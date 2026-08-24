import type { ChatEmote, ChatFragment } from "../events.js";
import { log } from "../log.js";

export type EmoteDef = ChatEmote & {
  zeroWidth: boolean;
  provider: "7tv" | "bttv" | "ffz";
};

const ZERO_WIDTH_FLAG = 1 << 8;
const USER_AGENT = "vitaminseags-chat/0.1";

async function fetchJson<T>(url: string, options?: { missingOk?: boolean }): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 404 && options?.missingOk) {
      return null;
    }
    if (!response.ok) {
      log.warn(`Emote fetch failed ${response.status}: ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    log.warn(`Emote fetch error for ${url}`, error);
    return null;
  }
}

function withHttps(url: string): string {
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }
  return url;
}

type SevenTvFile = { name: string; format: string };
type SevenTvEmote = {
  name: string;
  data?: {
    flags?: number;
    host?: { url: string; files?: SevenTvFile[] };
  };
};
type SevenTvSet = { emotes?: SevenTvEmote[] };
type SevenTvUser = {
  emote_set?: SevenTvSet;
  connections?: { emote_set?: SevenTvSet }[];
};

type BttvEmote = { id: string; code: string };
type BttvUser = { channelEmotes?: BttvEmote[]; sharedEmotes?: BttvEmote[] };

type FfzEmote = { name: string; urls?: Record<string, string> };
type FfzSet = { emoticons?: FfzEmote[] };
type FfzRoom = { sets?: Record<string, FfzSet> };
type FfzGlobal = { sets?: Record<string, FfzSet>; default_sets?: number[] };

function sevenTvUrl(hostUrl: string, files: SevenTvFile[] | undefined): string {
  const webp = files?.find((file) => file.name.startsWith("3x") && file.format === "WEBP")
    ?? files?.find((file) => file.format === "WEBP");
  const fileName = webp?.name ?? "3x.webp";
  return withHttps(`${hostUrl}/${fileName}`);
}

function addSevenTv(map: Map<string, EmoteDef>, set: SevenTvSet | undefined): void {
  for (const emote of set?.emotes ?? []) {
    const host = emote.data?.host;
    if (!emote.name || !host?.url) {
      continue;
    }
    map.set(emote.name, {
      name: emote.name,
      url: sevenTvUrl(host.url, host.files),
      zeroWidth: Boolean((emote.data?.flags ?? 0) & ZERO_WIDTH_FLAG),
      provider: "7tv",
    });
  }
}

function addBttv(map: Map<string, EmoteDef>, emotes: BttvEmote[] | undefined): void {
  for (const emote of emotes ?? []) {
    if (!emote.code || !emote.id) {
      continue;
    }
    map.set(emote.code, {
      name: emote.code,
      url: `https://cdn.betterttv.net/emote/${emote.id}/3x.webp`,
      zeroWidth: false,
      provider: "bttv",
    });
  }
}

function ffzBestUrl(urls: Record<string, string> | undefined): string | null {
  if (!urls) {
    return null;
  }
  const picked = urls["4"] ?? urls["2"] ?? urls["1"] ?? Object.values(urls)[0];
  return picked ? withHttps(picked) : null;
}

function addFfz(map: Map<string, EmoteDef>, sets: Record<string, FfzSet> | undefined): void {
  for (const set of Object.values(sets ?? {})) {
    for (const emote of set.emoticons ?? []) {
      const url = ffzBestUrl(emote.urls);
      if (!emote.name || !url) {
        continue;
      }
      map.set(emote.name, {
        name: emote.name,
        url,
        zeroWidth: false,
        provider: "ffz",
      });
    }
  }
}

export type EmoteRefreshResult = {
  count: number;
  channelProviders: string[];
};

export class EmoteCatalog {
  #byName = new Map<string, EmoteDef>();
  #refreshing: Promise<EmoteRefreshResult> | null = null;
  #channelProviders: string[] = [];

  lookup(name: string): EmoteDef | undefined {
    return this.#byName.get(name);
  }

