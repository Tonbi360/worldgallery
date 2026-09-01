function setCorsHeaders(res: any, origin?: string) {
  try {
    if (!res || typeof res.setHeader !== 'function') return;

    const configuredAppUrl = (
      (typeof process !== 'undefined' && (process.env.APP_URL || process.env.NEXTAUTH_URL)) ||
      ''
    ).trim();

    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://ais-dev-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
      'https://ais-pre-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
    ];

    if (configuredAppUrl && !allowedOrigins.includes(configuredAppUrl)) {
      allowedOrigins.push(configuredAppUrl);
    }

    const isVercelPreview = origin && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);
    const isAllowed = origin && (allowedOrigins.includes(origin) || isVercelPreview);
    const matchedOrigin = isAllowed ? origin : (configuredAppUrl || origin || '*');

    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-curator-email, x-curator-role, x-curator-passcode, x-user-email');
    res.setHeader('Access-Control-Max-Age', '86400');
  } catch {
    // Ignore
  }
}

function sendJson(res: any, status: number, data: any) {
  try {
    setCorsHeaders(res);
    if (res && typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    if (res) {
      res.statusCode = status;
      if (typeof res.end === 'function') {
        return res.end(JSON.stringify(data));
      }
    }
  } catch {
    // Fallback
  }
}

function sendError(res: any, status: number, message: string) {
  return sendJson(res, status, { ok: false, error: message });
}

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    const connectionString = (
      (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
      ''
    ).trim();

    let sql: any = null;
    if (connectionString) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        sql = neon(connectionString);
      } catch (neonErr: any) {
        return sendError(res, 500, `Database driver load error: ${neonErr?.message || String(neonErr)}`);
      }
    }

    if (!sql) {
      return sendError(res, 503, 'Database unavailable');
    }

    const { handle } = req.query || {};
    const cleanHandle = String(handle || '').toLowerCase().replace(/^@/, '').trim();

    if (!cleanHandle) {
      return sendError(res, 400, 'Handle is required');
    }

    const rows = await sql`
      SELECT * FROM profiles
      WHERE handle = ${cleanHandle} AND status = 'active'
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return sendError(res, 404, 'Profile not found');
    }

    const p = rows[0];
    const profile = {
      id: p.id,
      fullName: p.full_name,
      handle: p.handle,
      location: p.location || '',
      bio: p.bio || '',
      tags: typeof p.tags === 'string' ? JSON.parse(p.tags) : p.tags || [],
      availability: p.availability || 'open',
      avatarBg: p.avatar_bg || '#2D6A4F',
      avatarUrl: p.avatar_primary || undefined,
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean),
      memberNumber: p.member_number || undefined,
      cohort: p.cohort || 'Cohort 2026',
      bridges: typeof p.bridges === 'string' ? JSON.parse(p.bridges) : p.bridges || [],
    };

    return sendJson(res, 200, { ok: true, success: true, data: profile });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
