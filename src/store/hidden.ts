import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "../log.js";
import { normalizeLogin } from "./remaps.js";

const LOGIN = /^[a-z0-9_]{3,25}$/;
export const MAX_HIDDEN_LOGINS = 100;

export type HiddenStore = {
  list: () => string[];
  has: (login: string) => boolean;
  add: (login: string) => Promise<{ login: string } | "invalid" | "exists" | "full">;
  remove: (login: string) => Promise<boolean>;
};

export function sanitizeHiddenLogin(value: string): string | null {
  const login = normalizeLogin(value);
  return LOGIN.test(login) ? login : null;
}

export async function loadHiddenStore(filePath: string): Promise<HiddenStore> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const logins = new Set<string>();
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { logins?: unknown };
    if (Array.isArray(parsed.logins)) {
      for (const item of parsed.logins) {
        if (typeof item === "string") {
          const login = sanitizeHiddenLogin(item);
          if (login) {
            logins.add(login);
          }
        }
      }
    }
  } catch {
    // first run or unreadable file
  }

  let writing = Promise.resolve();
  const persist = () => {
    writing = writing
      .then(async () => {
        const tmp = `${filePath}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify({ logins: [...logins].sort() }, null, 2), "utf8");
        await rename(tmp, filePath);
      })
      .catch((error: unknown) => {
        log.warn("Failed to persist hidden chatters.", error);
      });
    return writing;
  };

  await persist();

  return {
    list() {
      return [...logins].sort();
    },
    has(login) {
      const key = sanitizeHiddenLogin(login);
      return Boolean(key && logins.has(key));
    },
    async add(login) {
      const key = sanitizeHiddenLogin(login);
      if (!key) {
        return "invalid";
      }
      if (logins.has(key)) {
        return "exists";
      }
      if (logins.size >= MAX_HIDDEN_LOGINS) {
        return "full";
      }
      logins.add(key);
      await persist();
      return { login: key };
    },
    async remove(login) {
      const key = sanitizeHiddenLogin(login);
      if (!key || !logins.delete(key)) {
        return false;
      }
      await persist();
      return true;
    },
  };
}
