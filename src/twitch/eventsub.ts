import type { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import type { EventSubChannelChatMessageEvent } from "@twurple/eventsub-base";
import type { EventBus, ChatFragment, ChatMessagePayload, ActivityPayload } from "../events.js";
import type { StatusStore } from "../status.js";
import type { UserStore } from "../store/users.js";
import type { MessageStore } from "../store/messages.js";
import type { SettingsStore } from "../store/settings.js";
import type { RemapStore } from "../store/remaps.js";
import type { HiddenStore } from "../store/hidden.js";
import { parseColourCommand } from "../chat/colour.js";
import {
  canUseWho,
  commandHits,
  commandWho,
  findCustomCommand,
  isCommandEnabled,
  publicCommandHelp,
} from "../chat/catalog.js";
import {
  isChannelStaff,
  parseChatVisibilityCommand,
  parseHelpCommand,
  parsePartyCommand,
  parseUsernameCommand,
} from "../chat/commands.js";
import { log } from "../log.js";
import { BadgeCatalog } from "./badges.js";
import type { BotChat } from "./chat-send.js";
import { collapseZeroWidth, EmoteCatalog, twitchEmoteUrl } from "./emotes.js";

const EMOTE_REFRESH_MS = 30 * 60 * 1000;
const HELP_COOLDOWN_MS = 8_000;
const CUSTOM_REPLY_COOLDOWN_MS = 4_000;

function buildFragments(
  event: EventSubChannelChatMessageEvent,
  emotes: EmoteCatalog,
): ChatFragment[] {
  const fragments: ChatFragment[] = [];

  for (const part of event.messageParts) {
    if (part.type === "emote") {
      fragments.push({
        type: "emote",
        name: part.text,
        url: twitchEmoteUrl(part.emote.id),
      });
      continue;
    }
    if (part.type === "mention") {
      fragments.push({ type: "mention", text: part.text });
      continue;
    }
    if (part.type === "cheermote") {
      fragments.push({
        type: "cheer",
        text: part.text,
        bits: part.cheermote.bits,
      });
      continue;
    }
    fragments.push(...emotes.parseText(part.text));
  }

  return collapseZeroWidth(fragments);
}

function toPayload(
  event: EventSubChannelChatMessageEvent,
  emotes: EmoteCatalog,
  badges: BadgeCatalog,
  nameColor: string | null,
  displayName: string,
): ChatMessagePayload {
  return {
    id: event.messageId,
    user: {
      id: event.chatterId,
      name: event.chatterName,
      displayName,
      color: nameColor ?? event.color,
    },
    badges: badges.resolve(event.badges),
    fragments: buildFragments(event, emotes),
    text: event.messageText,
    bits: event.bits,
    isRedemption: event.isRedemption,
  };
}

export async function startEventSub(options: {
  api: ApiClient;
  bus: EventBus;
  broadcasterId: string;
  userId: string;
  status: StatusStore;
  users: UserStore;
  messages: MessageStore;
  settings: SettingsStore;
  remaps: RemapStore;
  hidden: HiddenStore;
  botChat: BotChat;
}): Promise<EventSubWsListener> {
  const { api, bus, broadcasterId, userId, status, users, messages, settings, remaps, hidden, botChat } = options;
  const emotes = new EmoteCatalog();
  const badges = new BadgeCatalog();
  let lastHelpAt = 0;
  const customReplyAt = new Map<string, number>();

  await Promise.all([emotes.refresh(broadcasterId), badges.refresh(api, broadcasterId)]);

  const listener = new EventSubWsListener({ apiClient: api });

  listener.onChannelChatMessage(broadcasterId, userId, (event) => {
    const chatter = {
      id: event.chatterId,
      login: event.chatterName,
      displayName: event.chatterDisplayName,
    };
    remaps.rememberUser(event.chatterId, event.chatterName);
    if (botChat.isBotEcho(event.chatterId, event.messageId, event.messageText)) {
      return;
    }
    if (hidden.has(event.chatterName)) {
      return;
    }
    const live = settings.snapshot();
    const staff = isChannelStaff(event);

    const visibility = parseChatVisibilityCommand(event.messageText);
    if (visibility) {
      const commandId = visibility === "show" ? "showchat" : "hidechat";
      if (isCommandEnabled(live.commands, commandId)) {
        if (canUseWho(commandWho(live.commands, commandId), staff)) {
          void settings.update({ chatVisible: visibility === "show" }).then((overlay) => {
            bus.emit({ type: "overlay.settings", payload: overlay });
          });
        }
        return;
      }
    }

    const usernameCommand = parseUsernameCommand(event.messageText);
    if (usernameCommand && isCommandEnabled(live.commands, "username")) {
      if (canUseWho(commandWho(live.commands, "username"), staff) && usernameCommand !== "invalid") {
        void remaps.setSelf(
          { id: event.chatterId, login: event.chatterName },
          usernameCommand.alias,
        );
      }
      return;
    }

    const colourCommand = parseColourCommand(event.messageText);
    if (colourCommand && isCommandEnabled(live.commands, "colour")) {
      if (canUseWho(commandWho(live.commands, "colour"), staff) && colourCommand !== "invalid") {
        void users.setColor(chatter, colourCommand.color);
      }
      return;
    }

    if (parsePartyCommand(event.messageText) && isCommandEnabled(live.commands, "party")) {
      if (
        canUseWho(commandWho(live.commands, "party"), staff) &&
        commandHits(live.commands, "party", staff)
      ) {
        bus.emit({ type: "overlay.party", payload: { durationMs: 10_000 } });
      }
      return;
    }

    if (parseHelpCommand(event.messageText) && isCommandEnabled(live.commands, "help")) {
      if (canUseWho(commandWho(live.commands, "help"), staff)) {
        const now = Date.now();
        if (now - lastHelpAt >= HELP_COOLDOWN_MS) {
          lastHelpAt = now;
          void botChat.send(publicCommandHelp(live.commands, live.customCommands), event.messageId);
        }
      }
      return;
    }

    const custom = findCustomCommand(live.customCommands, event.messageText);
    if (custom?.enabled) {
      if (canUseWho(custom.who, staff) && custom.sendReply && custom.reply) {
        const now = Date.now();
        const last = customReplyAt.get(custom.id) ?? 0;
        if (now - last >= CUSTOM_REPLY_COOLDOWN_MS) {
          customReplyAt.set(custom.id, now);
          void botChat.send(custom.reply, event.messageId);
        }
      }
      return;
    }

    void users.recordMessage(chatter);
    void messages.append({
      id: event.messageId,
      userId: event.chatterId,
      login: event.chatterName,
      displayName: event.chatterDisplayName,
      text: event.messageText,
      ts: Date.now(),
    });

    if (live.hideCommands && event.messageText.startsWith("!")) {
      return;
    }

    const nameColor = users.getColor(event.chatterId);
    const displayName =
      remaps.resolve(event.chatterId, event.chatterName) ?? event.chatterDisplayName;
    bus.emit({
      type: "chat.message",
      payload: toPayload(event, emotes, badges, nameColor, displayName),
    });
  });

  listener.onChannelChatMessageDelete(broadcasterId, userId, (event) => {
    bus.emit({ type: "chat.message.delete", payload: { id: event.messageId } });
  });

  listener.onChannelChatClear(broadcasterId, userId, () => {
    bus.emit({ type: "chat.clear", payload: {} });
  });

  subscribeChannelActivity(listener, bus, broadcasterId, userId);

  listener.on(listener.onUserSocketConnect, (connectedUserId) => {
    status.patch({ eventSub: true });
    log.info(`EventSub socket connected for user ${connectedUserId}.`);
  });
  listener.on(listener.onUserSocketDisconnect, (disconnectedUserId, error) => {
    status.patch({ eventSub: false });
    log.warn(`EventSub socket disconnected for user ${disconnectedUserId}.`, error ?? "");
  });

  listener.start();
  log.info("EventSub listener started for channel chat.");

  const timer = setInterval(() => {
    void emotes.refresh(broadcasterId).catch((error: unknown) => {
      log.warn("Emote refresh failed.", error);
    });
  }, EMOTE_REFRESH_MS);
  timer.unref?.();

  return listener;
}

function emitActivity(bus: EventBus, payload: Omit<ActivityPayload, "id" | "ts">): void {
  bus.emit({
    type: "channel.activity",
    payload: {
      id: `${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      ...payload,
    },
  });
}

function subscribeChannelActivity(
  listener: EventSubWsListener,
  bus: EventBus,
  broadcasterId: string,
  userId: string,
): void {
  listener.on(listener.onSubscriptionCreateFailure, (_subscription, error) => {
    log.warn("EventSub subscription failed.", error);
  });

  listener.onChannelFollow(broadcasterId, userId, (event) => {
    emitActivity(bus, {
      kind: "follow",
      user: event.userDisplayName,
      text: `${event.userDisplayName} followed`,
    });
  });

  listener.onChannelSubscription(broadcasterId, (event) => {
    if (event.isGift) {
      return;
    }
    emitActivity(bus, {
      kind: "subscribe",
      user: event.userDisplayName,
      text: `${event.userDisplayName} subscribed`,
    });
  });

  listener.onChannelSubscriptionGift(broadcasterId, (event) => {
    const name = event.isAnonymous ? "Anonymous" : event.gifterDisplayName ?? "Anonymous";
    const count = event.amount;
    emitActivity(bus, {
      kind: "gift",
      user: name,
      text: `${name} gifted ${count} sub${count === 1 ? "" : "s"}`,
    });
  });

  listener.onChannelCheer(broadcasterId, (event) => {
    const name = event.userDisplayName ?? "Anonymous";
    emitActivity(bus, {
      kind: "cheer",
      user: name,
      text: `${name} cheered ${event.bits} bits`,
    });
  });

  listener.onChannelRaidTo(broadcasterId, (event) => {
    emitActivity(bus, {
      kind: "raid",
      user: event.raidingBroadcasterDisplayName,
      text: `${event.raidingBroadcasterDisplayName} raided with ${event.viewers} viewers`,
    });
  });
}