  snapshot(): EmoteRefreshResult {
    return { count: this.#byName.size, channelProviders: [...this.#channelProviders] };
  }

  async refresh(broadcasterId: string): Promise<EmoteRefreshResult> {
    if (this.#refreshing) {
      return this.#refreshing;
    }
    this.#refreshing = this.#load(broadcasterId).finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #load(broadcasterId: string): Promise<EmoteRefreshResult> {
    const next = new Map<string, EmoteDef>();

    const [stvGlobal, stvUser, bttvGlobal, bttvUser, ffzGlobal, ffzRoom] = await Promise.all([
      fetchJson<SevenTvSet>("https://7tv.io/v3/emote-sets/global"),
      fetchJson<SevenTvUser>(`https://7tv.io/v3/users/twitch/${broadcasterId}`, { missingOk: true }),
      fetchJson<BttvEmote[]>("https://api.betterttv.net/3/cached/emotes/global"),
      fetchJson<BttvUser>(`https://api.betterttv.net/3/cached/users/twitch/${broadcasterId}`, { missingOk: true }),
      fetchJson<FfzGlobal>("https://api.frankerfacez.com/v1/set/global"),
      fetchJson<FfzRoom>(`https://api.frankerfacez.com/v1/room/id/${broadcasterId}`, { missingOk: true }),
    ]);

    addSevenTv(next, stvGlobal ?? undefined);
    addSevenTv(next, stvUser?.emote_set);
    for (const connection of stvUser?.connections ?? []) {
      addSevenTv(next, connection.emote_set);
    }
    addBttv(next, bttvGlobal ?? undefined);
    addBttv(next, bttvUser?.channelEmotes);
    addBttv(next, bttvUser?.sharedEmotes);
    addFfz(next, ffzGlobal?.sets);
    addFfz(next, ffzRoom?.sets);

    const channelProviders = [
      stvUser ? "7TV" : null,
      bttvUser ? "BTTV" : null,
      ffzRoom ? "FFZ" : null,
    ].filter((name): name is string => name !== null);

    if (next.size === 0 && this.#byName.size > 0) {
      log.warn("Emote refresh returned nothing; keeping the previous catalog.");
      return this.snapshot();
    }

    this.#byName = next;
    this.#channelProviders = channelProviders;

    if (channelProviders.length === 0) {
      log.info(
        `Loaded ${next.size} global third-party emotes. No 7TV/BTTV/FFZ channel page for this Twitch user yet.`,
      );
    } else {
      log.info(
        `Loaded ${next.size} third-party emotes (7TV / BTTV / FFZ), including channel catalogs: ${channelProviders.join(", ")}.`,
      );
    }

    return { count: next.size, channelProviders };
  }

  parseText(text: string): ChatFragment[] {
    if (!text) {
      return [];
    }

    const tokens = text.split(/(\s+)/);
    const fragments: ChatFragment[] = [];

    const pushText = (value: string) => {
      const last = fragments.at(-1);
      if (last?.type === "text") {
        last.text += value;
        return;
      }
      fragments.push({ type: "text", text: value });
    };

    for (const token of tokens) {
      if (!token) {
        continue;
      }
      const emote = this.#byName.get(token);
      if (emote) {
        fragments.push({
          type: "emote",
          name: emote.name,
          url: emote.url,
          zeroWidth: emote.zeroWidth,
        });
        continue;
      }
      pushText(token);
    }

    return fragments;
  }
}

export function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;
}

export function collapseZeroWidth(fragments: ChatFragment[]): ChatFragment[] {
  const stacked: ChatFragment[] = [];

  for (const fragment of fragments) {
    if (fragment.type === "emote" && fragment.zeroWidth) {
      const previous = stacked.at(-1);
      if (previous?.type === "emote") {
        previous.extra = [...(previous.extra ?? []), { name: fragment.name, url: fragment.url }];
        continue;
      }
    }

    if (fragment.type === "emote") {
      stacked.push({
        type: "emote",
        name: fragment.name,
        url: fragment.url,
        extra: fragment.extra,
      });
      continue;
    }

    stacked.push(fragment);
  }

  return stacked;
}
