export type CommandId =
  | "colour"
  | "username"
  | "showchat"
  | "hidechat"
  | "party"
  | "dvd"
  | "sbon"
  | "sboff"
  | "preset"
  | "help";
export type CommandWho = "anyone" | "mods";

export type CommandState = {
  enabled: boolean;
  staffGuarantee: boolean;
  who: CommandWho;
  chatHelp: string;
  chancePct?: number;
};

export type CommandFlags = Record<CommandId, CommandState>;

export type CustomCommand = {
  id: string;
  trigger: string;
  reply: string;
  sendReply: boolean;
  enabled: boolean;
  who: CommandWho;
  chatHelp: string;
};

export type ChatCommandInfo = {
  id: CommandId;
  names: string[];
  who: CommandWho;
  description: string;
  chatHelp: string;
  chance?: number;
};

export type ChatCommandView = {
  id: string;
  kind: "builtin" | "custom";
  names: string[];
  who: CommandWho;
  description: string;
  reply: string | null;
  sendReply: boolean;
  chatHelp: string;
  enabled: boolean;
  staffGuarantee: boolean;
  hasChance: boolean;
  chancePct: number | null;
};

export const CHAT_COMMANDS: ChatCommandInfo[] = [
  {
    id: "colour",
    names: ["!colour", "!color"],
    who: "anyone",
    description: "Set a persistent username colour on the overlay. Hidden from chat.",
    chatHelp: "set your overlay name colour",
  },
  {
    id: "username",
    names: ["!username"],
    who: "anyone",
    description: "Set your on-screen name remap, unless the owner has blocked it.",
    chatHelp: "set your on-screen name",
  },
  {
    id: "showchat",
    names: ["!showchat"],
    who: "mods",
    description: "Show the chat overlay.",
    chatHelp: "show overlay chat",
  },
  {
    id: "hidechat",
    names: ["!hidechat"],
    who: "mods",
    description: "Hide the chat overlay.",
    chatHelp: "hide overlay chat",
  },
  {
    id: "party",
    names: ["!party"],
    who: "anyone",
    description: "Chance to send on-screen chat flying around in colour for 10 seconds.",
    chatHelp: "1% chance of party mode",
    chance: 0.01,
  },
  {
    id: "dvd",
    names: ["!dvd"],
    who: "anyone",
    description: "Chance to bounce a DVD logo around the overlay for 60 seconds.",
    chatHelp: "4% chance of bouncing DVD",
    chance: 0.04,
  },
  {
    id: "sbon",
    names: ["!sbon"],
    who: "mods",
    description: "Dim the overlay except for the configured spotlight circles.",
    chatHelp: "turn on spotlights",
  },
  {
    id: "sboff",
    names: ["!sboff"],
    who: "mods",
    description: "Remove the spotlight dimming.",
    chatHelp: "turn off spotlights",
  },
  {
    id: "preset",
    names: ["!preset"],
    who: "mods",
    description: "Apply a saved chat-box and spotlight preset by name. With no name, list saved presets.",
    chatHelp: "apply a layout preset",
  },
  {
    id: "help",
    names: ["!help"],
    who: "anyone",
    description: "Reply in Twitch chat with the enabled commands anyone can use.",
    chatHelp: "this list",
  },
];

const CATALOG_BY_ID = new Map(CHAT_COMMANDS.map((command) => [command.id, command]));

export const DEFAULT_COMMANDS: CommandFlags = {
  colour: defaultState("colour"),
  username: defaultState("username"),
  showchat: defaultState("showchat"),
  hidechat: defaultState("hidechat"),
  party: defaultState("party", { staffGuarantee: true }),
  dvd: defaultState("dvd", { staffGuarantee: true }),
  sbon: defaultState("sbon"),
  sboff: defaultState("sboff"),
  preset: defaultState("preset"),
  help: defaultState("help"),
};

export const MAX_CUSTOM_COMMANDS = 40;

function catalogChancePct(id: CommandId): number | undefined {
  const chance = CATALOG_BY_ID.get(id)?.chance;
  return chance == null ? undefined : Math.round(chance * 100);
}

function defaultState(id: CommandId, extra: Partial<CommandState> = {}): CommandState {
  const info = CATALOG_BY_ID.get(id);
  const chancePct = catalogChancePct(id);
  return {
    enabled: true,
    staffGuarantee: false,
    who: info?.who ?? "anyone",
    chatHelp: info?.chatHelp ?? "",
    ...(chancePct != null ? { chancePct } : {}),
    ...extra,
  };
}

export function cloneCommandFlags(flags: CommandFlags): CommandFlags {
  const next = {} as CommandFlags;
  for (const id of Object.keys(DEFAULT_COMMANDS) as CommandId[]) {
    next[id] = { ...DEFAULT_COMMANDS[id], ...(flags[id] ?? {}) };
  }
  return next;
}

