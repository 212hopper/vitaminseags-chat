# Agent guide

This is a **self-hosted OBS companion** for one Twitch channel, not a StreamElements clone. It runs as **one Node process** (Docker/Portainer, or `npm start` while developing). OBS loads overlay pages as Browser Sources from `PUBLIC_BASE_URL`.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding features. Project rules in `.cursor/rules/` encode the same model.

## What exists

- One Node/TypeScript process (`src/index.ts`), shipped as a single container (default port **30009**)
- Twurple EventSub WebSocket for chat plus follows, subs, gifts, cheers, raids
- In-process typed event bus (`src/events.ts`) → Fastify `/ws` fan-out
- Chat overlay at `public/overlays/chat/` (1920×1080 stage; this **is** the OBS frontend)
- Dashboard on the same container: live status, activity, overlay settings, commands, timed chat, remaps, stats, app users
- Data on a volume: `data/tokens.json`, `overlay-settings.json`, `remaps.json`, `users.json`, `messages/`, `sessions.json`, `app-users.json`
- Chat commands: `!colour` / `!color`, `!username`, `!showchat` / `!hidechat`, `!party`, `!help`, plus custom replies from the Commands page
- Timed chat messages (optional live-only)
- Bot-sent lines stay in Twitch chat and are not drawn on the overlay
- App login (`ADMIN_USERNAME` / `ADMIN_PASSWORD`); overlay, `/ws`, and `/health` stay public
- `GET /health` for Docker/Portainer; JSON logs (`LOG_LEVEL`)
- `npm test` (Node test runner + tsx)

## Non-negotiables

- Twitch handlers **emit events**. They do not talk to OBS or touch the DOM.
- Overlays **consume `/ws`**. They do not call Twitch APIs.
- New features are new **event types** + optional new overlay pages, not a second bot or a second container.
- Overlays are vanilla HTML/CSS/JS (OBS CEF is an older Chromium; no React).
- Never commit `.env`, `data/tokens.json`, or secrets.
- Keep settings in JSON on the data volume. Do not add Postgres until JSON files are no longer enough.

## How to add a feature

1. Subscribe in `src/twitch/eventsub.ts`.
2. Add a `type` to `AppEvent` in `src/events.ts`.
3. `bus.emit({ type, payload })`.
4. If it needs pixels: `public/overlays/<name>/` and a new OBS Browser Source.
5. If it is streamer config: a `/dashboard/...` page and `/api/...` on this same process.

Chat replies go through `createBotChat` (`src/twitch/chat-send.ts`) so EventSub echoes are skipped on the overlay.

## Run

Portainer / Docker: `docker compose up -d --build` (see README).

Local: `npm start`

Overlay: `PUBLIC_BASE_URL/overlays/chat/` (OBS 1920×1080)
OAuth: `PUBLIC_BASE_URL/oauth`
Health: `PUBLIC_BASE_URL/health`
