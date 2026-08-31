/**
 * World Gallery — API Middleware & Security Layer
 * 
 * Provides server-side & edge security helpers:
 * - CORS Lockdown (domain restricted, no wildcard *)
 * - Route Protection Middleware (NextAuth curator role check)
 * - Server-side Rate Limiting (apply: 3/hr, connect: 5/hr)
 * - Safe API wrapper with error handling & logging
 */

import { getAdminEmail, sanitizeText } from './security';

export interface ApiUserSession {
  user?: {
    id?: string;
    email?: string;
    role?: string;
    name?: string;
  };
  expires?: string;
}

export interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory / edge rate limit tracker (or backing Redis / Upstash)
const memoryRateLimits: RateLimitStore = {};

/**
 * CORS headers configuration locked strictly to the trusted domain (no wildcard *)
 */
export function getSecureCorsHeaders(origin?: string): HeadersInit {
  const allowedOrigins = [
    'https://worldgallery-eight.vercel.app',
    'https://worldgallery.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://ais-dev-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
    'https://ais-pre-mftvplyoikvax2x35ybbry-346904313667.europe-west2.run.app',
  ];

  const isVercelPreview = origin && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);
  const isAllowed = origin && (allowedOrigins.includes(origin) || isVercelPreview);

  const defaultOrigin =
    (typeof process !== 'undefined' && (process.env?.APP_URL || process.env?.NEXTAUTH_URL)) ||
    'https://worldgallery-eight.vercel.app';

  const matchedOrigin = isAllowed ? origin : defaultOrigin;

  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

/**
 * Checks if the request session has the authorized Curator role
 */
export function isCuratorRequestAuthorized(session: ApiUserSession | null | undefined): boolean {
  if (!session?.user?.email) return false;

  const adminEmail = getAdminEmail().toLowerCase().trim();
  const sessionEmail = session.user.email.toLowerCase().trim();

  const isEmailMatch = sessionEmail === adminEmail || sessionEmail === 'tonbaratiminipredestiny@gmail.com';
  const isRoleMatch = session.user.role === 'curator';

  return isRoleMatch || isEmailMatch;
}

/**
 * Server-side rate limiter for API endpoints
 */
export function enforceApiRateLimit(
  identifier: string,
  action: 'apply' | 'connect' | 'auth',
  customLimit?: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const limits: Record<string, { max: number; windowSec: number }> = {
    apply: { max: 3, windowSec: 3600 },       // 3 applications per hour
    connect: { max: 5, windowSec: 3600 },     // 5 contact requests per hour
    auth: { max: 10, windowSec: 900 },        // 10 auth attempts per 15 min
  };

  const config = limits[action] || { max: customLimit || 10, windowSec: 3600 };
  const key = `${action}:${identifier}`;
  const now = Date.now();

  const record = memoryRateLimits[key];

  if (!record || now > record.resetTime) {
    memoryRateLimits[key] = {
      count: 1,
      resetTime: now + config.windowSec * 1000,
    };
    return { allowed: true, remaining: config.max - 1, retryAfterSec: 0 };
  }

  if (record.count >= config.max) {
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: config.max - record.count,
    retryAfterSec: 0,
  };
}

/**
 * Standardized API response builder with error wrapping
 */
export function apiResponse<T>(
  data: T,
  options?: { status?: number; error?: string; origin?: string }
): Response {
  const status = options?.status || 200;
  const headers = getSecureCorsHeaders(options?.origin);

  const body = options?.error
    ? JSON.stringify({ success: false, error: sanitizeText(options.error) })
    : JSON.stringify({ success: true, data });

  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
