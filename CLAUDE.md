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

**Auth flow:** `src/hooks.server.ts` runs better-auth on every request and populates `event.locals.user` and `event.locals.session`. Auth is configured in `src/lib/server/auth.ts` using the `betterAuth` minimal bundle with the Drizzle adapter plus the `admin`, `username` and `sveltekitCookies` plugins. The auth DB tables (user, session, account, verification) live in `src/lib/server/db/auth.schema.ts` — regenerate with `npm run auth:schema` after changing auth config. `src/app.d.ts` infers `locals.user` from `auth.$Infer.Session`, so plugin fields (`role`, `username`, `archivedAt`) stay visible; do not replace it with a static `User` import.

**Roles and accounts.** Three roles — `admin`, `teacher`, `student` — defined with their access-control statement in `src/lib/roles.ts` (framework-free, importable anywhere). **Sign-up is disabled**: every account is created by an admin or a teacher, except the first admin, which `/setup` mints on an empty database and then 404s.

- Students sign in with a **username**; their `email` column holds a synthetic `@students.dewy.local` address they never see. Teachers and admins use a real email. `/login` routes on the `@`.
- **`src/lib/server/users.ts` is the authorization boundary**, not better-auth. Better-auth's permission model knows *"may create users"*, not *"may create users of role student, in a class you own"* — its `createUser` writes whatever role the caller passes. Every account write goes through `users.ts`, which enforces: admin → anyone; teacher → students sharing a class they own; student → nobody. `auth.api.createUser` is called **without** headers there (skipping better-auth's own gate on purpose, since ours already ran); `banUser` / `setUserPassword` / `setRole` need `headers` and so are gated twice.
- **Passwords are typed, not generated, on reset.** `setPassword` in `users.ts` takes the value a teacher chose and applies it to every selected account (so a bulk reset gives them all the same one — the UI says so). Generation survives only for *bulk account creation*, where inventing thirty by hand is what stops a teacher bothering; those are shown once on a printable `CredentialsSheet` and never stored in plaintext. Changing your own password does not revoke your own session.
- **Archival** is better-auth's `banned` flag (a `session.create.before` hook blocks every sign-in path and banning deletes existing sessions) plus our own `archivedAt` for the date. `users.ts` writes both together so they cannot drift. Nothing is deleted — `item_progress` survives archive and restore.
- Classes live in `src/lib/server/classes.ts` (`class`, `class_member`, `class_course`). A signed-in student sees the courses their classes were assigned; a student in no class, and anonymous visitors, see every published course.

**Guards:** `/admin/+layout.server.ts` and `/designer/+layout.server.ts` are the only route guards — both require a teacher or admin. Which *course* a teacher may edit is separate and lives in `courses.ts` (`assertCanEditCourse` / `assertCanEditStage` / `assertCanEditItem` / `assertCanEditLevel`), called at the top of every mutating action.

**Course sharing:** a **clone** is a live read-only link (`course_share` / `level_share`) — the owner's later edits reach the recipient, who can assign it to classes but never edit it. A **copy** is `duplicateCourse` / `copyLevel`: a deep duplicate the recipient owns, with `copiedFromId` kept as provenance. A borrowed level hangs off `stage_item.linked_level_id` rather than `level.item_id`, which preserves the `UNIQUE` "owned by exactly one stage" guarantee; deleting a course, stage or item that owns a level somebody is borrowing is refused with a message rather than a foreign-key error.

**Database:** `src/lib/server/db/index.ts` creates the Drizzle client with better-sqlite3. `src/lib/server/db/schema.ts` is the single source of truth for app tables; it re-exports `auth.schema.ts`. The DB file path comes from `DATABASE_URL` env var (defaults to `local.db` for local dev).

**Environment variables** (see `.env.example`):
- `DATABASE_URL` — path to SQLite file
- `ORIGIN` — used as better-auth `baseURL`
- `BETTER_AUTH_SECRET` — 32-char high-entropy secret for production

**Deployment:** Docker via `dockerfile` + `docker-compose.yml`. The Node adapter serves the built app.
