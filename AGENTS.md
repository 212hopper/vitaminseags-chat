# Agent guide

This is a **self-hosted OBS companion** for one Twitch channel, not a StreamElements clone. It runs as **one Node process** (Docker/Portainer on a server, or `npm start` while developing). OBS loads overlay pages as Browser Sources from `PUBLIC_BASE_URL`.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding features. Project rules in `.cursor/rules/` encode the same model.

## What exists (v1)

- One Node/TypeScript process (`src/index.ts`), shipped as a single container
- Twurple EventSub WebSocket for chat
- In-process typed event bus (`src/events.ts`)
- Fastify HTTP + `/ws` fan-out
- Chat overlay at `public/overlays/chat/` (this **is** the frontend)
- Tokens and viewer data on a volume (`data/tokens.json`, `data/users.json`)
- `!colour` / `!color` sets a persistent username colour and is never shown in the overlay
- Chat stats at `/stats/`
- Default port **30009**

## Non-negotiables

- Twitch handlers **emit events**. They do not talk to OBS or touch the DOM.
- Overlays **consume `/ws`**. They do not call Twitch APIs.
- New features are new **event types** + optional new overlay pages, not a second bot or a second container.
- Overlays are vanilla HTML/CSS/JS (OBS CEF is an older Chromium; no React).
- Never commit `.env`, `data/tokens.json`, or secrets.
- Do not add Postgres until we persist more than OAuth tokens.

## How to add a feature

1. Subscribe in `src/twitch/eventsub.ts`.
2. Add a `type` to `AppEvent` in `src/events.ts`.
3. `bus.emit({ type, payload })`.
4. If it needs pixels: `public/overlays/<name>/` and a new OBS Browser Source.

## Run

Portainer / Docker: `docker compose up -d --build` (see README).

Local: `npm start`

Overlay: `PUBLIC_BASE_URL/overlays/chat/`
OAuth: `PUBLIC_BASE_URL/oauth`
