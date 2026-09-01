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
      const u = userRows[0];

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
        try {
          const freshHash = await bcrypt.hash(configuredAdminPasscode, 10);
          const curatorUserId = `usr_curator_${Date.now()}`;
          await sql`INSERT INTO users (id, email, password_hash, role, created_at) VALUES (${curatorUserId}, ${configuredAdminEmail}, ${freshHash}, 'curator', NOW())`;
        } catch (insertErr) {
          console.error('[Curator Insert Error]', insertErr);
        }
      }

      return sendJson(res, 200, {
        ok: true,
        verified: true,
        user: {
          id: u?.id || 'usr_curator',
          email: configuredAdminEmail,
          role: 'curator',
          handle: 'curator',
          name: 'The Curator',
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
        name: profile?.full_name || 'Gallery Member',
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
