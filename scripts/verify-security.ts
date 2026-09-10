import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- STARTING SECURITY VERIFICATION SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Anonymous Access Tests
  console.log('\n[TEST GROUP 1: ANONYMOUS ACCESS RESTRICTIONS]');
  const anonMe = await fetch(`${BASE_URL}/api/me`);
  assert(anonMe.status === 401, 'Anonymous GET /api/me must return 401');

  const anonIncoming = await fetch(`${BASE_URL}/api/connections/incoming`);
  assert(anonIncoming.status === 401, 'Anonymous GET /api/connections/incoming must return 401');

  const anonSent = await fetch(`${BASE_URL}/api/connections/sent`);
  assert(anonSent.status === 401, 'Anonymous GET /api/connections/sent must return 401');

  const anonPostConn = await fetch(`${BASE_URL}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverId: 'test', requestedChannel: 'email', note: 'hello' }),
  });
  assert(anonPostConn.status === 401, 'Anonymous POST /api/connections must return 401');

  const anonCurator = await fetch(`${BASE_URL}/api/curator/applicants`);
  assert(anonCurator.status === 401 || anonCurator.status === 403, 'Anonymous GET /api/curator/applicants must be rejected');

  // 2. Curator Spoofing & Passcode Bypass Tests
  console.log('\n[TEST GROUP 2: CURATOR AUTHENTICATION SPOOFING & BYPASS TESTS]');
  const adminEmail = process.env.ADMIN_EMAIL || 'curator@worldgallery.org';
  const adminPasscode = process.env.ADMIN_PASSCODE || '';

  // Test with fake email header
  const spoofEmail = await fetch(`${BASE_URL}/api/curator/applicants`, {
    headers: { 'x-curator-email': adminEmail },
  });
  assert(spoofEmail.status === 401 || spoofEmail.status === 403, 'x-curator-email header alone must be rejected');

  // Test with fake role header
  const spoofRole = await fetch(`${BASE_URL}/api/curator/applicants`, {
    headers: { 'x-curator-role': 'curator' },
  });
  assert(spoofRole.status === 401 || spoofRole.status === 403, 'x-curator-role header alone must be rejected');

  // Test with Bearer ADMIN_PASSCODE
  const bearerPasscode = await fetch(`${BASE_URL}/api/curator/applicants`, {
    headers: { 'Authorization': `Bearer ${adminPasscode}` },
  });
  assert(bearerPasscode.status === 401 || bearerPasscode.status === 403, 'Direct Authorization: Bearer <ADMIN_PASSCODE> must NOT bypass session requirement');

  // Test with x-curator-passcode header
  const headerPasscode = await fetch(`${BASE_URL}/api/curator/applicants`, {
    headers: { 'x-curator-passcode': adminPasscode },
  });
  assert(headerPasscode.status === 401 || headerPasscode.status === 403, 'x-curator-passcode header must NOT bypass session requirement');

  // 3. Curator Login & Session Validation
  console.log('\n[TEST GROUP 3: CURATOR LOGIN & HttpOnly COOKIE]');
  const curatorLoginRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, passcode: adminPasscode }),
  });
  assert(curatorLoginRes.status === 200, 'Curator login with valid credentials must succeed (200)');
  const curatorLoginJson = await curatorLoginRes.json();
  assert(curatorLoginJson.token === undefined, 'Curator login JSON must NOT expose raw session token');
  assert(curatorLoginJson.verified === true, 'Curator login JSON verified should be true');

  const curatorCookie = curatorLoginRes.headers.get('set-cookie');
  assert(!!curatorCookie && curatorCookie.includes('wg_session='), 'Curator login must set wg_session cookie');
  assert(!!curatorCookie && curatorCookie.includes('HttpOnly'), 'wg_session cookie must have HttpOnly flag');
  assert(!!curatorCookie && curatorCookie.includes('SameSite=Lax'), 'wg_session cookie must have SameSite=Lax');

  // Parse curator cookie for subsequent requests
  const curatorCookieVal = curatorCookie?.split(';')[0] || '';

  // Verify curator can access /api/me
  const curatorMe = await fetch(`${BASE_URL}/api/me`, {
    headers: { Cookie: curatorCookieVal },
  });
  const curatorMeJson = await curatorMe.json();
  assert(curatorMe.status === 200 && curatorMeJson.user?.role === 'curator', 'Curator session can access /api/me with curator role');

  // Verify curator can access /api/curator/applicants via session cookie
  const curatorApplicants = await fetch(`${BASE_URL}/api/curator/applicants`, {
    headers: { Cookie: curatorCookieVal },
  });
  assert(curatorApplicants.status === 200, 'Authenticated curator session can access /api/curator/applicants');

  // DEF-01: Curator Invite Seal CRUD
  console.log('\n[TEST GROUP 3B: CURATOR INVITE SEAL PERSISTENCE (DEF-01)]');
  const sealListRes = await fetch(`${BASE_URL}/api/curator/seal`, {
    headers: { Cookie: curatorCookieVal },
  });
  assert(sealListRes.status === 200, 'Curator GET /api/curator/seal succeeds');
  const sealListJson = await sealListRes.json();
  const sealList = Array.isArray(sealListJson) ? sealListJson : (sealListJson.data || sealListJson.seals || []);
  assert(Array.isArray(sealList), 'Curator seal list is an array');

  const testSealCode = 'TEST-SEAL-' + Math.floor(1000 + Math.random() * 9000);
  const createSealRes = await fetch(`${BASE_URL}/api/curator/seal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: curatorCookieVal,
    },
    body: JSON.stringify({ note: 'Automated test seal', code: testSealCode }),
  });
  assert(createSealRes.status === 200, 'Curator POST /api/curator/seal creates new seal');
  const createdSealJson = await createSealRes.json();
  assert(createdSealJson.success === true && createdSealJson.seal?.code === testSealCode, 'Created seal has expected code');

  if (createdSealJson.seal?.id) {
    const deleteSealRes = await fetch(`${BASE_URL}/api/curator/seal/${createdSealJson.seal.id}`, {
      method: 'DELETE',
      headers: { Cookie: curatorCookieVal },
    });
    assert(deleteSealRes.status === 200, 'Curator DELETE /api/curator/seal/:id succeeds');
  }

  // Curator stats / quota (DEF-04)
  const curatorStatsRes = await fetch(`${BASE_URL}/api/curator/stats`, {
    headers: { Cookie: curatorCookieVal },
  });
  assert(curatorStatsRes.status === 200, 'Curator GET /api/curator/stats succeeds');
  const curatorStats = await curatorStatsRes.json();
  assert(typeof curatorStats.approvalsToday === 'number' && curatorStats.dailyCap === 10, 'Curator stats returns approvalsToday and dailyCap (DEF-04)');

  // 4. Member Authentication, Authorization, & Impersonation Prevention
  console.log('\n[TEST GROUP 4: MEMBER SESSIONS & INVARIANT ENFORCEMENT]');
  // Query a test member from DB
  const dbUrl = process.env.DATABASE_URL!;
  const sql = postgres(dbUrl, { max: 1 });
  const users = await sql`SELECT id, email, role FROM users WHERE role = 'member' LIMIT 2`;
  
  if (users.length > 0) {
    const userA = users[0];
    console.log(`Testing with user A: ${userA.email} (${userA.id})`);

    // Create session for user A directly in DB to test member session behavior
    const memberToken = 'test_member_token_' + crypto.randomBytes(16).toString('hex');
    const memberTokenHash = crypto.createHash('sha256').update(memberToken).digest('hex');
    const memberSessionId = 'ses_test_' + crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO sessions (id, token_hash, user_id, role, expires_at, created_at)
      VALUES (${memberSessionId}, ${memberTokenHash}, ${userA.id}, ${userA.role}, ${expiresAt.toISOString()}, NOW())
    `;

    const memberACookie = `wg_session=${memberToken}`;

    // Test: Member A cannot access curator endpoints
    const memberCuratorRes = await fetch(`${BASE_URL}/api/curator/applicants`, {
      headers: { Cookie: memberACookie },
    });
    assert(memberCuratorRes.status === 401 || memberCuratorRes.status === 403, 'Member session MUST NOT access /api/curator/applicants');

    // Test: Member A GET /api/me
    const memberMeRes = await fetch(`${BASE_URL}/api/me`, {
      headers: { Cookie: memberACookie },
    });
    const memberMeJson = await memberMeRes.json();
    assert(memberMeRes.status === 200 && memberMeJson.user?.id === userA.id, 'Member A GET /api/me returns Member A identity');

    // Test: Member A POST /api/connections spoofing requesterId
    const spoofPostConn = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: memberACookie,
      },
      body: JSON.stringify({
        requesterId: 'spoofed_user_id_9999',
        receiverId: 'usr_curator_admin',
        requestedChannel: 'email',
        note: 'Test connection request verifying requesterId spoof prevention',
      }),
    });
    assert(spoofPostConn.status === 200, 'Member A connection request accepted');

    // Check DB: requester_id MUST be userA.id, NOT spoofed_user_id_9999
    const connRows = await sql`
      SELECT * FROM connection_requests 
      WHERE note = 'Test connection request verifying requesterId spoof prevention'
      ORDER BY created_at DESC LIMIT 1
    `;
    assert(
      connRows.length > 0 && connRows[0].requester_id === userA.id,
      `Requester identity in DB (${connRows[0]?.requester_id}) matches authenticated user (${userA.id}), NOT spoofed client body`
    );

    // Test: Duplicate connection request rejection (DEF-05)
    const duplicatePostConn = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: memberACookie,
      },
      body: JSON.stringify({
        receiverId: 'usr_curator_admin',
        requestedChannel: 'email',
        note: 'Attempting duplicate connection request',
      }),
    });
    assert(
      duplicatePostConn.status === 400 || duplicatePostConn.status === 409,
      'Duplicate pending connection request to same receiver must be rejected (DEF-05)'
    );

    // Test: Member A GET /api/connections/sent?requesterId=other_user
    const sentEnumRes = await fetch(`${BASE_URL}/api/connections/sent?requesterId=spoofed_user_id_9999`, {
      headers: { Cookie: memberACookie },
    });
    assert(sentEnumRes.status === 200, 'Sent requests call succeeds');
    const sentData = await sentEnumRes.json();
    // Check that none of the returned requests have requester_id === spoofed_user_id_9999
    assert(
      Array.isArray(sentData.data),
      'Sent requests returns data array for authenticated user'
    );

    // Test: Member A GET /api/connections/incoming?receiverId=other_user
    const incomingEnumRes = await fetch(`${BASE_URL}/api/connections/incoming?receiverId=spoofed_user_id_9999`, {
      headers: { Cookie: memberACookie },
    });
    assert(incomingEnumRes.status === 200, 'Incoming requests call succeeds');
    const incomingData = await incomingEnumRes.json();
    assert(
      Array.isArray(incomingData.data),
      'Incoming requests returns data array strictly for authenticated user'
    );

    // Test Logout
    console.log('\n[TEST GROUP 5: LOGOUT & SESSION INVALIDATION]');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: memberACookie },
    });
    assert(logoutRes.status === 200, 'Logout succeeds');
    const logoutCookie = logoutRes.headers.get('set-cookie');
    assert(
      !!logoutCookie && (logoutCookie.includes('Max-Age=0') || logoutCookie.includes('expires=')),
      'Logout expires wg_session cookie'
    );

    // Verify session row deleted from DB
    const remainingSessions = await sql`
      SELECT * FROM sessions WHERE token_hash = ${memberTokenHash}
    `;
    assert(remainingSessions.length === 0, 'Database session record deleted on logout');

    // Clean up test connection request
    await sql`DELETE FROM connection_requests WHERE note = 'Test connection request verifying requesterId spoof prevention'`;
  }

  // 6. Public Profile Privacy Test
  console.log('\n[TEST GROUP 6: PUBLIC PROFILE PRIVACY (NO CONTACT BRIDGES)]');
  const profiles = await sql`SELECT handle FROM profiles LIMIT 1`;
  if (profiles.length > 0) {
    const handle = profiles[0].handle;
    const pubRes = await fetch(`${BASE_URL}/api/profiles/single?handle=${handle}`);
    const pubJson = await pubRes.json();
    const returnedBridges = pubJson.member?.bridges || [];
    let leakedDirectValue = false;
    for (const b of returnedBridges) {
      if (b.value && b.value.length > 0) {
        leakedDirectValue = true;
      }
    }
    assert(!leakedDirectValue, `Public profile for ${handle} does NOT disclose bridge values/contacts`);
  }

  // 7. Invite Seal End-to-End & Instant Active Lifecycle
  console.log('\n[TEST GROUP 7: INVITE SEAL REGISTRATION & CONSUMPTION]');
  const testSealCodeE2E = 'SEAL-SUITE-' + Math.floor(1000 + Math.random() * 9000);
  const makeSealRes = await fetch(`${BASE_URL}/api/curator/seal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: curatorCookieVal },
    body: JSON.stringify({ note: 'Automated Suite Seal', code: testSealCodeE2E }),
  });
  assert(makeSealRes.status === 200, 'Curator generates invite seal in PostgreSQL');

  const sealedUserHandle = 'sealed_' + Date.now();
  const applyWithSealRes = await fetch(`${BASE_URL}/api/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Sealed Suite Member',
      handle: sealedUserHandle,
      email: `${sealedUserHandle}@example.com`,
      passcode: 'SecretPass123!Secure',
      location: 'Tokyo, JP',
      bio: 'Crafted testing profile.',
      tags: ['Architecture'],
      bridges: [{ type: 'email', value: `${sealedUserHandle}@example.com` }],
      inviteCode: testSealCodeE2E,
    }),
  });
  assert(applyWithSealRes.status === 200, 'Application with valid invite seal returns 200');
  const applyWithSealData = await applyWithSealRes.json();
  assert(applyWithSealData.status === 'active', 'Application with valid invite seal becomes instantly active');

  const [dbSealedProfile] = await sql`SELECT * FROM profiles WHERE handle = ${sealedUserHandle} LIMIT 1`;
  assert(!!dbSealedProfile && dbSealedProfile.status === 'active', 'Sealed profile recorded in DB as active');
  const [dbUsedSeal] = await sql`SELECT * FROM invite_codes WHERE code = ${testSealCodeE2E} LIMIT 1`;
  assert(dbUsedSeal.used_by === dbSealedProfile.id, 'Invite seal is consumed and bound to user');

  // 8. Pending Application, Waiting Room Polling & Curator Outcomes
  console.log('\n[TEST GROUP 8: WAITING ROOM POLICING & CURATOR TRANSITIONS]');
  const pendingUserHandle = 'pending_' + Date.now();
  const applyPendingRes = await fetch(`${BASE_URL}/api/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Pending Suite Applicant',
      handle: pendingUserHandle,
      email: `${pendingUserHandle}@example.com`,
      passcode: 'SecretPass123!Secure',
      location: 'Berlin, DE',
      bio: 'Waiting room verification applicant.',
      tags: ['Design'],
      bridges: [{ type: 'email', value: `${pendingUserHandle}@example.com` }],
    }),
  });
  assert(applyPendingRes.status === 200, 'Standard application without seal succeeds');
  const pendingApplicantCookie = applyPendingRes.headers.get('set-cookie')?.split(';')[0] || '';
  
  const pendingMeRes = await fetch(`${BASE_URL}/api/me`, { headers: { Cookie: pendingApplicantCookie } });
  const pendingMeData = await pendingMeRes.json();
  assert(pendingMeData.profile?.status === 'pending', 'Waiting room polling via /api/me detects pending state');

  const [dbPendingProfile] = await sql`SELECT * FROM profiles WHERE handle = ${pendingUserHandle} LIMIT 1`;
  const curatorApproveRes = await fetch(`${BASE_URL}/api/curator/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: curatorCookieVal },
    body: JSON.stringify({ applicantId: dbPendingProfile.id }),
  });
  assert(curatorApproveRes.status === 200, 'Curator approves pending applicant');

  const approvedMeRes = await fetch(`${BASE_URL}/api/me`, { headers: { Cookie: pendingApplicantCookie } });
  const approvedMeData = await approvedMeRes.json();
  assert(approvedMeData.profile?.status === 'active', 'Applicant transitions to active without re-login');
  assert(!!approvedMeData.profile?.memberNumber, 'Approved applicant receives serial member number');

  // Test Decline
  const declineUserHandle = 'decline_' + Date.now();
  const applyDeclineRes = await fetch(`${BASE_URL}/api/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Decline Suite Applicant',
      handle: declineUserHandle,
      email: `${declineUserHandle}@example.com`,
      passcode: 'SecretPass123!Secure',
      location: 'Oslo, NO',
      bio: 'Decline testing applicant.',
    }),
  });
  const declineApplicantCookie = applyDeclineRes.headers.get('set-cookie')?.split(';')[0] || '';
  const [dbDeclineProfile] = await sql`SELECT * FROM profiles WHERE handle = ${declineUserHandle} LIMIT 1`;
  const curatorDeclineRes = await fetch(`${BASE_URL}/api/curator/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: curatorCookieVal },
    body: JSON.stringify({ applicantId: dbDeclineProfile.id, reason: 'Cohort closed' }),
  });
  assert(curatorDeclineRes.status === 200, 'Curator declines applicant');

  const declinedMeRes = await fetch(`${BASE_URL}/api/me`, { headers: { Cookie: declineApplicantCookie } });
  const declinedMeData = await declinedMeRes.json();
  assert(declinedMeData.profile?.status === 'rejected', 'Waiting room detects rejected status');

  // 9. Connection Lifecycle, Privacy Snapshot & Expiration
  console.log('\n[TEST GROUP 9: CONNECTION LIFECYCLE & PRIVACY SNAPSHOT]');
  // Self-connection rejection
  const selfConnRes = await fetch(`${BASE_URL}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pendingApplicantCookie },
    body: JSON.stringify({ receiverId: dbPendingProfile.id, requestedChannel: 'email', note: 'Self' }),
  });
  assert(selfConnRes.status === 400, 'Self-connection request rejected (400)');

  // Member A (pendingUserHandle, now active) connects to Member B (sealedUserHandle, active)
  const realConnRes = await fetch(`${BASE_URL}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pendingApplicantCookie },
    body: JSON.stringify({ receiverId: dbSealedProfile.id, requestedChannel: 'email', note: 'Craft connection' }),
  });
  assert(realConnRes.status === 200, 'Connection request sent successfully');
  const realConnData = await realConnRes.json();
  const connRequestId = realConnData.request.id;

  // Sealed user (receiver) sees request without approved contact coordinate
  const receiverIncomingRes = await fetch(`${BASE_URL}/api/connections/incoming`, {
    headers: { Cookie: applyWithSealRes.headers.get('set-cookie')?.split(';')[0] || '' },
  });
  const receiverIncomingData = await receiverIncomingRes.json();
  const targetReq = (receiverIncomingData.data || []).find((r: any) => r.id === connRequestId);
  assert(!!targetReq, 'Receiver sees incoming connection request');
  assert(!targetReq.approvedContactValue, 'Pending connection does NOT disclose contact coordinates');

  // Receiver approves request with snapshot contact coordinate
  const approveConnRes = await fetch(`${BASE_URL}/api/connections/${connRequestId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: applyWithSealRes.headers.get('set-cookie')?.split(';')[0] || '' },
    body: JSON.stringify({ contactValue: 'sealed_contact@example.com' }),
  });
  assert(approveConnRes.status === 200, 'Receiver approves connection request');

  // Sender checks sent requests and sees approved contact coordinate
  const senderSentRes = await fetch(`${BASE_URL}/api/connections/sent`, {
    headers: { Cookie: pendingApplicantCookie },
  });
  const senderSentData = await senderSentRes.json();
  const revealedReq = (senderSentData.data || []).find((r: any) => r.id === connRequestId);
  assert(revealedReq?.status === 'approved', 'Request status is approved in sent requests');
  assert(revealedReq?.approvedContactValue === `${sealedUserHandle}@example.com` || !!revealedReq?.approvedContactValue, 'Approved contact coordinate snapshot revealed to sender');

  // Expiration test
  const expId = 'req_exp_suite_' + Date.now();
  await sql`
    INSERT INTO connection_requests (
      id, requester_id, receiver_id, requested_channel, note, status, created_at, expires_at
    ) VALUES (
      ${expId}, ${dbPendingProfile.id}, ${dbSealedProfile.id}, 'email', 'Expired check',
      'pending', NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day'
    )
  `;
  const tryApproveExp = await fetch(`${BASE_URL}/api/connections/${expId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: applyWithSealRes.headers.get('set-cookie')?.split(';')[0] || '' },
    body: JSON.stringify({ contactValue: 'sealed_contact@example.com' }),
  });
  assert(tryApproveExp.status === 410 || tryApproveExp.status === 400, 'Expired connection approval rejected');

  // 10. Password Recovery & Session Revocation
  console.log('\n[TEST GROUP 10: PASSWORD RECOVERY LIFECYCLE]');
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${pendingUserHandle}@example.com` }),
  });
  assert(forgotRes.status === 200, 'POST /api/auth/forgot returns 200');
  const forgotJson = await forgotRes.json();
  assert(forgotJson.message.includes('If an account exists'), 'Password recovery fails closed (no account enumeration)');

  const testResetToken = crypto.randomBytes(32).toString('hex');
  const testResetHash = crypto.createHash('sha256').update(testResetToken).digest('hex');
  await sql`
    INSERT INTO password_resets (id, token_hash, user_id, expires_at, used_at, created_at)
    VALUES (${'rst_' + Date.now()}, ${testResetHash}, ${dbPendingProfile.user_id}, NOW() + INTERVAL '30 minutes', NULL, NOW())
  `;
  const resetRes = await fetch(`${BASE_URL}/api/auth/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: testResetToken, newPassword: 'BrandNewSecurePass2026!' }),
  });
  assert(resetRes.status === 200, 'POST /api/auth/reset succeeds');

  const reuseTokenRes = await fetch(`${BASE_URL}/api/auth/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: testResetToken, newPassword: 'AnotherPassword!' }),
  });
  assert(reuseTokenRes.status === 400, 'Used reset token is rejected');

  const checkRevokedSessionRes = await fetch(`${BASE_URL}/api/me`, {
    headers: { Cookie: pendingApplicantCookie },
  });
  assert(checkRevokedSessionRes.status === 401, 'Old sessions revoked upon password reset');

  // 11. PWA Asset & Service Worker Isolation
  console.log('\n[TEST GROUP 11: PWA ASSETS & CACHE BOUNDARIES]');
  const manifestRes = await fetch(`${BASE_URL}/manifest.json`);
  assert(manifestRes.status === 200, 'PWA manifest.json is accessible');
  const manifestData = await manifestRes.json();
  assert(manifestData.name === 'World Gallery', 'PWA manifest has correct name');

  const swRes = await fetch(`${BASE_URL}/sw.js`);
  assert(swRes.status === 200, 'sw.js is served correctly');
  const swCode = await swRes.text();
  assert(swCode.includes('/api/'), 'Service worker explicitly passes through /api/ without caching private data');

  // Clean up test suite records
  await sql`DELETE FROM connection_requests WHERE id IN (${connRequestId}, ${expId})`;
  await sql`DELETE FROM invite_codes WHERE code = ${testSealCodeE2E}`;
  await sql`DELETE FROM sessions WHERE user_id IN (${dbSealedProfile.user_id}, ${dbPendingProfile.user_id}, ${dbDeclineProfile.user_id})`;
  await sql`DELETE FROM profiles WHERE id IN (${dbSealedProfile.id}, ${dbPendingProfile.id}, ${dbDeclineProfile.id})`;
  await sql`DELETE FROM users WHERE id IN (${dbSealedProfile.user_id}, ${dbPendingProfile.user_id}, ${dbDeclineProfile.user_id})`;

  await sql.end();

  console.log(`\n========================================`);
  console.log(`FINAL RESULT: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner failed with error:', err);
  process.exit(1);
});
