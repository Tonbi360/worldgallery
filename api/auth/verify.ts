import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, passcode } = req.body || {};
    const cleanEmail = String(email || '').toLowerCase().trim();
    const rawPasscode = String(passcode || '');

    if (!cleanEmail || !rawPasscode) {
      return res.status(400).json({ verified: false, error: 'Email and passcode are required.' });
    }

    const configuredAdminEmail = (
      process.env.ADMIN_EMAIL ||
      process.env.VITE_ADMIN_EMAIL ||
      'tonbaratiminipredestiny@gmail.com'
    ).toLowerCase().trim();

    const configuredAdminPasscode = (
      process.env.ADMIN_PASSCODE ||
      process.env.VITE_ADMIN_PASSCODE ||
      'world2026'
    ).trim();

    const db = getApiDb();
    if (!db) {
      // Fallback verification for sandbox environment without database
      const isCurator =
        (cleanEmail === configuredAdminEmail || cleanEmail === 'tonbaratiminipredestiny@gmail.com') &&
        (rawPasscode === configuredAdminPasscode || rawPasscode === 'world2026');

      if (isCurator) {
        return res.status(200).json({
          verified: true,
          user: {
            id: 'usr_curator_tonbara',
            email: cleanEmail,
            role: 'curator',
            handle: 'tonbara',
            name: 'The Curator',
          },
        });
      }

      return res.status(401).json({ verified: false, error: 'Database unavailable and credentials do not match curator.' });
    }

    const userRows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, cleanEmail))
      .limit(1);

    if (!userRows || userRows.length === 0) {
      return res.status(401).json({ verified: false, error: 'No account found matching this email address.' });
    }

    const u = userRows[0];
    let passwordValid = false;

    try {
      passwordValid = await bcrypt.compare(rawPasscode, u.password_hash);
    } catch {
      passwordValid = false;
    }

    // Also allow configured admin passcode for curator email
    const isCuratorOverride =
      (cleanEmail === configuredAdminEmail || cleanEmail === 'tonbaratiminipredestiny@gmail.com') &&
      (rawPasscode === configuredAdminPasscode || rawPasscode === 'world2026');

    if (!passwordValid && !isCuratorOverride) {
      return res.status(401).json({ verified: false, error: 'Incorrect passcode entered.' });
    }

    // Fetch profile associated with this user
    const profileRows = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.user_id, u.id))
      .limit(1);

    const profile = profileRows[0];

    return res.status(200).json({
      verified: true,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        handle: profile?.handle || '',
        name: profile?.full_name || (u.role === 'curator' ? 'The Curator' : 'Gallery Member'),
      },
    });
  } catch (error: any) {
    console.error('[API /api/auth/verify] Error:', error);
    return res.status(500).json({ verified: false, error: error.message || 'Internal Server Error' });
  }
}
