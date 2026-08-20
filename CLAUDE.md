## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

### Running the app

The dev stack runs via Docker Compose, not bare `npm` on the host — the agent container can't reach `server`/`client` directly. See `docs/agents/running-the-app.md`.
