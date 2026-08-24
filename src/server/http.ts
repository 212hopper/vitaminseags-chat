import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "../config.js";
import { buildAuthorizeUrl } from "../config.js";
import type { EventBus, ChatMessagePayload, ActivityPayload } from "../events.js";
import { toWireEvent } from "../events.js";
import type { OAuthWaiter } from "../twitch/auth.js";
import type { EmoteCatalog } from "../twitch/emotes.js";
import type { StatusStore } from "../status.js";
import type { UserStore } from "../store/users.js";
import type { MessageStore } from "../store/messages.js";
import type { OverlaySettings, SettingsStore } from "../store/settings.js";
import type { RemapStore } from "../store/remaps.js";
import type { HiddenStore } from "../store/hidden.js";
import { normalizeUsername, safeEqual, type AccountStore } from "../store/accounts.js";
import {
  cloneCustomCommands,
  createCustomCommand,
  isCommandId,
  sanitizeCustomCommand,
  serializeCommands,
  type CommandFlags,
} from "../chat/catalog.js";
import {
  cloneTimedMessages,
  createTimedMessage,
  sanitizeTimedMessage,
  timedMessageIsComplete,
} from "../chat/timed.js";
import { log, pinoToAppLogStream } from "../log.js";
import {
  clearOauthStateCookie,
  clearSessionCookie,
  loadSessionStore,
  isPublicPath,
  oauthStateCookie,
  oauthStateMatches,
  readOauthStateCookie,
  sessionCookie,
  type SessionAccount,
} from "./session.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ClientSocket = {
  send: (data: string) => void;
  on: (event: "close" | "error", listener: () => void) => void;
};

declare module "fastify" {
  interface FastifyInstance {
    flushSessions: () => Promise<void>;
  }
}

function authEnabled(config: AppConfig): boolean {
  return Boolean(config.adminUsername && config.adminPassword);
}

function pathnameOf(url: string): string {
  return url.split("?")[0] ?? url;
}

