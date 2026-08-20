import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type { AppConfig } from "../config.js";
import { buildAuthorizeUrl } from "../config.js";
import type { EventBus } from "../events.js";
import { toWireEvent } from "../events.js";
import type { OAuthWaiter } from "../twitch/auth.js";
import type { StatusStore } from "../status.js";
import type { UserStore } from "../store/users.js";
import type { MessageStore } from "../store/messages.js";
import type { OverlaySettings, SettingsStore } from "../store/settings.js";
import type { RemapStore } from "../store/remaps.js";
import { normalizeUsername, safeEqual, type AccountStore } from "../store/accounts.js";
import { CHAT_COMMANDS, type CommandFlags } from "../chat/catalog.js";
import {
  clearSessionCookie,
  createSessionStore,
  isPublicPath,
  sessionCookie,
  type SessionAccount,
} from "./session.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type ClientSocket = {
  send: (data: string) => void;
  on: (event: "close" | "error", listener: () => void) => void;
};

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
  accounts: AccountStore;
}): Promise<FastifyInstance> {
  const { config, bus, oauth, status, users, messages, settings, remaps, accounts } = options;
  const app = Fastify({ logger: false });
  const clients = new Set<ClientSocket>();
  const sessions = createSessionStore();
  const secureCookie = config.publicBaseUrl.startsWith("https://");

  await app.register(websocket);

  app.get("/login", async (_request, reply) => reply.redirect("/login/"));

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

  app.post("/api/login", async (request, reply) => {
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
  });

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
    const flags = settings.snapshot().commands;
    return {
      commands: CHAT_COMMANDS.map((command) => ({
        ...command,
        enabled: flags[command.id] !== false,
      })),
    };
  });

  app.patch("/api/commands", async (request) => {
    const body = (request.body ?? {}) as Partial<CommandFlags>;
    const current = settings.snapshot().commands;
    const overlay = await settings.update({ commands: { ...current, ...body } });
    bus.emit({ type: "overlay.settings", payload: overlay });
    const flags = overlay.commands;
    return {
      commands: CHAT_COMMANDS.map((command) => ({
        ...command,
        enabled: flags[command.id] !== false,
      })),
    };
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
    reply.redirect(buildAuthorizeUrl(config));
  });

  app.get("/oauth/callback", async (request, reply) => {
    const query = request.query as { code?: string; error?: string; error_description?: string };
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
    const waiting = oauth.complete(query.code);
    const next = waiting ? "/?auth=ok" : "/?auth=received";
    return reply.redirect(next);
  });

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(
      JSON.stringify({
        type: "hello",
        ts: Date.now(),
        payload: { overlay: settings.snapshot() },
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

  await app.listen({ port: config.port, host: config.host });
  console.log(`Overlay:   ${config.publicBaseUrl}/overlays/chat/`);
  console.log(`Dashboard: ${config.publicBaseUrl}/dashboard/`);
  if (authEnabled(config)) {
    console.log(`Login:     ${config.publicBaseUrl}/login/`);
  }
  console.log(`OAuth:     ${config.publicBaseUrl}/oauth`);
  return app;
}
