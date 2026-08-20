import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type NameRemap = {
  login: string;
  userId: string | null;
  alias: string;
  blocked: boolean;
};

export type RemapStore = {
  list: () => NameRemap[];
  resolve: (userId: string, login: string) => string | null;
  setSelf: (user: { id: string; login: string }, alias: string) => Promise<"ok" | "blocked" | "invalid">;
  upsert: (input: { login: string; alias: string; blocked?: boolean; userId?: string | null }) => Promise<NameRemap | null>;
  setBlocked: (login: string, blocked: boolean) => Promise<NameRemap | null>;
  remove: (login: string) => Promise<boolean>;
  rememberUser: (userId: string, login: string) => void;
};

const LOGIN = /^[a-z0-9_]{3,25}$/;

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase().replace(/^@/, "");
}

export function sanitizeAlias(alias: string): string | null {
  const value = alias.replace(/\s+/g, " ").trim();
  if (value.length < 1 || value.length > 32) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  return value;
}

export async function loadRemapStore(filePath: string): Promise<RemapStore> {
  await mkdir(path.dirname(filePath), { recursive: true });
  let remaps: Record<string, NameRemap> = {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { remaps?: Record<string, NameRemap> };
    if (parsed.remaps && typeof parsed.remaps === "object") {
      remaps = parsed.remaps;
    }
  } catch {
    remaps = {};
  }

  let writing: Promise<void> = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      const tmp = `${filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ remaps }, null, 2), "utf8");
      await rename(tmp, filePath);
    });
    return writing;
  };

  const byId = (userId: string) => Object.values(remaps).find((entry) => entry.userId === userId);

  return {
    list() {
      return Object.values(remaps).sort((a, b) => a.login.localeCompare(b.login));
    },
    resolve(userId, login) {
      const byUser = byId(userId);
      if (byUser) {
        return byUser.alias;
      }
      return remaps[normalizeLogin(login)]?.alias ?? null;
    },
    rememberUser(userId, login) {
      const key = normalizeLogin(login);
      const existing = remaps[key] ?? byId(userId);
      if (!existing) {
        return;
      }
      const oldKey = existing.login;
      if (existing.userId === userId && oldKey === key) {
        return;
      }
      if (oldKey !== key) {
        delete remaps[oldKey];
      }
      existing.userId = userId;
      existing.login = key;
      remaps[key] = existing;
      void persist();
    },
    async setSelf(user, alias) {
      const clean = sanitizeAlias(alias);
      if (!clean) {
        return "invalid";
      }
      const key = normalizeLogin(user.login);
      const existing = remaps[key] ?? byId(user.id);
      if (existing?.blocked) {
        return "blocked";
      }
      remaps[key] = {
        login: key,
        userId: user.id,
        alias: clean,
        blocked: existing?.blocked ?? false,
      };
      await persist();
      return "ok";
    },
    async upsert(input) {
      const key = normalizeLogin(input.login);
      const alias = sanitizeAlias(input.alias);
      if (!LOGIN.test(key) || !alias) {
        return null;
      }
      const existing = remaps[key];
      remaps[key] = {
        login: key,
        userId: input.userId ?? existing?.userId ?? null,
        alias,
        blocked: input.blocked ?? existing?.blocked ?? false,
      };
      await persist();
      return remaps[key];
    },
    async setBlocked(login, blocked) {
      const key = normalizeLogin(login);
      const existing = remaps[key];
      if (!existing) {
        return null;
      }
      existing.blocked = blocked;
      await persist();
      return existing;
    },
    async remove(login) {
      const key = normalizeLogin(login);
      if (!remaps[key]) {
        return false;
      }
      delete remaps[key];
      await persist();
      return true;
    },
  };
}
