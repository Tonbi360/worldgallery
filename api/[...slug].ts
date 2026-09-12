import crypto from 'crypto';

export const BUILD_STAMP = '1.0.1';

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
// 3. CURATOR & SESSION AUTHENTICATION VERIFIER
// ============================================================================

export function serverMaskContactValue(type: string, value: string): string {
  const val = String(value || '').trim();
  if (!val) return '••••••••';

  const t = type.toLowerCase();

  if (t === 'phone' || t === 'whatsapp' || t === 'signal') {
    const digits = val.replace(/\D/g, '');
    if (digits.length < 4) return '••• ••• ••';
    const last2 = digits.slice(-2);
    let countryCode = '';
    if (val.startsWith('+')) {
      const match = val.match(/^\+(\d{1,4})/);
      countryCode = match ? `+${match[1]} ` : '+ ';
    } else if (digits.length >= 11) {
      const ccLen = digits.length >= 12 ? 3 : (digits.length === 11 ? (digits.startsWith('1') ? 1 : 2) : 1);
      countryCode = `+${digits.slice(0, ccLen)} `;
    }
    return `${countryCode}••• ••• ${last2}`.trim();
  }

  if (t === 'email') {
    const parts = val.split('@');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const user = parts[0];
      const domain = parts[1];
      const domainParts = domain.split('.');
      const firstUserChar = user[0] || 'u';
      const firstDomainChar = domainParts[0]?.[0] || 'd';
      const tld = domainParts.length > 1 ? '.' + domainParts.slice(1).join('.') : '';
      return `${firstUserChar}•••@${firstDomainChar}•••${tld}`;
    }
    return `${val[0] || 'e'}•••@••••.com`;
  }

  if (t === 'website') {
    try {
      const parsed = new URL(val.startsWith('http') ? val : `https://${val}`);
      return parsed.hostname;
    } catch {
      return 'website.com';
    }
  }

  // Handles (Telegram, Instagram, Discord, Other)
  const clean = val.replace(/^@/, '');
  if (clean.length <= 2) {
    return `@${clean[0] || ''}•••`;
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  return `@${first}•••${last}`;
}

export function sanitizeBridgesForPublic(bridges: any[]): any[] {
  if (!Array.isArray(bridges)) return [];
  return bridges.map((b: any) => {
    const type = String(b.type || 'other');
    const label = String(b.label || b.type || 'Contact');
    let hint = String(b.maskedHint || b.hint || '').trim();
    if (!hint) {
      const rawVal = String(b.value || b.unmaskedValue || '');
      hint = serverMaskContactValue(type, rawVal);
    }
    return {
      type,
      label,
      maskedHint: hint,
      // CRITICAL SECURITY: Never leak value or unmaskedValue on public profile endpoints
    };
  });
}

