import { getApiDb, setCorsHeaders, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed');
    }

    // Dynamic import of bcryptjs inside handler
    let bcrypt: typeof import('bcryptjs');
    try {
      const bcryptMod = await import('bcryptjs');
      bcrypt = (bcryptMod as any).default || bcryptMod;
    } catch (importErr: any) {
      return sendError(res, 500, `Failed to load bcryptjs module: ${importErr?.message || String(importErr)}`);
    }

    const { email, passcode } = req.body || {};
    const cleanEmail = String(email || '').toLowerCase().trim();
    const rawPasscode = String(passcode || '').trim();

    if (!cleanEmail || !rawPasscode) {
      return sendJson(res, 400, { ok: false, verified: false, error: 'Email and passcode are required.' });
    }

    // Read admin credentials from environment (single source of truth)
    const configuredAdminEmail = (
      (typeof process !== 'undefined' && (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL)) ||
      ''
    ).toLowerCase().trim();

    const configuredAdminPasscode = (
      (typeof process !== 'undefined' && (process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASSCODE)) ||
      ''
    ).trim();

    const isCuratorEmail = Boolean(configuredAdminEmail && cleanEmail === configuredAdminEmail);

    // Initialize raw Neon SQL client
    let sql: any;
    try {
      sql = await getApiDb();
    } catch (dbLoadErr: any) {
      return sendError(res, 500, `Database connection error: ${dbLoadErr?.message || String(dbLoadErr)}`);
    }

    // Fallback when DB is not configured
    if (!sql) {
      if (isCuratorEmail && configuredAdminPasscode && rawPasscode === configuredAdminPasscode) {
        return sendJson(res, 200, {
          ok: true,
          verified: true,
          user: {
            id: 'usr_curator',
            email: configuredAdminEmail,
            role: 'curator',
            handle: 'curator',
            name: 'The Curator',
          },
        });
      }
      return sendJson(res, 401, {
        ok: false,
        verified: false,
        error: isCuratorEmail ? 'Incorrect passcode entered.' : 'Database unavailable.',
      });
    }

    // Curator Authentication Flow with Self-Healing Reconciliation
    if (isCuratorEmail) {
      if (!configuredAdminPasscode || rawPasscode !== configuredAdminPasscode) {
        return sendJson(res, 401, { ok: false, verified: false, error: 'Incorrect passcode entered.' });
      }

      // Valid passcode from ENV provided!
      // Check database users table for this email using raw neon SQL
      const userRows = await sql`SELECT * FROM users WHERE email = ${cleanEmail} LIMIT 1`;
      let u = userRows[0];
      let curatorUserId = u?.id;

      if (u) {
        // Test if existing password_hash matches current ADMIN_PASSCODE
        let hashMatches = false;
        try {
          hashMatches = await bcrypt.compare(configuredAdminPasscode, u.password_hash);
        } catch {
          hashMatches = false;
        }

        // Self-Healing Reconciliation: re-hash and update if hash was outdated or mismatched
        if (!hashMatches) {
          try {
            const freshHash = await bcrypt.hash(configuredAdminPasscode, 10);
            await sql`UPDATE users SET password_hash = ${freshHash}, role = 'curator' WHERE id = ${u.id}`;
          } catch (reconcileErr) {
            console.error('[Curator Reconcile Error]', reconcileErr);
          }
        }
      } else {
        // Self-healing: create curator user row in database
        curatorUserId = `usr_curator_${Date.now()}`;
        try {
          const freshHash = await bcrypt.hash(configuredAdminPasscode, 10);
          await sql`INSERT INTO users (id, email, password_hash, role, created_at) VALUES (${curatorUserId}, ${configuredAdminEmail}, ${freshHash}, 'curator', NOW())`;
        } catch (insertErr) {
          console.error('[Curator Insert Error]', insertErr);
        }
      }

      curatorUserId = curatorUserId || 'usr_curator';

      // 1. Curator Profile Self-Healing: Check if profiles row exists
      const curatorProfileRows = await sql`
        SELECT * FROM profiles
        WHERE user_id = ${curatorUserId} OR handle = 'tonbi360'
        LIMIT 1
      `;
      let curatorProf = curatorProfileRows[0];

      if (!curatorProf) {
        const curatorProfileId = `prof_curator_${Date.now()}`;
        try {
          const inserted = await sql`
            INSERT INTO profiles (
              id, user_id, full_name, handle, member_number, cohort,
              availability, status, location, bio, tags, avatar_bg, bridges, created_at, updated_at
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
              NOW(),
              NOW()
            )
            RETURNING *
          `;
          curatorProf = inserted && inserted[0] ? inserted[0] : null;
        } catch (createProfErr) {
          console.error('[Curator Profile Create Error]', createProfErr);
        }
      } else {
        try {
          const updated = await sql`
            UPDATE profiles
            SET full_name = 'Tonbara Timinipre Destiny',
                handle = 'tonbi360',
                member_number = '#0001',
                cohort = 'Founder & Curator',
                availability = 'open',
                status = 'active'
            WHERE id = ${curatorProf.id}
            RETURNING *
          `;
          if (updated && updated[0]) {
            curatorProf = updated[0];
          }
        } catch (updateProfErr) {
          console.error('[Curator Profile Update Error]', updateProfErr);
        }
      }

      // 2. Renumber all other active profiles in database by created_at order (Sarah becomes #0002)
      try {
        const otherProfiles = await sql`
          SELECT id FROM profiles
          WHERE (user_id != ${curatorUserId} AND handle != 'tonbi360')
            AND status = 'active'
          ORDER BY created_at ASC
        `;

        for (let i = 0; i < otherProfiles.length; i++) {
          const serial = String(i + 2).padStart(4, '0');
          await sql`
            UPDATE profiles
            SET member_number = ${'#' + serial}
            WHERE id = ${otherProfiles[i].id}
          `;
        }
      } catch (renumberErr) {
        console.error('[Curator Renumber Error]', renumberErr);
      }

      const realFullName = curatorProf?.full_name || 'Tonbara Timinipre Destiny';
      const realHandle = curatorProf?.handle || 'tonbi360';
      const realMemberNumber = curatorProf?.member_number || '#0001';

      return sendJson(res, 200, {
        ok: true,
        verified: true,
        user: {
          id: curatorUserId,
          email: configuredAdminEmail,
          role: 'curator',
          handle: realHandle,
          name: realFullName,
          member_number: realMemberNumber,
          memberNumber: realMemberNumber,
        },
        profile: {
          id: curatorProf?.id || `prof_curator`,
          fullName: realFullName,
          handle: realHandle,
          memberNumber: realMemberNumber,
          cohort: curatorProf?.cohort || 'Founder & Curator',
          availability: curatorProf?.availability || 'open',
          status: 'active',
          avatarBg: curatorProf?.avatar_bg || '#1C1C1E',
          location: curatorProf?.location || 'London & Global',
          bio: curatorProf?.bio || 'Founder and Curator of World Gallery.',
          tags: typeof curatorProf?.tags === 'string' ? JSON.parse(curatorProf.tags) : curatorProf?.tags || ['founder', 'curator', 'craft'],
          bridges: typeof curatorProf?.bridges === 'string' ? JSON.parse(curatorProf.bridges) : curatorProf?.bridges || [],
        },
      });
    }

    // Standard Member Authentication Flow using raw neon SQL
    const userRows = await sql`SELECT * FROM users WHERE email = ${cleanEmail} LIMIT 1`;

    if (!userRows || userRows.length === 0) {
      return sendJson(res, 401, { ok: false, verified: false, error: 'No account found matching this email address.' });
    }

    const u = userRows[0];
    let passwordValid = false;

    try {
      passwordValid = await bcrypt.compare(rawPasscode, u.password_hash);
    } catch {
      passwordValid = false;
    }

    if (!passwordValid) {
      return sendJson(res, 401, { ok: false, verified: false, error: 'Incorrect password entered.' });
    }

    // Fetch profile
    const profileRows = await sql`SELECT * FROM profiles WHERE user_id = ${u.id} LIMIT 1`;
    const profile = profileRows[0] || null;

    return sendJson(res, 200, {
      ok: true,
      verified: true,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        handle: profile?.handle || '',
        name: profile?.full_name || (u.email ? u.email.split('@')[0] : ''),
        member_number: profile?.member_number || undefined,
        memberNumber: profile?.member_number || undefined,
      },
      profile: profile ? {
        id: profile.id,
        fullName: profile.full_name,
        handle: profile.handle,
        location: profile.location || '',
        bio: profile.bio || '',
        tags: typeof profile.tags === 'string' ? JSON.parse(profile.tags) : profile.tags || [],
        availability: profile.availability || 'open',
        avatarBg: profile.avatar_bg || '#2D6A4F',
        avatarUrl: profile.avatar_primary || undefined,
        photos: [profile.avatar_primary, profile.avatar_secondary].filter(Boolean),
        memberNumber: profile.member_number || undefined,
        cohort: profile.cohort || 'Cohort 2026',
        bridges: typeof profile.bridges === 'string' ? JSON.parse(profile.bridges) : profile.bridges || [],
        status: profile.status || 'active',
      } : null,
    });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      verified: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
