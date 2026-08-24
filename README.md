# vitaminseags-chat

Self-hosted Twitch companion for **one channel**. One Node process talks to Twitch, serves a 1920×1080 chat overlay for OBS, and hosts a dashboard for you. It is not a StreamElements clone and not a multi-tenant SaaS.

For agents: [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it does

| Piece | What it is |
| --- | --- |
| App | One Fastify + Twurple process (Docker or `npm start`) |
| Overlay | `PUBLIC_BASE_URL/overlays/chat/` — transparent OBS Browser Source |
| Dashboard | Commands, timed chat, remaps, hidden chatters, overlay layout, live activity, stats |
| Data | JSON files on a Docker volume (`/app/data`), not Postgres |
| Chat replies | Sent as the Twitch account you authorize (`!help`, custom `!` replies, timers) |

Twitch chat → EventSub → typed event bus → `/ws` → overlay. Overlays never call Twitch. A second overlay later is another folder under `public/overlays/`, not a second container.

## Go live

1. Copy [`.env.example`](.env.example) to `.env`. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL`, `PUBLIC_BASE_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
2. Add the exact Redirect URL `PUBLIC_BASE_URL/oauth/callback` on the [Twitch app](https://dev.twitch.tv/console/apps). Non-localhost usually needs **https**.
3. `docker compose up -d` (or a Portainer stack — see [Deploy](#deploy)).
4. Open `PUBLIC_BASE_URL/oauth`, log in as the channel (or a bot that can read this chat), **accept every permission**, then **restart the container** if the homepage says scopes were updated.
5. OBS → Browser Source:
   - URL: `PUBLIC_BASE_URL/overlays/chat/`
   - Width **1920**, height **1080**
   - Leave **Shutdown source when not visible** unchecked
   - Allow the source to **control audio** if you want `!party` sound
6. Overlay URL stays public so OBS can load it. Dashboard/stats/home require app login when `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set.

If you change Twitch scopes (or see missing-permission warnings), Re-authorize Twitch, accept every tick, then restart.

## Deploy

Volume `chat-data` holds tokens, overlay settings, remaps, sessions, and chat stats.

```bash
docker compose up -d
```

That pulls `ghcr.io/212hopper/vitaminseags-chat:latest`. To rebuild from local source:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Health: `GET /health` (public). Compose and the image both health-check that URL. Logs are JSON lines (`LOG_LEVEL`, default `info`). Request logs do not include cookies.

### Portainer

Paste this repo’s [`docker-compose.yml`](docker-compose.yml). It **pulls** a published image and does not build on the host (Portainer’s compose build often fails with `mkdir /.docker: permission denied`).

Add the same keys as [`.env.example`](.env.example) under the stack **Environment variables**. Loading a `.env` in the UI injects variables; it does not create `/data/compose/N/.env`.

The image is `ghcr.io/212hopper/vitaminseags-chat:latest`. After the first CI publish, set that GitHub package to **Public** (Repo → Packages → package → Package settings → Change visibility) so Portainer can pull without a token.

Set `PUBLIC_BASE_URL` to the URL you will open in a browser (no trailing slash), and register `PUBLIC_BASE_URL/oauth/callback` on the Twitch app. To pick up a new release, re-pull the image and redeploy the stack.

### HTTPS (Twitch OAuth)

This process only speaks **HTTP**. Twitch will not accept `http://` redirect URLs except `localhost` / `127.0.0.1`. A public IP plus a forwarded port is not enough.

Put TLS in **front** of port 30009 (do not add a second service to this compose file):

1. Point a **domain** at your house (for example `chat.yourdomain.com`). Certificates are issued for names, not raw IPs.
2. Terminate HTTPS with a reverse proxy or tunnel, then proxy to `http://127.0.0.1:30009`.
   - **Cloudflare Tunnel** (`cloudflared`): easiest on a home connection; no need to open 80/443; you get `https://chat.yourdomain.com`.
   - **Caddy** (or nginx) on the same host: open 80 and 443, automatic Let’s Encrypt if the domain resolves here.
3. Set `PUBLIC_BASE_URL=https://chat.yourdomain.com` and `TWITCH_REDIRECT_URI=https://chat.yourdomain.com/oauth/callback` (or omit the redirect and let it default).
4. Set `TRUST_PROXY=true` so login rate limits use `X-Forwarded-For`.
5. Save the same HTTPS callback on the [Twitch app](https://dev.twitch.tv/console/apps).

OBS on the LAN can still load `http://YOUR_LAN_IP:30009/overlays/chat/` if you prefer not to send the overlay out to the internet. Twitch only cares about the OAuth callback URL.

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

- Layout, font, hold/fade, spotlights, and look presets live on **Settings**. Chat commands, who-can-use, hit chance, `!help` blurbs, and custom replies live on **Commands**. Repeating plugs live on **Timed chat**.
- Add `?preview=dvd` to bounce the DVD logo, or `?preview=sbon` to preview song-battle spotlights, without a chat roll.

## Pages

| URL | Purpose |
| --- | --- |
| `/overlays/chat/` | OBS chat overlay (public) |
| `/dashboard/` | Live status, chat log, activity, Twitch player |
| `/dashboard/settings/` | Hold, fade, font, chat box, spotlights, look presets |
| `/dashboard/commands/` | Enable commands, who, hit chance, `!help` text, custom replies or help-only tips |
| `/dashboard/timers/` | Timed chat: free text, live `!help`, or a custom command reply |
| `/dashboard/remaps/` | On-screen name remaps |
| `/dashboard/hidden/` | Hide Twitch logins from the overlay |
| `/stats/` | Per-viewer message counts and history |
| `/oauth` | Start Twitch authorization (sign-in required when app login is on) |
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
| `ADMIN_PASSWORD` | recommended | App login. Overlay + `/ws` + `/health` + `/oauth/callback` stay public |
| `LOG_LEVEL` | no | `error` `warn` `info` (default `info`) |
| `FASTIFY_LOG_LEVEL` | no | Pino levels including `silent` / `debug`. Defaults to `LOG_LEVEL` |
| `TRUST_PROXY` | no | `true` only behind a reverse proxy. Leave off on a LAN host |
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

GitHub Actions runs `npm test` and `tsc --noEmit` on push, then publishes `ghcr.io/212hopper/vitaminseags-chat:latest` from `main`. Tests cover colour parsing, command who-locks, custom/`!help` listing, timers, overlay setting sanitise, message history cap, hashed app sessions, and log levels.

`public/overlays/chat/party.wav` is a ~2.4 MB disco sting used by `!party`. Replace it in place if you want a smaller or different clip.
