import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountRole } from "../store/accounts.js";
import { safeEqual } from "../store/accounts.js";
import { log } from "../log.js";

export type SessionAccount = {
  username: string;
  role: AccountRole;
};

const COOKIE = "vseags_session";
const OAUTH_COOKIE = "vseags_oauth_state";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 600_000;
const OAUTH_TTL_SEC = OAUTH_STATE_TTL_MS / 1000;
const PRUNE_MS = 60 * 60 * 1000;

type Session = SessionAccount & { expiresAt: number };

export type SessionStore = {
  create: (account: SessionAccount) => string;
  resolve: (cookieHeader: string | undefined) => SessionAccount | null;
  destroy: (cookieHeader: string | undefined) => void;
  flush: () => Promise<void>;
};

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function loadSessionStore(filePath: string): Promise<SessionStore> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const sessions = new Map<string, Session>();
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, Partial<Session>>;
    const now = Date.now();
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^[a-f0-9]{64}$/i.test(key)) {
        continue;
      }
      if (
        typeof value.username === "string" &&
        (value.role === "admin" || value.role === "user") &&
        typeof value.expiresAt === "number" &&
        value.expiresAt > now
      ) {
        sessions.set(key.toLowerCase(), {
          username: value.username,
          role: value.role,
          expiresAt: value.expiresAt,
        });
      }
    }
  } catch {
    // first run or unreadable file
  }

  let writing = Promise.resolve();
  const persist = () => {
    writing = writing
      .then(async () => {
        prune(sessions);
        const tmp = `${filePath}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(Object.fromEntries(sessions), null, 2), "utf8");
        await rename(tmp, filePath);
      })
      .catch((error: unknown) => {
        log.warn("Failed to persist app sessions.", error);
      });
    return writing;
  };

  await persist();

  const pruneTimer = setInterval(() => {
    if (prune(sessions)) {
      void persist();
    }
  }, PRUNE_MS);
  pruneTimer.unref?.();

  return {
    create(account) {
      const token = randomBytes(24).toString("hex");
      sessions.set(hashSessionToken(token), { ...account, expiresAt: Date.now() + TTL_MS });
      void persist();
      return token;
    },
    resolve(cookieHeader) {
      const token = parseCookies(cookieHeader)[COOKIE];
      if (!token) {
        return null;
      }
      const key = hashSessionToken(token);
      const session = sessions.get(key);
      if (!session) {
        return null;
      }
      if (session.expiresAt < Date.now()) {
        sessions.delete(key);
        void persist();
        return null;
      }
      return { username: session.username, role: session.role };
    },
    destroy(cookieHeader) {
      const token = parseCookies(cookieHeader)[COOKIE];
      if (token && sessions.delete(hashSessionToken(token))) {
        void persist();
      }
    },
    flush() {
      return persist();
    },
  };
}

function prune(sessions: Map<string, Session>): boolean {
  const now = Date.now();
  let changed = false;
  for (const [key, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(key);
      changed = true;
    }
  }
  return changed;
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function oauthStateCookie(state: string, secure: boolean): string {
  const parts = [
    `${OAUTH_COOKIE}=${state}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OAUTH_TTL_SEC}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearOauthStateCookie(secure: boolean): string {
  const parts = [`${OAUTH_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readOauthStateCookie(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[OAUTH_COOKIE];
}

export function oauthStateMatches(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) {
    return false;
  }
  return safeEqual(expected, received);
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/oauth/callback" ||
    pathname.startsWith("/oauth/callback/") ||
    pathname.startsWith("/overlays/") ||
    pathname === "/ws"
  );
}

export function safeNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}
