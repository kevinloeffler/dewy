import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);

// better-sqlite3 is compiled with SQLITE_DEFAULT_FOREIGN_KEYS=1, so this is
// already on — but the schema leans on ON DELETE CASCADE to keep a course's
// stages, items and levels from outliving it, and that guarantee should be
// ours rather than a property of how the native dependency was built.
client.pragma('foreign_keys = ON');

export const db = drizzle(client, { schema });
