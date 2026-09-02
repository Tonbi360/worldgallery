export const BUILD_STAMP = 'WG-2026-09-03-A';

// ============================================================================
// 1. INLINED CORS & HTTP RESPONSE UTILITIES (ZERO EXTERNAL RELATIVE IMPORTS)
// ============================================================================

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-curator-email, x-curator-role, x-curator-passcode, x-user-email, x-requested-with'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  } catch {
    // Ignore header errors in mock/edge environments
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

// ============================================================================
// 2. ISOLATED DYNAMIC DRIVER LOADERS
// ============================================================================

async function getDb(): Promise<{ sql: any; error?: string }> {
  const connectionString = (
    (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
    ''
  ).trim();

  if (!connectionString) {
    return { sql: null };
  }

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString);
    return { sql };
  } catch (neonErr: any) {
    const msg = neonErr?.message || String(neonErr);
    return { sql: null, error: `Neon driver error: ${msg}` };
  }
}

async function getBcrypt(): Promise<{ bcrypt: any; error?: string }> {
  try {
    const bcrypt = await import('bcryptjs');
    return { bcrypt: bcrypt.default || bcrypt };
  } catch (err: any) {
    return { bcrypt: null, error: `Bcrypt load error: ${err?.message || String(err)}` };
  }
}

// ============================================================================
// 3. CURATOR AUTHENTICATION VERIFIER
// ============================================================================

function verifyCuratorApiAuth(req: any): { authorized: boolean; error?: string } {
  try {
    const configuredAdminEmail = (
      (typeof process !== 'undefined' && process.env.ADMIN_EMAIL) ||
      ''
    ).toLowerCase().trim();

    const configuredPasscode = (
      (typeof process !== 'undefined' && process.env.ADMIN_PASSCODE) ||
      ''
    ).trim();

    if (!configuredAdminEmail || !configuredPasscode) {
      return { authorized: false, error: 'Curator authentication is not configured on server' };
    }

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
    if (
      headerEmail === configuredAdminEmail &&
      (headerRole === 'curator' || headerRole === 'admin')
    ) {
      return { authorized: true };
    }

    return { authorized: false, error: 'Unauthorized: Action requires verified curator credentials.' };
  } catch (err: any) {
    return { authorized: false, error: `Auth verification error: ${err?.message || String(err)}` };
  }
}

// ============================================================================
// 4. URL PARSER & SLUG NORMALIZER
// ============================================================================

function parseRequestPath(req: any): { method: string; pathname: string; slug: string[]; query: Record<string, string> } {
  const method = String(req.method || 'GET').toUpperCase();
  const urlString = String(req.url || '/api/health');
  const parsedUrl = new URL(urlString, 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  
  // Extract path parts
  const cleanParts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  
  // Strip 'api' if leading
  const slug = cleanParts[0] === 'api' ? cleanParts.slice(1) : cleanParts;
  
  // If req.query contains slug array (Vercel catch-all style), respect that as fallback
  if (req.query?.slug) {
    const rawSlug = req.query.slug;
    const customSlug = Array.isArray(rawSlug) ? rawSlug : [String(rawSlug)];
    if (customSlug.length > 0 && slug.length === 0) {
      slug.push(...customSlug);
    }
  }

  const query: Record<string, string> = {};
  parsedUrl.searchParams.forEach((val, key) => {
    query[key] = val;
  });
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'slug' && typeof v === 'string') {
        query[k] = v;
      }
    }
  }

  return { method, pathname, slug, query };
}

// ============================================================================
// 5. INDIVIDUAL ENDPOINT ROUTE HANDLERS
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/health
// ----------------------------------------------------------------------------
async function handleHealth(req: any, res: any) {
  const { sql, error: dbErr } = await getDb();
  let dbStatus = 'not_configured';

  if (sql) {
    try {
      await sql`SELECT 1 as ping`;
      dbStatus = 'connected';
    } catch (pingErr: any) {
      dbStatus = `error: ${pingErr?.message || String(pingErr)}`;
    }
  } else if (dbErr) {
    dbStatus = dbErr;
  }

  return sendJson(res, 200, {
    ok: true,
    status: 'healthy',
    build: BUILD_STAMP,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    database: dbStatus,
    config: {
      database_url_configured: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
      admin_email_configured: !!process.env.ADMIN_EMAIL,
      admin_passcode_configured: !!process.env.ADMIN_PASSCODE,
    },
  });
}

