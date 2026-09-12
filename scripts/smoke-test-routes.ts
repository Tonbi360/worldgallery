import handler from '../api/[...slug]';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status(code: number): MockResponse;
  json(data: any): MockResponse;
  setHeader(name: string, value: string): void;
  end(data?: any): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(data?: any) {
      if (data && !this.body) {
        try {
          this.body = JSON.parse(data);
        } catch {
          this.body = data;
        }
      }
    },
  };
  return res;
}

async function runRouteSmokeTests() {
  console.log('=== RUNNING PHASE 1 ROUTE SMOKE TESTS ===\n');

  const spaRegex = /^\/((?!api\/|api$).*)$/;
  const spaTestCases = [
    { url: '/gallery', shouldMatch: true },
    { url: '/waiting', shouldMatch: true },
    { url: '/requests', shouldMatch: true },
    { url: '/profile/alex', shouldMatch: true },
    { url: '/terms', shouldMatch: true },
    { url: '/privacy', shouldMatch: true },
    { url: '/api', shouldMatch: false },
    { url: '/api/', shouldMatch: false },
    { url: '/api/health', shouldMatch: false },
    { url: '/api/auth/verify', shouldMatch: false },
    { url: '/api/profiles/sarah', shouldMatch: false },
    { url: '/api/curator/applicants', shouldMatch: false },
    { url: '/api/connections/incoming', shouldMatch: false },
  ];

  console.log('--- 1. SPA FALLBACK REGEX VERIFICATION ---');
  let regexPassed = 0;
  for (const tc of spaTestCases) {
    const matches = spaRegex.test(tc.url);
    if (matches === tc.shouldMatch) {
      console.log(`✅ [PASS] "${tc.url}" => ${matches ? 'rewrites to index.html' : 'bypasses SPA (API route)'}`);
      regexPassed++;
    } else {
      console.error(`❌ [FAIL] "${tc.url}" expected shouldMatch=${tc.shouldMatch} but got ${matches}`);
    }
  }

  console.log('\n--- 2. BACKEND HANDLER NESTED ROUTE DISPATCH ---');
  const routeCases = [
    {
      name: 'GET /api/health (direct)',
      req: { method: 'GET', url: '/api/health' },
      expectedStatuses: [200],
    },
    {
      name: 'GET /api/me (unauthenticated)',
      req: { method: 'GET', url: '/api/me' },
      expectedStatuses: [401],
    },
    {
      name: 'POST /api/auth/verify (empty body)',
      req: { method: 'POST', url: '/api/auth/verify', body: {} },
      expectedStatuses: [400],
    },
    {
      name: 'POST /api/auth/forgot (empty body)',
      req: { method: 'POST', url: '/api/auth/forgot', body: {} },
      expectedStatuses: [200], // Forgot password fails closed with generic success
    },
    {
      name: 'GET /api/profiles/test_unknown (not found)',
      req: { method: 'GET', url: '/api/profiles/non_existent_handle_12345' },
      expectedStatuses: [404],
    },
    {
      name: 'GET /api/curator/applicants (unauthorized)',
      req: { method: 'GET', url: '/api/curator/applicants' },
      expectedStatuses: [401],
    },
    {
      name: 'GET /api/connections/incoming (unauthorized)',
      req: { method: 'GET', url: '/api/connections/incoming' },
      expectedStatuses: [401],
    },
    {
      name: 'GET /api/connections/sent (unauthorized)',
      req: { method: 'GET', url: '/api/connections/sent' },
      expectedStatuses: [401],
    },
    // Vercel serverless environment simulation: req.url is /api/[...slug] with req.query.slug
    {
      name: 'Vercel Simulation: req.query.slug = ["auth", "verify"]',
      req: {
        method: 'POST',
        url: '/api/[...slug]',
        query: { slug: ['auth', 'verify'] },
        body: {},
      },
      expectedStatuses: [400],
    },
    {
      name: 'Vercel Simulation: req.query.slug = ["curator", "applicants"]',
      req: {
        method: 'GET',
        url: '/api/[...slug]',
        query: { slug: ['curator', 'applicants'] },
      },
      expectedStatuses: [401],
    },
    {
      name: 'Vercel Simulation: req.query.slug = ["connections", "incoming"]',
      req: {
        method: 'GET',
        url: '/api/[...slug]',
        query: { slug: ['connections', 'incoming'] },
      },
      expectedStatuses: [401],
    },
    {
      name: 'Vercel Simulation: x-matched-path header /api/auth/verify',
      req: {
        method: 'POST',
        url: '/api/[...slug]',
        headers: { 'x-matched-path': '/api/auth/verify' },
        body: {},
      },
      expectedStatuses: [400],
    },
  ];

  let routePassed = 0;
  for (const rc of routeCases) {
    const res = createMockResponse();
    await handler(rc.req, res);
    const status = res.statusCode;
    if (rc.expectedStatuses.includes(status)) {
      console.log(`✅ [PASS] ${rc.name} => status ${status} (expected ${rc.expectedStatuses.join('/')})`);
      routePassed++;
    } else {
      console.error(`❌ [FAIL] ${rc.name} => got status ${status}, expected ${rc.expectedStatuses.join('/')}. Response:`, res.body);
    }
  }

  console.log(`\n========================================`);
  console.log(`PHASE 1 SMOKE TEST RESULT: ${regexPassed + routePassed} passed, ${spaTestCases.length + routeCases.length - (regexPassed + routePassed)} failed.`);
  console.log(`========================================`);

  if (regexPassed + routePassed !== spaTestCases.length + routeCases.length) {
    process.exit(1);
  }
}

runRouteSmokeTests().catch(err => {
  console.error('Fatal smoke test error:', err);
  process.exit(1);
});