export function cloneCustomCommands(list: CustomCommand[] | undefined): CustomCommand[] {
  return (list ?? []).map((item) => ({ ...item }));
}

export function isCommandId(value: string): value is CommandId {
  return value in DEFAULT_COMMANDS;
}

export function isCommandEnabled(flags: CommandFlags, id: CommandId): boolean {
  return flags[id]?.enabled !== false;
}

export function isStaffGuaranteeEnabled(flags: CommandFlags, id: CommandId): boolean {
  return flags[id]?.staffGuarantee === true;
}

export function commandWho(flags: CommandFlags, id: CommandId): CommandWho {
  return flags[id]?.who ?? DEFAULT_COMMANDS[id].who;
}

export function commandChatHelp(flags: CommandFlags, id: CommandId): string {
  const fallback = CATALOG_BY_ID.get(id)?.chatHelp ?? "";
  const value = flags[id]?.chatHelp;
  return typeof value === "string" ? value : fallback;
}

export function canUseWho(who: CommandWho, isStaff: boolean): boolean {
  return who === "anyone" || isStaff;
}

export function commandChancePct(flags: CommandFlags, id: CommandId): number | null {
  const fallback = catalogChancePct(id);
  if (fallback == null) {
    return null;
  }
  const stored = flags[id]?.chancePct;
  if (typeof stored === "number" && Number.isFinite(stored)) {
    return sanitizeChancePct(stored, fallback);
  }
  return fallback;
}

export function commandHits(flags: CommandFlags, id: CommandId, isStaff: boolean): boolean {
  const chancePct = commandChancePct(flags, id);
  if (chancePct == null) {
    return true;
  }
  if (isStaff && isStaffGuaranteeEnabled(flags, id)) {
    return true;
  }
  return Math.random() * 100 < chancePct;
}

export function reservedTriggers(): Set<string> {
  const reserved = new Set<string>();
  for (const command of CHAT_COMMANDS) {
    for (const name of command.names) {
      reserved.add(name.replace(/^!/, "").toLowerCase());
    }
  }
  return reserved;
}

export function normalizeTrigger(raw: string): string | null {
  const value = raw.trim().replace(/^!+/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(value)) {
    return null;
  }
  return value;
}

export function sanitizeWho(value: unknown, fallback: CommandWho): CommandWho {
  return value === "mods" || value === "anyone" ? value : fallback;
}

