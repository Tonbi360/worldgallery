import { getApiDb, schema, setCorsHeaders, verifyCuratorApiAuth } from '../_lib/db';
import { eq } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server-side curator verification
  const auth = verifyCuratorApiAuth(req);
  if (!auth.authorized) {
    return res.status(401).json({ error: auth.error || 'Unauthorized' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const { applicantId } = req.body || {};
  if (!applicantId) {
    return res.status(400).json({ error: 'Applicant ID is required' });
  }

  try {
    await db
      .update(schema.profiles)
      .set({ status: 'rejected' })
      .where(eq(schema.profiles.id, applicantId));

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[API /api/curator/decline] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
