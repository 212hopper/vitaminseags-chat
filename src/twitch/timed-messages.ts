import type { SettingsStore } from "../store/settings.js";
import type { StatusStore } from "../status.js";
import type { BotChat } from "./chat-send.js";
import { resolveTimedChatText } from "../chat/timed.js";

const TICK_MS = 10_000;

export function startTimedMessages(options: {
  settings: SettingsStore;
  status: StatusStore;
  botChat: BotChat;
}): () => void {
  const { settings, status, botChat } = options;
  const lastSent = new Map<string, number>();
  let stopped = false;

  const tick = () => {
    if (stopped) {
      return;
    }
    const live = Boolean(status.snapshot().stream?.live);
    const now = Date.now();
    const overlay = settings.snapshot();
    const timers = overlay.timedMessages ?? [];
    const known = new Set(timers.map((item) => item.id));
    for (const id of lastSent.keys()) {
      if (!known.has(id)) {
        lastSent.delete(id);
      }
    }

    let sentThisTick = false;
    for (const timer of timers) {
      if (!timer.enabled) {
        lastSent.delete(timer.id);
        continue;
      }
      if (timer.liveOnly && !live) {
        lastSent.set(timer.id, now);
        continue;
      }
      const last = lastSent.get(timer.id);
      if (last == null) {
        lastSent.set(timer.id, now);
        continue;
      }
      const intervalMs = Math.max(1, timer.intervalMinutes) * 60_000;
      if (now - last < intervalMs || sentThisTick) {
        continue;
      }
      const text = resolveTimedChatText(timer, overlay);
      if (!text) {
        continue;
      }
      lastSent.set(timer.id, now);
      sentThisTick = true;
      void botChat.send(text);
    }
  };

  void tick();
  const handle = setInterval(tick, TICK_MS);
  handle.unref?.();

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
