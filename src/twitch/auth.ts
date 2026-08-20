import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RefreshingAuthProvider } from "@twurple/auth";
import type { AccessToken } from "@twurple/auth";
import type { AppConfig } from "../config.js";
import { buildAuthorizeUrl } from "../config.js";
import type { StatusStore } from "../status.js";

export class OAuthWaiter {
  #pending: ((code: string) => void) | null = null;
  #buffered: string | null = null;

  wait(): Promise<string> {
    if (this.#buffered) {
      const code = this.#buffered;
      this.#buffered = null;
      return Promise.resolve(code);
    }
    return new Promise((resolve) => {
      this.#pending = resolve;
    });
  }

  complete(code: string): boolean {
    if (this.#pending) {
      this.#pending(code);
      this.#pending = null;
      return true;
    }
    this.#buffered = code;
    return true;
  }
}

type StoredToken = Pick<AccessToken, "accessToken" | "refreshToken"> & {
  expiresIn: number | null;
  obtainmentTimestamp: number;
  scope?: string[];
};

async function loadTokens(tokenPath: string): Promise<StoredToken | null> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresIn: parsed.expiresIn ?? 0,
      obtainmentTimestamp: parsed.obtainmentTimestamp ?? 0,
      scope: parsed.scope ?? [],
    };
  } catch {
    return null;
  }
}

async function saveTokens(tokenPath: string, token: AccessToken): Promise<void> {
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8");
}

function tokensFromEnv(config: AppConfig): StoredToken | null {
  if (!config.accessToken || !config.refreshToken) {
    return null;
  }
  return {
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
    expiresIn: 0,
    obtainmentTimestamp: 0,
    scope: [],
  };
}

async function persistCurrentToken(
  provider: RefreshingAuthProvider,
  tokenPath: string,
  userId: string,
): Promise<void> {
  const token = await provider.getAccessTokenForUser(userId);
  if (token) {
    await saveTokens(tokenPath, token);
  }
}

export async function createAuthProvider(
  config: AppConfig,
  oauth: OAuthWaiter,
  status: StatusStore,
): Promise<{ provider: RefreshingAuthProvider; userId: string }> {
  if (!config.clientId) {
    throw new Error("TWITCH_CLIENT_ID is required.");
  }
  if (!config.clientSecret) {
    throw new Error(
      "TWITCH_CLIENT_SECRET is required. Add it to .env from your Twitch developer application.",
    );
  }

  const provider = new RefreshingAuthProvider({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });

  provider.on(provider.onRefresh, (_userId, tokenData) => {
    void saveTokens(config.tokenPath, tokenData);
  });

  const authorize = async (): Promise<string> => {
    status.patch({ phase: "needs_login", user: null, eventSub: false });
    const url = buildAuthorizeUrl(config);
    console.log(`Authorize this app in a browser:\n  ${url}\n`);
    console.log(`Or open ${config.publicBaseUrl}/oauth`);
    const code = await oauth.wait();
    const userId = await provider.addUserForCode(code, ["chat"]);
    await persistCurrentToken(provider, config.tokenPath, userId);
    return userId;
  };

  const tokens = (await loadTokens(config.tokenPath)) ?? tokensFromEnv(config);

  let userId: string;
  if (tokens) {
    try {
      userId = await provider.addUserForToken(tokens, ["chat"]);
      await persistCurrentToken(provider, config.tokenPath, userId);
      console.log(`Loaded stored token for user ${userId}.`);
    } catch (error) {
      console.warn("Stored tokens failed; starting a new OAuth login.", error);
      userId = await authorize();
    }
  } else {
    userId = await authorize();
  }

  const scopes = provider.getCurrentScopesForUser(userId);
  if (!scopes.includes("user:read:chat")) {
    console.warn(
      `Token is missing user:read:chat (have: ${scopes.join(", ") || "none"}). Re-authorize to grant EventSub chat access.`,
    );
    userId = await authorize();
  }

  return { provider, userId };
}
