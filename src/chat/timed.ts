import { publicCommandHelp, sanitizeReply, type CommandFlags, type CustomCommand } from "./catalog.js";

export type TimedMessageSource = "text" | "help" | "custom";

export type TimedMessage = {
  id: string;
  label: string;
  message: string;
  source: TimedMessageSource;
  customId: string;
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

export function sanitizeTimedSource(value: unknown, fallback: TimedMessageSource): TimedMessageSource {
  return value === "help" || value === "custom" || value === "text" ? value : fallback;
}

function sanitizeCustomId(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^c_[a-z0-9]+$/i.test(value)) {
    return value;
  }
  return fallback;
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
  const source = sanitizeTimedSource(raw.source, fallback?.source ?? "text");
  const customId = source === "custom" ? sanitizeCustomId(raw.customId, fallback?.customId ?? "") : "";
  const message = sanitizeReply(raw.message, fallback?.message ?? "");
  if (source === "text" && !message && !fallback) {
    return null;
  }
  if (source === "custom" && !customId) {
    return fallback ? { ...fallback } : null;
  }
  const resolvedMessage = source === "text" ? message || fallback?.message || "" : message;
  const label =
    sanitizeLabel(raw.label, fallback?.label ?? "") ||
    defaultLabel(source, resolvedMessage);
  return {
    id,
    label,
    message: resolvedMessage,
    source,
    customId,
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
    if (!sanitized || seen.has(sanitized.id) || !timedMessageIsComplete(sanitized)) {
      continue;
    }
    seen.add(sanitized.id);
    next.push(sanitized);
  }
  return next;
}

export function timedMessageIsComplete(timer: TimedMessage): boolean {
  if (timer.source === "help") {
    return true;
  }
  if (timer.source === "custom") {
    return Boolean(timer.customId);
  }
  return Boolean(timer.message);
}

export function createTimedMessage(input: {
  label?: string;
  message?: string;
  source?: TimedMessageSource;
  customId?: string;
  intervalMinutes?: number;
  liveOnly?: boolean;
  existing: TimedMessage[];
}): TimedMessage | { error: string } {
  if (input.existing.length >= MAX_TIMED_MESSAGES) {
    return { error: `You can have at most ${MAX_TIMED_MESSAGES} timed messages.` };
  }
  const source = sanitizeTimedSource(input.source, "text");
  const customId = source === "custom" ? sanitizeCustomId(input.customId, "") : "";
  const message = source === "text" ? sanitizeReply(input.message, "") : "";
  if (source === "text" && !message) {
    return { error: "Write the message to post in chat, or pick !help / a custom command." };
  }
  if (source === "custom" && !customId) {
    return { error: "Pick a custom command to post on the timer." };
  }
  const intervalMinutes = sanitizeIntervalMinutes(input.intervalMinutes, 15);
  return {
    id: newTimedId(),
    label: sanitizeLabel(input.label, "") || defaultLabel(source, message),
    message,
    source,
    customId,
    intervalMinutes,
    enabled: true,
    liveOnly: input.liveOnly !== false,
  };
}

export function resolveTimedChatText(
  timer: TimedMessage,
  overlay: { commands: CommandFlags; customCommands: CustomCommand[] },
): string | null {
  if (timer.source === "help") {
    const text = publicCommandHelp(overlay.commands, overlay.customCommands);
    return text || null;
  }
  if (timer.source === "custom") {
    const command = overlay.customCommands.find((item) => item.id === timer.customId);
    if (!command?.enabled || !command.sendReply) {
      return null;
    }
    const reply = command.reply.trim();
    return reply || null;
  }
  const message = timer.message.trim();
  return message || null;
}

function defaultLabel(source: TimedMessageSource, message: string): string {
  if (source === "help") {
    return "!help";
  }
  if (source === "custom") {
    return "Custom command";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 32) || "Timed message";
}

function newTimedId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
