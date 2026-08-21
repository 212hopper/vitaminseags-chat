import "dotenv/config";
import path from "node:path";
import { ApiClient } from "@twurple/api";
import { log } from "./log.js";
import { loadConfig } from "./config.js";
import { createEventBus } from "./events.js";
import { startHttpServer } from "./server/http.js";
import { createStatusStore } from "./status.js";
import { loadUserStore } from "./store/users.js";
import { loadMessageStore } from "./store/messages.js";
import { loadSettingsStore } from "./store/settings.js";
import { loadRemapStore } from "./store/remaps.js";
import { loadAccountStore } from "./store/accounts.js";
import { createAuthProvider, OAuthWaiter } from "./twitch/auth.js";
import { createBotChat } from "./twitch/chat-send.js";
import { startEventSub } from "./twitch/eventsub.js";
import { startStreamPoller } from "./twitch/stream.js";
import { startTimedMessages } from "./twitch/timed-messages.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const bus = createEventBus();
  const oauth = new OAuthWaiter();
  const status = createStatusStore("/overlays/chat/");
  const users = await loadUserStore(path.join(config.dataDir, "users.json"));
  const messages = await loadMessageStore(path.join(config.dataDir, "messages"));
  const settings = await loadSettingsStore(
    path.join(config.dataDir, "overlay-settings.json"),
    config.overlay,
  );
  const remaps = await loadRemapStore(path.join(config.dataDir, "remaps.json"));
  const accounts = await loadAccountStore(
    path.join(config.dataDir, "app-users.json"),
    config.adminUsername,
  );

  if (!config.adminUsername || !config.adminPassword) {
    log.warn("ADMIN_USERNAME / ADMIN_PASSWORD are not set. App pages are open on the network.");
  }

  const server = await startHttpServer({
    config,
    bus,
    oauth,
    status,
    users,
    messages,
    settings,
    remaps,
    accounts,
  });
  const { provider: authProvider, userId } = await createAuthProvider(config, oauth, status);
  const api = new ApiClient({ authProvider });

  const authedUser = await api.users.getAuthenticatedUser(userId);

  let broadcasterId = userId;
  let broadcasterLogin = authedUser.name;
  if (config.channelLogin) {
    const broadcaster = await api.users.getUserByName(config.channelLogin);
    if (!broadcaster) {
      throw new Error(`Twitch channel not found: ${config.channelLogin}`);
    }
    broadcasterId = broadcaster.id;
    broadcasterLogin = broadcaster.name;
  }

  status.patch({
    phase: "ready",
    user: {
      id: authedUser.id,
      login: authedUser.name,
      displayName: authedUser.displayName,
    },
    broadcaster: {
      id: broadcasterId,
      login: broadcasterLogin,
    },
  });

  const botChat = createBotChat(api, broadcasterId, userId);

  const listener = await startEventSub({
    api,
    bus,
    broadcasterId,
    userId,
    status,
    users,
    messages,
    settings,
    remaps,
    botChat,
  });
  const stopStreamPoller = startStreamPoller(api, broadcasterId, status);
  const stopTimedMessages = startTimedMessages({ settings, status, botChat });

  log.info(`Listening as user ${authedUser.name} for broadcaster ${broadcasterLogin}.`);

  const shutdown = async () => {
    stopStreamPoller();
    stopTimedMessages();
    listener.stop();
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error: unknown) => {
  log.error("Process failed to start", error);
  process.exit(1);
});
