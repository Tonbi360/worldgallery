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

  const curatorEmail = (process.env.ADMIN_EMAIL || 'tonbaratiminipredestiny@gmail.com').toLowerCase().trim();
  const rawPasscode = process.env.ADMIN_PASSCODE || 'world2026';

  try {
    // 1. Check if Curator user already exists
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, curatorEmail))
      .limit(1);

    let userId = 'usr_curator_tonbara';

    if (existingUser && existingUser.length > 0) {
      console.log(`ℹ️  Curator user already exists (${curatorEmail}). Skipping user creation.`);
      userId = existingUser[0].id;
    } else {
      console.log(`🔐 Hashing password with bcrypt (10 rounds)...`);
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(rawPasscode, saltRounds);

      await db.insert(schema.users).values({
        id: userId,
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
      .where(eq(schema.profiles.handle, 'tonbara'))
      .limit(1);

    if (existingProfile && existingProfile.length > 0) {
      console.log(`ℹ️  Curator profile (@tonbara) already exists. Skipping profile creation.`);
    } else {
      await db.insert(schema.profiles).values({
        id: 'prof_curator_tonbara',
        user_id: userId,
        full_name: 'Tonbara',
        handle: 'tonbara',
        location: 'Walden / Global',
        bio: 'Curator at World Gallery. Building quiet bridges across human minds.',
        avatar_bg: '#2C2C2E',
        tags: ['curator', 'architecture', 'design', 'philosophy'],
        availability: 'open',
        bridges: [
          {
            type: 'email',
            label: 'Curator Email',
            maskedHint: 't•••@g•••.com',
            unmaskedValue: curatorEmail,
          },
        ],
        member_number: '#0001',
        cohort: 'Founder & Curator',
        status: 'active',
        created_at: new Date(),
      });
      console.log(`✅ Created curator profile: Tonbara (@tonbara, #0001)`);
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
      .where(eq(schema.invite_codes.code, 'SEAL-WALDEN'))
      .limit(1);

    if (!existingSeals || existingSeals.length === 0) {
      await db.insert(schema.invite_codes).values([
        {
          id: 'seal_walden_founder',
          code: 'SEAL-WALDEN',
          description: 'Founding Member Seal issued by Tonbara',
          created_by: userId,
          created_at: new Date(),
        },
        {
          id: 'seal_curator_guest',
          code: 'SEAL-CURATOR',
          description: 'Curator Guest Seal',
          created_by: userId,
          created_at: new Date(),
        },
      ]);
      console.log(`✅ Seeded default invite seals (SEAL-WALDEN, SEAL-CURATOR)`);
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log(`   Curator: ${curatorEmail}`);
    console.log(`   Handle:  @tonbara`);
    console.log(`   Passcode: ${rawPasscode === 'world2026' ? 'world2026 (default)' : '[Configured ADMIN_PASSCODE]'}\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    process.exit(1);
  }
}

seed();
