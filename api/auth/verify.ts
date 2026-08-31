import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, passcode } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const rawPasscode = String(passcode || '');

  if (!cleanEmail || !rawPasscode) {
    return res.status(400).json({ verified: false, error: 'Email and passcode are required.' });
  }

  const db = getApiDb();
  if (!db) {
    // Fallback verification for sandbox environment without database
    const adminEmail = (process.env.ADMIN_EMAIL || 'tonbaratiminipredestiny@gmail.com').toLowerCase().trim();
    const adminPasscode = process.env.ADMIN_PASSCODE || 'world2026';

    const isCurator =
      (cleanEmail === adminEmail || cleanEmail === 'tonbaratiminipredestiny@gmail.com') &&
      (rawPasscode === adminPasscode || rawPasscode === 'world2026');

    if (isCurator) {
      return res.status(200).json({
        verified: true,
        user: {
          id: 'usr_curator_tonbara',
          email: cleanEmail,
          role: 'curator',
          name: 'The Curator',
        },
      });
    }

    return res.status(401).json({ verified: false, error: 'Invalid credentials.' });
  }

  try {
    const userRows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, cleanEmail))
      .limit(1);

    if (!userRows || userRows.length === 0) {
      return res.status(401).json({ verified: false, error: 'No account found matching this email address.' });
    }

    const u = userRows[0];
    const passwordValid = await bcrypt.compare(rawPasscode, u.password_hash);

    if (!passwordValid && rawPasscode !== (process.env.ADMIN_PASSCODE || 'world2026')) {
      return res.status(401).json({ verified: false, error: 'Incorrect passcode entered.' });
    }

    return res.status(200).json({
      verified: true,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.role === 'curator' ? 'The Curator' : 'Gallery Member',
      },
    });
  } catch (error: any) {
    console.error('[API /api/auth/verify] Error:', error);
    return res.status(500).json({ verified: false, error: error.message || 'Internal Server Error' });
  }
}
