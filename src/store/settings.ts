import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cloneCommandFlags,
  cloneCustomCommands,
  DEFAULT_COMMANDS,
  sanitizeCommandState,
  sanitizeCustomCommands,
  type CommandFlags,
  type CommandId,
} from "../chat/catalog.js";
import { cloneTimedMessages, sanitizeTimedMessages } from "../chat/timed.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, DEFAULT_FONT, type OverlayConfig } from "../config.js";

export type OverlaySettings = OverlayConfig;

export type SettingsStore = {
  snapshot: () => OverlaySettings;
  update: (partial: Partial<OverlaySettings>) => Promise<OverlaySettings>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeOverlaySettings(
  partial: Partial<OverlaySettings>,
  current: OverlaySettings,
): OverlaySettings {
  const next = { ...current };
  if (typeof partial.maxMessages === "number" && Number.isFinite(partial.maxMessages)) {
    next.maxMessages = clamp(Math.round(partial.maxMessages), 1, 50);
  }
  if (typeof partial.holdMs === "number" && Number.isFinite(partial.holdMs)) {
    next.holdMs = clamp(Math.round(partial.holdMs), 0, 3_600_000);
  }
  if (typeof partial.fadeOutMs === "number" && Number.isFinite(partial.fadeOutMs)) {
    next.fadeOutMs = clamp(Math.round(partial.fadeOutMs), 0, 30_000);
  }
  if (typeof partial.hideCommands === "boolean") {
    next.hideCommands = partial.hideCommands;
  }
  if (typeof partial.chatVisible === "boolean") {
    next.chatVisible = partial.chatVisible;
  }
  if (typeof partial.fontFamily === "string") {
    next.fontFamily = sanitizeFontFamily(partial.fontFamily, current.fontFamily || DEFAULT_FONT);
  }
  if (typeof partial.fontSizePx === "number" && Number.isFinite(partial.fontSizePx)) {
    next.fontSizePx = clamp(Math.round(partial.fontSizePx), 10, 72);
  }
  if (typeof partial.boxWidth === "number" && Number.isFinite(partial.boxWidth)) {
    next.boxWidth = clamp(Math.round(partial.boxWidth), 160, CANVAS_WIDTH);
  }
  if (typeof partial.boxHeight === "number" && Number.isFinite(partial.boxHeight)) {
    next.boxHeight = clamp(Math.round(partial.boxHeight), 120, CANVAS_HEIGHT);
  }
  if (typeof partial.posX === "number" && Number.isFinite(partial.posX)) {
    next.posX = clamp(Math.round(partial.posX), 0, CANVAS_WIDTH - next.boxWidth);
  } else {
    next.posX = clamp(next.posX, 0, CANVAS_WIDTH - next.boxWidth);
  }
  if (typeof partial.posY === "number" && Number.isFinite(partial.posY)) {
    next.posY = clamp(Math.round(partial.posY), 0, CANVAS_HEIGHT - next.boxHeight);
  } else {
    next.posY = clamp(next.posY, 0, CANVAS_HEIGHT - next.boxHeight);
  }
  if (partial.commands && typeof partial.commands === "object") {
    next.commands = sanitizeCommands(partial.commands, next.commands ?? cloneCommandFlags(DEFAULT_COMMANDS));
  } else if (!next.commands) {
    next.commands = cloneCommandFlags(DEFAULT_COMMANDS);
  }
  if (Array.isArray(partial.customCommands)) {
    next.customCommands = sanitizeCustomCommands(partial.customCommands, next.customCommands ?? []);
  } else if (!next.customCommands) {
    next.customCommands = [];
  }
  if (Array.isArray(partial.timedMessages)) {
    next.timedMessages = sanitizeTimedMessages(partial.timedMessages, next.timedMessages ?? []);
  } else if (!next.timedMessages) {
    next.timedMessages = [];
  }
  return next;
}

function sanitizeFontFamily(value: string, fallback: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!trimmed || /[;{}<>\\]/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function sanitizeCommands(partial: Partial<CommandFlags> | Record<string, unknown>, current: CommandFlags): CommandFlags {
  const next = cloneCommandFlags(current);
  for (const id of Object.keys(DEFAULT_COMMANDS) as CommandId[]) {
    if (id in partial) {
      next[id] = sanitizeCommandState(partial[id], next[id]);
    }
  }
  return next;
}

function snapshotOf(current: OverlaySettings): OverlaySettings {
  return {
    ...current,
    commands: cloneCommandFlags(current.commands),
    customCommands: cloneCustomCommands(current.customCommands),
    timedMessages: cloneTimedMessages(current.timedMessages),
  };
}

export async function loadSettingsStore(
  filePath: string,
  defaults: OverlaySettings,
): Promise<SettingsStore> {
  await mkdir(path.dirname(filePath), { recursive: true });
  let current = { ...defaults };
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<OverlaySettings>;
    current = sanitizeOverlaySettings(parsed, current);
  } catch {
    current = { ...defaults };
  }

  const persist = async () => {
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(current, null, 2), "utf8");
    await rename(tmp, filePath);
  };

  await persist();

  return {
    snapshot() {
      return snapshotOf(current);
    },
    async update(partial) {
      current = sanitizeOverlaySettings(partial, current);
      await persist();
      return snapshotOf(current);
    },
  };
}
