import { getApiDb, schema, setCorsHeaders } from '../_lib/db';
import { eq, desc } from 'drizzle-orm';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const { requesterId } = req.query || {};
  const cleanRequesterId = String(requesterId || '').trim();

  if (!cleanRequesterId) {
    return res.status(400).json({ error: 'requesterId parameter is required' });
  }

  try {
    const rows = await db
      .select()
      .from(schema.connection_requests)
      .where(eq(schema.connection_requests.requester_id, cleanRequesterId))
      .orderBy(desc(schema.connection_requests.created_at));

    const sent = rows.map((r) => {
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
        sentDate: r.created_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        status: r.status || 'pending',
        expiresInDays: daysLeft,
      };
    });

    return res.status(200).json({ success: true, data: sent });
  } catch (error: any) {
    console.error('[API /api/connections/sent] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
