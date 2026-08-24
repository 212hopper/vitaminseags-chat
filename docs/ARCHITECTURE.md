# Architecture

vitaminseags-chat is a **self-hosted companion** for one Twitch channel. It runs as one Node process in Docker/Portainer (or locally while developing). OBS on the stream PC loads overlay pages as Browser Sources from `PUBLIC_BASE_URL`. Twitch is the source of truth for events; overlays only render `/ws` frames.

Do not grow this into a StreamElements-style product (theme store, cloud dashboard, multi-tenant). Grow it as **more EventSub topics + more overlay pages** on the same bus, plus dashboard routes on this same container. Persist on JSON files in the data volume until that is no longer enough.

## Process shape

```
Twitch Helix + EventSub WS
        │
        ▼
 src/twitch/*   (auth, EventSub, emotes, badges, chat send, timers)
        │  bus.emit(AppEvent)
        ▼
 src/events.ts  (typed in-process pub/sub)
        │
        ▼
 src/server/http.ts
   ├── GET  /overlays/*     OBS pages (public)
   ├── GET  /ws             JSON events { type, payload, ts } (public)
   ├── GET  /health         liveness (public)
   ├── GET  /oauth          Twitch login
   ├── GET  /dashboard/*    streamer UI (app login)
   └── GET  /api/*          settings, commands, timers, remaps, hidden, stats
```

Boot order in `src/index.ts`: HTTP (so OAuth and `/health` work) → auth → Helix client → EventSub → stream poller → timed messages → shutdown hooks.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | Process entry |
| `src/config.ts` | Env, port, overlay defaults, OAuth scopes, log level |
| `src/log.ts` | JSON stdout/stderr (no tokens) |
| `src/events.ts` | `AppEvent` union, bus, wire envelope |
| `src/chat/catalog.ts` | Built-in + custom command model |
| `src/chat/timed.ts` | Timed message model |
| `src/twitch/auth.ts` | RefreshingAuthProvider, token file, OAuth |
| `src/twitch/eventsub.ts` | Subscribe, map Twitch → `AppEvent`, handle `!` commands |
| `src/twitch/chat-send.ts` | Helix send + echo filter for overlay |
| `src/twitch/timed-messages.ts` | Interval posters using the same send helper |
| `src/twitch/emotes.ts` | 7TV / BTTV / FFZ catalog + text parse |
| `src/twitch/badges.ts` | Twitch badge URL cache |
| `src/server/http.ts` | Fastify, static, `/ws`, OAuth, dashboard APIs |
| `src/server/session.ts` | App login cookies, persisted to `data/sessions.json` |
| `src/store/hidden.ts` | Overlay hide-list for Twitch logins |
| `public/overlays/chat/` | OBS chat overlay |
| `public/dashboard/` | Streamer pages |
| `data/` | Gitignored volume: tokens, settings, remaps, hidden, users, messages, sessions |
| `Dockerfile` / `docker-compose.yml` | Image build (`tsc`), healthcheck on `PORT`, volume |
| `.github/workflows/ci.yml` | `npm test` + `tsc --noEmit` on push |

## Event contract

Wire format:

```json
{ "type": "chat.message", "payload": {}, "ts": 0 }
```

Types:

- `hello` — WS connect only (not on the bus); overlay config plus recent chat/activity
- `chat.message`
- `chat.message.delete`
- `chat.clear`
- `overlay.settings`
- `overlay.party`
- `overlay.dvd`
- `channel.activity` — follow, sub, gift, cheer, raid (dashboard today; overlay later)

Name new types with a dotted namespace. Extend the `AppEvent` union first.

Chat payloads include parsed `fragments` (text, emotes, mentions, cheers) and resolved badge URLs. Overlays render fragments; they do not re-parse emote names.

## Twitch

- Library: **Twurple 8** (`@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws`).
- EventSub over **WebSocket** (no public EventSub callback URL).
- Chat: `onChannelChatMessage(broadcasterId, userId, ...)`.
- Send: `api.chat.sendChatMessage` via `createBotChat`. Replies, custom commands, and timers share that helper so echoes are hidden on the overlay. Timers can post free text, the live `!help` list, or a custom command’s current reply.
- Auth: `RefreshingAuthProvider` with `redirectUri`. Persist tokens on `provider.on(provider.onRefresh, ...)`.
- Twurple 8 events use `emitter.on(emitter.onRefresh, handler)`, not `emitter.onRefresh(handler)`.
- Scopes: `user:read:chat`, `user:write:chat`, `user:bot`, `channel:bot`, `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`. Re-authorize after a scope change, then restart the container.
- Replies are sent as the authorized Twitch account. A separate hopbot identity needs a second token (not implemented).
- Default listen port: **30009**. `HOST` defaults to `0.0.0.0`. Redirect URL must match `TWITCH_REDIRECT_URI`. Non-localhost Twitch redirects need **https** in front of this process (reverse proxy or tunnel). Compose pulls `ghcr.io/212hopper/vitaminseags-chat` and passes env vars into the container; it does not require a `.env` file or an image build on the Portainer host.

## Overlays

- Transparent `body` for OBS. Stage is **1920×1080**; OBS Browser Source should match.
- Connect to `ws(s)://{host}/ws` and reconnect with backoff.
- `textContent` / `createElement` for chatter text. Never `innerHTML` with user text.
- Only `https:` image URLs (emotes, badges).
- Handle `hello`, `overlay.settings`, `overlay.party`, `overlay.dvd`, `chat.message`, `chat.message.delete`, `chat.clear`. Ignore unknown `type`s.
- `!sbon` / `!sboff` persist `spotlightEnabled` on overlay settings. Hole count, shape (circle or rectangle), size (W×H), position, feather (edge falloff), and dimness live on Settings with the chat box. Party hides the dimming until it ends. `!preset name` applies a saved look. `?preview=sbon` and `?preview=dvd` on the overlay URL are OBS test hooks.
- OBS: leave “Shutdown source when not visible” off. Allow the source to control audio for party sound (`public/overlays/chat/party.wav`, replaceable ~2.4 MB clip). `?preview=dvd` bounces the DVD logo for 60 seconds; `?preview=sbon` shows the song-battle spotlights.

## Ops

- `GET /health` returns `{ ok, phase, eventSub, live, uptimeSec }` and is public. Docker/Compose healthchecks hit it. `ok` means the HTTP server is up, not that EventSub is connected.
- Fastify request logs omit cookies. App and Fastify logs share `{ ts, level, msg }` JSON (`LOG_LEVEL`, optional `FASTIFY_LOG_LEVEL`).
- Set `TRUST_PROXY=true` only when a reverse proxy sets `X-Forwarded-For`; otherwise login rate limits key on the proxy IP.
- App sessions persist in `data/sessions.json` (sha256 of the cookie token as the key) so a container restart does not force a dashboard re-login.
- Chat history per user is capped at 2,000 lines, with 500-line slack so trim is not a per-message rewrite.
- `restart: unless-stopped` on the compose service.

## Tests

`npm test` type-checks `src/**/*.ts` (including tests) then runs `tsx --test` on the unit files (colour, commands, catalog, timers, settings sanitise, presets, message log cap, sessions, log level). GitHub Actions runs the same plus `tsc --noEmit` for the production emit config. Test files are excluded from `dist/`.

## Adding a feature (example: alerts overlay)

1. Activity already emits `channel.activity` from `eventsub.ts`.
2. Add `public/overlays/alerts/` that listens on `/ws` for that type.
3. Point a second OBS Browser Source at `PUBLIC_BASE_URL/overlays/alerts/`.

Streamer-facing config stays a dashboard route + `/api/*` on this process.
