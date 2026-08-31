import { getApiDb, schema, setCorsHeaders } from './_lib/db';
import { sql } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers?.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(200).json({
      ok: false,
      db: 'Database not initialized (missing DATABASE_URL or POSTGRES_URL environment variable)',
      counts: {
        users: 0,
        profiles: 0,
        connection_requests: 0,
      },
    });
  }

  try {
    const [userRes, profileRes, connRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.users),
      db.select({ count: sql<number>`count(*)` }).from(schema.profiles),
      db.select({ count: sql<number>`count(*)` }).from(schema.connection_requests),
    ]);

    const usersCount = Number(userRes[0]?.count) || 0;
    const profilesCount = Number(profileRes[0]?.count) || 0;
    const connectionsCount = Number(connRes[0]?.count) || 0;

    return res.status(200).json({
      ok: true,
      db: 'connected',
      counts: {
        users: usersCount,
        profiles: profilesCount,
        connection_requests: connectionsCount,
      },
    });
  } catch (error: any) {
    console.error('[API /api/health] Database connection query failed:', error);
    return res.status(200).json({
      ok: false,
      db: error?.message || 'Database connection error',
      counts: {
        users: 0,
        profiles: 0,
        connection_requests: 0,
      },
    });
  }
}
