import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_COMMANDS, type CommandFlags } from "./chat/catalog.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw === "true" || raw === "yes";
}

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const DEFAULT_FONT =
  'Bahnschrift, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

export type OverlayConfig = {
  maxMessages: number;
  holdMs: number;
  fadeOutMs: number;
  hideCommands: boolean;
  chatVisible: boolean;
  fontFamily: string;
  fontSizePx: number;
  posX: number;
  posY: number;
  boxWidth: number;
  boxHeight: number;
  commands: CommandFlags;
};

export type AppConfig = {
  rootDir: string;
  publicDir: string;
  dataDir: string;
  tokenPath: string;
  host: string;
  port: number;
  publicBaseUrl: string;
  clientId: string;
  clientSecret: string;
  channelLogin: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  adminUsername: string;
  adminPassword: string;
  overlay: OverlayConfig;
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function loadConfig(): AppConfig {
  const port = envNumber("PORT", 30009);
  const publicBaseUrl = stripTrailingSlash(
    env("PUBLIC_BASE_URL", `http://127.0.0.1:${port}`),
  );
  const redirectUri = env("TWITCH_REDIRECT_URI", `${publicBaseUrl}/oauth/callback`);

  return {
    rootDir,
    publicDir: path.join(rootDir, "public"),
    dataDir: path.join(rootDir, "data"),
    tokenPath: path.join(rootDir, "data", "tokens.json"),
    host: env("HOST", "0.0.0.0"),
    port,
    publicBaseUrl,
    clientId: env("TWITCH_CLIENT_ID") || env("client"),
    clientSecret: env("TWITCH_CLIENT_SECRET"),
    channelLogin: (env("TWITCH_CHANNEL") || env("twitch")).toLowerCase(),
    redirectUri,
    accessToken: env("TWITCH_ACCESS_TOKEN") || env("access"),
    refreshToken: env("TWITCH_REFRESH_TOKEN") || env("refresh"),
    adminUsername: env("ADMIN_USERNAME"),
    adminPassword: env("ADMIN_PASSWORD"),
    overlay: {
      maxMessages: envNumber("OVERLAY_MAX_MESSAGES", 14),
      holdMs: envNumber("OVERLAY_HOLD_MS", 25_000),
      fadeOutMs: envNumber("OVERLAY_FADE_MS", 600),
      hideCommands: envBool("OVERLAY_HIDE_COMMANDS", true),
      chatVisible: true,
      fontFamily: DEFAULT_FONT,
      fontSizePx: 17,
      posX: 16,
      posY: 200,
      boxWidth: 420,
      boxHeight: 860,
      commands: { ...DEFAULT_COMMANDS },
    },
  };
}

export const OAUTH_SCOPES = ["user:read:chat", "user:bot", "channel:bot"] as const;

export function buildAuthorizeUrl(config: AppConfig): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("force_verify", "true");
  return url.toString();
}
