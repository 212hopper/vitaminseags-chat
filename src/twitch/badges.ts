import type { ApiClient } from "@twurple/api";
import type { ChatBadge } from "../events.js";
import { log } from "../log.js";

export class BadgeCatalog {
  #byKey = new Map<string, { url: string; title: string }>();

  async refresh(api: ApiClient, broadcasterId: string): Promise<void> {
    const next = new Map<string, { url: string; title: string }>();
    const [globalSets, channelSets] = await Promise.all([
      api.chat.getGlobalBadges(),
      api.chat.getChannelBadges(broadcasterId),
    ]);

    for (const set of [...globalSets, ...channelSets]) {
      for (const version of set.versions) {
        next.set(`${set.id}/${version.id}`, {
          url: version.getImageUrl(2),
          title: version.title,
        });
      }
    }

    this.#byKey = next;
    log.info(`Loaded ${next.size} chat badges.`);
  }

  resolve(badges: Record<string, string>): ChatBadge[] {
    const resolved: ChatBadge[] = [];
    for (const [setId, version] of Object.entries(badges)) {
      const info = this.#byKey.get(`${setId}/${version}`);
      if (!info) {
        continue;
      }
      resolved.push({
        setId,
        version,
        url: info.url,
        title: info.title,
      });
    }
    return resolved;
  }
}
