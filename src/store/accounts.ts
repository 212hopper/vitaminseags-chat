import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type AccountRole = "admin" | "user";

export type PublicAccount = {
  username: string;
  role: AccountRole;
  managed: boolean;
};

type StoredAccount = {
  username: string;
  password: string;
};

export type AccountStore = {
  list: () => PublicAccount[];
  create: (username: string, password: string) => Promise<PublicAccount | "exists" | "invalid">;
  remove: (username: string) => Promise<boolean>;
  verify: (username: string, password: string) => boolean;
};

const USERNAME = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt?: string): string {
  const usedSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, usedSalt, 32).toString("hex");
  return `${usedSalt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const next = scryptSync(password, salt, 32);
  const current = Buffer.from(hash, "hex");
  if (next.length !== current.length) {
    return false;
  }
  return timingSafeEqual(next, current);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function loadAccountStore(
  filePath: string,
  reservedAdmin: string,
): Promise<AccountStore> {
  await mkdir(path.dirname(filePath), { recursive: true });
  let accounts: Record<string, StoredAccount> = {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { accounts?: Record<string, StoredAccount> };
    if (parsed.accounts && typeof parsed.accounts === "object") {
      accounts = parsed.accounts;
    }
  } catch {
    accounts = {};
  }

  const persist = async () => {
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ accounts }, null, 2), "utf8");
    await rename(tmp, filePath);
  };

  return {
    list() {
      return Object.values(accounts)
        .map((entry) => ({ username: entry.username, role: "user" as const, managed: true }))
        .sort((a, b) => a.username.localeCompare(b.username));
    },
    async create(username, password) {
      const key = normalizeUsername(username);
      if (!USERNAME.test(key) || password.length < 4 || password.length > 128) {
        return "invalid";
      }
      if (reservedAdmin && key === normalizeUsername(reservedAdmin)) {
        return "exists";
      }
      if (accounts[key]) {
        return "exists";
      }
      accounts[key] = { username: key, password: hashPassword(password) };
      await persist();
      return { username: key, role: "user", managed: true };
    },
    async remove(username) {
      const key = normalizeUsername(username);
      if (!accounts[key]) {
        return false;
      }
      delete accounts[key];
      await persist();
      return true;
    },
    verify(username, password) {
      const entry = accounts[normalizeUsername(username)];
      if (!entry) {
        return false;
      }
      return verifyPassword(password, entry.password);
    },
  };
}
