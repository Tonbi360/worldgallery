export const BUILD_STAMP = 'WG-2026-09-02-C';

export default async function handler(req: any, res: any) {
  try {
    // 1. Safe CORS & Header configuration
    try {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');
      }
    } catch {
      // Header safety catch
    }

    if (req?.method === 'OPTIONS') {
      if (res?.status && typeof res.status === 'function') {
        return res.status(200).end();
      }
      return res?.end ? res.end() : null;
    }

    // 2. Read environment presence purely via process.env
    const rawDbUrl = (
      (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
      ''
    ).trim();

    const rawAdminEmail = (
      (typeof process !== 'undefined' && (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL)) ||
      ''
    ).trim();

    const rawAdminPasscode = (
      (typeof process !== 'undefined' && (process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASSCODE)) ||
      ''
    ).trim();

    const envPresence = {
      DATABASE_URL: rawDbUrl ? 'present' : 'missing',
      ADMIN_EMAIL: rawAdminEmail ? 'present' : 'missing',
      ADMIN_PASSCODE: rawAdminPasscode ? 'present' : 'missing',
    };

    // 3. Isolated DB connectivity check via dynamic import of neon
    let dbStatus = rawDbUrl ? 'untested' : 'missing DATABASE_URL';
    let dbConnected = false;
    let counts = {
      users: 0,
      profiles: 0,
      connection_requests: 0,
    };
    let dbError: string | null = null;

    if (rawDbUrl) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(rawDbUrl);

        const [userRows, profileRows, connRows] = await Promise.all([
          sql`SELECT count(*)::int as count FROM users`.catch(() => [{ count: 0 }]),
          sql`SELECT count(*)::int as count FROM profiles`.catch(() => [{ count: 0 }]),
          sql`SELECT count(*)::int as count FROM connection_requests`.catch(() => [{ count: 0 }]),
        ]);

        counts = {
          users: Number((userRows as any)?.[0]?.count) || 0,
          profiles: Number((profileRows as any)?.[0]?.count) || 0,
          connection_requests: Number((connRows as any)?.[0]?.count) || 0,
        };

        dbStatus = 'connected';
        dbConnected = true;
      } catch (err: any) {
        dbConnected = false;
        const msg = err?.message || String(err);
        const stackLine = (err?.stack || '').split('\n')[1]?.trim() || '';
        dbError = stackLine ? `${msg} (${stackLine})` : msg;
        dbStatus = `db error: ${dbError}`;
      }
    }

    const payload = {
      ok: true,
      build: BUILD_STAMP,
      node: typeof process !== 'undefined' ? process.version : 'unknown',
      env: envPresence,
      db: dbConnected ? 'connected' : (dbError || dbStatus),
      counts,
    };

    if (res && typeof res.status === 'function') {
      return res.status(200).json(payload);
    }
    if (res) {
      res.statusCode = 200;
      if (typeof res.end === 'function') {
        return res.end(JSON.stringify(payload));
      }
    }
    return payload;
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const firstStackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    const fallbackPayload = {
      ok: false,
      build: BUILD_STAMP,
      error: firstStackLine ? `${message} | at ${firstStackLine}` : message,
      node: typeof process !== 'undefined' ? process.version : 'unknown',
      env: {
        DATABASE_URL: 'error_evaluating',
        ADMIN_EMAIL: 'error_evaluating',
        ADMIN_PASSCODE: 'error_evaluating',
      },
      db: 'handler_crashed',
      counts: {
        users: 0,
        profiles: 0,
        connection_requests: 0,
      },
    };

    try {
      if (res && typeof res.status === 'function') {
        return res.status(200).json(fallbackPayload);
      }
      if (res) {
        res.statusCode = 200;
        if (typeof res.end === 'function') {
          return res.end(JSON.stringify(fallbackPayload));
        }
      }
    } catch {
      // Ignore
    }
    return fallbackPayload;
  }
}
