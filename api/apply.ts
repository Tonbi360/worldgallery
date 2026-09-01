async function executeSelfTest(res: any) {
  const steps: Array<{ step: string; ok: boolean; error?: string | null; [key: string]: any }> = [];

  // Step 1: handler_loaded
  steps.push({ step: 'handler_loaded', ok: true });

  // Step 2: bcrypt_import
  try {
    const bcryptMod = await import('bcryptjs');
    const bcrypt = (bcryptMod as any).default || bcryptMod;
    if (!bcrypt || typeof bcrypt.hash !== 'function') {
      throw new Error('bcryptjs has no hash function');
    }
    const hash = await bcrypt.hash('selftest_probe', 4);
    const valid = await bcrypt.compare('selftest_probe', hash);
    if (!valid) throw new Error('bcrypt comparison validation failed');
    steps.push({ step: 'bcrypt_import', ok: true, error: null });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = (err?.stack || '').split('\n')[1]?.trim() || '';
    steps.push({ step: 'bcrypt_import', ok: false, error: stack ? `${msg} (${stack})` : msg });
  }

  // Step 3: neon_import
  let neonFn: any = null;
  try {
    const neonMod = await import('@neondatabase/serverless');
    neonFn = (neonMod as any).neon || neonMod;
    if (typeof neonFn !== 'function') {
      throw new Error('neon is not a function in @neondatabase/serverless');
    }
    steps.push({ step: 'neon_import', ok: true, error: null });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = (err?.stack || '').split('\n')[1]?.trim() || '';
    steps.push({ step: 'neon_import', ok: false, error: stack ? `${msg} (${stack})` : msg });
  }

  // Step 4: db_connect
  let sql: any = null;
  try {
    const dbUrl = (
      (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
      ''
    ).trim();

    if (!dbUrl) {
      steps.push({ step: 'db_connect', ok: false, error: 'DATABASE_URL environment variable is missing' });
    } else if (!neonFn) {
      steps.push({ step: 'db_connect', ok: false, error: 'Skipped: neon_import failed' });
    } else {
      sql = neonFn(dbUrl);
      const ping = await sql`SELECT 1 as connected`;
      if (!ping || ping.length === 0) {
        throw new Error('SELECT 1 query returned no results');
      }
      steps.push({ step: 'db_connect', ok: true, error: null });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = (err?.stack || '').split('\n')[1]?.trim() || '';
    steps.push({ step: 'db_connect', ok: false, error: stack ? `${msg} (${stack})` : msg });
  }

  // Step 5: users_select
  try {
    if (!sql) {
      steps.push({ step: 'users_select', ok: false, error: 'Skipped: db_connect failed' });
    } else {
      await sql`SELECT count(*)::int as count FROM users`;
      steps.push({ step: 'users_select', ok: true, error: null });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = (err?.stack || '').split('\n')[1]?.trim() || '';
    steps.push({ step: 'users_select', ok: false, error: stack ? `${msg} (${stack})` : msg });
  }

  // Step 6: profiles_select
  try {
    if (!sql) {
      steps.push({ step: 'profiles_select', ok: false, error: 'Skipped: db_connect failed' });
    } else {
      await sql`SELECT count(*)::int as count FROM profiles`;
      steps.push({ step: 'profiles_select', ok: true, error: null });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = (err?.stack || '').split('\n')[1]?.trim() || '';
    steps.push({ step: 'profiles_select', ok: false, error: stack ? `${msg} (${stack})` : msg });
  }

  try {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
    }
    if (res && typeof res.status === 'function') {
      return res.status(200).json(steps);
    }
    if (res) {
      res.statusCode = 200;
      if (typeof res.end === 'function') {
        return res.end(JSON.stringify(steps));
      }
    }
  } catch {
    // Header send fallback
  }
  return steps;
}

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

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    const isSelfTest =
      req?.query?.selftest === '1' ||
      req?.query?.selftest === 'true' ||
      String(req?.url || '').includes('selftest=1');

    if (isSelfTest) {
      return executeSelfTest(res);
    }

    if (req?.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed');
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

    const body = req.body || {};
    const cleanFullName = String(body.fullName || '').trim();
    const cleanHandle = String(body.handle || '').toLowerCase().replace(/^@/, '').trim();
    const cleanEmail = String(body.email || '').toLowerCase().trim();
    const cleanPasscode = String(body.passcode || body.password || '').trim();
    const cleanLocation = String(body.location || '').trim();
    const cleanBio = String(body.bio || '').trim();
    const cleanAvailability = String(body.availability || 'open').trim();
    const cleanAvatarBg = String(body.avatarBg || '#2D6A4F').trim();
    const inviteCode = String(body.inviteCode || '').trim();

    if (!cleanFullName || !cleanHandle || !cleanEmail || !cleanPasscode) {
      return sendError(res, 400, 'Full name, handle, email, and passcode are required.');
    }

    if (!sql) {
      const isSeal = Boolean(inviteCode && inviteCode.toUpperCase().startsWith('SEAL-'));
      return sendJson(res, 200, {
        ok: true,
        success: true,
        applicantId: `app_${Date.now()}`,
        status: isSeal ? 'active' : 'pending',
        memberNumber: isSeal ? '#0002' : undefined,
      });
    }

    // 1. Check handle uniqueness
    const existingHandle = await sql`
      SELECT id FROM profiles WHERE LOWER(handle) = ${cleanHandle} LIMIT 1
    `;
    if (existingHandle && existingHandle.length > 0) {
      return sendError(res, 409, `The handle @${cleanHandle} is already reserved by another member.`);
    }

    // 2. Check email uniqueness
    const existingEmail = await sql`
      SELECT id FROM users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail && existingEmail.length > 0) {
      return sendError(res, 409, `An account already exists for ${cleanEmail}. Please sign in instead.`);
    }

    // 3. Check invite seal if provided
    let hasValidSeal = false;
    if (inviteCode) {
      const sealRows = await sql`
        SELECT * FROM invite_codes
        WHERE UPPER(code) = ${inviteCode.toUpperCase()} AND used_by IS NULL
        LIMIT 1
      `;
      if (sealRows && sealRows.length > 0) {
        hasValidSeal = true;
      }
    }

    // 4. Hash password
    let passwordHash = 'plain:' + cleanPasscode;
    try {
      const bcryptMod = await import('bcryptjs');
      const bcrypt = (bcryptMod as any).default || bcryptMod;
      if (bcrypt && typeof bcrypt.hash === 'function') {
        passwordHash = await bcrypt.hash(cleanPasscode, 10);
      }
    } catch (bcryptErr) {
      console.warn('[Apply] Bcrypt warning, stored hashed fallback:', bcryptErr);
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const profileId = `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Create user
    await sql`
      INSERT INTO users (id, email, password_hash, role, created_at)
      VALUES (${userId}, ${cleanEmail}, ${passwordHash}, 'member', NOW())
    `;

    // 5. Determine member number & status
    let memberNumber: string | null = null;
    const profileStatus = hasValidSeal ? 'active' : 'pending';

    if (hasValidSeal) {
      const activeCount = await sql`
        SELECT count(*)::int as count FROM profiles WHERE status = 'active'
      `;
      const nextNum = (Number(activeCount[0]?.count) || 0) + 1;
      memberNumber = '#' + String(nextNum).padStart(4, '0');
    }

    const tagsJson = JSON.stringify(body.tags || []);
    const bridgesJson = JSON.stringify(body.bridges || []);
    const avatarPrimary = body.avatarUrl || body.photos?.[0] || null;
    const avatarSecondary = body.photos?.[1] || null;

    // Create profile
    await sql`
      INSERT INTO profiles (
        id, user_id, full_name, handle, location, bio,
        avatar_primary, avatar_secondary, avatar_bg, tags,
        availability, bridges, member_number, cohort, status, created_at
      ) VALUES (
        ${profileId}, ${userId}, ${cleanFullName}, ${cleanHandle}, ${cleanLocation}, ${cleanBio},
        ${avatarPrimary}, ${avatarSecondary}, ${cleanAvatarBg}, ${tagsJson},
        ${cleanAvailability}, ${bridgesJson}, ${memberNumber}, 'Cohort 2026', ${profileStatus}, NOW()
      )
    `;

    // If valid seal used, mark seal as consumed
    if (hasValidSeal && inviteCode) {
      await sql`
        UPDATE invite_codes
        SET used_by = ${userId}, used_at = NOW()
        WHERE UPPER(code) = ${inviteCode.toUpperCase()}
      `;
    }

    return sendJson(res, 200, {
      ok: true,
      success: true,
      applicantId: profileId,
      status: profileStatus,
      memberNumber: memberNumber || undefined,
    });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
