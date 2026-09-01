import { getApiDb, setCorsHeaders, verifyCuratorApiAuth, sendJson, sendError } from '../_lib/db';

export default async function handler(req: any, res: any) {
  try {
    setCorsHeaders(res, req?.headers?.origin);

    if (req?.method === 'OPTIONS') {
      return res.status ? res.status(200).end() : res.end();
    }

    if (req?.method !== 'POST') {
      return sendError(res, 405, 'Method not allowed');
    }

    // Server-side curator verification
    const auth = verifyCuratorApiAuth(req);
    if (!auth.authorized) {
      return sendError(res, 401, auth.error || 'Unauthorized: Curator credentials required');
    }

    // Dynamic import of drizzle-orm inside handler
    let drizzleOrm: typeof import('drizzle-orm');
    try {
      drizzleOrm = await import('drizzle-orm');
    } catch (importErr: any) {
      return sendError(res, 500, `Failed to load drizzle-orm module: ${importErr?.message || String(importErr)}`);
    }
    const { eq } = drizzleOrm;

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
    const { applicantId } = req.body || {};
    if (!applicantId) {
      return sendError(res, 400, 'Applicant ID is required');
    }

    await db
      .update(schema.profiles)
      .set({ status: 'rejected' })
      .where(eq(schema.profiles.id, applicantId));

    return sendJson(res, 200, { ok: true, success: true });
  } catch (fatalErr: any) {
    const message = fatalErr?.message || String(fatalErr);
    const stackLine = (fatalErr?.stack || '').split('\n')[1]?.trim() || '';
    return sendJson(res, 500, {
      ok: false,
      error: stackLine ? `${message} | at ${stackLine}` : message,
    });
  }
}
