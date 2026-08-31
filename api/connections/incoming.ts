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

  const { receiverId } = req.query || {};
  const cleanReceiverId = String(receiverId || '').trim();

  if (!cleanReceiverId) {
    return res.status(400).json({ error: 'receiverId parameter is required' });
  }

  try {
    const rows = await db
      .select()
      .from(schema.connection_requests)
      .where(eq(schema.connection_requests.receiver_id, cleanReceiverId))
      .orderBy(desc(schema.connection_requests.created_at));

    const incoming = rows.map((r) => {
      const daysLeft = r.expires_at
        ? Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 7;

      return {
        id: r.id,
        senderHandle: r.requester_id,
        senderName: r.requester_id.replace(/^@/, ''),
        senderAvatarBg: '#2D6A4F',
        channelType: r.requested_channel,
        channelLabel: r.requested_channel.toUpperCase(),
        note: r.note,
        timeAgo: 'Recently',
        expiresInDays: daysLeft,
        status: r.status || 'pending',
      };
    });

    return res.status(200).json({ success: true, data: incoming });
  } catch (error: any) {
    console.error('[API /api/connections/incoming] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
