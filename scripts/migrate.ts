import { neon } from '@neondatabase/serverless';

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL is required to run migrations.');
    process.exit(1);
  }

  console.log('⚡ Running migration via Neon HTTP driver (@neondatabase/serverless)...');
  const sql = neon(databaseUrl);

  try {
    // 1. Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Checked/created table: users');

    // 2. Profiles table
    await sql`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        handle TEXT NOT NULL UNIQUE,
        location TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        avatar_primary TEXT,
        avatar_secondary TEXT,
        avatar_bg TEXT DEFAULT '#2D6A4F',
        tags JSONB DEFAULT '[]'::jsonb,
        availability TEXT DEFAULT 'open',
        bridges JSONB DEFAULT '[]'::jsonb,
        member_number TEXT,
        cohort TEXT DEFAULT 'Cohort 2026',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Checked/created table: profiles');

    // 3. Connection requests table
    await sql`
      CREATE TABLE IF NOT EXISTS connection_requests (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        requested_channel TEXT NOT NULL,
        sender_offered_channel TEXT,
        note TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
    `;
    console.log('✅ Checked/created table: connection_requests');

    // 4. Curator daily approvals table
    await sql`
      CREATE TABLE IF NOT EXISTS curator_daily_approvals (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        count INTEGER NOT NULL DEFAULT 0
      );
    `;
    console.log('✅ Checked/created table: curator_daily_approvals');

    // 5. Invite codes table
    await sql`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        created_by TEXT,
        used_by TEXT,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Checked/created table: invite_codes');

    // 6. Sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Checked/created table: sessions');

    // 7. Password Resets table
    await sql`
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Checked/created table: password_resets');

    // 8. Indexes
    await sql`CREATE INDEX IF NOT EXISTS profiles_status_idx ON profiles (status);`;
    await sql`CREATE INDEX IF NOT EXISTS connection_requests_receiver_id_idx ON connection_requests (receiver_id);`;
    await sql`CREATE INDEX IF NOT EXISTS connection_requests_requester_id_idx ON connection_requests (requester_id);`;
    await sql`CREATE INDEX IF NOT EXISTS password_resets_token_hash_idx ON password_resets (token_hash);`;
    await sql`CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets (user_id);`;
    console.log('✅ Checked/created indexes');

    console.log('🎉 Migration finished successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