// ----------------------------------------------------------------------------
// GET /api/auth/verify?selftest=1
// ----------------------------------------------------------------------------
async function handleAuthSelftest(req: any, res: any) {
  const steps: any[] = [];
  steps.push({ step: '1_handler_loaded', ok: true });

  const { bcrypt, error: bcryptErr } = await getBcrypt();
  steps.push({ step: '2_bcrypt_import', ok: !!bcrypt, error: bcryptErr });

  const { sql, error: neonErr } = await getDb();
  steps.push({ step: '3_neon_import', ok: !!sql || !neonErr, error: neonErr });

  if (sql) {
    try {
      const ping = await sql`SELECT 1 as ping`;
      steps.push({ step: '4_db_connect', ok: true, result: ping[0] });

      const uCount = await sql`SELECT COUNT(*)::int as count FROM users`;
      steps.push({ step: '5_users_select', ok: true, user_count: uCount[0]?.count });

      const pCount = await sql`SELECT COUNT(*)::int as count FROM profiles`;
      steps.push({ step: '6_profiles_select', ok: true, profile_count: pCount[0]?.count });
    } catch (dbQueryErr: any) {
      steps.push({ step: 'db_query_error', ok: false, error: dbQueryErr?.message || String(dbQueryErr) });
    }
  } else {
    steps.push({ step: '4_db_connect', ok: false, note: 'DATABASE_URL not configured' });
  }

  return sendJson(res, 200, {
    ok: true,
    selftest: true,
    build: BUILD_STAMP,
    timestamp: new Date().toISOString(),
    steps,
  });
}

