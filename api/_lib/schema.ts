import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

/**
 * Users Table
 * Core authentication and identity record.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').default('member').notNull(), // 'curator' | 'member'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Profiles Table
 * Member and applicant profiles with gallery display attributes.
 */
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  full_name: text('full_name').notNull(),
  handle: text('handle').notNull().unique(),
  location: text('location').default(''),
  bio: text('bio').default(''),
  avatar_primary: text('avatar_primary'),
  avatar_secondary: text('avatar_secondary'),
  avatar_bg: text('avatar_bg').default('#2D6A4F'),
  tags: jsonb('tags').$type<string[]>().default([]),
  availability: text('availability').default('open'), // 'open' | 'quiet' | 'paused'
  bridges: jsonb('bridges').$type<any[]>().default([]),
  member_number: text('member_number'),
  cohort: text('cohort').default('Cohort 2026'),
  status: text('status').default('active').notNull(), // 'active' | 'pending' | 'rejected'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Connection Requests Table
 * Human-to-human bridge notes and reciprocal coordinates.
 */
export const connection_requests = pgTable('connection_requests', {
  id: text('id').primaryKey(),
  requester_id: text('requester_id').notNull(),
  receiver_id: text('receiver_id').notNull(),
  requested_channel: text('requested_channel').notNull(),
  sender_offered_channel: text('sender_offered_channel'),
  note: text('note').notNull(),
  status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'declined' | 'expired'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
});

/**
 * Curator Daily Approvals Table
 * Tracks daily capacity cap (max 10/day).
 */
export const curator_daily_approvals = pgTable('curator_daily_approvals', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(), // YYYY-MM-DD
  count: integer('count').default(0).notNull(),
});

/**
 * Invite Codes Table
 * Curator-issued seals and usage status.
 */
export const invite_codes = pgTable('invite_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description'),
  created_by: text('created_by'),
  used_by: text('used_by'),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type ConnectionRequest = typeof connection_requests.$inferSelect;
export type NewConnectionRequest = typeof connection_requests.$inferInsert;

export type CuratorDailyApproval = typeof curator_daily_approvals.$inferSelect;
export type InviteCode = typeof invite_codes.$inferSelect;
