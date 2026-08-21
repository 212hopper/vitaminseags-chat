import type { OverlaySettings } from "./store/settings.js";

export type ChatBadge = {
  setId: string;
  version: string;
  url: string;
  title: string;
};

export type ChatEmote = {
  name: string;
  url: string;
};

export type ChatFragment =
  | { type: "text"; text: string }
  | { type: "mention"; text: string }
  | { type: "cheer"; text: string; bits: number }
  | { type: "emote"; name: string; url: string; zeroWidth?: boolean; extra?: ChatEmote[] };

export type ChatMessagePayload = {
  id: string;
  user: {
    id: string;
    name: string;
    displayName: string;
    color: string | null;
  };
  badges: ChatBadge[];
  fragments: ChatFragment[];
  text: string;
  bits: number;
  isRedemption: boolean;
};

export type ActivityKind = "follow" | "subscribe" | "gift" | "cheer" | "raid";

export type ActivityPayload = {
  id: string;
  kind: ActivityKind;
  user: string;
  text: string;
  ts: number;
};

export type AppEvent =
  | { type: "chat.message"; payload: ChatMessagePayload }
  | { type: "chat.message.delete"; payload: { id: string } }
  | { type: "chat.clear"; payload: Record<string, never> }
  | { type: "overlay.settings"; payload: OverlaySettings }
  | { type: "overlay.party"; payload: { durationMs: number } }
  | { type: "channel.activity"; payload: ActivityPayload };

export type EventBus = {
  on: (handler: (event: AppEvent) => void) => () => void;
  emit: (event: AppEvent) => void;
};

export function createEventBus(): EventBus {
  const handlers = new Set<(event: AppEvent) => void>();

  return {
    on(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    emit(event) {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
}

export type WireEvent = AppEvent & { ts: number };

export function toWireEvent(event: AppEvent): WireEvent {
  return { ...event, ts: Date.now() };
}
