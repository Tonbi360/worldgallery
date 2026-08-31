import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../drizzle/schema';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getApiDb() {
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
    console.warn('[API Database] Connection failure:', err);
    return null;
  }
}

export { schema };

export function setCorsHeaders(res: any, origin?: string) {
  const allowedOrigins = [
    'https://worldgallery.vercel.app',
    'http://localhost:3000',
    'https://ais-dev-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
    'https://ais-pre-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
  ];

  const matchedOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : 'https://worldgallery.vercel.app';

  res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}
