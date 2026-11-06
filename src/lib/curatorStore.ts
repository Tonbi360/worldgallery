import {
  PendingApplicant,
  InviteSeal,
  CuratorTelemetry,
} from '../types/admin';
import { GalleryMember } from '../types/gallery';
import { getAllGalleryMembers, saveAllGalleryMembers } from './userProfile';
import { isCuratorSession, getAdminEmail, sanitizeText, sanitizeStringArray } from './security';
import {
  dbGetPendingApplicants,
  dbApproveApplicant,
  dbDeclineApplicant,
} from './dataService';

const PENDING_STORAGE_KEY = 'wg_curator_pending_applicants';
const SEALS_STORAGE_KEY = 'wg_curator_invite_seals';
const DAILY_APPROVALS_KEY = 'wg_curator_daily_approvals';
const ADMIN_SESSION_KEY = 'wg_curator_session_authenticated';
const USER_SESSION_KEY = 'wg_user_session';

interface DailyApprovalRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * In Phase 2, server session derived from PostgreSQL is the sole authority for curator authorization.
 * LocalStorage keys must not grant curator access.
 */
export function isCuratorAuthenticated(): boolean {
  // Always return false from client storage checks; useAuth() is the sole authority.
  return false;
}

export function setCuratorAuthenticated(value: boolean, _email?: string, _name?: string, _handle?: string): void {
  if (typeof window === 'undefined') return;
  if (!value) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(USER_SESSION_KEY);
  }
}

export function authenticateCurator(_passwordOrEmail: string): boolean {
  // In Phase 2, client-side passcode matching is disabled. All authentication flows through /api/auth/verify.
  return false;
}

export async function fetchPendingApplicantsFromDb(): Promise<PendingApplicant[]> {
  try {
    const dbApplicants = await dbGetPendingApplicants();
    if (dbApplicants && dbApplicants.length > 0) {
      savePendingApplicants(dbApplicants);
      return dbApplicants;
    }
  } catch (error) {
    console.warn('[Database] Falling back to local pending applicants:', error);
  }
  return getPendingApplicants();
}

export function getPendingApplicants(): PendingApplicant[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePendingApplicants(applicants: PendingApplicant[]): void {
  if (typeof window === 'undefined') return;
  // Sanitize all applicants before saving
  const sanitized = applicants.map((app) => ({
    ...app,
    fullName: sanitizeText(app.fullName),
    handle: sanitizeText(app.handle).toLowerCase().replace(/^@/, ''),
    location: sanitizeText(app.location),
    bio: sanitizeText(app.bio),
    tags: sanitizeStringArray(app.tags),
  }));
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(sanitized));
}