export function sanitizeChatHelp(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function sanitizeChancePct(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function sanitizeReply(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.replace(/\r\n/g, "\n").trim().slice(0, 500);
}

export function sanitizeCommandState(value: unknown, fallback: CommandState): CommandState {
  if (typeof value === "boolean") {
    return { ...fallback, enabled: value };
  }
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const raw = value as Partial<CommandState>;
  const next: CommandState = {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    staffGuarantee: typeof raw.staffGuarantee === "boolean" ? raw.staffGuarantee : fallback.staffGuarantee,
    who: sanitizeWho(raw.who, fallback.who),
    chatHelp: sanitizeChatHelp(raw.chatHelp, fallback.chatHelp),
  };
  if (fallback.chancePct != null) {
    next.chancePct = sanitizeChancePct(raw.chancePct, fallback.chancePct);
  }
  return next;
}

export function sanitizeSendReply(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function sanitizeCustomCommand(
  value: unknown,
  fallback: CustomCommand | null,
  others: CustomCommand[],
): CustomCommand | null {
  if (!value || typeof value !== "object") {
    return fallback ? { ...fallback } : null;
  }
  const raw = value as Partial<CustomCommand>;
  const id =
    typeof raw.id === "string" && /^c_[a-z0-9]+$/i.test(raw.id)
      ? raw.id
      : fallback?.id ?? newCustomId();
  const trigger = normalizeTrigger(raw.trigger ?? fallback?.trigger ?? "");
  if (!trigger) {
    return fallback ? { ...fallback } : null;
  }
  if (reservedTriggers().has(trigger)) {
    return fallback ? { ...fallback } : null;
  }
  if (others.some((item) => item.id !== id && item.trigger === trigger)) {
    return fallback ? { ...fallback } : null;
  }
  const reply = sanitizeReply(raw.reply, fallback?.reply ?? "");
  const sendReply = sanitizeSendReply(raw.sendReply, fallback?.sendReply ?? Boolean(reply));
  const chatHelp = sanitizeChatHelp(raw.chatHelp, fallback?.chatHelp ?? "");
  if (sendReply && !reply) {
    return null;
  }
  if (!sendReply && !chatHelp) {
    return null;
  }
  return {
    id,
    trigger,
    reply,
    sendReply,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : (fallback?.enabled ?? true),
    who: sanitizeWho(raw.who, fallback?.who ?? "anyone"),
    chatHelp,
  };
}

export function sanitizeCustomCommands(partial: unknown, current: CustomCommand[]): CustomCommand[] {
  if (!Array.isArray(partial)) {
    return cloneCustomCommands(current);
  }
  const next: CustomCommand[] = [];
  const seenIds = new Set<string>();
  for (const item of partial.slice(0, MAX_CUSTOM_COMMANDS)) {
    const sanitized = sanitizeCustomCommand(item, null, next);
    if (!sanitized || seenIds.has(sanitized.id)) {
      continue;
    }
    seenIds.add(sanitized.id);
    next.push(sanitized);
  }
  return next;
}

export function createCustomCommand(input: {
  trigger: string;
  reply: string;
  sendReply?: boolean;
  who?: CommandWho;
  chatHelp?: string;
  existing: CustomCommand[];
}): CustomCommand | { error: string } {
  if (input.existing.length >= MAX_CUSTOM_COMMANDS) {
    return { error: `You can have at most ${MAX_CUSTOM_COMMANDS} custom commands.` };
  }
  const trigger = normalizeTrigger(input.trigger);
  if (!trigger) {
    return { error: "Command must be 2–24 letters, numbers or underscores, like discord." };
  }
  if (reservedTriggers().has(trigger)) {
    return { error: `!${trigger} is already a built-in command.` };
  }
  if (input.existing.some((item) => item.trigger === trigger)) {
    return { error: `!${trigger} already exists.` };
  }
  const sendReply = input.sendReply !== false;
  const reply = sanitizeReply(input.reply, "");
  const chatHelp = sanitizeChatHelp(input.chatHelp, "");
  if (sendReply && !reply) {
    return { error: "Write the reply the bot should send, or turn off Send a chat reply." };
  }
  if (!sendReply && !chatHelp) {
    return { error: "Add !help text so chatters know what this command is for." };
  }
  return {
    id: newCustomId(),
    trigger,
    reply,
    sendReply,
    enabled: true,
    who: sanitizeWho(input.who, "anyone"),
    chatHelp,
  };
}

export function findCustomCommand(commands: CustomCommand[], text: string): CustomCommand | null {
  const match = text.trim().match(/^!([a-z0-9_]{2,24})(?:\s|$)/i);
  if (!match) {
    return null;
  }
  const trigger = match[1]?.toLowerCase();
  if (!trigger) {
    return null;
  }
  return commands.find((item) => item.trigger === trigger) ?? null;
}

export function publicCommandHelp(flags: CommandFlags, custom: CustomCommand[]): string {
  const parts: string[] = [];
  for (const command of CHAT_COMMANDS) {
    if (!isCommandEnabled(flags, command.id) || commandWho(flags, command.id) !== "anyone") {
      continue;
    }
    const names = command.names.join("/");
    const help = commandChatHelp(flags, command.id);
    parts.push(help ? `${names} — ${help}` : names);
  }
  for (const command of custom) {
    if (!command.enabled || command.who !== "anyone") {
      continue;
    }
    const name = `!${command.trigger}`;
    parts.push(command.chatHelp ? `${name} — ${command.chatHelp}` : name);
  }
  if (!parts.length) {
    return "No public commands are enabled.";
  }
  return `Anyone can use: ${parts.join(" · ")}`.slice(0, 500);
}

export function serializeCommands(flags: CommandFlags, custom: CustomCommand[]): ChatCommandView[] {
  const builtins = CHAT_COMMANDS.map((command) => ({
    id: command.id,
    kind: "builtin" as const,
    names: command.names,
    who: commandWho(flags, command.id),
    description: command.description,
    reply: null,
    sendReply: false,
    chatHelp: commandChatHelp(flags, command.id),
    enabled: isCommandEnabled(flags, command.id),
    staffGuarantee: isStaffGuaranteeEnabled(flags, command.id),
    hasChance: command.chance != null,
    chancePct: commandChancePct(flags, command.id),
  }));
  const customs = custom.map((command) => ({
    id: command.id,
    kind: "custom" as const,
    names: [`!${command.trigger}`],
    who: command.who,
    description: command.sendReply ? "Custom chat reply." : "Listed in !help; no chat reply.",
    reply: command.reply,
    sendReply: command.sendReply,
    chatHelp: command.chatHelp,
    enabled: command.enabled,
    staffGuarantee: false,
    hasChance: false,
    chancePct: null,
  }));
  return [...builtins, ...customs];
}

function newCustomId(): string {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
