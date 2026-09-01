import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq, desc } from 'drizzle-orm';

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

    if (req.method === 'GET') {
      const rows = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.status, 'active'))
        .orderBy(desc(schema.profiles.created_at));

      const profiles = rows.map((p) => ({
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

      return res.status(200).json({ success: true, data: profiles });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const cleanHandle = String(body.handle || '').toLowerCase().replace(/^@/, '').trim();
      const cleanName = String(body.fullName || '').trim();

      if (!cleanHandle || !cleanName) {
        return res.status(400).json({ error: 'Handle and full name are required' });
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

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[API /api/profiles] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
