import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

async function clean() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ FATAL: DATABASE_URL is strictly required.');
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPasscode = process.env.ADMIN_PASSCODE?.trim();

  if (!adminEmail || !adminPasscode) {
    console.error('❌ FATAL: ADMIN_EMAIL and ADMIN_PASSCODE environment variables are strictly required to reseed the curator.');
    process.exit(1);
  }

  console.log('⚡ Connecting to Neon database...');
  const sql = neon(databaseUrl);

  try {
    console.log('🧹 Executing TRUNCATE users, profiles, connection_requests, invite_codes, curator_daily_approvals, sessions, password_resets CASCADE...');
    await sql`
      TRUNCATE users, profiles, connection_requests, invite_codes, curator_daily_approvals, sessions, password_resets CASCADE
    `;
    console.log('✅ All application tables truncated cleanly.');

    console.log(`🌱 Reseeding curator strictly from env (${adminEmail})...`);
    const passwordHash = await bcrypt.hash(adminPasscode, 10);
    const curatorHandle = adminEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'curator';
    const curatorUserId = `usr_curator_${curatorHandle}`;

    // 1. Insert Curator user
    await sql`
      INSERT INTO users (id, email, password_hash, role, created_at)
      VALUES (${curatorUserId}, ${adminEmail}, ${passwordHash}, 'curator', NOW())
    `;

    // 2. Insert Curator profile
    const tagsJson = JSON.stringify(['curator', 'architecture', 'design']);
    const bridgesJson = JSON.stringify([
      {
        type: 'email',
        label: 'Curator Email',
        maskedHint: '••••@••••.com',
        unmaskedValue: adminEmail,
      },
    ]);

    await sql`
      INSERT INTO profiles (
        id, user_id, full_name, handle, location, bio,
        avatar_primary, avatar_secondary, avatar_bg, tags,
        availability, bridges, member_number, cohort, status, created_at
      ) VALUES (
        ${curatorUserId}, ${curatorUserId}, 'Curator', ${curatorHandle}, 'Global',
        'Curator at World Gallery. Building quiet bridges across human minds.',
        NULL, NULL, '#2D6A4F', ${tagsJson}::jsonb,
        'open', ${bridgesJson}::jsonb, '#0001', 'Founder & Curator', 'active', NOW()
      )
    `;

    // 3. Initialize today's approval quota record
    const today = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO curator_daily_approvals (id, date, count)
      VALUES (${`quota_${today}`}, ${today}, 0)
      ON CONFLICT (date) DO NOTHING
    `;

    // 4. Seed initial curator seals
    await sql`
      INSERT INTO invite_codes (id, code, description, created_by, created_at)
      VALUES 
        ('seal_founder', 'SEAL-FOUNDER', 'Founding member instant admission seal', 'curator', NOW()),
        ('seal_curator', 'SEAL-CURATOR', 'Curator direct admission seal', 'curator', NOW())
      ON CONFLICT (code) DO NOTHING
    `;

    console.log('✅ Curator and initial records reseeded successfully.');

    // Report resulting row counts
    const [usersCount] = await sql`SELECT COUNT(*)::int as count FROM users`;
    const [profilesCount] = await sql`SELECT COUNT(*)::int as count FROM profiles`;
    const [connectionsCount] = await sql`SELECT COUNT(*)::int as count FROM connection_requests`;
    const [invitesCount] = await sql`SELECT COUNT(*)::int as count FROM invite_codes`;
    const [curatorQuotaCount] = await sql`SELECT COUNT(*)::int as count FROM curator_daily_approvals`;
    const [sessionsCount] = await sql`SELECT COUNT(*)::int as count FROM sessions`;

    console.log('\n📊 RESULTING ROW COUNTS:');
    console.log(` - users:                   ${usersCount.count}`);
    console.log(` - profiles:                ${profilesCount.count}`);
    console.log(` - connection_requests:     ${connectionsCount.count}`);
    console.log(` - invite_codes:            ${invitesCount.count}`);
    console.log(` - curator_daily_approvals: ${curatorQuotaCount.count}`);
    console.log(` - sessions:                ${sessionsCount.count}\n`);

  } catch (err) {
    console.error('❌ Clean slate execution failed:', err);
    process.exit(1);
  }
}

clean();
