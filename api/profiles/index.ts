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
    const { eq, desc } = drizzleOrm;

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

    if (req.method === 'GET') {
      const rows = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.status, 'active'))
        .orderBy(desc(schema.profiles.created_at));

      const profiles = rows.map((p: any) => ({
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
      }));

      return sendJson(res, 200, { ok: true, success: true, data: profiles });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const cleanHandle = String(body.handle || '').toLowerCase().replace(/^@/, '').trim();
      const cleanName = String(body.fullName || '').trim();

      if (!cleanHandle || !cleanName) {
        return sendError(res, 400, 'Handle and full name are required');
      }

      const existing = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.handle, cleanHandle))
        .limit(1);

      if (existing && existing.length > 0) {
        await db
          .update(schema.profiles)
          .set({
            full_name: cleanName,
            bio: body.bio || '',
            location: body.location || '',
            avatar_bg: body.avatarBg || '#2D6A4F',
            avatar_primary: body.avatarUrl || body.photos?.[0] || null,
            avatar_secondary: body.photos?.[1] || null,
            tags: body.tags || [],
            availability: body.availability || 'open',
            bridges: body.bridges || [],
          })
          .where(eq(schema.profiles.handle, cleanHandle));
      } else {
        await db.insert(schema.profiles).values({
          id: body.id || `prof_${Date.now()}`,
          full_name: cleanName,
          handle: cleanHandle,
          bio: body.bio || '',
          location: body.location || '',
          avatar_bg: body.avatarBg || '#2D6A4F',
          avatar_primary: body.avatarUrl || body.photos?.[0] || null,
          avatar_secondary: body.photos?.[1] || null,
          tags: body.tags || [],
          availability: body.availability || 'open',
          bridges: body.bridges || [],
          member_number: body.memberNumber || '#0001',
          cohort: body.cohort || 'Cohort 2026',
          status: 'active',
          created_at: new Date(),
        });
      }

      return sendJson(res, 200, { ok: true, success: true });
    }

    return sendError(res, 405, 'Method not allowed');
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
