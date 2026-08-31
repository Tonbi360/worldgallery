import { getApiDb, schema, setCorsHeaders, verifyCuratorApiAuth } from '../_lib/db';
import { eq, sql } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server-side curator verification
  const auth = verifyCuratorApiAuth(req);
  if (!auth.authorized) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const { applicantId } = req.body || {};
  if (!applicantId) {
    return res.status(400).json({ error: 'Applicant ID is required' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Enforce max 10 daily approvals
    const dailyRecords = await db
      .select()
      .from(schema.curator_daily_approvals)
      .where(eq(schema.curator_daily_approvals.date, today))
      .limit(1);

    const currentDaily = dailyRecords[0]?.count || 0;
    if (currentDaily >= 10) {
      return res.status(429).json({
        error: 'Daily curation quota reached (10/10). The pace of welcoming resumes at dawn.',
      });
    }

    // 2. Fetch applicant profile
    const applicant = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, applicantId))
      .limit(1);

    if (!applicant || applicant.length === 0) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const p = applicant[0];

    // 3. Count total active members for member numbering
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.profiles)
      .where(eq(schema.profiles.status, 'active'));

    const nextSerial = String((Number(countResult[0]?.count) || 0) + 1).padStart(4, '0');

    // 4. Update status to active
    await db
      .update(schema.profiles)
      .set({
        status: 'active',
        member_number: `#${nextSerial}`,
        cohort: 'Cohort 2026',
      })
      .where(eq(schema.profiles.id, applicantId));

    // 5. Update daily counter
    if (dailyRecords && dailyRecords.length > 0) {
      await db
        .update(schema.curator_daily_approvals)
        .set({ count: currentDaily + 1 })
        .where(eq(schema.curator_daily_approvals.date, today));
    } else {
      await db.insert(schema.curator_daily_approvals).values({
        id: `cda_${today}`,
        date: today,
        count: 1,
      });
    }

    const member = {
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
      memberNumber: `#${nextSerial}`,
      cohort: 'Cohort 2026',
      bridges: p.bridges || [],
    };

    return res.status(200).json({ success: true, member });
  } catch (error: any) {
    console.error('[API /api/curator/approve] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
