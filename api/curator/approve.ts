function setCorsHeaders(res: any, origin?: string) {
  try {
    if (!res || typeof res.setHeader !== 'function') return;

    const configuredAppUrl = (
      (typeof process !== 'undefined' && (process.env.APP_URL || process.env.NEXTAUTH_URL)) ||
      ''
    ).trim();

    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://ais-dev-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
      'https://ais-pre-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
    ];

    if (configuredAppUrl && !allowedOrigins.includes(configuredAppUrl)) {
      allowedOrigins.push(configuredAppUrl);
    }

    const isVercelPreview = origin && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);
    const isAllowed = origin && (allowedOrigins.includes(origin) || isVercelPreview);
    const matchedOrigin = isAllowed ? origin : (configuredAppUrl || origin || '*');

    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-curator-email, x-curator-role, x-curator-passcode, x-user-email');
    res.setHeader('Access-Control-Max-Age', '86400');
  } catch {
    // Ignore
  }
}

function sendJson(res: any, status: number, data: any) {
  try {
    setCorsHeaders(res);
    if (res && typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    if (res) {
      res.statusCode = status;
      if (typeof res.end === 'function') {
        return res.end(JSON.stringify(data));
      }
    }
  } catch {
    // Fallback
  }
}

function sendError(res: any, status: number, message: string) {
  return sendJson(res, status, { ok: false, error: message });
}

function verifyCuratorApiAuth(req: any): { authorized: boolean; error?: string } {
  try {
    const configuredAdminEmail = (
      (typeof process !== 'undefined' && (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL)) ||
      'tonbaratiminipredestiny@gmail.com'
    ).toLowerCase().trim();

    const configuredPasscode = (
      (typeof process !== 'undefined' && (process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASSCODE)) ||
      'curator2026'
    ).trim();

    const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
    const headerEmail = String(req?.headers?.['x-curator-email'] || req?.headers?.['x-user-email'] || '').toLowerCase().trim();
    const headerRole = String(req?.headers?.['x-curator-role'] || '').toLowerCase().trim();
    const headerPasscode = String(req?.headers?.['x-curator-passcode'] || '').trim();

    // 1. Check Bearer token or direct passcode header
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token === configuredPasscode || token === configuredAdminEmail) {
        return { authorized: true };
      }
    }

    if (headerPasscode && headerPasscode === configuredPasscode) {
      return { authorized: true };
    }

    // 2. Validate curator session email + role
    if (headerEmail === configuredAdminEmail && (headerRole === 'curator' || headerRole === 'admin')) {
      return { authorized: true };
    }

    // 3. Fallback for preview / dev environments when database is mock
    if (process.env.NODE_ENV === 'development' || (!process.env.DATABASE_URL && !process.env.POSTGRES_URL)) {
      return { authorized: true };
    }

    return { authorized: false, error: 'Unauthorized: Action requires verified curator credentials.' };
  } catch (err: any) {
    return { authorized: false, error: `Auth verification error: ${err?.message || String(err)}` };
  }
}

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

    const connectionString = (
      (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
      ''
    ).trim();

    let sql: any = null;
    if (connectionString) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        sql = neon(connectionString);
      } catch (neonErr: any) {
        return sendError(res, 500, `Database driver load error: ${neonErr?.message || String(neonErr)}`);
      }
    }

    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    if (!sql) {
      return sendJson(res, 200, {
        ok: true,
        success: true,
        member: {
          id: applicantId,
          fullName: 'Approved Member',
          handle: 'approved',
          memberNumber: '#0002',
          cohort: 'Cohort 2026',
        },
      });
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
