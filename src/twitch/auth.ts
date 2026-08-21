import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RefreshingAuthProvider } from "@twurple/auth";
import type { AccessToken } from "@twurple/auth";
import type { AppConfig } from "../config.js";
import { OAUTH_SCOPES } from "../config.js";
import { log } from "../log.js";
import { OAUTH_STATE_TTL_MS } from "../server/session.js";
import { safeEqual } from "../store/accounts.js";
import type { StatusStore } from "../status.js";

export function missingOAuthScopes(have: readonly string[]): string[] {
  return OAUTH_SCOPES.filter((scope) => !have.includes(scope));
}

export class OAuthWaiter {
  #pending: ((code: string) => void) | null = null;
  #buffered: string | null = null;
  #apply: ((code: string) => Promise<string>) | null = null;
  #expectedState: string | null = null;
  #stateExpiresAt = 0;

  issueState(): string {
    const state = randomBytes(16).toString("hex");
    this.#expectedState = state;
    this.#stateExpiresAt = Date.now() + OAUTH_STATE_TTL_MS;
    return state;
  }

  takeState(state: string | undefined): boolean {
    if (!this.#expectedState) {
      return false;
    }
    if (Date.now() > this.#stateExpiresAt) {
      this.#expectedState = null;
      this.#stateExpiresAt = 0;
      return false;
    }
    if (!state || !safeEqual(state, this.#expectedState)) {
      return false;
    }
    this.#expectedState = null;
    this.#stateExpiresAt = 0;
    return true;
  }

  clearState(): void {
    this.#expectedState = null;
    this.#stateExpiresAt = 0;
  }

  bind(apply: (code: string) => Promise<string>): void {
    this.#apply = apply;
    if (this.#buffered) {
      const code = this.#buffered;
      this.#buffered = null;
      void apply(code);
    }
  }

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

  async complete(code: string): Promise<"applied" | "queued"> {
    if (this.#pending) {
      this.#pending(code);
      this.#pending = null;
      return "queued";
    }
    if (this.#apply) {
      await this.#apply(code);
      return "applied";
    }
    this.#buffered = code;
    return "queued";
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

  const applyCode = async (code: string): Promise<string> => {
    const appliedId = await provider.addUserForCode(code, ["chat"]);
    await persistCurrentToken(provider, config.tokenPath, appliedId);
    const granted = provider.getCurrentScopesForUser(appliedId);
    const missing = missingOAuthScopes(granted);
    status.patch({ missingScopes: missing });
    log.info(`Saved Twitch token for user ${appliedId}. Scopes: ${granted.join(", ") || "none"}`);
    if (missing.length) {
      log.warn(
        `Token is still missing: ${missing.join(", ")}. On the Twitch consent screen, allow every permission listed.`,
      );
    } else {
      log.info("Twitch token has every scope this app needs. Restart the container if activity EventSub still errors.");
    }
    return appliedId;
  };
  oauth.bind(applyCode);

  const authorize = async (): Promise<string> => {
    status.patch({ phase: "needs_login", user: null, eventSub: false });
    if (config.adminUsername && config.adminPassword) {
      log.info(
        `Authorize this app in a browser: sign in at ${config.publicBaseUrl}/login/ first, then open ${config.publicBaseUrl}/oauth`,
      );
    } else {
      log.info(`Authorize this app in a browser: ${config.publicBaseUrl}/oauth`);
    }
    const code = await oauth.wait();
    return applyCode(code);
  };

  const tokens = (await loadTokens(config.tokenPath)) ?? tokensFromEnv(config);

  let userId: string;
  if (tokens) {
    try {
      userId = await provider.addUserForToken(tokens, ["chat"]);
      await persistCurrentToken(provider, config.tokenPath, userId);
      log.info(`Loaded stored token for user ${userId}.`);
    } catch (error) {
      log.warn("Stored tokens failed; starting a new OAuth login.", error);
      userId = await authorize();
    }
  } else {
    userId = await authorize();
  }

  const scopes = provider.getCurrentScopesForUser(userId);
  const missing = missingOAuthScopes(scopes);
  status.patch({ missingScopes: missing });
  if (missing.length) {
    log.warn(
      `Twitch token missing scopes: ${missing.join(", ")}. Open ${config.publicBaseUrl}/oauth, accept every permission, then restart the container.`,
    );
  } else {
    log.info(`Twitch token scopes: ${scopes.join(", ")}`);
  }

  if (!scopes.includes("user:read:chat")) {
    log.warn(
      `Token is missing user:read:chat (have: ${scopes.join(", ") || "none"}). Re-authorize to grant EventSub chat access.`,
    );
    userId = await authorize();
  }

  return { provider, userId };
}
