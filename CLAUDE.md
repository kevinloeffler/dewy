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
npm run db:baseline  # one-off: adopt a db:push-made database into migration history
npm run db:studio    # open Drizzle Studio

npm run auth:schema  # regenerate auth schema from better-auth config
```

## Architecture

**Stack:** SvelteKit + Svelte 5 (runes) + TypeScript, Drizzle ORM + better-sqlite3, better-auth, Node adapter.

**Runes mode is forced project-wide** via `svelte.config.js` — never use legacy `$:`, `export let`, etc. Always use `$state`, `$derived`, `$props`, `$effect`.

**Auth flow:** `src/hooks.server.ts` reads the session on every request and populates `event.locals.user` and `event.locals.session`. It deliberately does **not** mount better-auth's HTTP endpoints — `/api/auth/*` is a 404, because those endpoints check only coarse permissions (a teacher session could mint an admin through them). Every auth operation is a server-side `auth.api` call; never add `svelteKitHandler` or a client that talks to `/api/auth`. `/login` throttles failed sign-ins itself (`$lib/server/rate-limit`), since better-auth's rate limiter only covers the HTTP endpoints. Auth is configured in `src/lib/server/auth.ts` using the `betterAuth` minimal bundle with the Drizzle adapter plus the `admin`, `username` and `sveltekitCookies` plugins. The auth DB tables (user, session, account, verification) live in `src/lib/server/db/auth.schema.ts` — regenerate with `npm run auth:schema` after changing auth config. `src/app.d.ts` infers `locals.user` from `auth.$Infer.Session`, so plugin fields (`role`, `username`, `archivedAt`) stay visible; do not replace it with a static `User` import.

**Roles and accounts.** Three roles — `admin`, `teacher`, `student` — defined with their access-control statement in `src/lib/roles.ts` (framework-free, importable anywhere). **Sign-up is disabled**: every account is created by an admin or a teacher, except the first admin, which `/setup` mints on an empty database and then 404s.

- Students sign in with a **username**; their `email` column holds a synthetic `@students.dewy.local` address they never see. Teachers and admins use a real email. `/login` routes on the `@`.
- **`src/lib/server/users.ts` is the authorization boundary**, not better-auth. Better-auth's permission model knows *"may create users"*, not *"may create users of role student, in a class you own"* — its `createUser` writes whatever role the caller passes. Every account write goes through `users.ts`, which enforces: admin → anyone; teacher → students sharing a class they own; student → nobody. `auth.api.createUser` is called **without** headers there (skipping better-auth's own gate on purpose, since ours already ran); `banUser` / `setUserPassword` / `setRole` need `headers` and so are gated twice.
- **Passwords are typed, not generated, on reset.** `setPassword` in `users.ts` takes the value a teacher chose and applies it to every selected account (so a bulk reset gives them all the same one — the UI says so). Generation survives only for *bulk account creation*, where inventing thirty by hand is what stops a teacher bothering; those are shown once on a printable `CredentialsSheet` and never stored in plaintext. Changing your own password does not revoke your own session.
- **Archival** is better-auth's `banned` flag (a `session.create.before` hook blocks every sign-in path and banning deletes existing sessions) plus our own `archivedAt` for the date. `users.ts` writes both together so they cannot drift. Nothing is deleted — `item_progress` survives archive and restore.
- Classes live in `src/lib/server/classes.ts` (`class`, `class_member`, `class_course`). A student sees the courses their classes were assigned and nothing else — no assignment means an empty catalogue, since what a class is given *is* the curriculum. Staff and anonymous visitors still see every published course. `listCoursesFor` / `canSeeCourse` in `courses.ts` state this rule, and both `/courses/[courseId]` and `/courses/[courseId]/items/[itemId]` (load *and* its `complete` action) enforce it — the item route is reachable without passing through the course page.

**Progress:** `item_progress` records **completions only** — a row appears when a student finishes an item, so "not complete" never distinguishes *stuck* from *never opened*; `attempts` is the only struggle signal stored. The gating rule lives once in `$lib/progress` (`courseProgress`), which is pure and database-free. The teacher's dashboard at `/admin/classes/[classId]/progress` runs that same function once per student over one outline, so the grid a teacher reads and the course page a student sees can never disagree about what is locked. It needs no guard of its own: `findClass` already answers "may this teacher see this class?", and seeing a class is what entitles you to its students' progress. Archived students are left out of the grid so every count is over the same set of people.

**Guards:** `/admin/+layout.server.ts` and `/designer/+layout.server.ts` are the only route guards — both require a teacher or admin. Which *course* a teacher may edit is separate and lives in `courses.ts` (`assertCanEditCourse` / `assertCanEditStage` / `assertCanEditItem` / `assertCanEditLevel`), called at the top of every mutating action.

**Playgrounds:** a `level` row with no `item_id` — a standalone level belonging to no course. Teachers create and manage them at `/admin/playgrounds` (`createPlayground` / `listPlaygrounds` / `deletePlayground` in `levels.ts`); the editor is the same `/designer/[id]`, so there is only ever one authoring path. `level.owner_id` is what decides who may edit one, since no course is there to answer: a null owner means a row written before playgrounds had owners and any teacher may adopt it, matching how `canEditCourse` treats an ownerless course. For a level *inside* a course the column is provenance only — the course decides. `/playground` is a retired URL that now redirects to `/level/[id]`.

**Course sharing:** a **clone** is a live read-only link (`course_share` / `level_share`) — the owner's later edits reach the recipient, who can assign it to classes but never edit it. A **copy** is `duplicateCourse` / `copyLevel`: a deep duplicate the recipient owns, with `copiedFromId` kept as provenance. A borrowed level hangs off `stage_item.linked_level_id` rather than `level.item_id`, which preserves the `UNIQUE` "owned by exactly one stage" guarantee; deleting a course, stage or item that owns a level somebody is borrowing is refused with a message rather than a foreign-key error.

**Images:** teachers drop or paste images into `MarkdownEditor`, which POSTs to `/api/images` and inserts `![alt](/images/<id>)`. Bytes are a BLOB in the `image` table (so `/data/dewy.db` stays the whole backup) and are served publicly by unguessable id from `/images/[id]`. The type is sniffed from magic bytes (`$lib/images`), never trusted from the browser, and SVG is refused. `renderMarkdown` only renders `/images/…` sources, so there are no external tracking pixels. `/api/images` checks the role itself, since no layout guard reaches a `+server.ts`. Images are never deleted automatically: copies and undo may still reference them. **Built-in images** ship with the build instead: a file in `src/lib/assets/builtin/` (e.g. `robot-happy.png`) is bundled into the server by `$lib/server/builtin-images` and served from the same route as `/images/builtin-robot-happy`, so markdown embeds it like any upload. Their URL survives a changed file, so they get a one-hour cache rather than `immutable`.

**Database:** `src/lib/server/db/index.ts` creates the Drizzle client with better-sqlite3. `src/lib/server/db/schema.ts` is the single source of truth for app tables; it re-exports `auth.schema.ts`. The DB file path comes from `DATABASE_URL` env var (defaults to `local.db` for local dev).

**Migrations:** `drizzle/` holds the migration history, starting at `0000_init`. The production container runs `scripts/migrate.js` before the server starts, so **every schema change must be committed as a migration** (`npm run db:generate`) — a change applied only with `db:push` never reaches a deployed database. A database created by `db:push` has the tables but no history; `npm run db:baseline` records `0000_init` as applied once, and `migrate.js` refuses such a database otherwise. `drizzle-orm` is a runtime dependency (not dev) because that script runs in the image.

**Environment variables** (see `.env.example`):
- `DATABASE_URL` — path to SQLite file
- `ORIGIN` — used as better-auth `baseURL`
- `BETTER_AUTH_SECRET` — 32-char high-entropy secret for production
- `BODY_SIZE_LIMIT` — adapter-node request cap; `Dockerfile.prod` sets `6M` for image uploads

**Deployment:** `Dockerfile.prod` builds the production image (adapter-node, `node build` on port 3000, SQLite at `/data/dewy.db` — mount a volume there); `.github/workflows/docker.yml` builds it on PRs and pushes it to GHCR from `main` and `v*` tags. `dockerfile` + `docker-compose.yml` are the dev setup only (`vite dev`).