async function getAuthUser(req: any, sql: any): Promise<{ id: string; role: string; email?: string } | null> {
  if (!sql) return null;
  try {
    const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const cookieHeader = String(req?.headers?.cookie || '');
      const match = cookieHeader.match(/(?:^|;\s*)wg_session=([^;]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1]);
      }
    }
    if (!token) return null;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionRows = await sql`
      SELECT s.user_id, s.role, u.email, u.role as user_role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW()
      LIMIT 1
    `;
    if (sessionRows.length > 0) {
      const resolvedRole = (sessionRows[0].user_role === 'curator' || sessionRows[0].role === 'curator')
        ? 'curator'
        : (sessionRows[0].user_role || sessionRows[0].role || 'member');
      return {
        id: sessionRows[0].user_id,
        role: resolvedRole,
        email: sessionRows[0].email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyCuratorApiAuth(req: any, sql?: any): Promise<{ authorized: boolean; error?: string; curatorId?: string }> {
  try {
    if (!sql) {
      return { authorized: false, error: 'Database connection required for curator authorization' };
    }

    const authUser = await getAuthUser(req, sql);
    if (authUser && authUser.role === 'curator') {
      return { authorized: true, curatorId: authUser.id };
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
  
  // Inspect possible original URLs provided by proxies or Vercel rewrites
  const rawUrl = (
    req?.headers?.['x-forwarded-url'] ||
    req?.headers?.['x-original-url'] ||
    req?.headers?.['x-rewrite-url'] ||
    req?.headers?.['x-matched-path'] ||
    req?.url ||
    '/api/health'
  );
  const urlString = String(rawUrl);
  const parsedUrl = new URL(urlString, 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  
  // Extract path parts
  const cleanParts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  
  // Strip 'api' if leading
  let slug = cleanParts[0] === 'api' ? cleanParts.slice(1) : cleanParts;

  // Filter out literal '[...slug]' token if Vercel internal router passed it as pathname
  if (slug.length === 1 && (slug[0] === '[...slug]' || slug[0] === ':slug*' || slug[0] === 'index')) {
    slug = [];
  }

  // If req.query contains slug array (Vercel catch-all style), respect that as primary or fallback
  if (req.query?.slug) {
    const rawSlug = req.query.slug;
    let customParts: string[] = [];
    if (Array.isArray(rawSlug)) {
      customParts = rawSlug.flatMap((s: any) => String(s).split('/').filter(Boolean));
    } else if (typeof rawSlug === 'string') {
      customParts = rawSlug.split('/').filter(Boolean);
    }
    // Remove leading 'api' if present in query slug
    if (customParts[0] === 'api') {
      customParts = customParts.slice(1);
    }
    if (customParts.length > 0 && (slug.length === 0 || slug[0] === '[...slug]')) {
      slug = customParts;
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

  let isCuratorLogin = false;
  if (configuredAdminEmail && configuredAdminPasscode && passcode) {
    const isEmailOrHandle = (rawEmail === configuredAdminEmail || (curatorHandle !== '' && rawEmail === curatorHandle));
    if (isEmailOrHandle) {
      try {
        const bufPasscode = Buffer.from(passcode);
        const bufConfigured = Buffer.from(configuredAdminPasscode);
        if (bufPasscode.length === bufConfigured.length && crypto.timingSafeEqual(bufPasscode, bufConfigured)) {
          isCuratorLogin = true;
        }
      } catch {
        isCuratorLogin = false;
      }
    }
  }

  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, 'Database service is unavailable');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProduction ? '; Secure' : ''}`;

  // Curator Authentication Branch with Self-Healing
  if (isCuratorLogin) {
    const curatorUserId = `usr_curator_${curatorHandle || 'admin'}`;
    let resolvedCuratorId = curatorUserId;
    try {
      const existingUsers = await sql`
        SELECT * FROM users
        WHERE LOWER(email) = ${configuredAdminEmail} OR role = 'curator'
        LIMIT 1
      `;

      resolvedCuratorId = existingUsers[0]?.id || curatorUserId;

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
        const tagsJson = JSON.stringify(['Architecture', 'Curation', 'Design Systems']);
        const bridgesJson = JSON.stringify([
          {
            type: 'email',
            label: 'Curator Email',
            maskedHint: '••••@••••.com',
            unmaskedValue: configuredAdminEmail,
          },
        ]);
        await sql`
          INSERT INTO profiles (
            id, user_id, full_name, handle, location, bio,
            avatar_primary, avatar_secondary, avatar_bg, tags,
            availability, bridges, member_number, cohort, status, created_at
          ) VALUES (
            ${resolvedCuratorId}, ${resolvedCuratorId}, 'Curator', ${curatorHandle || 'curator'},
            'Global', 'Founding Curator of World Gallery.',
            NULL, NULL, '#2D6A4F', ${tagsJson}::jsonb,
            'open', ${bridgesJson}::jsonb, '#0001',
            'Founder & Curator', 'active', NOW()
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

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
      await sql`
        INSERT INTO sessions (id, token_hash, user_id, role, expires_at, created_at)
        VALUES (${sessionId}, ${tokenHash}, ${resolvedCuratorId}, 'curator', ${expiresAt.toISOString()}, NOW())
      `;
      if (res && typeof res.setHeader === 'function') {
        res.setHeader(
          'Set-Cookie',
          `wg_session=${sessionToken}; ${cookieFlags}`
        );
      }
    } catch (sErr) {
      console.warn('[Session Error]', sErr);
    }

    return sendJson(res, 200, {
      ok: true,
      verified: true,
      user: {
        id: resolvedCuratorId,
        email: configuredAdminEmail,
        role: 'curator',
        name: 'Curator',
      },
      profile: {
        id: resolvedCuratorId,
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

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const sessionId = `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  try {
    await sql`
      INSERT INTO sessions (id, token_hash, user_id, role, expires_at, created_at)
      VALUES (${sessionId}, ${tokenHash}, ${foundUser.id}, ${foundUser.role || 'member'}, ${expiresAt.toISOString()}, NOW())
    `;
    if (res && typeof res.setHeader === 'function') {
      res.setHeader(
        'Set-Cookie',
        `wg_session=${sessionToken}; ${cookieFlags}`
      );
    }
  } catch (sErr) {
    console.warn('[Session Error]', sErr);
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

// ============================================================================
// PASSWORD RESET HANDLERS & RATE LIMITING
// ============================================================================

// In-memory sliding window rate limiter: 3 requests / hour per IP
const forgotRateLimits = new Map<string, number[]>();

function checkForgotRateLimit(ip: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;
  const attempts = (forgotRateLimits.get(ip) || []).filter((t) => t > oneHourAgo);
  if (attempts.length >= 3) {
    forgotRateLimits.set(ip, attempts);
    return false;
  }
  attempts.push(now);
  forgotRateLimits.set(ip, attempts);
  return true;
}

function getClientIp(req: any): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return String(req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1');
}

// ----------------------------------------------------------------------------
// POST /api/auth/forgot
// ----------------------------------------------------------------------------
async function handleAuthForgot(req: any, res: any) {
  const genericSuccess = {
    ok: true,
    success: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  };

  const clientIp = getClientIp(req);
  if (!checkForgotRateLimit(clientIp)) {
    return sendError(res, 429, 'Too many reset requests. Please wait an hour before trying again.');
  }

  const body = req.body || {};
  const rawEmail = String(body.email || '').toLowerCase().trim();

  // Fail closed / no account enumeration
  if (!rawEmail || !rawEmail.includes('@')) {
    return sendJson(res, 200, genericSuccess);
  }

  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    console.error('[Forgot Password] Database error:', dbErr);
    return sendJson(res, 200, genericSuccess);
  }

  try {
    // 1. Look up user by email
    const users = await sql`
      SELECT id, email, role FROM users
      WHERE LOWER(email) = ${rawEmail}
      LIMIT 1
    `;

    // Members only: Curator passcode lives strictly in env — no reset path for it.
    if (users.length === 0 || users[0].role !== 'member') {
      return sendJson(res, 200, genericSuccess);
    }

    const member = users[0];

    // 2. Generate 32-byte random token and store SHA-256 hash in password_resets
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetId = `rst_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30-min expiry

    await sql`
      INSERT INTO password_resets (id, token_hash, user_id, expires_at, used_at, created_at)
      VALUES (${resetId}, ${tokenHash}, ${member.id}, ${expiresAt}, NULL, NOW())
    `;

    // 3. Send email via Resend
    const resendApiKey = (
      (typeof process !== 'undefined' && process.env.RESEND_API_KEY) ||
      ''
    ).trim();

    if (!resendApiKey) {
      console.warn('[Resend] RESEND_API_KEY is not configured. Reset email suppressed.');
      return sendJson(res, 200, genericSuccess);
    }

    const configuredAppUrl = (
      (typeof process !== 'undefined' && (process.env.APP_URL || process.env.NEXTAUTH_URL)) ||
      ''
    ).trim();

    const baseAppUrl = configuredAppUrl
      ? (configuredAppUrl.startsWith('http') ? configuredAppUrl : `https://${configuredAppUrl}`).replace(/\/+$/, '')
      : 'https://worldgallery.app';

    const resetUrl = `${baseAppUrl}/reset?token=${token}`;

    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'World Gallery <onboarding@resend.dev>',
          to: [member.email],
          subject: 'Your World Gallery reset seal',
          text: `A password reset seal was requested for your World Gallery membership.\n\nRenew your credentials within 30 minutes:\n${resetUrl}`,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 36px 20px; color: #1C1C1E; line-height: 1.6;">
  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 18px; font-weight: 600; color: #1C1C1E; margin: 0 0 10px 0; letter-spacing: -0.02em;">World Gallery</h2>
    <p style="font-size: 14.5px; color: #3A3A3C; margin: 0; line-height: 1.5;">
      A password reset seal was requested for your World Gallery membership.
    </p>
  </div>
  <div style="margin: 28px 0;">
    <a href="${resetUrl}" style="display: inline-block; background-color: #2D6A4F; color: #FFFFFF; font-size: 14.5px; font-weight: 500; text-decoration: none; padding: 12px 24px; border-radius: 9999px;">
      Renew your seal
    </a>
  </div>
  <div style="border-top: 1px solid #E5E5EA; padding-top: 20px; margin-top: 28px;">
    <p style="font-size: 12.5px; color: #8E8E93; margin: 0 0 8px 0; line-height: 1.4;">
      This seal expires in 30 minutes. If you did not request this, no action is needed.
    </p>
    <p style="font-size: 12px; color: #8E8E93; margin: 0; word-break: break-all;">
      Direct link: <a href="${resetUrl}" style="color: #2D6A4F;">${resetUrl}</a>
    </p>
  </div>
</div>
          `.trim(),
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text().catch(() => '');
        console.error('[Resend Error]', emailResponse.status, errorText);
      }
    } catch (sendErr: any) {
      console.error('[Resend Network Error]', sendErr?.message || String(sendErr));
    }

    return sendJson(res, 200, genericSuccess);
  } catch (err: any) {
    console.error('[Forgot Password Fatal]', err);
    return sendJson(res, 200, genericSuccess);
  }
}

// ----------------------------------------------------------------------------
// POST /api/auth/reset
// ----------------------------------------------------------------------------
async function handleAuthReset(req: any, res: any) {
  const body = req.body || {};
  const token = String(body.token || '').trim();
  const newPassword = String(body.password || body.newPassword || '').trim();

  if (!token) {
    return sendError(res, 400, 'Reset token is required.');
  }

  if (!newPassword || newPassword.length < 6) {
    return sendError(res, 400, 'Password must be at least 6 characters.');
  }

  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    console.error('[Reset Password] Database unavailable:', dbErr);
    return sendError(res, 503, "Couldn't submit — try again.");
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 1. Look up token in password_resets
    const resetRows = await sql`
      SELECT id, user_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (resetRows.length === 0) {
      return sendError(res, 400, 'Invalid reset seal.');
    }

    const resetRecord = resetRows[0];

    // Single-use check
    if (resetRecord.used_at) {
      return sendError(res, 400, 'This reset seal has already been used.');
    }

    // 30-min expiry check
    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      return sendError(res, 400, 'This reset seal has expired. Please request a new one.');
    }

    // Members only check
    const userRows = await sql`
      SELECT id, role FROM users
      WHERE id = ${resetRecord.user_id}
      LIMIT 1
    `;

    if (userRows.length === 0 || userRows[0].role !== 'member') {
      return sendError(res, 400, 'Invalid reset seal.');
    }

    // 2. Set new bcrypt hash
    const { bcrypt, error: bcryptErr } = await getBcrypt();
    if (!bcrypt) {
      console.error('[Reset Password] Bcrypt unavailable:', bcryptErr);
      return sendError(res, 500, "Couldn't submit — try again.");
    }
    const newHash = await bcrypt.hash(newPassword, 10);

    await sql`
      UPDATE users
      SET password_hash = ${newHash}
      WHERE id = ${resetRecord.user_id}
    `;

    // 3. Mark token used
    await sql`
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = ${resetRecord.id}
    `;

    // 4. Delete ALL sessions for that user
    await sql`
      DELETE FROM sessions
      WHERE user_id = ${resetRecord.user_id}
    `;

    return sendJson(res, 200, {
      ok: true,
      success: true,
      message: 'Your seal is renewed. Sign in.',
    });
  } catch (err: any) {
    console.error('[Reset Password Fatal]', err);
    return sendError(res, 500, "Couldn't submit — try again.");
  }
}

// ----------------------------------------------------------------------------
// GET /api/auth/reset?token=... (Token validity check)
// ----------------------------------------------------------------------------
async function handleAuthCheckResetToken(req: any, res: any, query: Record<string, string>) {
  const token = String(query.token || '').trim();
  if (!token) {
    return sendError(res, 400, 'Token is required');
  }

  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, "Database unavailable");
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRows = await sql`
      SELECT id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (resetRows.length === 0) {
      return sendJson(res, 200, { ok: false, valid: false, reason: 'not_found' });
    }

    const r = resetRows[0];
    if (r.used_at) {
      return sendJson(res, 200, { ok: false, valid: false, reason: 'used' });
    }

    if (new Date(r.expires_at).getTime() < Date.now()) {
      return sendJson(res, 200, { ok: false, valid: false, reason: 'expired' });
    }

    return sendJson(res, 200, { ok: true, valid: true });
  } catch (err: any) {
    console.error('[Check Token Fatal]', err);
    return sendError(res, 500, "Couldn't submit — try again.");
  }
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
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || '').trim();
    const rawHandle = String(body.handle || '').trim().replace(/^@/, '').toLowerCase();
    const rawEmail = String(body.email || '').trim().toLowerCase();
    const passcode = String(body.passcode || body.password || '').trim();
    const location = String(body.location || '').trim();
    const bio = String(body.bio || '').trim();
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const availability = String(body.availability || 'open').trim();
    const avatarBg = String(body.avatarBg || '#2D6A4F').trim();
    const avatarPrimary = String(body.avatarPrimary || body.avatarUrl || (Array.isArray(body.photos) ? body.photos[0] : '') || '').trim() || null;
    const avatarSecondary = String(body.avatarSecondary || (Array.isArray(body.photos) && body.photos[1] ? body.photos[1] : '') || '').trim() || null;
    const bridges = Array.isArray(body.bridges) ? body.bridges : [];
    const inviteCode = body.inviteCode ? String(body.inviteCode).trim().toUpperCase() : '';

    if (!fullName || !rawHandle || !rawEmail || !passcode) {
      return sendError(res, 400, 'Missing required fields: fullName, handle, email, passcode');
    }

    const { sql, error: dbErr } = await getDb();
    if (dbErr || !sql) {
      console.error('[Apply DB Error]', dbErr);
      return sendError(res, 500, "Couldn't submit — try again.");
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
      console.error('[Apply Bcrypt Error]', bcryptErr);
      return sendError(res, 500, "Couldn't submit — try again.");
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
        id, user_id, full_name, handle, location, bio,
        avatar_primary, avatar_secondary, avatar_bg, tags,
        availability, bridges, member_number, cohort, status, created_at
      ) VALUES (
        ${userId}, ${userId}, ${fullName}, ${rawHandle}, ${location}, ${bio},
        ${avatarPrimary}, ${avatarSecondary}, ${avatarBg},
        ${JSON.stringify(tags)}::jsonb, ${availability}, ${JSON.stringify(bridges)}::jsonb,
        ${assignedMemberNumber}, ${cohort}, ${finalStatus}, NOW()
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

    const p = profileRows[0];
    const profileObj = {
      id: p.id,
      fullName: p.full_name,
      handle: p.handle,
      location: p.location,
      bio: p.bio,
      tags: p.tags || [],
      availability: p.availability,
      avatarBg: p.avatar_bg,
      avatarPrimary: p.avatar_primary,
      avatarSecondary: p.avatar_secondary,
      avatarUrl: p.avatar_primary || '',
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
      memberNumber: p.member_number,
      cohort: p.cohort,
      bridges: p.bridges || [],
      status: p.status,
    };

    // 8. Establish authenticated session for the newly registered applicant
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
      await sql`
        INSERT INTO sessions (id, token_hash, user_id, role, expires_at, created_at)
        VALUES (${sessionId}, ${tokenHash}, ${userId}, 'member', ${expiresAt.toISOString()}, NOW())
      `;
      if (res && typeof res.setHeader === 'function') {
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieFlags = [
          'Path=/',
          'HttpOnly',
          'SameSite=Lax',
          `Max-Age=${30 * 24 * 60 * 60}`,
          isProduction ? 'Secure' : '',
        ].filter(Boolean).join('; ');
        res.setHeader('Set-Cookie', `wg_session=${sessionToken}; ${cookieFlags}`);
      }
    } catch (sErr) {
      console.warn('[Apply Session Error]', sErr);
    }

    return sendJson(res, 200, {
      ok: true,
      success: true,
      status: finalStatus,
      memberNumber: assignedMemberNumber,
      user: { id: userId, email: rawEmail, role: 'member', name: fullName },
      profile: profileObj,
    });
  } catch (err: any) {
    console.error('[Apply Catch Error]', err?.message || String(err));
    return sendError(res, 500, "Couldn't submit — try again.");
  }
}

// ----------------------------------------------------------------------------
// GET /api/profiles & POST /api/profiles
// ----------------------------------------------------------------------------
async function handleProfiles(req: any, res: any, slug: string[]) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    console.error('[Profiles DB Error]', dbErr);
    return sendError(res, 503, 'Database service is unavailable');
  }

  // Specific profile: GET /api/profiles/:handle
  if (slug.length >= 2 && req.method === 'GET') {
    const rawHandle = slug[1].replace(/^@/, '').toLowerCase();

    const rows = await sql`
      SELECT * FROM profiles
      WHERE LOWER(handle) = ${rawHandle} AND status = 'active'
      LIMIT 1
    `;

    if (rows.length === 0) {
      return sendError(res, 404, 'Profile not found');
    }

    const p = rows[0];
    const authUser = await getAuthUser(req, sql);
    const isOwnerOrCurator = authUser && (authUser.id === p.user_id || authUser.id === p.id || authUser.role === 'curator');
    const safeBridges = isOwnerOrCurator ? (p.bridges || []) : sanitizeBridgesForPublic(p.bridges || []);

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
        avatarPrimary: p.avatar_primary,
        avatarSecondary: p.avatar_secondary,
        avatarUrl: p.avatar_primary || '',
        photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
        memberNumber: p.member_number,
        cohort: p.cohort,
        bridges: safeBridges,
      },
    });
  }

  // GET /api/profiles (List all active members - ALWAYS SANITIZED)
  if (req.method === 'GET') {
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
      avatarPrimary: p.avatar_primary,
      avatarSecondary: p.avatar_secondary,
      avatarUrl: p.avatar_primary || '',
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
      memberNumber: p.member_number,
      cohort: p.cohort,
      // INVARIANT INV-01: Public listings must never leak raw bridge coordinates
      bridges: sanitizeBridgesForPublic(p.bridges || []),
    }));

    return sendJson(res, 200, { ok: true, success: true, data: members });
  }

  // POST /api/profiles (Secure Upsert profile)
  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.handle || !p.fullName) {
      return sendError(res, 400, 'Handle and full name are required');
    }

    const authUser = await getAuthUser(req, sql);
    const curatorAuth = await verifyCuratorApiAuth(req, sql);

    // INVARIANT INV-03: Unauthenticated callers cannot create or mutate profiles
    if (!authUser && !curatorAuth.authorized) {
      return sendError(res, 401, 'Unauthorized: Profile update requires an authenticated session');
    }

    const rawHandle = String(p.handle).replace(/^@/, '').toLowerCase();
    const id = p.id || `mem_${rawHandle}`;

    const existingRows = await sql`
      SELECT * FROM profiles WHERE id = ${id} OR LOWER(handle) = ${rawHandle} LIMIT 1
    `;

    const isCurator = curatorAuth.authorized || (authUser && authUser.role === 'curator');
    const existing = existingRows[0];

    if (existing) {
      const isOwner = authUser && (authUser.id === existing.user_id || authUser.id === existing.id);
      if (!isOwner && !isCurator) {
        return sendError(res, 403, 'Forbidden: You cannot modify another member\'s profile');
      }
    } else if (!isCurator) {
      return sendError(res, 403, 'Forbidden: Profile creation is restricted to the application workflow');
    }

    const avatarPrimary = String(p.avatarPrimary || p.avatarUrl || (Array.isArray(p.photos) ? p.photos[0] : '') || '').trim() || null;
    const avatarSecondary = String(p.avatarSecondary || (Array.isArray(p.photos) && p.photos[1] ? p.photos[1] : '') || '').trim() || null;

    // Retain server-controlled attributes unless updated by curator
    const resolvedStatus = isCurator ? (p.status || existing?.status || 'active') : (existing?.status || 'active');
    const resolvedMemberNumber = isCurator ? (p.memberNumber || existing?.member_number || null) : (existing?.member_number || null);
    const resolvedCohort = isCurator ? (p.cohort || existing?.cohort || 'Cohort 2026') : (existing?.cohort || 'Cohort 2026');
    const resolvedUserId = existing?.user_id || authUser?.id || id;

    let up: any;
    if (existing) {
      const updated = await sql`
        UPDATE profiles SET
          full_name = ${p.fullName},
          location = ${p.location || ''},
          bio = ${p.bio || ''},
          avatar_primary = ${avatarPrimary},
          avatar_secondary = ${avatarSecondary},
          avatar_bg = ${p.avatarBg || existing.avatar_bg || '#2D6A4F'},
          tags = ${JSON.stringify(p.tags || [])}::jsonb,
          availability = ${p.availability || existing.availability || 'open'},
          bridges = ${JSON.stringify(p.bridges || [])}::jsonb,
          member_number = ${resolvedMemberNumber},
          cohort = ${resolvedCohort},
          status = ${resolvedStatus}
        WHERE id = ${existing.id}
        RETURNING *
      `;
      up = updated[0];
    } else {
      const inserted = await sql`
        INSERT INTO profiles (
          id, user_id, full_name, handle, location, bio,
          avatar_primary, avatar_secondary, avatar_bg, tags,
          availability, bridges, member_number, cohort, status, created_at
        ) VALUES (
          ${id}, ${resolvedUserId}, ${p.fullName}, ${rawHandle}, ${p.location || ''}, ${p.bio || ''},
          ${avatarPrimary}, ${avatarSecondary}, ${p.avatarBg || '#2D6A4F'},
          ${JSON.stringify(p.tags || [])}::jsonb, ${p.availability || 'open'},
          ${JSON.stringify(p.bridges || [])}::jsonb,
          ${resolvedMemberNumber}, ${resolvedCohort}, ${resolvedStatus}, NOW()
        )
        RETURNING *
      `;
      up = inserted[0];
    }
    const isOwner = authUser && (authUser.id === up.user_id || authUser.id === up.id);
    const safeBridges = (isOwner || isCurator) ? (up.bridges || []) : sanitizeBridgesForPublic(up.bridges || []);

    const profileObj = {
      id: up.id,
      fullName: up.full_name,
      handle: up.handle,
      location: up.location,
      bio: up.bio,
      tags: up.tags || [],
      availability: up.availability,
      avatarBg: up.avatar_bg,
      avatarPrimary: up.avatar_primary,
      avatarSecondary: up.avatar_secondary,
      avatarUrl: up.avatar_primary || '',
      photos: [up.avatar_primary, up.avatar_secondary].filter(Boolean) as string[],
      memberNumber: up.member_number,
      cohort: up.cohort,
      bridges: safeBridges,
      status: up.status,
    };

    return sendJson(res, 200, { ok: true, success: true, profile: profileObj });
  }

  return sendError(res, 405, 'Method not allowed');
}

// ----------------------------------------------------------------------------
// CURATOR OPERATIONS (/api/curator/*)
// ----------------------------------------------------------------------------
async function handleCurator(req: any, res: any, slug: string[]) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, 'Database service is unavailable');
  }

  const auth = await verifyCuratorApiAuth(req, sql);
  if (!auth.authorized) {
    return sendError(res, 401, auth.error || 'Unauthorized: Curator credentials required');
  }

  const action = slug[1] || '';

  // GET /api/curator/applicants
  if (action === 'applicants' && req.method === 'GET') {
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
      avatarPrimary: p.avatar_primary,
      avatarSecondary: p.avatar_secondary,
      avatarUrl: p.avatar_primary || '',
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
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

    // 1. Verify applicant exists and is in 'pending' status
    const appRows = await sql`
      SELECT id, status FROM profiles WHERE id = ${applicantId} LIMIT 1
    `;
    if (appRows.length === 0) {
      return sendError(res, 404, 'Applicant not found');
    }
    if (appRows[0].status !== 'pending') {
      return sendError(res, 400, `Applicant is already ${appRows[0].status}`);
    }

    // 2. Atomically reserve quota for today (max 10 approvals/day)
    const today = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO curator_daily_approvals (id, date, count)
      VALUES (${today}, ${today}, 0)
      ON CONFLICT (date) DO NOTHING
    `;

    // PostgreSQL row-level lock on curator_daily_approvals row enforces race-safe atomic quota
    const quotaRes = await sql`
      UPDATE curator_daily_approvals
      SET count = count + 1
      WHERE date = ${today} AND count < 10
      RETURNING count
    `;

    if (quotaRes.length === 0) {
      return sendError(res, 429, 'Daily curation quota reached (10/10). Pace of welcoming resumes at dawn.');
    }

    // 3. Calculate next member sequence
    const activeMembers = await sql`
      SELECT COUNT(*)::int as count FROM profiles WHERE status = 'active'
    `;
    const nextSerial = `#${String((activeMembers[0]?.count || 1) + 1).padStart(4, '0')}`;

    // 4. Atomically approve applicant profile
    const updated = await sql`
      UPDATE profiles
      SET status = 'active', member_number = ${nextSerial}, cohort = 'Cohort 2026'
      WHERE id = ${applicantId} AND status = 'pending'
      RETURNING *
    `;

    if (updated.length === 0) {
      // Rollback the reserved quota if profile could not be updated
      await sql`
        UPDATE curator_daily_approvals
        SET count = GREATEST(0, count - 1)
        WHERE date = ${today}
      `;
      return sendError(res, 400, 'Applicant could not be approved or was already processed');
    }

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
      avatarPrimary: p.avatar_primary,
      avatarSecondary: p.avatar_secondary,
      avatarUrl: p.avatar_primary || '',
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
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

    await sql`
      UPDATE profiles
      SET status = 'rejected'
      WHERE id = ${applicantId}
    `;

    return sendJson(res, 200, { ok: true, success: true });
  }

  // GET /api/curator/seal & POST /api/curator/seal & DELETE /api/curator/seal/:id
  if (action === 'seal') {
    if (req.method === 'GET') {
      const seals = await sql`
        SELECT * FROM invite_codes ORDER BY created_at DESC
      `;
      return sendJson(res, 200, { ok: true, success: true, data: seals, seals });
    }

    if (req.method === 'POST') {
      const { description, code, action: postAction, id: sealIdToDelete } = req.body || {};
      if (postAction === 'delete' || slug[2] === 'delete') {
        const idToDel = sealIdToDelete || slug[2];
        if (idToDel) {
          await sql`DELETE FROM invite_codes WHERE id = ${idToDel}`;
        }
        return sendJson(res, 200, { ok: true, success: true });
      }

      const sealCode = (code || `SEAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();
      const sealDesc = (description || 'Direct curator invitation').trim();
      const sealId = `seal_${Date.now()}`;

      const rows = await sql`
        INSERT INTO invite_codes (id, code, description, created_by, created_at)
        VALUES (${sealId}, ${sealCode}, ${sealDesc}, 'curator', NOW())
        RETURNING *
      `;

      return sendJson(res, 200, { ok: true, success: true, seal: rows[0] });
    }

    if (req.method === 'DELETE') {
      const sealId = slug[2] || req.body?.id;
      if (sealId) {
        await sql`DELETE FROM invite_codes WHERE id = ${sealId}`;
      }
      return sendJson(res, 200, { ok: true, success: true });
    }
  }

  // GET /api/curator/members
  if (action === 'members' && req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM profiles WHERE status = 'active' ORDER BY member_number ASC
    `;
    return sendJson(res, 200, { ok: true, success: true, data: rows });
  }

  // GET /api/curator/stats
  if (action === 'stats' && req.method === 'GET') {
    const today = new Date().toISOString().slice(0, 10);
    const [activeRow] = await sql`SELECT COUNT(*)::int as count FROM profiles WHERE status = 'active'`;
    const [pendingRow] = await sql`SELECT COUNT(*)::int as count FROM profiles WHERE status = 'pending'`;
    const [todayRow] = await sql`SELECT count FROM curator_daily_approvals WHERE date = ${today} LIMIT 1`;
    const statData = {
      activeCount: activeRow?.count || 0,
      pendingCount: pendingRow?.count || 0,
      approvalsToday: todayRow?.count || 0,
      dailyCap: 10,
    };
    return sendJson(res, 200, {
      ok: true,
      success: true,
      ...statData,
      stats: statData,
    });
  }

  return sendError(res, 404, 'Unknown curator action');
}

// ----------------------------------------------------------------------------
// CONNECTIONS (/api/connections/*)
// ----------------------------------------------------------------------------
async function handleConnections(req: any, res: any, slug: string[], query: Record<string, string>) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, 'Database service is unavailable');
  }

  // Auto-expire pending requests older than 7 days
  try {
    await sql`
      UPDATE connection_requests
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at < NOW()
    `;
  } catch (expErr) {
    console.warn('[Connections Expire Warning]', expErr);
  }

  const sub = slug[1] || '';

  // GET /api/connections/incoming
  if (sub === 'incoming' && req.method === 'GET') {
    const authUser = await getAuthUser(req, sql);
    if (!authUser) {
      return sendError(res, 401, 'Unauthorized: Authentication session required');
    }

    // Ignore client query.receiverId - strictly derive receiver identity from authenticated session
    const userProfiles = await sql`
      SELECT handle FROM profiles WHERE id = ${authUser.id} OR user_id = ${authUser.id} LIMIT 1
    `;
    const userHandle = (userProfiles[0]?.handle || '').toLowerCase();
    const cleanUserId = authUser.id.replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();

    const rows = await sql`
      SELECT * FROM connection_requests
      WHERE receiver_id = ${authUser.id}
         OR receiver_id = ${cleanUserId}
         OR receiver_id = ${`@${cleanUserId}`}
         OR (LENGTH(${userHandle}) > 0 AND (LOWER(receiver_id) = ${userHandle} OR LOWER(receiver_id) = ${`@${userHandle}`}))
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
    const authUser = await getAuthUser(req, sql);
    if (!authUser) {
      return sendError(res, 401, 'Unauthorized: Authentication session required');
    }

    // Ignore client query.requesterId - strictly derive requester identity from authenticated session
    const userProfiles = await sql`
      SELECT handle FROM profiles WHERE id = ${authUser.id} OR user_id = ${authUser.id} LIMIT 1
    `;
    const userHandle = (userProfiles[0]?.handle || '').toLowerCase();
    const cleanUserId = authUser.id.replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();

    const rows = await sql`
      SELECT * FROM connection_requests
      WHERE requester_id = ${authUser.id}
         OR requester_id = ${cleanUserId}
         OR requester_id = ${`@${cleanUserId}`}
         OR (LENGTH(${userHandle}) > 0 AND (LOWER(requester_id) = ${userHandle} OR LOWER(requester_id) = ${`@${userHandle}`}))
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
        // INVARIANT INV-06 & INV-07: Contact coordinates revealed ONLY if status === 'approved'
        approvedContactValue: r.status === 'approved' ? (r.approved_contact_value || undefined) : undefined,
        unmaskedContact: (r.status === 'approved' && r.approved_contact_value) ? {
          type: r.requested_channel,
          label: r.requested_channel.toUpperCase(),
          value: r.approved_contact_value,
        } : undefined,
      };
    });

    return sendJson(res, 200, { ok: true, success: true, data: sent });
  }

  // POST /api/connections/:id/approve or POST /api/connections/approve
  if ((sub === 'approve' || (slug.length >= 3 && slug[2] === 'approve')) && req.method === 'POST') {
    const id = (slug.length >= 3 ? slug[1] : (req.body?.id || req.body?.requestId || ''));
    if (!id) {
      return sendError(res, 400, 'Connection request ID is required');
    }

    const requestRows = await sql`
      SELECT * FROM connection_requests WHERE id = ${id} LIMIT 1
    `;
    if (requestRows.length === 0) {
      return sendError(res, 404, 'Connection request not found');
    }

    const connectionReq = requestRows[0];
    const authUser = await getAuthUser(req, sql);

    if (!authUser) {
      return sendError(res, 401, 'Unauthorized: Authentication session required to approve connection request');
    }

    // INVARIANT INV-05: User cannot approve their own sent request, only the receiver can approve
    if (authUser.role !== 'curator') {
      const receiverClean = connectionReq.receiver_id.replace(/^@/, '').toLowerCase();
      const userClean = authUser.id.replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();
      const userProfiles = await sql`
        SELECT handle FROM profiles WHERE id = ${authUser.id} OR user_id = ${authUser.id} LIMIT 1
      `;
      const userHandle = (userProfiles[0]?.handle || '').toLowerCase();

      const isReceiver =
        authUser.id === connectionReq.receiver_id ||
        userClean === receiverClean ||
        (userHandle && userHandle === receiverClean);

      if (!isReceiver) {
        return sendError(res, 403, 'Forbidden: Only the receiving member can approve this connection');
      }
    }

    if (connectionReq.status !== 'pending') {
      return sendError(res, 400, `Request cannot be approved from current state: ${connectionReq.status}`);
    }

    if (connectionReq.expires_at && new Date(connectionReq.expires_at).getTime() < Date.now()) {
      await sql`UPDATE connection_requests SET status = 'expired' WHERE id = ${id}`;
      return sendError(res, 410, 'Connection request has expired and can no longer be approved');
    }

    // Look up receiver profile to extract requested contact coordinate
    const receiverProfiles = await sql`
      SELECT bridges FROM profiles
      WHERE id = ${connectionReq.receiver_id}
         OR user_id = ${connectionReq.receiver_id}
         OR LOWER(handle) = ${connectionReq.receiver_id.replace(/^@/, '').toLowerCase()}
      LIMIT 1
    `;

    let contactVal = '';
    if (receiverProfiles.length > 0 && Array.isArray(receiverProfiles[0].bridges)) {
      const bridge = receiverProfiles[0].bridges.find((b: any) =>
        String(b.type || '').toLowerCase() === String(connectionReq.requested_channel || '').toLowerCase()
      );
      contactVal = bridge?.unmaskedValue || bridge?.value || bridge?.maskedHint || '';
    }

    const updated = await sql`
      UPDATE connection_requests
      SET status = 'approved', approved_contact_value = ${contactVal}
      WHERE id = ${id}
      RETURNING *
    `;

    return sendJson(res, 200, { ok: true, success: true, request: updated[0] });
  }

  // POST /api/connections/:id/decline or POST /api/connections/decline
  if ((sub === 'decline' || (slug.length >= 3 && slug[2] === 'decline')) && req.method === 'POST') {
    const id = (slug.length >= 3 ? slug[1] : (req.body?.id || req.body?.requestId || ''));
    if (!id) {
      return sendError(res, 400, 'Connection request ID is required');
    }

    const requestRows = await sql`
      SELECT * FROM connection_requests WHERE id = ${id} LIMIT 1
    `;
    if (requestRows.length === 0) {
      return sendError(res, 404, 'Connection request not found');
    }

    const connectionReq = requestRows[0];
    const authUser = await getAuthUser(req, sql);

    if (!authUser) {
      return sendError(res, 401, 'Unauthorized: Authentication session required to decline connection request');
    }

    if (authUser.role !== 'curator') {
      const receiverClean = connectionReq.receiver_id.replace(/^@/, '').toLowerCase();
      const userClean = authUser.id.replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();
      const userProfiles = await sql`
        SELECT handle FROM profiles WHERE id = ${authUser.id} OR user_id = ${authUser.id} LIMIT 1
      `;
      const userHandle = (userProfiles[0]?.handle || '').toLowerCase();

      const isReceiver =
        authUser.id === connectionReq.receiver_id ||
        userClean === receiverClean ||
        (userHandle && userHandle === receiverClean);

      if (!isReceiver) {
        return sendError(res, 403, 'Forbidden: Only the receiving member can decline this connection');
      }
    }

    await sql`
      UPDATE connection_requests
      SET status = 'declined'
      WHERE id = ${id}
    `;

    return sendJson(res, 200, { ok: true, success: true });
  }

  // POST /api/connections (Send connection request)
  if (req.method === 'POST') {
    const authUser = await getAuthUser(req, sql);
    if (!authUser) {
      return sendError(res, 401, 'Unauthorized: Authentication required to send a connection request');
    }

    const body = req.body || {};
    // Requester identity MUST come exclusively from authenticated session.
    // Client-supplied body.requesterId is ignored.
    const requesterId = authUser.id;
    const receiverId = String(body.receiverId || '').trim();
    const requestedChannel = String(body.requestedChannel || '').trim();
    const senderOfferedChannel = body.senderOfferedChannel ? String(body.senderOfferedChannel).trim() : null;
    const note = String(body.note || '').trim();

    if (!receiverId || !requestedChannel || !note) {
      return sendError(res, 400, 'Missing required connection request fields');
    }

    // Check user profiles to prevent requesting connection with oneself
    const userProfiles = await sql`
      SELECT handle FROM profiles WHERE id = ${authUser.id} OR user_id = ${authUser.id} LIMIT 1
    `;
    const userHandle = (userProfiles[0]?.handle || '').toLowerCase();
    const cleanReq = authUser.id.replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();
    const cleanRec = receiverId.replace(/^@/, '').replace(/^mem_/, '').replace(/^usr_/, '').toLowerCase();

    // INVARIANT INV-05: Cannot request connection with yourself
    if (cleanReq === cleanRec || (userHandle && userHandle === cleanRec)) {
      return sendError(res, 400, 'Cannot send a connection request to yourself');
    }

    // Check for existing pending request between this requester and receiver
    const existing = await sql`
      SELECT id FROM connection_requests
      WHERE status = 'pending'
        AND (
          LOWER(requester_id) = ${requesterId.toLowerCase()}
          OR LOWER(requester_id) = ${cleanReq}
          OR LOWER(requester_id) = ${`@${cleanReq}`}
          OR (LENGTH(${userHandle}) > 0 AND (LOWER(requester_id) = ${userHandle} OR LOWER(requester_id) = ${`@${userHandle}`}))
        )
        AND (
          LOWER(receiver_id) = ${receiverId.toLowerCase()}
          OR LOWER(receiver_id) = ${cleanRec}
          OR LOWER(receiver_id) = ${`@${cleanRec}`}
        )
      LIMIT 1
    `;

    if (existing.length > 0) {
      return sendError(res, 409, 'A connection request to this member is already pending');
    }

    const newId = body.id || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    try {
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
    } catch (insertErr: any) {
      if (insertErr?.code === '23505' || String(insertErr?.message || '').includes('unique')) {
        return sendError(res, 409, 'A connection request to this member is already pending');
      }
      throw insertErr;
    }
  }

  return sendError(res, 405, 'Method not allowed');
}

