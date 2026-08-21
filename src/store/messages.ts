import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "../log.js";

export type StoredChatMessage = {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  text: string;
  ts: number;
};

export type MessageStore = {
  append: (message: StoredChatMessage) => Promise<void>;
  listByUser: (userId: string) => Promise<StoredChatMessage[]>;
};

export const MAX_MESSAGES_PER_USER = 2_000;

function safeUserId(userId: string): string | null {
  return /^\d+$/.test(userId) ? userId : null;
}

export function jsonlLineCount(raw: string): number {
  let count = 0;
  for (const line of raw.split("\n")) {
    if (line) {
      count += 1;
    }
  }
  return count;
}

export function capJsonlLines(raw: string, max = MAX_MESSAGES_PER_USER): string | null {
  const lines = raw.split("\n").filter((line) => line.length > 0);
  if (lines.length <= max) {
    return null;
  }
  return `${lines.slice(-max).join("\n")}\n`;
}

async function existingLineCount(filePath: string): Promise<number> {
  try {
    return jsonlLineCount(await readFile(filePath, "utf8"));
  } catch {
    return 0;
  }
}

export async function loadMessageStore(
  dir: string,
  maxPerUser = MAX_MESSAGES_PER_USER,
): Promise<MessageStore> {
  await mkdir(dir, { recursive: true });
  let writing: Promise<void> = Promise.resolve();
  const counts = new Map<string, number>();

  const fileFor = (userId: string) => path.join(dir, `${userId}.jsonl`);

  const trimToCap = async (filePath: string) => {
    const raw = await readFile(filePath, "utf8");
    const capped = capJsonlLines(raw, maxPerUser);
    if (!capped) {
      return jsonlLineCount(raw);
    }
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, capped, "utf8");
    await rename(tmp, filePath);
    return maxPerUser;
  };

  return {
    async append(message) {
      const userId = safeUserId(message.userId);
      if (!userId) {
        return;
      }
      writing = writing
        .then(async () => {
          const filePath = fileFor(userId);
          if (!counts.has(userId)) {
            counts.set(userId, await existingLineCount(filePath));
          }
          await appendFile(filePath, `${JSON.stringify(message)}\n`, "utf8");
          const next = (counts.get(userId) ?? 0) + 1;
          counts.set(userId, next);
          if (next > maxPerUser) {
            counts.set(userId, await trimToCap(filePath));
          }
        })
        .catch((error: unknown) => {
          log.warn("Failed to store chat message.", error);
        });
      await writing;
    },
    async listByUser(userId) {
      const safe = safeUserId(userId);
      if (!safe) {
        return [];
      }
      try {
        const raw = await readFile(fileFor(safe), "utf8");
        const messages: StoredChatMessage[] = [];
        for (const line of raw.split("\n")) {
          if (!line) {
            continue;
          }
          try {
            messages.push(JSON.parse(line) as StoredChatMessage);
          } catch {
            // skip a corrupt line
          }
        }
        counts.set(safe, messages.length);
        return messages;
      } catch {
        counts.set(safe, 0);
        return [];
      }
    },
  };
}
