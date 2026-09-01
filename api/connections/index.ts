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

    let dbContext;
    try {
      dbContext = await getApiDb();
    } catch (dbErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbErr?.message || String(dbErr)}`);
    }

    if (!dbContext) {
      return sendError(res, 503, 'Database unavailable');
    }

    const { db, schema } = dbContext;
    const body = req.body || {};
    const requesterId = String(body.requesterId || '').trim();
    const receiverId = String(body.receiverId || '').trim();
    const requestedChannel = String(body.requestedChannel || '').trim();
    const senderOfferedChannel = body.senderOfferedChannel ? String(body.senderOfferedChannel).trim() : null;
    const note = String(body.note || '').trim();

    if (!requesterId || !receiverId || !requestedChannel || !note) {
      return sendError(res, 400, 'Missing required connection request fields');
    }

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

    return sendJson(res, 200, { ok: true, success: true, request: inserted[0] });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
