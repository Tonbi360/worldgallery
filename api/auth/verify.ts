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
    const inputIdentifier = String(body.email || body.handle || '').trim().toLowerCase();
    const inputPasscode = String(body.passcode || body.password || '').trim();

    if (!inputIdentifier || !inputPasscode) {
      return sendError(res, 400, 'Identifier (email/handle) and passcode are required.');
    }

    const configuredAdminEmail = (
      (typeof process !== 'undefined' && (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL)) ||
      'tonbaratiminipredestiny@gmail.com'
    ).toLowerCase().trim();

    const configuredPasscode = (
      (typeof process !== 'undefined' && (process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASSCODE)) ||
      'curator2026'
    ).trim();

    const cleanInput = inputIdentifier.replace(/^@/, '');
    const isCuratorAttempt =
      inputIdentifier === configuredAdminEmail ||
      cleanInput === 'tonbi360' ||
      cleanInput === 'curator' ||
      cleanInput === 'tonbara';

    // 1. CURATOR AUTHENTICATION ROUTE
    if (isCuratorAttempt) {
      const isPasscodeValid = inputPasscode === configuredPasscode;
      if (!isPasscodeValid) {
        return sendJson(res, 401, {
          ok: false,
          verified: false,
          error: 'Invalid curator passcode.',
        });
      }

      if (!sql) {
        return sendJson(res, 200, {
          ok: true,
          verified: true,
          role: 'curator',
          user: {
            id: 'usr_curator',
            email: configuredAdminEmail,
            role: 'curator',
            name: 'Tonbara Timinipre Destiny',
            handle: 'tonbi360',
            member_number: '#0001',
          },
          profile: {
            id: 'prof_curator',
            fullName: 'Tonbara Timinipre Destiny',
            handle: 'tonbi360',
            memberNumber: '#0001',
            cohort: 'Founder & Curator',
            avatarBg: '#1C1C1E',
            bio: 'Founder and Curator of World Gallery.',
            location: 'London & Global',
            tags: ['founder', 'curator', 'craft'],
            availability: 'open',
            bridges: [],
          },
        });
      }

      let curatorUserId = 'usr_curator';
      try {
        const existingUsers = await sql`
          SELECT * FROM users
          WHERE email = ${configuredAdminEmail} OR role = 'curator'
          LIMIT 1
        `;

        if (existingUsers && existingUsers.length > 0) {
          curatorUserId = existingUsers[0].id;
        } else {
          let bcryptMod: any = null;
          try {
            bcryptMod = await import('bcryptjs');
          } catch {
            // fallback
          }
          const bcrypt = (bcryptMod as any)?.default || bcryptMod;
          const hash = bcrypt ? await bcrypt.hash(configuredPasscode, 10) : 'plain:' + configuredPasscode;
          await sql`
            INSERT INTO users (id, email, password_hash, role, created_at)
            VALUES (${curatorUserId}, ${configuredAdminEmail}, ${hash}, 'curator', NOW())
            ON CONFLICT (email) DO UPDATE SET role = 'curator'
          `;
        }
      } catch (userErr) {
        console.error('[Curator User Sync Error]', userErr);
      }

      let curatorProf: any = null;
      try {
        const profRows = await sql`
          SELECT * FROM profiles
          WHERE handle = 'tonbi360' OR user_id = ${curatorUserId}
          LIMIT 1
        `;

        if (!profRows || profRows.length === 0) {
          const curatorProfileId = `prof_curator_${Date.now()}`;
          const inserted = await sql`
            INSERT INTO profiles (
              id, user_id, full_name, handle, member_number, cohort,
              availability, status, location, bio, tags, avatar_bg, bridges, created_at
            ) VALUES (
              ${curatorProfileId},
              ${curatorUserId},
              'Tonbara Timinipre Destiny',
              'tonbi360',
              '#0001',
              'Founder & Curator',
              'open',
              'active',
              'London & Global',
              'Founder and Curator of World Gallery.',
              ${JSON.stringify(['founder', 'curator', 'craft'])},
              '#1C1C1E',
              ${JSON.stringify([])},
              NOW()
            )
            RETURNING *
          `;
          curatorProf = inserted[0];
        } else {
          curatorProf = profRows[0];
          const updated = await sql`
            UPDATE profiles SET
              full_name = 'Tonbara Timinipre Destiny',
              handle = 'tonbi360',
              member_number = '#0001',
              cohort = 'Founder & Curator',
              status = 'active',
              avatar_bg = '#1C1C1E'
            WHERE id = ${curatorProf.id}
            RETURNING *
          `;
          if (updated && updated[0]) {
            curatorProf = updated[0];
          }
        }
      } catch (profErr) {
        console.error('[Curator Profile Sync Error]', profErr);
      }

      // Renumber all other active profiles in database by created_at order (Sarah becomes #0002)
      try {
        const otherActiveProfiles = await sql`
          SELECT id, member_number, created_at FROM profiles
          WHERE status = 'active' AND handle != 'tonbi360'
          ORDER BY created_at ASC
        `;

        for (let i = 0; i < otherActiveProfiles.length; i++) {
          const expectedSerial = '#' + String(i + 2).padStart(4, '0');
          const pRow = otherActiveProfiles[i];
          if (pRow.member_number !== expectedSerial) {
            await sql`
              UPDATE profiles
              SET member_number = ${expectedSerial}
              WHERE id = ${pRow.id}
            `;
          }
        }
      } catch (renumberErr) {
        console.error('[Profile Renumber Error]', renumberErr);
      }

      return sendJson(res, 200, {
        ok: true,
        verified: true,
        role: 'curator',
        user: {
          id: curatorUserId,
          email: configuredAdminEmail,
          role: 'curator',
          name: 'Tonbara Timinipre Destiny',
          handle: 'tonbi360',
          member_number: '#0001',
        },
        profile: curatorProf ? {
          id: curatorProf.id,
          fullName: curatorProf.full_name || 'Tonbara Timinipre Destiny',
          handle: curatorProf.handle || 'tonbi360',
          memberNumber: curatorProf.member_number || '#0001',
          cohort: curatorProf.cohort || 'Founder & Curator',
          avatarBg: curatorProf.avatar_bg || '#1C1C1E',
          avatarUrl: curatorProf.avatar_primary || undefined,
          photos: [curatorProf.avatar_primary, curatorProf.avatar_secondary].filter(Boolean),
          bio: curatorProf.bio || 'Founder and Curator of World Gallery.',
          location: curatorProf.location || 'London & Global',
          tags: typeof curatorProf.tags === 'string' ? JSON.parse(curatorProf.tags) : curatorProf.tags || ['founder', 'curator'],
          availability: curatorProf.availability || 'open',
          bridges: typeof curatorProf.bridges === 'string' ? JSON.parse(curatorProf.bridges) : curatorProf.bridges || [],
        } : undefined,
      });
    }

    // 2. MEMBER AUTHENTICATION ROUTE
    if (!sql) {
      return sendJson(res, 200, {
        ok: true,
        verified: true,
        role: 'member',
        user: {
          id: `usr_${cleanInput}`,
          email: inputIdentifier.includes('@') ? inputIdentifier : `${cleanInput}@worldgallery.io`,
          role: 'member',
          name: cleanInput,
          handle: cleanInput,
        },
      });
    }

    // Lookup user in DB
    const userRows = await sql`
      SELECT u.*, p.id as profile_id, p.full_name, p.handle, p.member_number, p.cohort,
             p.avatar_bg, p.avatar_primary, p.avatar_secondary, p.bio, p.location,
             p.tags, p.availability, p.bridges, p.status as profile_status
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE LOWER(u.email) = ${inputIdentifier} OR LOWER(p.handle) = ${cleanInput}
      LIMIT 1
    `;

    if (!userRows || userRows.length === 0) {
      return sendJson(res, 401, {
        ok: false,
        verified: false,
        error: 'No account found for this handle or email. Please check your credentials or apply.',
      });
    }

    const dbUser = userRows[0];
    let passwordMatches = false;

    try {
      const bcryptMod = await import('bcryptjs');
      const bcrypt = (bcryptMod as any).default || bcryptMod;
      if (bcrypt && dbUser.password_hash) {
        if (dbUser.password_hash.startsWith('$2')) {
          passwordMatches = await bcrypt.compare(inputPasscode, dbUser.password_hash);
        } else if (dbUser.password_hash.startsWith('plain:')) {
          passwordMatches = inputPasscode === dbUser.password_hash.replace('plain:', '');
        } else {
          passwordMatches = inputPasscode === dbUser.password_hash;
        }
      }
    } catch {
      passwordMatches = inputPasscode === dbUser.password_hash;
    }

    if (!passwordMatches) {
      return sendJson(res, 401, {
        ok: false,
        verified: false,
        error: 'Incorrect passcode for this account.',
      });
    }

    const memberProfile = dbUser.profile_id ? {
      id: dbUser.profile_id,
      fullName: dbUser.full_name,
      handle: dbUser.handle,
      memberNumber: dbUser.member_number,
      cohort: dbUser.cohort,
      avatarBg: dbUser.avatar_bg || '#2D6A4F',
      avatarUrl: dbUser.avatar_primary || undefined,
      photos: [dbUser.avatar_primary, dbUser.avatar_secondary].filter(Boolean),
      bio: dbUser.bio || '',
      location: dbUser.location || '',
      tags: typeof dbUser.tags === 'string' ? JSON.parse(dbUser.tags) : dbUser.tags || [],
      availability: dbUser.availability || 'open',
      bridges: typeof dbUser.bridges === 'string' ? JSON.parse(dbUser.bridges) : dbUser.bridges || [],
    } : undefined;

    return sendJson(res, 200, {
      ok: true,
      verified: true,
      role: dbUser.role || 'member',
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role || 'member',
        name: dbUser.full_name || dbUser.email.split('@')[0],
        handle: dbUser.handle || '',
        member_number: dbUser.member_number || undefined,
      },
      profile: memberProfile,
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
