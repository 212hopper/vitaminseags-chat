import type { ApiClient } from "@twurple/api";

const PENDING_MS = 15_000;
const ID_TTL_MS = 60_000;

export type BotChat = {
  send: (message: string, replyToId?: string) => Promise<void>;
  isBotEcho: (chatterId: string, messageId: string, text: string) => boolean;
};

export function createBotChat(api: ApiClient, broadcasterId: string, senderUserId: string): BotChat {
  const ids = new Set<string>();
  const pending: { text: string; until: number }[] = [];

  function dropPending(text: string): void {
    const index = pending.findIndex((item) => item.text === text);
    if (index !== -1) {
      pending.splice(index, 1);
    }
  }

  return {
    isBotEcho(chatterId, messageId, text) {
      if (ids.has(messageId)) {
        ids.delete(messageId);
        dropPending(text);
        return true;
      }
      if (chatterId !== senderUserId) {
        return false;
      }
      const now = Date.now();
      for (let i = pending.length - 1; i >= 0; i--) {
        const item = pending[i];
        if (item && item.until < now) {
          pending.splice(i, 1);
        }
      }
      const index = pending.findIndex((item) => item.text === text);
      if (index === -1) {
        return false;
      }
      pending.splice(index, 1);
      return true;
    },

    async send(message, replyToId) {
      const text = message.slice(0, 500);
      pending.push({ text, until: Date.now() + PENDING_MS });
      try {
        const sent = await api.chat.sendChatMessage(
          broadcasterId,
          text,
          replyToId ? { replyParentMessageId: replyToId } : undefined,
        );
        if (sent.isSent && sent.id) {
          ids.add(sent.id);
          setTimeout(() => ids.delete(sent.id), ID_TTL_MS);
        }
      } catch (error) {
        dropPending(text);
        console.warn(
          "Could not send Twitch chat reply. Re-authorize with user:write:chat, then restart.",
          error,
        );
      }
    },
  };
}
