export type CommandId = "colour" | "username" | "showchat" | "hidechat";

export type CommandFlags = Record<CommandId, boolean>;

export type ChatCommandInfo = {
  id: CommandId;
  names: string[];
  who: "anyone" | "mods";
  description: string;
};

export const CHAT_COMMANDS: ChatCommandInfo[] = [
  {
    id: "colour",
    names: ["!colour", "!color"],
    who: "anyone",
    description: "Set a persistent username colour on the overlay. Hidden from chat.",
  },
  {
    id: "username",
    names: ["!username"],
    who: "anyone",
    description: "Set your on-screen name remap, unless the owner has blocked it.",
  },
  {
    id: "showchat",
    names: ["!showchat"],
    who: "mods",
    description: "Show the chat overlay. Broadcaster and moderators only.",
  },
  {
    id: "hidechat",
    names: ["!hidechat"],
    who: "mods",
    description: "Hide the chat overlay. Broadcaster and moderators only.",
  },
];

export const DEFAULT_COMMANDS: CommandFlags = {
  colour: true,
  username: true,
  showchat: true,
  hidechat: true,
};

export function isCommandEnabled(flags: CommandFlags, id: CommandId): boolean {
  return flags[id] !== false;
}
