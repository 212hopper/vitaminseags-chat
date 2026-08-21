import { appendFile, mkdir, readFile } from "node:fs/promises";
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

function safeUserId(userId: string): string | null {
  return /^\d+$/.test(userId) ? userId : null;
}

export async function loadMessageStore(dir: string): Promise<MessageStore> {
  await mkdir(dir, { recursive: true });
  let writing: Promise<void> = Promise.resolve();

  const fileFor = (userId: string) => path.join(dir, `${userId}.jsonl`);

  return {
    async append(message) {
      const userId = safeUserId(message.userId);
      if (!userId) {
        return;
      }
      writing = writing
        .then(async () => {
          await appendFile(fileFor(userId), `${JSON.stringify(message)}\n`, "utf8");
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