// ----------------------------------------------------------------------------
// GET /api/me (Current Authenticated Member Session & Profile)
// ----------------------------------------------------------------------------
async function handleMe(req: any, res: any) {
  const { sql, error: dbErr } = await getDb();
  if (dbErr || !sql) {
    return sendError(res, 503, 'Database service is unavailable');
  }

  const authUser = await getAuthUser(req, sql);
  if (!authUser) {
    return sendError(res, 401, 'Unauthorized: No active session');
  }

  const profileRows = await sql`
    SELECT * FROM profiles
    WHERE user_id = ${authUser.id} OR id = ${authUser.id}
    LIMIT 1
  `;

  if (profileRows.length === 0) {
    const isCurator = authUser.role === 'curator';
    return sendJson(res, 200, {
      ok: true,
      success: true,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
      },
      profile: isCurator
        ? {
            id: authUser.id,
            fullName: 'Curator',
            handle: 'curator',
            location: 'World Gallery Registry',
            bio: 'Chief Curator and Founder of World Gallery.',
            tags: ['curator'],
            availability: 'quiet',
            avatarBg: '#2D6A4F',
            avatarPrimary: '',
            avatarSecondary: '',
            avatarUrl: '',
            photos: [],
            memberNumber: '#0001',
            cohort: 'Founder & Curator',
            bridges: [],
            status: 'active',
          }
        : null,
    });
  }

  const p = profileRows[0];
  return sendJson(res, 200, {
    ok: true,
    success: true,
    user: {
      id: authUser.id,
      email: authUser.email,
      role: authUser.role,
    },
    profile: {
      id: p.id,
      fullName: p.full_name,
      handle: p.handle,
      location: p.location,
      bio: p.bio,
      tags: p.tags || [],
      availability: p.availability,
      avatarBg: p.avatar_bg,
      avatarPrimary: p.avatar_primary,
      avatarSecondary: p.avatar_secondary,
      avatarUrl: p.avatar_primary || '',
      photos: [p.avatar_primary, p.avatar_secondary].filter(Boolean) as string[],
      memberNumber: p.member_number,
      cohort: p.cohort,
      // The authenticated owner can access their own bridges
      bridges: p.bridges || [],
      status: p.status,
    },
  });
}

