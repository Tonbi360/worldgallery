import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../drizzle/schema';

// Lazy-initialized database connection for server/node scripts, Vercel/serverless functions, and APIs
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getServerDb() {
  if (dbInstance) return dbInstance;

  const connectionString =
    process.env.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env.POSTGRES_URL : '');

  if (!connectionString) {
    return null;
  }

  try {
    const sql = neon(connectionString);
    dbInstance = drizzle(sql, { schema });
    return dbInstance;
  } catch (err) {
    console.warn('[Database] Could not connect to DATABASE_URL:', err);
    return null;
  }
}

export { schema };
