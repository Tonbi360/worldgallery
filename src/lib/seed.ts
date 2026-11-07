import bcrypt from 'bcryptjs';
import { getServerDb, schema } from './serverDb';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🏛️  World Gallery — Seeding Curator Account & Initial Data...');

  const db = getServerDb();
  if (!db) {
    console.error('❌ Error: DATABASE_URL environment variable is missing or invalid.');
    console.error('   Please provide DATABASE_URL in your .env file or environment.');
    process.exit(1);
  }

  const curatorEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const rawPasscode = (process.env.ADMIN_PASSCODE || '').trim();

  if (!curatorEmail) {
    console.error('❌ Error: ADMIN_EMAIL environment variable is missing.');
    console.error('   Seeding requires ADMIN_EMAIL to be explicitly provided.');
    process.exit(1);
  }

  if (!rawPasscode) {
    console.error('❌ Error: ADMIN_PASSCODE environment variable is missing.');
    console.error('   Seeding requires ADMIN_PASSCODE to be explicitly provided.');
    process.exit(1);
  }

  const curatorHandle = curatorEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'curator';
  const userId = `usr_curator_${curatorHandle}`;

  try {
    // 1. Check if Curator user already exists
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, curatorEmail))
      .limit(1);

    let resolvedUserId = userId;

    if (existingUser && existingUser.length > 0) {
      console.log(`ℹ️  Curator user already exists (${curatorEmail}). Skipping user creation.`);
      resolvedUserId = existingUser[0].id;
    } else {
      console.log(`🔐 Hashing password with bcrypt (10 rounds)...`);
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(rawPasscode, saltRounds);

      await db.insert(schema.users).values({
        id: resolvedUserId,
        email: curatorEmail,
        password_hash: passwordHash,
        role: 'curator',
        created_at: new Date(),
      });
      console.log(`✅ Created curator user: ${curatorEmail} (role: curator)`);
    }

    // 2. Check if Curator profile exists
    const existingProfile = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.handle, curatorHandle))
      .limit(1);

    if (existingProfile && existingProfile.length > 0) {
      console.log(`ℹ️  Curator profile (@${curatorHandle}) already exists. Skipping profile creation.`);
    } else {
      await db.insert(schema.profiles).values({
        id: `prof_curator_${curatorHandle}`,
        user_id: resolvedUserId,
        full_name: 'Curator',
        handle: curatorHandle,
        location: 'Global',
        bio: 'Curator at World Gallery. Building quiet bridges across human minds.',
        avatar_bg: '#2C2C2E',
        tags: ['curator', 'architecture', 'design'],
        availability: 'open',
        bridges: [
          {
            type: 'email',
            label: 'Curator Email',
            maskedHint: '••••@••••.com',
            unmaskedValue: curatorEmail,
          },
        ],
        member_number: '#0001',
        cohort: 'Founder & Curator',
        status: 'active',
        created_at: new Date(),
      });
      console.log(`✅ Created curator profile: Curator (@${curatorHandle}, #0001)`);
    }

    // 3. Initialize today's approval tracking if not present
    const today = new Date().toISOString().slice(0, 10);
    const existingApproval = await db
      .select()
      .from(schema.curator_daily_approvals)
      .where(eq(schema.curator_daily_approvals.date, today))
      .limit(1);

    if (!existingApproval || existingApproval.length === 0) {
      await db.insert(schema.curator_daily_approvals).values({
        id: `cda_${today}`,
        date: today,
        count: 0,
      });
      console.log(`✅ Initialized daily approvals counter for ${today}`);
    }

    // 4. Seed default invite codes
    const existingSeals = await db
      .select()
      .from(schema.invite_codes)
      .where(eq(schema.invite_codes.code, 'SEAL-FOUNDER'))
      .limit(1);

    if (!existingSeals || existingSeals.length === 0) {
      await db.insert(schema.invite_codes).values([
        {
          id: 'seal_founder',
          code: 'SEAL-FOUNDER',
          description: 'Founding Member Seal',
          created_by: resolvedUserId,
          created_at: new Date(),
        },
        {
          id: 'seal_curator_guest',
          code: 'SEAL-CURATOR',
          description: 'Curator Guest Seal',
          created_by: resolvedUserId,
          created_at: new Date(),
        },
      ]);
      console.log(`✅ Seeded default invite seals (SEAL-FOUNDER, SEAL-CURATOR)`);
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log(`   Curator: ${curatorEmail}`);
    console.log(`   Handle:  @${curatorHandle}`);
    console.log(`   Passcode: [Configured ADMIN_PASSCODE]\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    process.exit(1);
  }
}

seed();
