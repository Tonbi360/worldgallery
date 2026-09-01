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

    // Dynamic import of drizzle-orm inside handler
    let drizzleOrm: typeof import('drizzle-orm');
    try {
      drizzleOrm = await import('drizzle-orm');
    } catch (importErr: any) {
      return sendError(res, 500, `Failed to load drizzle-orm module: ${importErr?.message || String(importErr)}`);
    }
    const { eq, desc } = drizzleOrm;

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
    const { receiverId } = req.query || {};
    const cleanReceiverId = String(receiverId || '').trim();

    if (!cleanReceiverId) {
      return sendError(res, 400, 'receiverId parameter is required');
    }

    const rows = await db
      .select()
      .from(schema.connection_requests)
      .where(eq(schema.connection_requests.receiver_id, cleanReceiverId))
      .orderBy(desc(schema.connection_requests.created_at));

    const incoming = rows.map((r: any) => {
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

    return sendJson(res, 200, { ok: true, success: true, data: incoming });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
