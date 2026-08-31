import { getApiDb, schema, setCorsHeaders } from '../_lib/db';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getApiDb();
  if (!db) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const body = req.body || {};
  const requesterId = String(body.requesterId || '').trim();
  const receiverId = String(body.receiverId || '').trim();
  const requestedChannel = String(body.requestedChannel || '').trim();
  const senderOfferedChannel = body.senderOfferedChannel ? String(body.senderOfferedChannel).trim() : null;
  const note = String(body.note || '').trim();

  if (!requesterId || !receiverId || !requestedChannel || !note) {
    return res.status(400).json({ error: 'Missing required connection request fields' });
  }

  try {
    const newId = body.id || `req_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const inserted = await db
      .insert(schema.connection_requests)
      .values({
        id: newId,
        requester_id: requesterId,
        receiver_id: receiverId,
        requested_channel: requestedChannel,
        sender_offered_channel: senderOfferedChannel,
        note: note,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
      })
      .returning();

    return res.status(200).json({ success: true, request: inserted[0] });
  } catch (error: any) {
    console.error('[API /api/connections] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