// ----------------------------------------------------------------------------
// POST /api/auth/verify
// ----------------------------------------------------------------------------
async function handleAuthVerify(req: any, res: any) {
  const body = req.body || {};
  const rawEmail = String(body.email || body.handle || '').toLowerCase().trim();
  const passcode = String(body.passcode || '').trim();

  if (!rawEmail || !passcode) {
    return sendError(res, 400, 'Email/handle and passcode are required');
  }

  const configuredAdminEmail = (
    (typeof process !== 'undefined' && process.env.ADMIN_EMAIL) ||
    ''
  ).toLowerCase().trim();

  const configuredAdminPasscode = (
    (typeof process !== 'undefined' && process.env.ADMIN_PASSCODE) ||
    ''
  ).trim();

  const curatorHandle = configuredAdminEmail ? configuredAdminEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') : '';

  const isCuratorLogin =
    configuredAdminEmail !== '' &&
    configuredAdminPasscode !== '' &&
    (rawEmail === configuredAdminEmail || (curatorHandle !== '' && rawEmail === curatorHandle)) &&
    passcode === configuredAdminPasscode;

  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, 'Database service is unavailable');
  }

  // Curator Authentication Branch with Self-Healing
  if (isCuratorLogin) {
    const curatorUserId = `usr_curator_${curatorHandle || 'admin'}`;
    try {
      const existingUsers = await sql`
        SELECT * FROM users
        WHERE LOWER(email) = ${configuredAdminEmail} OR role = 'curator'
        LIMIT 1
      `;

      let resolvedCuratorId = existingUsers[0]?.id || curatorUserId;

      if (existingUsers.length === 0) {
        const { bcrypt } = await getBcrypt();
        const hash = bcrypt ? await bcrypt.hash(passcode, 10) : 'curator_hash';
        await sql`
          INSERT INTO users (id, email, password_hash, role, created_at)
          VALUES (${resolvedCuratorId}, ${configuredAdminEmail}, ${hash}, 'curator', NOW())
          ON CONFLICT (id) DO NOTHING
        `;
      }

      const existingProfiles = await sql`
        SELECT * FROM profiles
        WHERE LOWER(handle) = ${curatorHandle} OR member_number = '#0001'
        LIMIT 1
      `;

      if (existingProfiles.length === 0) {
        await sql`
          INSERT INTO profiles (
            id, user_id, full_name, handle, location, bio, tags,
            availability, avatar_bg, avatar_url, photos, member_number,
            cohort, status, created_at, updated_at
          ) VALUES (
            ${resolvedCuratorId}, ${resolvedCuratorId}, 'Curator', ${curatorHandle || 'curator'},
            'Global', 'Founding Curator of World Gallery.',
            ARRAY['Architecture', 'Curation', 'Design Systems']::text[],
            'available', '#1C1C1E', '', ARRAY[]::text[], '#0001',
            'Founder & Curator', 'active', NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      // Renumber all other active profiles sequentially starting from #0002
      try {
        const otherActiveProfiles = await sql`
          SELECT id, created_at FROM profiles
          WHERE status = 'active' AND handle != ${curatorHandle} AND member_number != '#0001'
          ORDER BY created_at ASC
        `;

        for (let i = 0; i < otherActiveProfiles.length; i++) {
          const nextNum = `#${String(i + 2).padStart(4, '0')}`;
          await sql`
            UPDATE profiles
            SET member_number = ${nextNum}
            WHERE id = ${otherActiveProfiles[i].id} AND (member_number IS NULL OR member_number != ${nextNum})
          `;
        }
      } catch {
        // Non-fatal renumbering notice
      }
    } catch (selfHealErr: any) {
      console.warn('[Curator Verify] Self-healing notice:', selfHealErr?.message || String(selfHealErr));
    }

    return sendJson(res, 200, {
      ok: true,
      verified: true,
      user: {
        id: curatorUserId,
        email: configuredAdminEmail,
        role: 'curator',
        name: 'Curator',
      },
      profile: {
        id: curatorUserId,
        handle: curatorHandle || 'curator',
        fullName: 'Curator',
        memberNumber: '#0001',
        cohort: 'Founder & Curator',
        status: 'active',
      },
    });
  }

  // Member Authentication Branch
  if (!sql) {
    return sendError(res, 401, 'Authentication requires active database connection');
  }

  const cleanHandle = rawEmail.replace(/^@/, '');
  const userRows = await sql`
    SELECT u.*, p.handle as profile_handle, p.full_name, p.member_number, p.cohort, p.status as profile_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id OR p.id = u.id
    WHERE LOWER(u.email) = ${rawEmail} OR LOWER(p.handle) = ${cleanHandle}
    LIMIT 1
  `;

  if (userRows.length === 0) {
    return sendError(res, 401, 'No account found with this email or handle');
  }

  const foundUser = userRows[0];
  const { bcrypt, error: bcryptErr } = await getBcrypt();
  if (!bcrypt) {
    return sendError(res, 500, `Bcrypt unavailable: ${bcryptErr}`);
  }

  const passwordMatches = await bcrypt.compare(passcode, foundUser.password_hash);
  if (!passwordMatches) {
    return sendError(res, 401, 'Invalid passcode provided');
  }

  return sendJson(res, 200, {
    ok: true,
    verified: true,
    user: {
      id: foundUser.id,
      email: foundUser.email,
      role: foundUser.role || 'member',
      name: foundUser.full_name || foundUser.profile_handle,
    },
    profile: {
      id: foundUser.id,
      handle: foundUser.profile_handle,
      fullName: foundUser.full_name,
      memberNumber: foundUser.member_number,
      cohort: foundUser.cohort,
      status: foundUser.profile_status || 'active',
    },
  });
}

