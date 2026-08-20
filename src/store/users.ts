import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ChatterRecord = {
  id: string;
  login: string;
  displayName: string;
  color: string | null;
  messageCount: number;
};

export type UserStore = {
  getColor: (userId: string) => string | null;
  getUser: (userId: string) => ChatterRecord | null;
  setColor: (user: Pick<ChatterRecord, "id" | "login" | "displayName">, color: string) => Promise<void>;
  recordMessage: (user: Pick<ChatterRecord, "id" | "login" | "displayName">) => Promise<void>;
  stats: () => ChatterRecord[];
};

type FileShape = {
  users: Record<string, ChatterRecord>;
};

function emptyRecord(user: Pick<ChatterRecord, "id" | "login" | "displayName">): ChatterRecord {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    color: null,
    messageCount: 0,
  };
}

export async function loadUserStore(filePath: string): Promise<UserStore> {
  await mkdir(path.dirname(filePath), { recursive: true });

  let users: Record<string, ChatterRecord> = {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as FileShape;
    if (parsed?.users && typeof parsed.users === "object") {
      users = parsed.users;
    }
  } catch {
    users = {};
  }

  let writing: Promise<void> = Promise.resolve();

  const persist = () => {
    writing = writing.then(async () => {
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ users }, null, 2), "utf8");
      await rename(tmp, filePath);
    });
    return writing;
  };

  const touch = (user: Pick<ChatterRecord, "id" | "login" | "displayName">): ChatterRecord => {
    const existing = users[user.id] ?? emptyRecord(user);
    existing.login = user.login;
    existing.displayName = user.displayName;
    users[user.id] = existing;
    return existing;
  };

  return {
    getColor(userId) {
      return users[userId]?.color ?? null;
    },
    getUser(userId) {
      return users[userId] ?? null;
    },
    async setColor(user, color) {
      const record = touch(user);
      record.color = color;
      await persist();
    },
    async recordMessage(user) {
      const record = touch(user);
      record.messageCount += 1;
      await persist();
    },
    stats() {
      return Object.values(users).sort((a, b) => {
        if (b.messageCount !== a.messageCount) {
          return b.messageCount - a.messageCount;
        }
        return a.displayName.localeCompare(b.displayName);
      });
    },
  };
}
