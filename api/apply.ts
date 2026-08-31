import { getApiDb, schema, setCorsHeaders } from './_lib/db';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers?.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({
      error: 'Database is currently unavailable. Please verify DATABASE_URL is set in your deployment.',
    });
  }

  try {
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
    const rawPasscode = String(body.passcode || 'world2026').trim();

    if (!cleanFullName || !cleanHandle) {
      return res.status(400).json({ error: 'Full name and handle are required.' });
    }

    // 1. Check if handle is already taken in profiles table
    const existingHandle = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.handle, cleanHandle))
      .limit(1);

    if (existingHandle && existingHandle.length > 0) {
      return res.status(400).json({ error: `The handle @${cleanHandle} is already registered.` });
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

    return res.status(200).json({
      success: true,
      status: profileStatus,
      user: userSession,
      profile: memberProfile,
    });
  } catch (error: any) {
    console.error('[API /api/apply] Error registering applicant:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