// ----------------------------------------------------------------------------
// GET /api/apply?selftest=1
// ----------------------------------------------------------------------------
async function handleApplySelftest(req: any, res: any) {
  const steps: any[] = [];
  steps.push({ step: '1_apply_handler_loaded', ok: true });

  const { bcrypt, error: bcryptErr } = await getBcrypt();
  steps.push({ step: '2_bcrypt_import', ok: !!bcrypt, error: bcryptErr });

  const { sql, error: neonErr } = await getDb();
  steps.push({ step: '3_neon_import', ok: !!sql || !neonErr, error: neonErr });

  if (sql) {
    try {
      const ping = await sql`SELECT 1 as ping`;
      steps.push({ step: '4_db_connect', ok: true, result: ping[0] });

      const icCount = await sql`SELECT COUNT(*)::int as count FROM invite_codes`;
      steps.push({ step: '5_invite_codes_select', ok: true, seal_count: icCount[0]?.count });
    } catch (dbQueryErr: any) {
      steps.push({ step: 'db_query_error', ok: false, error: dbQueryErr?.message || String(dbQueryErr) });
    }
  }

  return sendJson(res, 200, {
    ok: true,
    selftest: true,
    endpoint: '/api/apply',
    build: BUILD_STAMP,
    timestamp: new Date().toISOString(),
    steps,
  });
}

// ----------------------------------------------------------------------------
// POST /api/apply
// ----------------------------------------------------------------------------
async function handleApply(req: any, res: any) {
  const body = req.body || {};
  const fullName = String(body.fullName || '').trim();
  const rawHandle = String(body.handle || '').trim().replace(/^@/, '').toLowerCase();
  const rawEmail = String(body.email || '').trim().toLowerCase();
  const passcode = String(body.passcode || '').trim();
  const location = String(body.location || '').trim();
  const bio = String(body.bio || '').trim();
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const availability = String(body.availability || 'available').trim();
  const avatarBg = String(body.avatarBg || '#1C1C1E').trim();
  const avatarUrl = String(body.avatarUrl || '').trim();
  const photos = Array.isArray(body.photos) ? body.photos : (avatarUrl ? [avatarUrl] : []);
  const bridges = Array.isArray(body.bridges) ? body.bridges : [];
  const inviteCode = body.inviteCode ? String(body.inviteCode).trim().toUpperCase() : '';

  if (!fullName || !rawHandle || !rawEmail || !passcode) {
    return sendError(res, 400, 'Missing required fields: fullName, handle, email, passcode');
  }

  const { sql, error: dbErr } = await getDb();
  if (dbErr) {
    return sendError(res, 500, `Database initialization failure: ${dbErr}`);
  }

  // If mock/no database
  if (!sql) {
    const isSeal = !!inviteCode;
    const serial = isSeal ? '#0002' : null;
    return sendJson(res, 200, {
      ok: true,
      success: true,
      status: isSeal ? 'active' : 'pending',
      memberNumber: serial,
      profile: {
        id: `mock_${rawHandle}`,
        handle: rawHandle,
        fullName,
        memberNumber: serial,
        status: isSeal ? 'active' : 'pending',
      },
    });
  }

  // 1. Check handle uniqueness
  const existingHandle = await sql`
    SELECT id FROM profiles WHERE LOWER(handle) = ${rawHandle} LIMIT 1
  `;
  if (existingHandle.length > 0) {
    return sendError(res, 409, `The handle @${rawHandle} is already reserved.`);
  }

  // 2. Check email uniqueness
  const existingEmail = await sql`
    SELECT id FROM users WHERE LOWER(email) = ${rawEmail} LIMIT 1
  `;
  if (existingEmail.length > 0) {
    return sendError(res, 409, `An account with email ${rawEmail} is already registered.`);
  }

  // 3. Check invite seal if provided
  let isInstantApproval = false;
  let matchedSealId: string | null = null;

  if (inviteCode) {
    const sealRows = await sql`
      SELECT id, code, used_by FROM invite_codes
      WHERE UPPER(code) = ${inviteCode} AND used_by IS NULL
      LIMIT 1
    `;
    if (sealRows.length > 0) {
      isInstantApproval = true;
      matchedSealId = sealRows[0].id;
    }
  }

  // 4. Calculate member serial if instant approval
  let assignedMemberNumber: string | null = null;
  if (isInstantApproval) {
    const countRows = await sql`
      SELECT COUNT(*)::int as count FROM profiles WHERE status = 'active'
    `;
    const activeCount = countRows[0]?.count || 1;
    assignedMemberNumber = `#${String(activeCount + 1).padStart(4, '0')}`;
  }

  // 5. Hash passcode
  const { bcrypt, error: bcryptErr } = await getBcrypt();
  if (!bcrypt) {
    return sendError(res, 500, `Bcrypt error: ${bcryptErr}`);
  }
  const passwordHash = await bcrypt.hash(passcode, 10);

  // 6. Create User & Profile
  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const finalStatus = isInstantApproval ? 'active' : 'pending';
  const cohort = isInstantApproval ? 'Cohort 2026' : 'Applicant';

  await sql`
    INSERT INTO users (id, email, password_hash, role, created_at)
    VALUES (${userId}, ${rawEmail}, ${passwordHash}, 'member', NOW())
  `;

  const profileRows = await sql`
    INSERT INTO profiles (
      id, user_id, full_name, handle, location, bio, tags,
      availability, avatar_bg, avatar_url, photos, member_number,
      cohort, status, bridges, created_at, updated_at
    ) VALUES (
      ${userId}, ${userId}, ${fullName}, ${rawHandle}, ${location}, ${bio},
      ${tags}::text[], ${availability}, ${avatarBg}, ${avatarUrl},
      ${photos}::text[], ${assignedMemberNumber}, ${cohort}, ${finalStatus},
      ${JSON.stringify(bridges)}::jsonb, NOW(), NOW()
    )
    RETURNING *
  `;

  // 7. Consume seal if used
  if (matchedSealId) {
    await sql`
      UPDATE invite_codes
      SET used_by = ${userId}, used_at = NOW()
      WHERE id = ${matchedSealId}
    `;
  }

  return sendJson(res, 200, {
    ok: true,
    success: true,
    status: finalStatus,
    memberNumber: assignedMemberNumber,
    user: { id: userId, email: rawEmail, role: 'member', name: fullName },
    profile: profileRows[0],
  });
}

