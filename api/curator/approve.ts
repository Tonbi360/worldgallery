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

    let sql: any;
    try {
      sql = await getApiDb();
    } catch (dbErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbErr?.message || String(dbErr)}`);
    }

    if (!sql) {
      return sendError(res, 503, 'Database unavailable');
    }

    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Enforce max 10 daily approvals
    const dailyRecords = await sql`
      SELECT * FROM curator_daily_approvals
      WHERE date = ${today}
      LIMIT 1
    `;

    const currentDaily = Number(dailyRecords[0]?.count) || 0;
    if (currentDaily >= 10) {
      return sendError(res, 429, 'Daily curation quota reached (10/10). The pace of welcoming resumes at dawn.');
    }

    // 2. Fetch applicant profile
    const applicant = await sql`
      SELECT * FROM profiles
      WHERE id = ${applicantId}
      LIMIT 1
    `;

    if (!applicant || applicant.length === 0) {
      return sendError(res, 404, 'Applicant not found');
    }

    const p = applicant[0];

    // 3. Count total active members for member numbering
    const countResult = await sql`
      SELECT count(*)::int as count
      FROM profiles
      WHERE status = 'active'
    `;

    const nextSerial = String((Number(countResult[0]?.count) || 0) + 1).padStart(4, '0');

    // 4. Update status to active
    await sql`
      UPDATE profiles SET
        status = 'active',
        member_number = ${'#' + nextSerial},
        cohort = 'Cohort 2026'
      WHERE id = ${applicantId}
    `;

    // 5. Update daily counter
    if (dailyRecords && dailyRecords.length > 0) {
      await sql`
        UPDATE curator_daily_approvals
        SET count = ${currentDaily + 1}
        WHERE date = ${today}
      `;
    } else {
      await sql`
        INSERT INTO curator_daily_approvals (id, date, count)
        VALUES (${'cda_' + today}, ${today}, 1)
      `;
    }

    const member = {
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
      memberNumber: `#${nextSerial}`,
      cohort: 'Cohort 2026',
      bridges: typeof p.bridges === 'string' ? JSON.parse(p.bridges) : p.bridges || [],
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
