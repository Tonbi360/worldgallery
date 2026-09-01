import { getApiDb, setCorsHeaders, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    let sql: any;
    try {
      sql = await getApiDb();
    } catch (dbErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbErr?.message || String(dbErr)}`);
    }

    if (!sql) {
      return sendError(res, 503, 'Database unavailable');
    }

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT * FROM profiles
        WHERE status = 'active'
        ORDER BY created_at DESC
      `;

      const profiles = rows.map((p: any) => ({
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

      const existing = await sql`SELECT id FROM profiles WHERE handle = ${cleanHandle} LIMIT 1`;

      const tagsJson = JSON.stringify(body.tags || []);
      const bridgesJson = JSON.stringify(body.bridges || []);
      const avatarPrimary = body.avatarUrl || body.photos?.[0] || null;
      const avatarSecondary = body.photos?.[1] || null;

      if (existing && existing.length > 0) {
        await sql`
          UPDATE profiles SET
            full_name = ${cleanName},
            bio = ${body.bio || ''},
            location = ${body.location || ''},
            avatar_bg = ${body.avatarBg || '#2D6A4F'},
            avatar_primary = ${avatarPrimary},
            avatar_secondary = ${avatarSecondary},
            tags = ${tagsJson}::jsonb,
            availability = ${body.availability || 'open'},
            bridges = ${bridgesJson}::jsonb
          WHERE handle = ${cleanHandle}
        `;
      } else {
        const profId = body.id || `prof_${Date.now()}`;
        await sql`
          INSERT INTO profiles (
            id, full_name, handle, bio, location, avatar_bg, avatar_primary, avatar_secondary,
            tags, availability, bridges, member_number, cohort, status, created_at
          ) VALUES (
            ${profId}, ${cleanName}, ${cleanHandle}, ${body.bio || ''},
            ${body.location || ''}, ${body.avatarBg || '#2D6A4F'}, ${avatarPrimary},
            ${avatarSecondary}, ${tagsJson}::jsonb, ${body.availability || 'open'},
            ${bridgesJson}::jsonb, ${body.memberNumber || '#0001'},
            ${body.cohort || 'Cohort 2026'}, 'active', NOW()
          )
        `;
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