// ----------------------------------------------------------------------------
// GET /api/profiles & POST /api/profiles
// ----------------------------------------------------------------------------
async function handleProfiles(req: any, res: any, slug: string[]) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr) {
    return sendError(res, 500, `Database error: ${dbErr}`);
  }

  // Specific profile: GET /api/profiles/:handle
  if (slug.length >= 2 && req.method === 'GET') {
    const rawHandle = slug[1].replace(/^@/, '').toLowerCase();
    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, data: null });
    }

    const rows = await sql`
      SELECT * FROM profiles
      WHERE LOWER(handle) = ${rawHandle} AND status = 'active'
      LIMIT 1
    `;

    if (rows.length === 0) {
      return sendError(res, 404, 'Profile not found');
    }

    const p = rows[0];
    return sendJson(res, 200, {
      ok: true,
      success: true,
      data: {
        id: p.id,
        fullName: p.full_name,
        handle: p.handle,
        location: p.location,
        bio: p.bio,
        tags: p.tags || [],
        availability: p.availability,
        avatarBg: p.avatar_bg,
        avatarUrl: p.avatar_url,
        photos: p.photos || [],
        memberNumber: p.member_number,
        cohort: p.cohort,
        bridges: p.bridges || [],
      },
    });
  }

  // GET /api/profiles (List all active members)
  if (req.method === 'GET') {
    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, data: [] });
    }

    const rows = await sql`
      SELECT * FROM profiles
      WHERE status = 'active'
      ORDER BY member_number ASC, created_at ASC
    `;

    const members = rows.map((p: any) => ({
      id: p.id,
      fullName: p.full_name,
      handle: p.handle,
      location: p.location,
      bio: p.bio,
      tags: p.tags || [],
      availability: p.availability,
      avatarBg: p.avatar_bg,
      avatarUrl: p.avatar_url,
      photos: p.photos || [],
      memberNumber: p.member_number,
      cohort: p.cohort,
      bridges: p.bridges || [],
    }));

    return sendJson(res, 200, { ok: true, success: true, data: members });
  }

  // POST /api/profiles (Upsert profile)
  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.handle || !p.fullName) {
      return sendError(res, 400, 'Handle and full name are required');
    }

    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, profile: p });
    }

    const rawHandle = String(p.handle).replace(/^@/, '').toLowerCase();
    const id = p.id || `mem_${rawHandle}`;

    const upserted = await sql`
      INSERT INTO profiles (
        id, user_id, full_name, handle, location, bio, tags,
        availability, avatar_bg, avatar_url, photos, member_number,
        cohort, status, bridges, created_at, updated_at
      ) VALUES (
        ${id}, ${id}, ${p.fullName}, ${rawHandle}, ${p.location || ''}, ${p.bio || ''},
        ${p.tags || []}::text[], ${p.availability || 'available'}, ${p.avatarBg || '#1C1C1E'},
        ${p.avatarUrl || ''}, ${p.photos || []}::text[], ${p.memberNumber || null},
        ${p.cohort || 'Cohort 2026'}, ${p.status || 'active'}, ${JSON.stringify(p.bridges || [])}::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        location = EXCLUDED.location,
        bio = EXCLUDED.bio,
        tags = EXCLUDED.tags,
        availability = EXCLUDED.availability,
        avatar_bg = EXCLUDED.avatar_bg,
        avatar_url = EXCLUDED.avatar_url,
        photos = EXCLUDED.photos,
        bridges = EXCLUDED.bridges,
        updated_at = NOW()
      RETURNING *
    `;

    return sendJson(res, 200, { ok: true, success: true, profile: upserted[0] });
  }

  return sendError(res, 405, 'Method not allowed');
}

