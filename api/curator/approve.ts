import { getApiDb, setCorsHeaders, verifyCuratorApiAuth, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed');
    }

    // Server-side curator verification
    const auth = verifyCuratorApiAuth(req);
    if (!auth.authorized) {
      return sendError(res, 401, auth.error || 'Unauthorized: Curator credentials required');
    }

    // Dynamic import of drizzle-orm inside handler
    let drizzleOrm: typeof import('drizzle-orm');
    try {
      drizzleOrm = await import('drizzle-orm');
    } catch (importErr: any) {
      return sendError(res, 500, `Failed to load drizzle-orm module: ${importErr?.message || String(importErr)}`);
    }
    const { eq, sql } = drizzleOrm;

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
    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Enforce max 10 daily approvals
    const dailyRecords = await db
      .select()
      .from(schema.curator_daily_approvals)
      .where(eq(schema.curator_daily_approvals.date, today))
      .limit(1);

    const currentDaily = dailyRecords[0]?.count || 0;
    if (currentDaily >= 10) {
      return sendError(res, 429, 'Daily curation quota reached (10/10). The pace of welcoming resumes at dawn.');
    }

    // 2. Fetch applicant profile
    const applicant = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, applicantId))
      .limit(1);

    if (!applicant || applicant.length === 0) {
      return sendError(res, 404, 'Applicant not found');
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

    return sendJson(res, 200, { ok: true, success: true, member });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