// ----------------------------------------------------------------------------
// POST /api/auth/logout
// ----------------------------------------------------------------------------
async function handleAuthLogout(req: any, res: any) {
  const { sql } = await getDb();
  if (sql) {
    const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      const cookieHeader = String(req?.headers?.cookie || '');
      const match = cookieHeader.match(/(?:^|;\s*)wg_session=([^;]+)/);
      if (match && match[1]) token = decodeURIComponent(match[1]);
    }
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      try {
        await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
      } catch (logoutErr) {
        console.warn('[Logout Delete Session Warning]', logoutErr);
      }
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`;
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', `wg_session=; ${cookieFlags}`);
  }

  return sendJson(res, 200, { ok: true, success: true });
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

    // 2. /api/me
    if (rootTarget === 'me') {
      return await handleMe(req, res);
    }

    // 3. /api/auth/*
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
      if (sub === 'me' && method === 'GET') {
        return await handleMe(req, res);
      }
      if (sub === 'logout' && method === 'POST') {
        return await handleAuthLogout(req, res);
      }
      if (sub === 'forgot') {
        if (method === 'POST') {
          return await handleAuthForgot(req, res);
        }
        return sendError(res, 405, 'Method not allowed on /api/auth/forgot');
      }
      if (sub === 'reset') {
        if (method === 'POST') {
          return await handleAuthReset(req, res);
        }
        if (method === 'GET') {
          return await handleAuthCheckResetToken(req, res, query);
        }
        return sendError(res, 405, 'Method not allowed on /api/auth/reset');
      }
      return sendError(res, 404, 'Unknown auth endpoint');
    }

    // 4. /api/apply
    if (rootTarget === 'apply') {
      if (method === 'GET' && query.selftest === '1') {
        return await handleApplySelftest(req, res);
      }
      if (method === 'POST') {
        return await handleApply(req, res);
      }
      return sendError(res, 405, 'Method not allowed on /api/apply');
    }

    // 5. /api/profiles/*
    if (rootTarget === 'profiles') {
      return await handleProfiles(req, res, slug);
    }

    // 6. /api/curator/*
    if (rootTarget === 'curator') {
      return await handleCurator(req, res, slug);
    }

    // 7. /api/connections/*
    if (rootTarget === 'connections') {
      return await handleConnections(req, res, slug, query);
    }

    return sendError(res, 404, `Endpoint /api/${slug.join('/')} not found`);
  } catch (fatalErr: any) {
    console.error('[API Fatal Error]', fatalErr);
    return sendJson(res, 500, {
      ok: false,
      error: "Couldn't submit — try again.",
      build: BUILD_STAMP,
    });
  }
}