// ----------------------------------------------------------------------------
// CURATOR OPERATIONS (/api/curator/*)
// ----------------------------------------------------------------------------
async function handleCurator(req: any, res: any, slug: string[]) {
  const auth = verifyCuratorApiAuth(req);
  if (!auth.authorized) {
    return sendError(res, 401, auth.error || 'Unauthorized: Curator credentials required');
  }

  const action = slug[1] || '';
  const { sql, error: dbErr } = await getDb();
  if (dbErr) {
    return sendError(res, 500, `Database error: ${dbErr}`);
  }

  // GET /api/curator/applicants
  if (action === 'applicants' && req.method === 'GET') {
    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, data: [] });
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
      location: p.location,
      bio: p.bio,
      tags: p.tags || [],
      availability: p.availability,
      avatarBg: p.avatar_bg,
      avatarUrl: p.avatar_url,
      photos: p.photos || [],
      submittedAt: p.created_at,
      status: 'pending',
      bridges: p.bridges || [],
    }));

    return sendJson(res, 200, { ok: true, success: true, data: applicants });
  }

  // POST /api/curator/approve
  if (action === 'approve' && req.method === 'POST') {
    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    if (!sql) {
      return sendJson(res, 200, {
        ok: true,
        success: true,
        member: { id: applicantId, memberNumber: '#0002', status: 'active' },
      });
    }

    // Check daily quota (max 10 approvals/day)
    const today = new Date().toISOString().slice(0, 10);
    const quotaRows = await sql`
      SELECT count FROM curator_daily_approvals WHERE date = ${today} LIMIT 1
    `;
    const todayCount = quotaRows[0]?.count || 0;
    if (todayCount >= 10) {
      return sendError(res, 429, 'Daily curation quota reached (10/10). Pace of welcoming resumes at dawn.');
    }

    // Calculate next member sequence
    const activeMembers = await sql`
      SELECT COUNT(*)::int as count FROM profiles WHERE status = 'active'
    `;
    const nextSerial = `#${String((activeMembers[0]?.count || 1) + 1).padStart(4, '0')}`;

    const updated = await sql`
      UPDATE profiles
      SET status = 'active', member_number = ${nextSerial}, cohort = 'Cohort 2026', updated_at = NOW()
      WHERE id = ${applicantId}
      RETURNING *
    `;

    if (updated.length === 0) {
      return sendError(res, 404, 'Applicant not found');
    }

    // Increment daily quota record
    await sql`
      INSERT INTO curator_daily_approvals (date, count)
      VALUES (${today}, 1)
      ON CONFLICT (date) DO UPDATE SET count = curator_daily_approvals.count + 1
    `;

    const p = updated[0];
    const memberObj = {
      id: p.id,
      fullName: p.full_name,
      handle: p.handle,
      location: p.location,
      bio: p.bio,
      tags: p.tags || [],
      availability: p.availability,
      avatarBg: p.avatar_bg,
      avatarUrl: p.avatar_url,
      photos: p.photos || [],
      memberNumber: p.member_number,
      cohort: p.cohort,
      bridges: p.bridges || [],
    };

    return sendJson(res, 200, { ok: true, success: true, member: memberObj });
  }

  // POST /api/curator/decline
  if (action === 'decline' && req.method === 'POST') {
    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true });
    }

    await sql`
      UPDATE profiles
      SET status = 'rejected', updated_at = NOW()
      WHERE id = ${applicantId}
    `;

    return sendJson(res, 200, { ok: true, success: true });
  }

  // GET /api/curator/seal & POST /api/curator/seal
  if (action === 'seal') {
    if (req.method === 'GET') {
      if (!sql) {
        return sendJson(res, 200, { ok: true, success: true, data: [] });
      }
      const seals = await sql`
        SELECT * FROM invite_codes ORDER BY created_at DESC
      `;
      return sendJson(res, 200, { ok: true, success: true, data: seals });
    }

    if (req.method === 'POST') {
      const { description, code } = req.body || {};
      const sealCode = (code || `SEAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();
      const sealDesc = (description || 'Direct curator invitation').trim();
      const sealId = `seal_${Date.now()}`;

      if (!sql) {
        return sendJson(res, 200, {
          ok: true,
          success: true,
          seal: { id: sealId, code: sealCode, description: sealDesc, status: 'active' },
        });
      }

      const rows = await sql`
        INSERT INTO invite_codes (id, code, description, created_by, max_uses, created_at)
        VALUES (${sealId}, ${sealCode}, ${sealDesc}, 'curator', 1, NOW())
        RETURNING *
      `;

      return sendJson(res, 200, { ok: true, success: true, seal: rows[0] });
    }
  }

  return sendError(res, 404, 'Unknown curator action');
}

// ----------------------------------------------------------------------------
// CONNECTIONS (/api/connections/*)
// ----------------------------------------------------------------------------
async function handleConnections(req: any, res: any, slug: string[], query: Record<string, string>) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr) {
    return sendError(res, 500, `Database error: ${dbErr}`);
  }

  const sub = slug[1] || '';

  // GET /api/connections/incoming
  if (sub === 'incoming' && req.method === 'GET') {
    const receiverId = (query.receiverId || '').trim();
    if (!receiverId) {
      return sendError(res, 400, 'receiverId parameter is required');
    }

    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, data: [] });
    }

    const rows = await sql`
      SELECT * FROM connection_requests
      WHERE receiver_id = ${receiverId}
      ORDER BY created_at DESC
    `;

    const incoming = rows.map((r: any) => {
      const daysLeft = r.expires_at
        ? Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 7;

      return {
        id: r.id,
        senderHandle: r.requester_id,
        senderName: r.requester_id.replace(/^@/, ''),
        senderAvatarBg: '#2D6A4F',
        channelType: r.requested_channel,
        channelLabel: r.requested_channel.toUpperCase(),
        note: r.note,
        timeAgo: 'Recently',
        expiresInDays: daysLeft,
        status: r.status || 'pending',
      };
    });

    return sendJson(res, 200, { ok: true, success: true, data: incoming });
  }

  // GET /api/connections/sent
  if (sub === 'sent' && req.method === 'GET') {
    const requesterId = (query.requesterId || '').trim();
    if (!requesterId) {
      return sendError(res, 400, 'requesterId parameter is required');
    }

    if (!sql) {
      return sendJson(res, 200, { ok: true, success: true, data: [] });
    }

    const rows = await sql`
      SELECT * FROM connection_requests
      WHERE requester_id = ${requesterId}
      ORDER BY created_at DESC
    `;

    const sent = rows.map((r: any) => {
      const daysLeft = r.expires_at
        ? Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 7;

      return {
        id: r.id,
        recipientHandle: r.receiver_id,
        recipientName: r.receiver_id.replace(/^@/, ''),
        recipientAvatarBg: '#2C2C2E',
        note: r.note,
        channelLabel: r.requested_channel.toUpperCase(),
        channelType: r.requested_channel,
        sentDate: r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recently',
        status: r.status || 'pending',
        expiresInDays: daysLeft,
      };
    });

    return sendJson(res, 200, { ok: true, success: true, data: sent });
  }

  // POST /api/connections
  if (req.method === 'POST') {
    const body = req.body || {};
    const requesterId = String(body.requesterId || '').trim();
    const receiverId = String(body.receiverId || '').trim();
    const requestedChannel = String(body.requestedChannel || '').trim();
    const senderOfferedChannel = body.senderOfferedChannel ? String(body.senderOfferedChannel).trim() : null;
    const note = String(body.note || '').trim();

    if (!requesterId || !receiverId || !requestedChannel || !note) {
      return sendError(res, 400, 'Missing required connection request fields');
    }

    const newId = body.id || `req_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (!sql) {
      return sendJson(res, 200, {
        ok: true,
        success: true,
        request: {
          id: newId,
          requester_id: requesterId,
          receiver_id: receiverId,
          requested_channel: requestedChannel,
          sender_offered_channel: senderOfferedChannel,
          note,
          status: 'pending',
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
      });
    }

    const rows = await sql`
      INSERT INTO connection_requests (
        id, requester_id, receiver_id, requested_channel, sender_offered_channel,
        note, status, created_at, expires_at
      ) VALUES (
        ${newId}, ${requesterId}, ${receiverId}, ${requestedChannel}, ${senderOfferedChannel},
        ${note}, 'pending', ${now.toISOString()}, ${expiresAt.toISOString()}
      )
      RETURNING *
    `;

    return sendJson(res, 200, { ok: true, success: true, request: rows[0] });
  }

  return sendError(res, 405, 'Method not allowed');
}

// ============================================================================
// 6. MAIN CATCH-ALL ROUTER HANDLER
// ============================================================================

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    const { method, slug, query } = parseRequestPath(req);
    const rootTarget = slug[0] || 'health';

    // 1. /api/health
    if (rootTarget === 'health' || slug.length === 0) {
      return await handleHealth(req, res);
    }

    // 2. /api/auth/*
    if (rootTarget === 'auth') {
      const sub = slug[1] || 'verify';
      if (sub === 'verify') {
        if (method === 'GET' && query.selftest === '1') {
          return await handleAuthSelftest(req, res);
        }
        if (method === 'POST') {
          return await handleAuthVerify(req, res);
        }
      }
      return sendError(res, 404, 'Unknown auth endpoint');
    }

    // 3. /api/apply
    if (rootTarget === 'apply') {
      if (method === 'GET' && query.selftest === '1') {
        return await handleApplySelftest(req, res);
      }
      if (method === 'POST') {
        return await handleApply(req, res);
      }
      return sendError(res, 405, 'Method not allowed on /api/apply');
    }

    // 4. /api/profiles/*
    if (rootTarget === 'profiles') {
      return await handleProfiles(req, res, slug);
    }

    // 5. /api/curator/*
    if (rootTarget === 'curator') {
      return await handleCurator(req, res, slug);
    }

    // 6. /api/connections/*
    if (rootTarget === 'connections') {
      return await handleConnections(req, res, slug, query);
    }

    return sendError(res, 404, `Endpoint /api/${slug.join('/')} not found`);
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
      build: BUILD_STAMP,
    });
  }
}
