function setCorsHeaders(res: any, origin?: string) {
  try {
    if (!res || typeof res.setHeader !== 'function') return;

    const configuredAppUrl = (
      (typeof process !== 'undefined' && (process.env.APP_URL || process.env.NEXTAUTH_URL)) ||
      ''
    ).trim();

    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://ais-dev-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
      'https://ais-pre-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
    ];

    if (configuredAppUrl && !allowedOrigins.includes(configuredAppUrl)) {
      allowedOrigins.push(configuredAppUrl);
    }

    const isVercelPreview = origin && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);
    const isAllowed = origin && (allowedOrigins.includes(origin) || isVercelPreview);
    const matchedOrigin = isAllowed ? origin : (configuredAppUrl || origin || '*');

    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-curator-email, x-curator-role, x-curator-passcode, x-user-email');
    res.setHeader('Access-Control-Max-Age', '86400');
  } catch {
    // Ignore
  }
}

function sendJson(res: any, status: number, data: any) {
  try {
    setCorsHeaders(res);
    if (res && typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    if (res) {
      res.statusCode = status;
      if (typeof res.end === 'function') {
        return res.end(JSON.stringify(data));
      }
    }
  } catch {
    // Fallback
  }
}

function sendError(res: any, status: number, message: string) {
  return sendJson(res, status, { ok: false, error: message });
}

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed');
    }

    const connectionString = (
      (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) ||
      ''
    ).trim();

    let sql: any = null;
    if (connectionString) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        sql = neon(connectionString);
      } catch (neonErr: any) {
        return sendError(res, 500, `Database driver load error: ${neonErr?.message || String(neonErr)}`);
      }
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

    if (!sql) {
      return sendJson(res, 200, {
        ok: true,
        success: true,
        request: {
          id: newId,
          requester_id: requesterId,
          receiver_id: receiverId,
          requested_channel: requestedChannel,
          sender_offered_channel: senderOfferedChannel,
          note,
          status: 'pending',
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
      });
    }

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