export async function startHttpServer(options: {
  config: AppConfig;
  bus: EventBus;
  oauth: OAuthWaiter;
  status: StatusStore;
  users: UserStore;
  messages: MessageStore;
  settings: SettingsStore;
  remaps: RemapStore;
  hidden: HiddenStore;
  accounts: AccountStore;
  emotes: EmoteCatalog;
}): Promise<FastifyInstance> {
  const { config, bus, oauth, status, users, messages, settings, remaps, hidden, accounts, emotes } = options;
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.fastifyLogLevel,
      stream: pinoToAppLogStream(),
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            host: request.headers.host,
          };
        },
      },
    },
  });
  const clients = new Set<ClientSocket>();
  const sessions = await loadSessionStore(path.join(config.dataDir, "sessions.json"));
  const secureCookie = config.publicBaseUrl.startsWith("https://");
  const recentChat: { payload: ChatMessagePayload; ts: number }[] = [];
  const recentActivity: ActivityPayload[] = [];
  const feedCap = 150;

  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  app.get("/login", async (_request, reply) => reply.redirect("/login/"));

  app.get("/health", async () => {
    const snap = status.snapshot();
    return {
      ok: true,
      phase: snap.phase,
      eventSub: snap.eventSub,
      live: snap.stream.live,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  const currentAccount = (request: FastifyRequest): SessionAccount | null => {
    if (!authEnabled(config)) {
      return { username: "local", role: "admin" };
    }
    return sessions.resolve(request.headers.cookie);
  };

  const requireSignIn = (request: FastifyRequest, reply: FastifyReply): SessionAccount | null => {
    const account = currentAccount(request);
    if (account) {
      return account;
    }
    void reply.status(401).send({ error: "Sign in required" });
    return null;
  };

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): SessionAccount | null => {
    const account = requireSignIn(request, reply);
    if (!account) {
      return null;
    }
    if (account.role !== "admin") {
      void reply.status(403).send({ error: "Admin only" });
      return null;
    }
    return account;
  };

  app.addHook("onRequest", async (request, reply) => {
    if (!authEnabled(config)) {
      return;
    }
    const pathname = pathnameOf(request.url);
    if (isPublicPath(pathname)) {
      return;
    }
    if (sessions.resolve(request.headers.cookie)) {
      return;
    }
    if (pathname.startsWith("/api/")) {
      return reply.status(401).send({ error: "Sign in required" });
    }
    const next = encodeURIComponent(pathname);
    return reply.redirect(`/login/?next=${next}`);
  });

  app.get("/api/me", async (request) => {
    if (!authEnabled(config)) {
      return { authEnabled: false, username: null, role: "admin" };
    }
    const account = sessions.resolve(request.headers.cookie);
    return {
      authEnabled: true,
      username: account?.username ?? null,
      role: account?.role ?? null,
    };
  });

  app.post(
    "/api/login",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      if (!authEnabled(config)) {
        return reply.status(400).send({ error: "App login is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD." });
      }
      const body = (request.body ?? {}) as { username?: string; password?: string };
      const username = normalizeUsername(body.username ?? "");
      const password = body.password ?? "";
      let account: SessionAccount | null = null;
      if (username && username === normalizeUsername(config.adminUsername) && safeEqual(password, config.adminPassword)) {
        account = { username: config.adminUsername, role: "admin" };
      } else if (username && accounts.verify(username, password)) {
        account = { username, role: "user" };
      }
      if (!account) {
        return reply.status(401).send({ error: "Wrong username or password" });
      }
      const token = sessions.create(account);
      void reply.header("Set-Cookie", sessionCookie(token, secureCookie));
      return { username: account.username, role: account.role };
    },
  );

  app.post("/api/logout", async (request, reply) => {
    sessions.destroy(request.headers.cookie);
    void reply.header("Set-Cookie", clearSessionCookie(secureCookie));
    return { ok: true };
  });

  app.get("/api/accounts", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const extra = accounts.list();
    const admin = config.adminUsername
      ? [{ username: config.adminUsername, role: "admin" as const, managed: false }]
      : [];
    return { users: [...admin, ...extra] };
  });

  app.post("/api/accounts", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const body = (request.body ?? {}) as { username?: string; password?: string };
    const created = await accounts.create(body.username ?? "", body.password ?? "");
    if (created === "invalid") {
      return reply.status(400).send({
        error: "Username must be 3–32 letters, numbers or underscores. Password must be at least 4 characters.",
      });
    }
    if (created === "exists") {
      return reply.status(409).send({ error: "That username already exists." });
    }
    return created;
  });

  app.delete("/api/accounts/:username", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const { username } = request.params as { username: string };
    if (config.adminUsername && normalizeUsername(username) === normalizeUsername(config.adminUsername)) {
      return reply.status(400).send({ error: "The env admin account cannot be deleted." });
    }
    const removed = await accounts.remove(username);
    if (!removed) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { ok: true };
  });

  app.get("/api/commands", async () => {
    const overlay = settings.snapshot();
    return { commands: serializeCommands(overlay.commands, overlay.customCommands) };
  });

  app.post("/api/commands", async (request, reply) => {
    const body = (request.body ?? {}) as {
      trigger?: string;
      reply?: string;
      sendReply?: boolean;
      who?: string;
      chatHelp?: string;
    };
    const current = settings.snapshot();
    const created = createCustomCommand({
      trigger: body.trigger ?? "",
      reply: body.reply ?? "",
      sendReply: body.sendReply,
      who: body.who === "mods" ? "mods" : "anyone",
      chatHelp: body.chatHelp ?? "",
      existing: current.customCommands,
    });
    if ("error" in created) {
      return reply.status(400).send({ error: created.error });
    }
    const overlay = await settings.update({
      customCommands: [...current.customCommands, created],
    });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { commands: serializeCommands(overlay.commands, overlay.customCommands) };
  });

  app.patch("/api/commands", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const current = settings.snapshot();
    const commandPatch: Partial<CommandFlags> = {};
    let custom = cloneCustomCommands(current.customCommands);
    let customChanged = false;

    for (const [key, value] of Object.entries(body)) {
      if (isCommandId(key)) {
        commandPatch[key] = value as CommandFlags[typeof key];
        continue;
      }
      const index = custom.findIndex((item) => item.id === key);
      if (index === -1) {
        continue;
      }
      const existing = custom[index];
      if (!existing) {
        continue;
      }
      const patch = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const next = sanitizeCustomCommand({ ...existing, ...patch, id: key }, existing, custom);
      if (!next) {
        return reply.status(400).send({ error: "That custom command could not be updated." });
      }
      custom[index] = next;
      customChanged = true;
    }

    const overlay = await settings.update({
      commands: { ...current.commands, ...commandPatch },
      ...(customChanged ? { customCommands: custom } : {}),
    });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { commands: serializeCommands(overlay.commands, overlay.customCommands) };
  });

  app.delete("/api/commands/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (isCommandId(id)) {
      return reply.status(400).send({ error: "Built-in commands cannot be deleted." });
    }
    const current = settings.snapshot();
    if (!current.customCommands.some((item) => item.id === id)) {
      return reply.status(404).send({ error: "Command not found" });
    }
    const overlay = await settings.update({
      customCommands: current.customCommands.filter((item) => item.id !== id),
    });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { commands: serializeCommands(overlay.commands, overlay.customCommands) };
  });

  app.get("/api/timers", async () => {
    return { timers: settings.snapshot().timedMessages ?? [] };
  });

  app.post("/api/timers", async (request, reply) => {
    const body = (request.body ?? {}) as {
      label?: string;
      message?: string;
      source?: string;
      customId?: string;
      intervalMinutes?: number;
      liveOnly?: boolean;
    };
    const current = settings.snapshot();
    const created = createTimedMessage({
      label: body.label ?? "",
      message: body.message ?? "",
      source: body.source === "help" || body.source === "custom" ? body.source : "text",
      customId: body.customId ?? "",
      intervalMinutes: body.intervalMinutes,
      liveOnly: body.liveOnly,
      existing: current.timedMessages ?? [],
    });
    if ("error" in created) {
      return reply.status(400).send({ error: created.error });
    }
    const overlay = await settings.update({
      timedMessages: [...(current.timedMessages ?? []), created],
    });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { timers: overlay.timedMessages };
  });

  app.patch("/api/timers", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const current = settings.snapshot();
    let timers = cloneTimedMessages(current.timedMessages);
    let changed = false;

    for (const [key, value] of Object.entries(body)) {
      const index = timers.findIndex((item) => item.id === key);
      if (index === -1) {
        continue;
      }
      const existing = timers[index];
      if (!existing) {
        continue;
      }
      const patch = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const next = sanitizeTimedMessage({ ...existing, ...patch, id: key }, existing);
      if (!next || !timedMessageIsComplete(next)) {
        return reply.status(400).send({ error: "That timed message could not be updated." });
      }
      timers[index] = next;
      changed = true;
    }

    if (!changed) {
      return { timers };
    }
    const overlay = await settings.update({ timedMessages: timers });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { timers: overlay.timedMessages };
  });

  app.delete("/api/timers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = settings.snapshot();
    const timers = current.timedMessages ?? [];
    if (!timers.some((item) => item.id === id)) {
      return reply.status(404).send({ error: "Timed message not found" });
    }
    const overlay = await settings.update({
      timedMessages: timers.filter((item) => item.id !== id),
    });
    bus.emit({ type: "overlay.settings", payload: overlay });
    return { timers: overlay.timedMessages };
  });

  app.get("/api/config", async () => ({
    overlay: settings.snapshot(),
    overlayUrl: `${config.publicBaseUrl}/overlays/chat/`,
  }));

  app.get("/api/settings", async () => settings.snapshot());

  app.patch("/api/settings", async (request) => {
    const body = (request.body ?? {}) as Partial<OverlaySettings>;
    const overlay = await settings.update(body);
    bus.emit({ type: "overlay.settings", payload: overlay });
    return overlay;
  });

  app.get("/api/emotes", async () => emotes.snapshot());

  app.post(
    "/api/emotes/refresh",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
        },
      },
    },
    async (_request, reply) => {
      const broadcasterId = status.snapshot().broadcaster?.id;
      if (!broadcasterId) {
        return reply.status(503).send({ error: "Twitch is not connected yet." });
      }
      try {
        return await emotes.refresh(broadcasterId);
      } catch (error) {
        log.warn("Manual emote refresh failed.", error);
        return reply.status(502).send({ error: "Could not refresh emote catalogs." });
      }
    },
  );

  app.get("/api/remaps", async () => ({ remaps: remaps.list() }));

  app.post("/api/remaps", async (request, reply) => {
    const body = (request.body ?? {}) as {
      login?: string;
      alias?: string;
      blocked?: boolean;
      userId?: string | null;
    };
    const created = await remaps.upsert({
      login: body.login ?? "",
      alias: body.alias ?? "",
      blocked: body.blocked,
      userId: body.userId,
    });
    if (!created) {
      return reply.status(400).send({
        error: "Need a valid Twitch login (3–25 characters) and an on-screen name (1–32 characters).",
      });
    }
    return created;
  });

  app.patch("/api/remaps/:login", async (request, reply) => {
    const { login } = request.params as { login: string };
    const body = (request.body ?? {}) as { alias?: string; blocked?: boolean };
    if (typeof body.alias === "string") {
      const updated = await remaps.upsert({
        login,
        alias: body.alias,
        blocked: body.blocked,
      });
      if (!updated) {
        return reply.status(400).send({ error: "Invalid on-screen name." });
      }
      return updated;
    }
    if (typeof body.blocked === "boolean") {
      const updated = await remaps.setBlocked(login, body.blocked);
      if (!updated) {
        return reply.status(404).send({ error: "Remap not found" });
      }
      return updated;
    }
    return reply.status(400).send({ error: "Nothing to update" });
  });

  app.delete("/api/remaps/:login", async (request, reply) => {
    const { login } = request.params as { login: string };
    const removed = await remaps.remove(login);
    if (!removed) {
      return reply.status(404).send({ error: "Remap not found" });
    }
    return { ok: true };
  });

  app.get("/api/hidden", async () => ({ logins: hidden.list() }));

  app.post("/api/hidden", async (request, reply) => {
    const body = (request.body ?? {}) as { login?: string };
    const result = await hidden.add(body.login ?? "");
    if (result === "invalid") {
      return reply.status(400).send({ error: "Need a valid Twitch login (3–25 letters, numbers or underscores)." });
    }
    if (result === "exists") {
      return reply.status(409).send({ error: "That login is already hidden." });
    }
    if (result === "full") {
      return reply.status(400).send({ error: "You can hide at most 100 logins." });
    }
    return { logins: hidden.list() };
  });

  app.delete("/api/hidden/:login", async (request, reply) => {
    const { login } = request.params as { login: string };
    const removed = await hidden.remove(login);
    if (!removed) {
      return reply.status(404).send({ error: "Login is not hidden." });
    }
    return { logins: hidden.list() };
  });

  app.get("/api/status", async () => status.snapshot());

  app.get("/api/stats", async () => ({
    users: users.stats(),
  }));

  app.get("/api/stats/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = users.getUser(id);
    const chat = await messages.listByUser(id);
    if (!user && chat.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }
    return {
      user: user ?? {
        id,
        login: chat.at(-1)?.login ?? id,
        displayName: chat.at(-1)?.displayName ?? id,
        color: null,
        messageCount: chat.length,
      },
      messages: chat,
    };
  });

  app.get("/oauth", async (_request, reply) => {
    const state = oauth.issueState();
    void reply.header("Set-Cookie", oauthStateCookie(state, secureCookie));
    return reply.redirect(buildAuthorizeUrl(config, state));
  });

  app.get("/oauth/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };
    const cookieState = readOauthStateCookie(request.headers.cookie);
    const valid = cookieState
      ? oauthStateMatches(cookieState, query.state)
      : oauth.takeState(query.state);
    if (!valid) {
      return reply.status(400).send("Invalid OAuth state");
    }
    oauth.clearState();
    void reply.header("Set-Cookie", clearOauthStateCookie(secureCookie));
    if (query.error) {
      return reply
        .type("text/html")
        .send(
          `<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">
            <h1>Authorization failed</h1>
            <p>${escapeHtml(query.error)}: ${escapeHtml(query.error_description ?? "")}</p>
          </body></html>`,
        );
    }
    if (!query.code) {
      return reply.status(400).send("Missing code");
    }
    const waiting = await oauth.complete(query.code);
    const next = waiting === "applied" ? "/?auth=updated" : "/?auth=ok";
    return reply.redirect(next);
  });

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(
      JSON.stringify({
        type: "hello",
        ts: Date.now(),
        payload: {
          overlay: settings.snapshot(),
          recentChat,
          recentActivity,
        },
      }),
    );
    socket.on("close", () => {
      clients.delete(socket);
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });

  bus.on((event) => {
    if (event.type === "chat.message") {
      recentChat.push({ payload: event.payload, ts: Date.now() });
      if (recentChat.length > feedCap) {
        recentChat.shift();
      }
    }
    if (event.type === "chat.message.delete") {
      const index = recentChat.findIndex((entry) => entry.payload.id === event.payload.id);
      if (index >= 0) {
        recentChat.splice(index, 1);
      }
    }
    if (event.type === "channel.activity") {
      recentActivity.push(event.payload);
      if (recentActivity.length > feedCap) {
        recentActivity.shift();
      }
    }
    const body = JSON.stringify(toWireEvent(event));
    for (const client of clients) {
      try {
        client.send(body);
      } catch {
        clients.delete(client);
      }
    }
  });

  await app.register(fastifyStatic, {
    root: config.publicDir,
    prefix: "/",
    index: ["index.html"],
    list: false,
  });

  app.decorate("flushSessions", () => sessions.flush());

  await app.listen({ port: config.port, host: config.host });
  log.info("HTTP listening", {
    host: config.host,
    port: config.port,
    overlay: `${config.publicBaseUrl}/overlays/chat/`,
    dashboard: `${config.publicBaseUrl}/dashboard/`,
    oauth: `${config.publicBaseUrl}/oauth`,
    health: `${config.publicBaseUrl}/health`,
  });
  return app;
}
