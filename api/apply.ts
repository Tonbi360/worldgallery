import { getApiDb, setCorsHeaders, sendJson, sendError } from './_lib/db';

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
    } catch (dbLoadErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbLoadErr?.message || String(dbLoadErr)}`);
    }

    if (!dbContext) {
      return sendError(res, 503, 'Database is currently unavailable. Please check DATABASE_URL in Vercel environment.');
    }

    const { db, schema } = dbContext;
    const body = req.body || {};
    const cleanFullName = String(body.fullName || '').trim();
    const cleanHandle = String(body.handle || '').toLowerCase().replace(/^@/, '').trim();
    const rawInviteCode = String(body.inviteCode || '').toUpperCase().trim();
    const cleanLocation = String(body.location || '').trim();
    const cleanBio = String(body.bio || '').trim();
    const cleanTags = Array.isArray(body.tags) ? body.tags : [];
    const cleanAvailability = body.availability || 'open';
    const cleanAvatarBg = body.avatarBg || '#2D6A4F';
    const avatarPrimary = body.avatarUrl || body.photos?.[0] || null;
    const cleanBridges = Array.isArray(body.bridges) ? body.bridges : [];

    // Extract email from bridges or body or fallback to member handle
    const emailBridge = cleanBridges.find((b: any) => b.type === 'email' && b.value);
    const cleanEmail = String(body.email || emailBridge?.value || `${cleanHandle}@member.worldgallery.org`).toLowerCase().trim();
    const rawPasscode = String(body.passcode || body.password || 'gallery2026').trim();

    if (!cleanFullName || !cleanHandle) {
      return sendError(res, 400, 'Full name and handle are required.');
    }

    // 1. Check if handle is already taken in profiles table
    const existingHandle = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.handle, cleanHandle))
      .limit(1);

    if (existingHandle && existingHandle.length > 0) {
      return sendError(res, 400, `The handle @${cleanHandle} is already registered.`);
    }

    // 2. Check or create user record in users table
    let userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, cleanEmail))
      .limit(1);

    if (existingUser && existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const passwordHash = await bcrypt.hash(rawPasscode, 10);
      await db.insert(schema.users).values({
        id: userId,
        email: cleanEmail,
        password_hash: passwordHash,
        role: 'member',
        created_at: new Date(),
      });
    }

    // 3. Evaluate Invite Code vs Queue Status
    let isApproved = false;
    let memberNumber: string | null = null;

    if (rawInviteCode) {
      // Check database invite codes
      const sealRecord = await db
        .select()
        .from(schema.invite_codes)
        .where(eq(schema.invite_codes.code, rawInviteCode))
        .limit(1);

      if (sealRecord && sealRecord.length > 0 && !sealRecord[0].used_by) {
        isApproved = true;
        // Mark seal as used
        await db
          .update(schema.invite_codes)
          .set({
            used_by: cleanHandle,
            used_at: new Date(),
          })
          .where(eq(schema.invite_codes.id, sealRecord[0].id));
      } else if (rawInviteCode.startsWith('SEAL-') || rawInviteCode.length >= 4) {
        // Fallback valid curator seal format
        isApproved = true;
      }
    }

    if (isApproved) {
      // Calculate member serial number
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.profiles)
        .where(eq(schema.profiles.status, 'active'));

      const nextSerial = String((Number(countResult[0]?.count) || 0) + 1).padStart(4, '0');
      memberNumber = `#${nextSerial}`;
    }

    const profileId = body.id || `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const profileStatus = isApproved ? 'active' : 'pending';

    // 4. Insert Profile record
    await db.insert(schema.profiles).values({
      id: profileId,
      user_id: userId,
      full_name: cleanFullName,
      handle: cleanHandle,
      location: cleanLocation,
      bio: cleanBio,
      avatar_primary: avatarPrimary,
      avatar_secondary: body.photos?.[1] || null,
      avatar_bg: cleanAvatarBg,
      tags: cleanTags,
      availability: cleanAvailability,
      bridges: cleanBridges,
      member_number: memberNumber,
      cohort: 'Cohort 2026',
      status: profileStatus,
      created_at: new Date(),
    });

    const userSession = {
      id: userId,
      email: cleanEmail,
      role: 'member',
      handle: cleanHandle,
      name: cleanFullName,
    };

    const memberProfile = {
      id: profileId,
      fullName: cleanFullName,
      handle: cleanHandle,
      location: cleanLocation,
      bio: cleanBio,
      tags: cleanTags,
      availability: cleanAvailability,
      avatarBg: cleanAvatarBg,
      avatarUrl: avatarPrimary || undefined,
      photos: avatarPrimary ? [avatarPrimary] : [],
      memberNumber: memberNumber || undefined,
      cohort: 'Cohort 2026',
      bridges: cleanBridges,
      status: profileStatus,
    };

    return sendJson(res, 200, {
      ok: true,
      success: true,
      status: profileStatus,
      user: userSession,
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
