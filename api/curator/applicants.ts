import { getApiDb, setCorsHeaders, verifyCuratorApiAuth, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'GET') {
      return sendError(res, 405, 'Method not allowed');
    }

    // Server-side curator verification
    const auth = verifyCuratorApiAuth(req);
    if (!auth.authorized) {
      return sendError(res, 401, auth.error || 'Unauthorized: Curator credentials required');
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

    const rows = await sql`
      SELECT * FROM profiles
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `;

    const applicants = rows.map((p: any) => ({
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
      bridges: typeof p.bridges === 'string' ? JSON.parse(p.bridges) : p.bridges || [],
      appliedAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      entryType: 'queue',
      status: 'pending',
    }));

    return sendJson(res, 200, { ok: true, success: true, data: applicants });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
