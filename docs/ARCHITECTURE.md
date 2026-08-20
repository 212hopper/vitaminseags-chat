# Architecture

vitaminseags-chat is a **self-hosted companion**. It runs as one Node process in Docker/Portainer (or locally while developing). OBS on the stream PC loads overlay pages as Browser Sources from `PUBLIC_BASE_URL`. Twitch is the source of truth for events; the overlay is only a renderer.

Do not grow this into a StreamElements-style product (theme store, cloud dashboard, multi-tenant). Grow it as **more EventSub topics + more overlay pages** on the same bus. Do not add a database until we persist more than OAuth tokens. A future dashboard is another route on this same container.

## Process shape

```
Twitch Helix + EventSub WS
        │
        ▼
 src/twitch/*   (auth, EventSub, emotes, badges)
        │  bus.emit(AppEvent)
        ▼
 src/events.ts  (typed in-process pub/sub)
        │
        ▼
 src/server/http.ts
   ├── GET  /overlays/*   static pages for OBS
   ├── GET  /ws           JSON events { type, payload, ts }
   ├── GET  /oauth        Twitch login
   └── GET  /api/config   overlay settings
```

Boot order in `src/index.ts`: HTTP (so OAuth works) → auth → Helix client → EventSub → shutdown hooks.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | Process entry |
| `src/config.ts` | Env, port, overlay settings, OAuth scopes |
| `src/events.ts` | `AppEvent` union, bus, wire envelope |
| `src/twitch/auth.ts` | RefreshingAuthProvider, token file, localhost OAuth |
| `src/twitch/eventsub.ts` | Subscribe, map Twitch → `AppEvent` |
| `src/twitch/emotes.ts` | 7TV / BTTV / FFZ catalog + text parse |
| `src/twitch/badges.ts` | Twitch badge URL cache |
| `src/server/http.ts` | Fastify, static, `/ws`, OAuth routes |
| `public/overlays/chat/` | v1 OBS overlay |
| `data/tokens.json` | Gitignored refreshed tokens (Docker volume `/app/data`) |
| `Dockerfile` / `docker-compose.yml` | Portainer/stack deploy |

## Event contract

Wire format:

```json
{ "type": "chat.message", "payload": {}, "ts": 0 }
```

v1 types:

- `hello` — sent on WS connect only (not on the bus); payload is overlay config
- `chat.message`
- `chat.message.delete`
- `chat.clear`

Name new types with a dotted namespace (`channel.subscription`, `channel.redemption`, `overlay.command`). Extend the `AppEvent` union first so TypeScript keeps producers and consumers honest.

Chat payloads already include parsed `fragments` (text, emotes, mentions, cheers) and resolved badge URLs. Overlays should render fragments, not re-parse emote names.

## Twitch

- Library: **Twurple 8** (`@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws`).
- EventSub over **WebSocket** (no public URL, no ngrok).
- Chat: `onChannelChatMessage(broadcasterId, userId, ...)`.
- Auth: `RefreshingAuthProvider` with `redirectUri`. Persist tokens on `provider.on(provider.onRefresh, ...)`.
- Twurple 8 events use `emitter.on(emitter.onRefresh, handler)`, not `emitter.onRefresh(handler)`.
- v1 scopes: `user:read:chat`, `user:bot`, `channel:bot`. Same account can read its own chat. A bot account is only needed to **send** messages.
- Default listen port: **30009**. `HOST` defaults to `0.0.0.0`. Set `PUBLIC_BASE_URL` to the URL OBS and the browser use. Redirect URL on the Twitch app must match `TWITCH_REDIRECT_URI` (default `PUBLIC_BASE_URL/oauth/callback`). Non-localhost Twitch redirects generally need https.

## Overlays

- Transparent `body` background for OBS.
- Connect to `ws(s)://{host}/ws` and reconnect with backoff.
- Use `textContent` / `createElement` for chatters. Never `innerHTML` with user text.
- Only load `https:` image URLs (emotes, badges).
- Style via CSS variables in the overlay stylesheet. Uniqueness lives here, not in the bot.
- OBS: leave “Shutdown source when not visible” off, or the WS drops while the scene is hidden.

## Adding a feature (example: subs)

1. `listener.onChannelSubscription(...)` in `eventsub.ts`.
2. Add `{ type: "channel.subscription"; payload: ... }` to `AppEvent`.
3. `bus.emit(...)`. HTTP already fans the bus to `/ws`.
4. Either handle the type in `public/overlays/chat/` or add `public/overlays/alerts/` and a second Browser Source.

A later dashboard is just another Fastify route plus the same bus or `/api/config`. Do not start a second container for it. Add Postgres when we have durable app data beyond tokens.
