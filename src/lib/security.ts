import DOMPurify from 'dompurify';

export const ADMIN_EMAIL_FALLBACK = 'tonbaratiminipredestiny@gmail.com';

export interface UserSession {
  email: string;
  role: 'curator' | 'member' | 'applicant';
  name?: string;
  id?: string;
}

/**
 * Validates and checks if a session has Curator permissions.
 * Gated by NextAuth/session role === 'curator' or email matching ADMIN_EMAIL.
 */
export function isCuratorSession(session?: UserSession | null): boolean {
  if (!session) return false;
  if (session.role === 'curator') return true;

  const adminEmail = getAdminEmail().toLowerCase().trim();
  if (session.email && session.email.toLowerCase().trim() === adminEmail) {
    return true;
  }

  return false;
}

export function getAdminEmail(): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;
  return (
    (typeof process !== 'undefined' && process.env?.ADMIN_EMAIL) ||
    metaEnv?.VITE_ADMIN_EMAIL ||
    ADMIN_EMAIL_FALLBACK
  );
}

export function getAppUrl(): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;
  return (
    (typeof process !== 'undefined' && (process.env?.APP_URL || process.env?.NEXTAUTH_URL)) ||
    metaEnv?.VITE_APP_URL ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  );
}

/**
 * Sanitizes raw string inputs against XSS and injection attacks.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (typeof window !== 'undefined') {
    return DOMPurify.sanitize(trimmed, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  // Server-side fallback regex strip
  return trimmed.replace(/[<>]/g, '');
}

/**
 * Sanitizes arrays of strings (e.g. craft tags).
 */
export function sanitizeStringArray(tags: string[] = []): string[] {
  return tags
    .map((t) => sanitizeText(t).toLowerCase().replace(/[^a-z0-9-_ ]/g, ''))
    .filter(Boolean);
}

/* ==========================================================================
   RATE LIMITING (Client + Edge/API compliant)
   - /api/apply: Max 3 submissions per hour
   - /api/connect/request: Max 5 bridge requests per hour
   ========================================================================== */

interface RateLimitRecord {
  timestamps: number[];
}

const RATE_LIMIT_PREFIX = 'wg_ratelimit_';

export function checkClientRateLimit(
  actionKey: 'apply' | 'connect',
  maxAllowed: number = actionKey === 'apply' ? 3 : 5,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  if (typeof window === 'undefined') {
    return { allowed: true, remaining: maxAllowed, retryAfterSec: 0 };
  }

  const storageKey = `${RATE_LIMIT_PREFIX}${actionKey}`;
  const now = Date.now();
  let record: RateLimitRecord = { timestamps: [] };

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      record = JSON.parse(raw);
    }
  } catch {
    record = { timestamps: [] };
  }

  // Filter timestamps within the rolling window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxAllowed) {
    const oldestTimestamp = validTimestamps[0] || now;
    const retryAfterSec = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  return {
    allowed: true,
    remaining: maxAllowed - validTimestamps.length,
    retryAfterSec: 0,
  };
}

export function recordClientAction(actionKey: 'apply' | 'connect'): void {
  if (typeof window === 'undefined') return;
  const storageKey = `${RATE_LIMIT_PREFIX}${actionKey}`;
  const now = Date.now();
  let record: RateLimitRecord = { timestamps: [] };

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      record = JSON.parse(raw);
    }
  } catch {
    record = { timestamps: [] };
  }

  const validTimestamps = record.timestamps.filter((ts) => now - ts < 60 * 60 * 1000);
  validTimestamps.push(now);
  localStorage.setItem(storageKey, JSON.stringify({ timestamps: validTimestamps }));
}

/* ==========================================================================
   IMAGE UPLOAD & MIME VALIDATION (Max 5MB, JPEG/PNG/WebP, Canvas Downscaler)
   ========================================================================== */

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface OptimizedImageResult {
  valid: boolean;
  error?: string;
  dataUrl?: string;
  uuidFileName?: string;
  originalName?: string;
  sizeBytes?: number;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'img_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * Validates MIME type, file size, and optimizes image resolution and compression.
 */
export async function validateAndOptimizeImage(file: File, maxDimension: number = 1200): Promise<OptimizedImageResult> {
  // 1. MIME Validation
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.',
    };
  }

  // 2. File Size Validation (Max 5MB)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 5MB.`,
    };
  }

  // 3. Generate secure UUID filename
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const uuidFileName = `${generateUUID()}.${ext}`;

  // 4. Canvas-based optimization and resolution normalization
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve({ valid: false, error: 'Could not read image file.' });
    };

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        resolve({ valid: false, error: 'Failed to decode image data.' });
      };

      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve({
            valid: true,
            dataUrl: reader.result as string,
            uuidFileName,
            originalName: file.name,
            sizeBytes: file.size,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP or JPEG with quality factor
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = 0.88;
        const optimizedDataUrl = canvas.toDataURL(outputMime, quality);

        resolve({
          valid: true,
          dataUrl: optimizedDataUrl,
          uuidFileName,
          originalName: file.name,
          sizeBytes: Math.round((optimizedDataUrl.length * 3) / 4),
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/* ==========================================================================
   ENVIRONMENT VARIABLE VALIDATION & FAIL-FAST AUDITING
   ========================================================================== */

export interface EnvValidationReport {
  isValid: boolean;
  missingVars: string[];
  warnings: string[];
}

export function auditEnvironmentVariables(): EnvValidationReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  const isBrowser = typeof window !== 'undefined';
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;

  if (isBrowser) {
    // Client-side environment audit (VITE_ prefixed only)
    if (!metaEnv?.VITE_ADMIN_EMAIL) {
      warnings.push(`VITE_ADMIN_EMAIL is not set in browser. Using fallback curator identity (${ADMIN_EMAIL_FALLBACK}).`);
      console.info(`[World Gallery Audit] Client: VITE_ADMIN_EMAIL not set, using fallback (${ADMIN_EMAIL_FALLBACK}).`);
    } else {
      console.info(`[World Gallery Audit] Client: Loaded VITE_ADMIN_EMAIL (${metaEnv.VITE_ADMIN_EMAIL}).`);
    }
  } else {
    // Serverless / Node environment audit
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
      missing.push('DATABASE_URL');
      console.error('❌ [World Gallery Boot] Missing required server variable: DATABASE_URL. Database connection will fail.');
    }
    if (!process.env.ADMIN_EMAIL) {
      missing.push('ADMIN_EMAIL');
      console.error('❌ [World Gallery Boot] Missing required server variable: ADMIN_EMAIL.');
    }
    if (!process.env.ADMIN_PASSCODE) {
      missing.push('ADMIN_PASSCODE');
      console.error('❌ [World Gallery Boot] Missing required server variable: ADMIN_PASSCODE.');
    }
  }

  const adminEmail = getAdminEmail();
  if (adminEmail === ADMIN_EMAIL_FALLBACK && !warnings.some(w => w.includes('fallback'))) {
    warnings.push(`Using fallback curator identity (${ADMIN_EMAIL_FALLBACK}).`);
  }

  return {
    isValid: missing.length === 0,
    missingVars: missing,
    warnings,
  };
}

/* ==========================================================================
   PRODUCTION LOGGING UTILITY
   ========================================================================== */

export function logError(error: unknown, context?: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[WorldGallery ${context || 'App'}]`, error);
  } else {
    // Structured production logging (ready for Sentry / Cloud Logging)
    const errObj = error instanceof Error ? { message: error.message, stack: error.stack } : { raw: String(error) };
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), context, error: errObj }));
  }
}
