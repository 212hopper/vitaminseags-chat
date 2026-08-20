export type StreamStatus = {
  live: boolean;
  viewerCount: number;
  startedAt: string | null;
};

export type AppStatus = {
  phase: "starting" | "needs_login" | "ready";
  user: { id: string; login: string; displayName: string } | null;
  broadcaster: { id: string; login: string } | null;
  eventSub: boolean;
  overlayPath: string;
  stream: StreamStatus;
};

export type StatusStore = {
  snapshot: () => AppStatus;
  patch: (partial: Partial<AppStatus>) => void;
};

export function createStatusStore(overlayPath: string): StatusStore {
  let current: AppStatus = {
    phase: "starting",
    user: null,
    broadcaster: null,
    eventSub: false,
    overlayPath,
    stream: { live: false, viewerCount: 0, startedAt: null },
  };

  return {
    snapshot() {
      return current;
    },
    patch(partial) {
      current = { ...current, ...partial };
    },
  };
}
