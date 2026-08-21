import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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
const TRIM_AFTER_BYTES = 256_000;

function safeUserId(userId: string): string | null {
  return /^\d+$/.test(userId) ? userId : null;
}

export function capJsonlLines(raw: string, max = MAX_MESSAGES_PER_USER): string | null {
  const lines = raw.split("\n").filter((line) => line.length > 0);
  if (lines.length <= max) {
    return null;
  }
  return `${lines.slice(-max).join("\n")}\n`;
}

export async function loadMessageStore(dir: string): Promise<MessageStore> {
  await mkdir(dir, { recursive: true });
  let writing: Promise<void> = Promise.resolve();

  const fileFor = (userId: string) => path.join(dir, `${userId}.jsonl`);

  const trimIfNeeded = async (filePath: string) => {
    try {
      const info = await stat(filePath);
      if (info.size < TRIM_AFTER_BYTES) {
        return;
      }
      const raw = await readFile(filePath, "utf8");
      const capped = capJsonlLines(raw);
      if (!capped) {
        return;
      }
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, capped, "utf8");
      await rename(tmp, filePath);
    } catch (error: unknown) {
      log.warn("Failed to trim chat history.", error);
    }
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
          await appendFile(filePath, `${JSON.stringify(message)}\n`, "utf8");
          await trimIfNeeded(filePath);
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
        return messages;
      } catch {
        return [];
      }
    },
  };
}
