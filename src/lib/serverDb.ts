import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../drizzle/schema';

// Lazy-initialized database connection for server/node scripts, migrations and APIs
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

export function getServerDb() {
  if (dbInstance) return dbInstance;

  const connectionString =
    process.env.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env.POSTGRES_URL : '');

  if (!connectionString) {
    return null;
  }

  try {
    clientInstance = postgres(connectionString, { max: 10 });
    dbInstance = drizzle(clientInstance, { schema });
    return dbInstance;
  } catch (err) {
    console.warn('[Database] Could not connect to DATABASE_URL:', err);
    return null;
  }
}

export { schema };
