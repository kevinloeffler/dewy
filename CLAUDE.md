# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dewy is a browser-based educational coding game where students navigate a 3D isometric tile-world by writing JavaScript code, and teachers manage classes and design levels via an admin panel.

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run preview      # preview production build
npm run check        # type-check with svelte-check
npm run check:watch  # type-check in watch mode

npm run db:push      # push schema changes to DB (no migration file)
npm run db:generate  # generate migration files
npm run db:migrate   # run migrations
npm run db:studio    # open Drizzle Studio

npm run auth:schema  # regenerate auth schema from better-auth config
```

## Architecture

**Stack:** SvelteKit + Svelte 5 (runes) + TypeScript, Drizzle ORM + better-sqlite3, better-auth, Node adapter.

**Runes mode is forced project-wide** via `svelte.config.js` — never use legacy `$:`, `export let`, etc. Always use `$state`, `$derived`, `$props`, `$effect`.

**Auth flow:** `src/hooks.server.ts` runs better-auth on every request and populates `event.locals.user` and `event.locals.session`. Auth is configured in `src/lib/server/auth.ts` using the `betterAuth` minimal bundle with the Drizzle adapter and `sveltekitCookies` plugin. The auth DB tables (user, session, account, verification) live in `src/lib/server/db/auth.schema.ts` — regenerate with `npm run auth:schema` after changing auth config.

**Database:** `src/lib/server/db/index.ts` creates the Drizzle client with better-sqlite3. `src/lib/server/db/schema.ts` is the single source of truth for app tables; it re-exports `auth.schema.ts`. The DB file path comes from `DATABASE_URL` env var (defaults to `local.db` for local dev).

**Environment variables** (see `.env.example`):
- `DATABASE_URL` — path to SQLite file
- `ORIGIN` — used as better-auth `baseURL`
- `BETTER_AUTH_SECRET` — 32-char high-entropy secret for production

**Deployment:** Docker via `dockerfile` + `docker-compose.yml`. The Node adapter serves the built app.
