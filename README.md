# vitaminseags-chat

Self-hosted Twitch companion for **one channel**. One Node process talks to Twitch, serves a 1920×1080 chat overlay for OBS, and hosts a dashboard for you. It is not a StreamElements clone and not a multi-tenant SaaS.

For agents: [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it does

| Piece | What it is |
| --- | --- |
| App | One Fastify + Twurple process (Docker or `npm start`) |
| Overlay | `PUBLIC_BASE_URL/overlays/chat/` — transparent OBS Browser Source |
| Dashboard | Commands, timed chat, remaps, overlay layout, live activity, stats |
| Data | JSON files on a Docker volume (`/app/data`), not Postgres |
| Chat replies | Sent as the Twitch account you authorize (`!help`, custom `!` replies, timers) |

Twitch chat → EventSub → typed event bus → `/ws` → overlay. Overlays never call Twitch. A second overlay later is another folder under `public/overlays/`, not a second container.

## Go live

1. Copy [`.env.example`](.env.example) to `.env`. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL`, `PUBLIC_BASE_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
2. Add the exact Redirect URL `PUBLIC_BASE_URL/oauth/callback` on the [Twitch app](https://dev.twitch.tv/console/apps). Non-localhost usually needs **https**.
3. `docker compose up -d --build` (or Portainer stack from this compose file).
4. Open `PUBLIC_BASE_URL/oauth`, log in as the channel (or a bot that can read this chat), **accept every permission**, then **restart the container** if the homepage says scopes were updated.
5. OBS → Browser Source:
   - URL: `PUBLIC_BASE_URL/overlays/chat/`
   - Width **1920**, height **1080**
   - Leave **Shutdown source when not visible** unchecked
   - Allow the source to **control audio** if you want `!party` sound
6. Overlay URL stays public so OBS can load it. Dashboard/stats/home require app login when `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set.

If you change Twitch scopes (or see missing-permission warnings), Re-authorize Twitch, accept every tick, then restart.

## Deploy

Portainer: **Stacks → Add stack**, this repo’s [`docker-compose.yml`](docker-compose.yml), env from `.env`. Volume `chat-data` holds tokens, overlay settings, remaps, sessions, and chat stats.

```bash
docker compose up -d --build
```

Health: `GET /health` (public). Compose and the image both health-check that URL. Logs are JSON lines (`LOG_LEVEL`, default `info`). Request logs do not include cookies.

Local without Docker:

```bash
copy .env.example .env
npm install
npm test
npm start
```

`PUBLIC_BASE_URL=http://127.0.0.1:30009`. Keep the terminal open. `npm run dev` restarts on save.

## OBS notes

- Start the container before going live.
- Custom CSS if the page is not transparent:

```css
body { background-color: rgba(0, 0, 0, 0) !important; }
```

- Layout, font, and hold/fade live on **Settings**. Chat commands, who-can-use, `!help` blurbs, and custom replies live on **Commands**. Repeating plugs live on **Timed chat**.

## Pages

| URL | Purpose |
| --- | --- |
| `/overlays/chat/` | OBS chat overlay (public) |
| `/dashboard/` | Live status, chat log, activity, Twitch player |
| `/dashboard/settings/` | Hold, fade, font, 1080p box position |
| `/dashboard/commands/` | Enable commands, who, `!help` text, custom replies |
| `/dashboard/timers/` | Timed chat messages |
| `/dashboard/remaps/` | On-screen name remaps |
| `/stats/` | Per-viewer message counts and history |
| `/oauth` | Twitch authorization |
| `/health` | Liveness JSON for Docker / Portainer |
| `/login/` | App login (not Twitch) |

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | yes | Twitch application client id |
| `TWITCH_CLIENT_SECRET` | yes | Twitch application client secret |
| `TWITCH_CHANNEL` | yes | Channel login (no `https://twitch.tv/`) |
| `PUBLIC_BASE_URL` | yes on a server | Public URL, no trailing slash |
| `TWITCH_REDIRECT_URI` | no | Default `PUBLIC_BASE_URL/oauth/callback` |
| `HOST` | no | Bind address (default `0.0.0.0`) |
| `PORT` | no | Listen port (default `30009`) |
| `ADMIN_USERNAME` | recommended | App login |
| `ADMIN_PASSWORD` | recommended | App login. Overlay + `/ws` + `/health` stay public |
| `LOG_LEVEL` | no | `fatal` `error` `warn` `info` `debug` `trace` `silent` (default `info`) |
| `OVERLAY_MAX_MESSAGES` | no | First-run default only; settings page wins after that |
| `OVERLAY_HOLD_MS` | no | First-run default |
| `OVERLAY_FADE_MS` | no | First-run default |
| `OVERLAY_HIDE_COMMANDS` | no | First-run default |

Aliases `client`, `twitch`, `access`, and `refresh` still work for the `TWITCH_*` names.

OAuth scopes: `user:read:chat`, `user:write:chat`, `user:bot`, `channel:bot`, `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`. Chat replies are sent as the authorized account.

Do not commit `.env` or anything under `data/`.

## Tests

```bash
npm test
```

Docker build runs `npm test` then `tsc`. Tests cover colour parsing, command who-locks, custom/`!help` listing, timers, overlay setting sanitise, and persisted app sessions.
