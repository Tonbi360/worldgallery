import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    const db = getApiDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { handle } = req.query || {};
    const cleanHandle = String(handle || '').toLowerCase().replace(/^@/, '').trim();

    if (!cleanHandle) {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const rows = await db
      .select()
      .from(schema.profiles)
      .where(and(eq(schema.profiles.handle, cleanHandle), eq(schema.profiles.status, 'active')))
      .limit(1);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
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

    return res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    console.error('[API /api/profiles/[handle]] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
