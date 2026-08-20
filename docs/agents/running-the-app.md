# Running the app

This repo's dev stack runs in Docker Compose (`docker-compose.yml` at repo root), not via bare `npm` on the host. The agent (`claude` service) runs in its own container on a separate network and cannot reach `server`/`client` directly — a human runs these commands on the host.

## Services

- `install`: runs `npm install` once (via a shared `node_modules` bind-mounted from the repo root); `server` and `client` wait on it.
- `server`: `npm run dev -w server`, exposed on host port `3001`.
- `client`: `npm run dev -w client` (Vite, `host: true`), exposed on host port `5173`.

## Starting it

```
docker compose up
```

Brings up `install` (runs once, exits), then `server` and `client`. Since the compose file bind-mounts the repo root (`.:/workspace`) into both containers, any file added or edited on the host — including new Vite entry points like a `*.html` prototype route — is visible inside the container immediately; Vite's dev server picks it up live with no rebuild or restart needed.

Once it's up:
- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

To bring up just one service (e.g. only the client), Compose still starts its `install` dependency first: `docker compose up client`.

Stop with `docker compose down`.

## When a skill hands over an `npm ...` command

Skills and agents in this repo can't run `npm`/`vite`/etc. directly against the host — translate:
- `npm run dev -w client` → already running as the `client` service; just open the URL, no command needed.
- A one-off command not already covered by a running service (e.g. `npm run build -w client`, `npx tsc --noEmit`) → run it inside the client/server container so it shares the installed `node_modules`: `docker compose run --rm client npm run build`.
