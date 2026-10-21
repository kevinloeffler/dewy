/**
 * Applies the migrations in `drizzle/` to DATABASE_URL, then the data
 * migrations in `scripts/data-migrations/`. The production container runs
 * this before starting the server, so a fresh volume gets its tables and an
 * existing one gets whatever it is missing. Idempotent.
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
import { readdirSync } from 'node:fs';

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
const dataMigrationsFolder = new URL('./data-migrations/', import.meta.url);
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

/*
 * Data migrations: rewrites of stored rows — chiefly the level JSON in
 * `level.data` — that no schema change expresses. Each file exports
 * `up(db)`, gets the raw better-sqlite3 client, and runs exactly once, in
 * filename order, after the schema is current. It and its record share one
 * transaction, so a failure leaves the database as it was and stops the
 * container. Because each one runs once, it need not be idempotent.
 */
client.exec(`CREATE TABLE IF NOT EXISTS "__data_migrations" (
    name text PRIMARY KEY NOT NULL,
    applied_at integer NOT NULL
)`);
const applied = new Set(
    client.prepare('select name from "__data_migrations"').all().map((row) => row.name)
);
const record = client.prepare('insert into "__data_migrations" (name, applied_at) values (?, ?)');

const pending = readdirSync(dataMigrationsFolder)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => name.slice(0, -'.js'.length))
    .filter((name) => !applied.has(name));

for (const name of pending) {
    const { up } = await import(new URL(`${name}.js`, dataMigrationsFolder).href);
    client.transaction(() => {
        up(client);
        record.run(name, Date.now());
    })();
    console.log(`Data migration ${name} applied.`);
}

client.close();

console.log(`Migrations applied to ${file}.`);
