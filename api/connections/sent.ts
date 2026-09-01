import { getApiDb, setCorsHeaders, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'GET') {
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

    const { requesterId } = req.query || {};
    const cleanRequesterId = String(requesterId || '').trim();

    if (!cleanRequesterId) {
      return sendError(res, 400, 'requesterId parameter is required');
    }

    const rows = await sql`
      SELECT * FROM connection_requests
      WHERE requester_id = ${cleanRequesterId}
      ORDER BY created_at DESC
    `;

    const sent = rows.map((r: any) => {
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
        sentDate: r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recently',
        status: r.status || 'pending',
        expiresInDays: daysLeft,
      };
    });

    return sendJson(res, 200, { ok: true, success: true, data: sent });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
