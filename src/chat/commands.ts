export function parseUsernameCommand(text: string): { alias: string } | "invalid" | null {
  const match = text.trim().match(/^!username(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }
  const alias = match[1]?.trim();
  if (!alias) {
    return "invalid";
  }
  return { alias };
}

export function parseChatVisibilityCommand(text: string): "show" | "hide" | null {
  const value = text.trim().toLowerCase();
  if (value === "!showchat") {
    return "show";
  }
  if (value === "!hidechat") {
    return "hide";
  }
  return null;
}

export function parsePartyCommand(text: string): boolean {
  return text.trim().toLowerCase() === "!party";
}

export function parseDvdCommand(text: string): boolean {
  return text.trim().toLowerCase() === "!dvd";
}

export function parseSpotlightCommand(text: string): "on" | "off" | null {
  const value = text.trim().toLowerCase();
  if (value === "!sbon") {
    return "on";
  }
  if (value === "!sboff") {
    return "off";
  }
  return null;
}

export function parsePresetCommand(text: string): { list: true } | { name: string } | null {
  const match = text.trim().match(/^!preset(?:\s+(.*))?$/i);
  if (!match) {
    return null;
  }
  const name = match[1]?.trim();
  if (!name) {
    return { list: true };
  }
  return { name };
}

export function parseHelpCommand(text: string): boolean {
  return text.trim().toLowerCase() === "!help";
}

export function isChannelStaff(event: { hasBadge: (name: string) => boolean }): boolean {
  return event.hasBadge("broadcaster") || event.hasBadge("moderator");
}
