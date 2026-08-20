# vitaminseags-chat

Self-hosted Twitch chat overlay for OBS. One app talks to Twitch and serves a transparent Browser Source page. v1 is **chat**; later overlays reuse the same event bus.

For agents and later features, start with [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## How it runs

This is **one Node.js container** (or a local Node process while you develop). It is not a multi-service stack yet.

| Piece | What it is today |
| --- | --- |
| App | Fastify + Twurple in one process |
| Frontend | Static overlay pages in this same app (`/overlays/chat/`) |
| Data | Tokens on a Docker volume (`/app/data`), not a database |
| OBS | Browser Source pointing at this app’s URL |

A Postgres/database and a separate dashboard UI get added when there is something to persist (overlay settings, loyalty, a control panel). They are not required for chat.

**OBS does not have to run on the same machine.** The stream PC loads `PUBLIC_BASE_URL/overlays/chat/` as a Browser Source. The container can live on your Portainer host.

## Deploy with Portainer

1. Copy [`.env.example`](.env.example) to `.env` on the host (or paste the same keys into the Portainer stack env).
2. Set at least `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_CHANNEL`.
3. Set `PUBLIC_BASE_URL` to the URL you will open in a browser and in OBS, with no trailing slash. Examples:
   - LAN: `http://192.168.1.50:30009`
   - Reverse proxy: `https://chat.example.com`
4. Set `TWITCH_REDIRECT_URI` to `PUBLIC_BASE_URL/oauth/callback` (or leave it unset to derive it).
5. In the [Twitch developer console](https://dev.twitch.tv/console/apps), add that **exact** Redirect URL. Twitch allows `http://localhost` without TLS; any other host usually needs **https**.
6. In Portainer: **Stacks → Add stack**, deploy this repo’s [`docker-compose.yml`](docker-compose.yml) (Git or copied compose). Build from the Dockerfile in the repo.
7. Open `PUBLIC_BASE_URL/oauth`, log in as the account that should **read** chat, and allow access. Tokens land on the `chat-data` volume.
8. In OBS: **Sources → Add → Browser**, URL `PUBLIC_BASE_URL/overlays/chat/`, width ~400, height = canvas height. Leave **Shutdown source when not visible** unchecked.

To run the same compose on the host without Portainer:

```bash
docker compose up -d --build
```

If you put this behind Nginx Proxy Manager / Traefik / Caddy, keep `HOST=0.0.0.0` and publish or proxy port 30009. Point `PUBLIC_BASE_URL` at the public https URL.

## Develop locally (no Docker)

Install [Node.js 20+](https://nodejs.org/). From this repo:

```bash
copy .env.example .env
npm install
npm start
```

Use `PUBLIC_BASE_URL=http://127.0.0.1:30009` and add `http://127.0.0.1:30009/oauth/callback` (or `http://localhost:30009/oauth/callback`) on the Twitch app. Keep the terminal open. `npm run dev` restarts on save.

## OBS Browser Source notes

- Start the container (or `npm start`) before going live.
- Custom CSS if the page is not transparent:

```css
body { background-color: rgba(0, 0, 0, 0) !important; }
```

- Restyle in `public/overlays/chat/style.css` (CSS variables at the top).

## Environment variables

Copy [`.env.example`](.env.example). Do not commit `.env` or token files.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | yes | Twitch application client id |
| `TWITCH_CLIENT_SECRET` | yes | Twitch application client secret |
| `TWITCH_CHANNEL` | yes | Channel login (without `https://twitch.tv/`) |
| `PUBLIC_BASE_URL` | yes on a server | Public URL of this app, no trailing slash |
| `TWITCH_REDIRECT_URI` | no | Twitch redirect URL (default `PUBLIC_BASE_URL/oauth/callback`) |
| `HOST` | no | Bind address (default `0.0.0.0`; keep this in Docker) |
| `PORT` | no | Listen port (default `30009`) |
| `OVERLAY_MAX_MESSAGES` | no | Messages on screen (default `14`) |
| `OVERLAY_HOLD_MS` | no | How long a message stays fully visible, in ms (default `25000`) |
| `OVERLAY_FADE_MS` | no | How long the fade-out takes after hold, in ms (default `600`) |
| `OVERLAY_HIDE_COMMANDS` | no | Hide `!` commands (default `true`) |
| `TWITCH_ACCESS_TOKEN` | no | First-run seed only; prefer `/oauth` |
| `TWITCH_REFRESH_TOKEN` | no | Pair with `TWITCH_ACCESS_TOKEN` if seeding |

Existing `.env` keys `client`, `twitch`, `access`, and `refresh` still work as aliases for the `TWITCH_*` names.

v1 OAuth scopes: `user:read:chat`, `user:bot`, `channel:bot`. Same account can read its own chat. A bot account is only needed later to **send** messages.

If you change `PUBLIC_BASE_URL` or `TWITCH_REDIRECT_URI`, update the Twitch application Redirect URL to match.

## How this is structured (for later features)

```
Twitch EventSub  →  src/twitch/eventsub.ts  →  typed event bus  →  WebSocket /ws
                                                                →  /overlays/chat
                                                                →  future overlays
```

Events on the wire are JSON `{ type, payload, ts }`. v1 types: `hello`, `chat.message`, `chat.message.delete`, `chat.clear`.

To add another overlay:

1. Listen in `src/twitch/eventsub.ts` and `bus.emit` a new `type`.
2. Add `public/overlays/<name>/`.
3. Point a second OBS Browser Source at `PUBLIC_BASE_URL/overlays/<name>/`.

A dashboard later is another route on this same container, not a second service. Add Postgres when we have durable app data beyond OAuth tokens.
