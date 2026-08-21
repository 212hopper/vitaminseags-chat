import { sanitizeReply } from "./catalog.js";

export type TimedMessage = {
  id: string;
  label: string;
  message: string;
  intervalMinutes: number;
  enabled: boolean;
  liveOnly: boolean;
};

export const MAX_TIMED_MESSAGES = 20;
export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 180;

export function cloneTimedMessages(list: TimedMessage[] | undefined): TimedMessage[] {
  return (list ?? []).map((item) => ({ ...item }));
}

export function sanitizeIntervalMinutes(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(raw)));
}

export function sanitizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

export function sanitizeTimedMessage(
  value: unknown,
  fallback: TimedMessage | null,
): TimedMessage | null {
  if (!value || typeof value !== "object") {
    return fallback ? { ...fallback } : null;
  }
  const raw = value as Partial<TimedMessage>;
  const id =
    typeof raw.id === "string" && /^t_[a-z0-9]+$/i.test(raw.id)
      ? raw.id
      : fallback?.id ?? newTimedId();
  const message = sanitizeReply(raw.message, fallback?.message ?? "");
  if (!message && !fallback) {
    return null;
  }
  const label = sanitizeLabel(raw.label, fallback?.label ?? "") || labelFromMessage(message || fallback?.message || "");
  return {
    id,
    label,
    message: message || fallback?.message || "",
    intervalMinutes: sanitizeIntervalMinutes(raw.intervalMinutes, fallback?.intervalMinutes ?? 15),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : (fallback?.enabled ?? true),
    liveOnly: typeof raw.liveOnly === "boolean" ? raw.liveOnly : (fallback?.liveOnly ?? true),
  };
}

export function sanitizeTimedMessages(partial: unknown, current: TimedMessage[]): TimedMessage[] {
  if (!Array.isArray(partial)) {
    return cloneTimedMessages(current);
  }
  const next: TimedMessage[] = [];
  const seen = new Set<string>();
  for (const item of partial.slice(0, MAX_TIMED_MESSAGES)) {
    const sanitized = sanitizeTimedMessage(item, null);
    if (!sanitized || seen.has(sanitized.id) || !sanitized.message) {
      continue;
    }
    seen.add(sanitized.id);
    next.push(sanitized);
  }
  return next;
}

export function createTimedMessage(input: {
  label?: string;
  message: string;
  intervalMinutes?: number;
  liveOnly?: boolean;
  existing: TimedMessage[];
}): TimedMessage | { error: string } {
  if (input.existing.length >= MAX_TIMED_MESSAGES) {
    return { error: `You can have at most ${MAX_TIMED_MESSAGES} timed messages.` };
  }
  const message = sanitizeReply(input.message, "");
  if (!message) {
    return { error: "Write the message to post in chat." };
  }
  const intervalMinutes = sanitizeIntervalMinutes(input.intervalMinutes, 15);
  return {
    id: newTimedId(),
    label: sanitizeLabel(input.label, "") || labelFromMessage(message),
    message,
    intervalMinutes,
    enabled: true,
    liveOnly: input.liveOnly !== false,
  };
}

function labelFromMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 32) || "Timed message";
}

function newTimedId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
