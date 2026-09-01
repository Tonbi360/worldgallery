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

    let sql: any;
    try {
      sql = await getApiDb();
    } catch (dbErr: any) {
      return sendError(res, 500, `Database initialization error: ${dbErr?.message || String(dbErr)}`);
    }

    if (!sql) {
      return sendError(res, 503, 'Database unavailable');
    }

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

    const rows = await sql`
      INSERT INTO connection_requests (
        id, requester_id, receiver_id, requested_channel, sender_offered_channel,
        note, status, created_at, expires_at
      ) VALUES (
        ${newId}, ${requesterId}, ${receiverId}, ${requestedChannel}, ${senderOfferedChannel},
        ${note}, 'pending', ${now.toISOString()}, ${expiresAt.toISOString()}
      )
      RETURNING *
    `;

    return sendJson(res, 200, { ok: true, success: true, request: rows[0] });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
