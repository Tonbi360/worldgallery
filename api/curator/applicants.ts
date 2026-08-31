import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq, desc } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    const rows = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.status, 'pending'))
      .orderBy(desc(schema.profiles.created_at));

    const applicants = rows.map((p) => ({
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
      bridges: p.bridges || [],
      appliedAt: p.created_at.toISOString(),
      entryType: 'queue',
      status: 'pending',
    }));

    return res.status(200).json({ success: true, data: applicants });
  } catch (error: any) {
    console.error('[API /api/curator/applicants] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
