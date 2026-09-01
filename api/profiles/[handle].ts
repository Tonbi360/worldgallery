import { getApiDb, setCorsHeaders, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    // Dynamic import of drizzle-orm inside handler
    let drizzleOrm: typeof import('drizzle-orm');
    try {
      drizzleOrm = await import('drizzle-orm');
    } catch (importErr: any) {
      return sendError(res, 500, `Failed to load drizzle-orm module: ${importErr?.message || String(importErr)}`);
    }
    const { eq, and } = drizzleOrm;

    let dbContext;
    try {
      dbContext = await getApiDb();
    } catch (dbErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbErr?.message || String(dbErr)}`);
    }

    if (!dbContext) {
      return sendError(res, 503, 'Database unavailable');
    }

    const { db, schema } = dbContext;
    const { handle } = req.query || {};
    const cleanHandle = String(handle || '').toLowerCase().replace(/^@/, '').trim();

    if (!cleanHandle) {
      return sendError(res, 400, 'Handle is required');
    }

    const rows = await db
      .select()
      .from(schema.profiles)
      .where(and(eq(schema.profiles.handle, cleanHandle), eq(schema.profiles.status, 'active')))
      .limit(1);

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
      tags: p.tags || [],
      availability: p.availability || 'open',
      avatarBg: p.avatar_bg || '#2D6A4F',
      avatarUrl: p.avatar_primary || undefined,
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean),
      memberNumber: p.member_number || undefined,
      cohort: p.cohort || 'Cohort 2026',
      bridges: p.bridges || [],
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