export function getDailyApprovalCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(DAILY_APPROVALS_KEY);
    if (!raw) return 0;
    const record: DailyApprovalRecord = JSON.parse(raw);
    if (record.date === today) {
      return record.count || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function incrementDailyApprovalCount(): number {
  if (typeof window === 'undefined') return 1;
  const today = new Date().toISOString().slice(0, 10);
  const current = getDailyApprovalCount();
  const next = current + 1;
  localStorage.setItem(DAILY_APPROVALS_KEY, JSON.stringify({ date: today, count: next }));
  return next;
}

export async function approveApplicantAsync(applicantId: string): Promise<{ success: boolean; error?: string; member?: GalleryMember }> {
  try {
    const dbRes = await dbApproveApplicant(applicantId);
    if (dbRes && dbRes.success && dbRes.member) {
      const applicants = getPendingApplicants().filter((a) => a.id !== applicantId);
      savePendingApplicants(applicants);
      const existingMembers = getAllGalleryMembers().filter((m) => m.id !== dbRes.member?.id);
      saveAllGalleryMembers([dbRes.member, ...existingMembers]);
      incrementDailyApprovalCount();
      return dbRes;
    }
    return { success: false, error: dbRes?.error || 'Curator approval failed on the server.' };
  } catch (err: any) {
    console.warn('[CuratorStore] Database approve request notice:', err);
    return { success: false, error: err?.message || 'Failed to reach server' };
  }
}

export function approveApplicant(applicantId: string): { success: boolean; error?: string; member?: GalleryMember } {
  const currentApprovals = getDailyApprovalCount();
  if (currentApprovals >= 10) {
    return {
      success: false,
      error: 'Daily curation quota reached (10/10). The pace of welcoming resumes at dawn.',
    };
  }

  const applicants = getPendingApplicants();
  const target = applicants.find((a) => a.id === applicantId);
  if (!target) {
    return { success: false, error: 'Applicant record not found.' };
  }

  // Calculate next member sequence number
  const existingMembers = getAllGalleryMembers();
  const nextSerial = String(existingMembers.length + 1).padStart(4, '0');

  const newMember: GalleryMember = {
    id: `mem-${target.handle.replace(/[^a-zA-Z0-9]/g, '') || Date.now()}`,
    fullName: sanitizeText(target.fullName),
    handle: sanitizeText(target.handle).toLowerCase().replace(/^@/, ''),
    location: sanitizeText(target.location),
    bio: sanitizeText(target.bio),
    tags: sanitizeStringArray(target.tags),
    availability: target.availability,
    avatarBg: target.avatarBg,
    avatarUrl: target.avatarUrl,
    photos: target.photos || (target.avatarUrl ? [target.avatarUrl] : []),
    memberNumber: `#${nextSerial}`,
    cohort: 'Cohort 2026',
    bridges: target.bridges,
  };

  // Add to active directory
  const updatedMembers = [newMember, ...existingMembers];
  saveAllGalleryMembers(updatedMembers);

  // Remove from pending applicants
  const remaining = applicants.filter((a) => a.id !== applicantId);
  savePendingApplicants(remaining);

  // Increment daily counter
  incrementDailyApprovalCount();

  // Non-blocking database update
  dbApproveApplicant(applicantId).catch(() => {});

  return { success: true, member: newMember };
}

export function declineApplicant(applicantId: string, _note?: string): boolean {
  const applicants = getPendingApplicants();
  const remaining = applicants.filter((a) => a.id !== applicantId);
  savePendingApplicants(remaining);

  // Non-blocking database update
  dbDeclineApplicant(applicantId).catch(() => {});

  return true;
}

export function getInviteSeals(): InviteSeal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEALS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveInviteSeals(seals: InviteSeal[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEALS_STORAGE_KEY, JSON.stringify(seals));
}

export function createInviteSeal(description: string, customCode?: string): InviteSeal {
  if (!isCuratorAuthenticated()) {
    throw new Error('Unauthorized: Only an authenticated Curator can forge invitation seals.');
  }

  const rawCode = customCode?.trim() || `SEAL-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanCode = sanitizeText(rawCode).toUpperCase().replace(/[^A-Z0-9-]/g, '');

  const newSeal: InviteSeal = {
    id: `seal-${Date.now()}`,
    code: cleanCode,
    description: sanitizeText(description) || 'Direct curator invitation',
    createdAt: new Date().toISOString(),
    status: 'active',
  };

  const current = getInviteSeals();
  const updated = [newSeal, ...current];
  saveInviteSeals(updated);
  return newSeal;
}

export function deleteInviteSeal(sealId: string): void {
  if (!isCuratorAuthenticated()) {
    throw new Error('Unauthorized: Only an authenticated Curator can revoke invitation seals.');
  }

  const current = getInviteSeals();
  const updated = current.filter((s) => s.id !== sealId);
  saveInviteSeals(updated);
}

export function getCuratorTelemetry(): CuratorTelemetry {
  const members = getAllGalleryMembers();
  const pending = getPendingApplicants().filter((a) => a.status === 'pending');
  const dailyCount = getDailyApprovalCount();
  const totalBridges = members.reduce((acc, m) => acc + (m.bridges?.length || 0), 0);

  return {
    verifiedHumans: members.length,
    restingRequests: pending.length,
    activeBridges: totalBridges,
    approvedToday: dailyCount,
    dailyCap: 10,
  };
}
