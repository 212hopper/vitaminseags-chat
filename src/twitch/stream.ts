import type { ApiClient } from "@twurple/api";
import { log } from "../log.js";
import type { StatusStore } from "../status.js";

const POLL_MS = 15_000;

export function startStreamPoller(
  api: ApiClient,
  broadcasterId: string,
  status: StatusStore,
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) {
      return;
    }
    try {
      const stream = await api.streams.getStreamByUserId(broadcasterId);
      if (!stream) {
        status.patch({
          stream: { live: false, viewerCount: 0, startedAt: null },
        });
        return;
      }
      status.patch({
        stream: {
          live: true,
          viewerCount: stream.viewers,
          startedAt: stream.startDate.toISOString(),
        },
      });
    } catch (error) {
      log.warn("Stream poll failed.", error);
    }
  };

  void poll();
  const timer = setInterval(() => {
    void poll();
  }, POLL_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
