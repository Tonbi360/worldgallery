import { getApiDb, schema, setCorsHeaders } from './_lib/db';
import { sql } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  try {
    try {
      setCorsHeaders(res, req?.headers?.origin);
    } catch {
      // CORS header setting safety fallback
    }

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method && req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const databaseUrl = (
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      ''
    ).trim();

    const isDbConfigured = Boolean(databaseUrl);

    let dbStatus: string = 'not_connected';
    const counts = {
      users: 0,
      profiles: 0,
      connection_requests: 0,
    };

    if (!isDbConfigured) {
      dbStatus = 'missing DATABASE_URL (or POSTGRES_URL) environment variable';
    } else {
      try {
        const db = getApiDb();
        if (!db) {
          dbStatus = 'database client initialization failed (check DATABASE_URL connection string format)';
        } else {
          const [userRes, profileRes, connRes] = await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(schema.users),
            db.select({ count: sql<number>`count(*)` }).from(schema.profiles),
            db.select({ count: sql<number>`count(*)` }).from(schema.connection_requests),
          ]);

          counts.users = Number(userRes[0]?.count) || 0;
          counts.profiles = Number(profileRes[0]?.count) || 0;
          counts.connection_requests = Number(connRes[0]?.count) || 0;
          dbStatus = 'connected';
        }
      } catch (dbErr: any) {
        const message = dbErr?.message || String(dbErr);
        const stackLine = (dbErr?.stack || '').split('\n')[1]?.trim() || '';
        dbStatus = `db error: ${message}${stackLine ? ` (${stackLine})` : ''}`;
      }
    }

    const responsePayload = {
      ok: dbStatus === 'connected',
      db: dbStatus,
      counts,
      env: {
        has_database_url: isDbConfigured,
        has_admin_email: Boolean(process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL),
        has_admin_passcode: Boolean(process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASSCODE),
        has_resend_api_key: Boolean(process.env.RESEND_API_KEY),
      },
    };

    if (res && typeof res.status === 'function') {
      return res.status(200).json(responsePayload);
    }
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    res.statusCode = 200;
    return res.end(JSON.stringify(responsePayload));
  } catch (err: any) {
    const message = err?.message || String(err);
    const firstStackLine = (err?.stack || '').split('\n')[1]?.trim() || '';
    const errPayload = {
      ok: false,
      error: firstStackLine ? `${message} | at ${firstStackLine}` : message,
      db: 'handler_crashed',
      counts: {
        users: 0,
        profiles: 0,
        connection_requests: 0,
      },
    };

    try {
      if (res && typeof res.status === 'function') {
        return res.status(200).json(errPayload);
      }
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      res.statusCode = 200;
      return res.end(JSON.stringify(errPayload));
    } catch {
      try {
        res.statusCode = 200;
        return res.end(JSON.stringify(errPayload));
      } catch {
        // safety
      }
    }
  }
}

