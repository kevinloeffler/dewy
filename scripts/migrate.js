/**
 * Applies the migrations in `drizzle/` to DATABASE_URL. The production
 * container runs this before starting the server, so a fresh volume gets its
 * tables and an existing one gets whatever it is missing. Idempotent.
 *
 *   node scripts/migrate.js              # apply pending migrations
 *   node scripts/migrate.js --baseline   # adopt a database made by db:push
 *
 * Databases created with `db:push` (every local.db so far) already have the
 * tables but no record of `0000_init`, so migrating them would fail on the
 * first CREATE TABLE. `--baseline` records `0000_init` as applied — its
 * schema was checked against local.db when it was generated — and then
 * migrates normally. Without the flag such a database is refused rather than
 * guessed at.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
const file = process.env.DATABASE_URL ?? 'local.db';
const baseline = process.argv.includes('--baseline');

const client = new Database(file);
client.pragma('foreign_keys = ON');

const hasTable = (name) =>
    client.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name) !== undefined;

if (hasTable('user') && !hasTable('__drizzle_migrations')) {
    if (!baseline) {
        console.error(
            `${file} has tables but no migration history (it was probably made with db:push).\n` +
                'Run `node scripts/migrate.js --baseline` once to adopt it.'
        );
        process.exit(1);
    }

    const [init] = readMigrationFiles({ migrationsFolder });
    // Same shape drizzle's migrator creates, so it picks up from here.
    client.exec(`CREATE TABLE "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
    )`);
    client
        .prepare('insert into "__drizzle_migrations" (hash, created_at) values (?, ?)')
        .run(init.hash, init.folderMillis);
    console.log(`Baselined ${file} at 0000_init.`);
}

migrate(drizzle(client), { migrationsFolder });
client.close();

console.log(`Migrations applied to ${file}.`);
