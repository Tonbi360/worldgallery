/**
 * World Gallery — Database Data Service & Query Layer
 * 
 * Provides client-side data operations, secure API bridges, and schema mappings for:
 * - Profiles (read/write/list)
 * - Users & Curator Authentication (lookup, verification)
 * - Connection Requests (insert, query by receiver/requester, status updates)
 * - Curator Approvals & Invite Codes
 */

import { GalleryMember, ContactBridge } from '../types/gallery';
import { PendingApplicant } from '../types/admin';
import { IncomingRequest, SentRequest } from '../types/activity';
import { sanitizeText, sanitizeStringArray, getAdminEmail } from './security';
import type { ConnectionRequest } from '../../drizzle/schema';

// ==========================================
// 1. PROFILES QUERY LAYER
// ==========================================

export async function dbGetProfileByHandle(handle: string): Promise<GalleryMember | null> {
  const cleanHandle = sanitizeText(handle).toLowerCase().replace(/^@/, '');
  try {
    const res = await fetch(`/api/profiles/${encodeURIComponent(cleanHandle)}`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data?.data) return data.data;
    }
  } catch (error) {
    console.warn('[DataService] API profile lookup notice:', error);
  }
  return null;
}

export async function dbGetAllActiveProfiles(): Promise<GalleryMember[]> {
  try {
    const res = await fetch('/api/profiles').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) return data.data;
    }
  } catch (error) {
    console.warn('[DataService] API profiles fetch notice:', error);
  }
  return [];
}

export function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

export async function dbUpsertProfile(profile: GalleryMember, _userId?: string): Promise<boolean> {
  try {
    const cleanHandle = sanitizeText(profile.handle).toLowerCase().replace(/^@/, '');
    const sanitized = {
      ...profile,
      fullName: sanitizeText(profile.fullName),
      handle: cleanHandle,
      location: sanitizeText(profile.location),
      bio: sanitizeText(profile.bio),
      tags: sanitizeStringArray(profile.tags),
    };

    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sanitized),
    }).catch(() => null);

    return !!(res && res.ok);
  } catch (error) {
    console.warn('[DataService] Error in dbUpsertProfile:', error);
    return false;
  }
}

// ==========================================
// 2. CURATOR & APPLICANTS QUERY LAYER
// ==========================================

function getCuratorHeaders(): Record<string, string> {
  return getAuthHeaders();
}

export async function dbGetPendingApplicants(): Promise<PendingApplicant[]> {
  try {
    const res = await fetch('/api/curator/applicants', {
      headers: getCuratorHeaders(),
    }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) return data.data;
    }
  } catch (error) {
    console.warn('[DataService] Error in dbGetPendingApplicants:', error);
  }
  return [];
}

export async function dbApproveApplicant(applicantId: string): Promise<{ success: boolean; error?: string; member?: GalleryMember }> {
  try {
    const res = await fetch('/api/curator/approve', {
      method: 'POST',
      headers: getCuratorHeaders(),
      body: JSON.stringify({ applicantId: sanitizeText(applicantId) }),
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      return { success: true, member: data.member };
    }
  } catch (error) {
    console.warn('[DataService] Error in dbApproveApplicant:', error);
  }
  return { success: true };
}

export async function dbDeclineApplicant(applicantId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/curator/decline', {
      method: 'POST',
      headers: getCuratorHeaders(),
      body: JSON.stringify({ applicantId: sanitizeText(applicantId) }),
    }).catch(() => null);

    return !!(res && res.ok);
  } catch (error) {
    console.warn('[DataService] Error in dbDeclineApplicant:', error);
    return true;
  }
}

// ==========================================
// 3. USER AUTHENTICATION QUERY LAYER
// ==========================================

export async function dbVerifyUserCredentials(
  email: string,
  passcode: string
): Promise<{ verified: boolean; user?: { id: string; email: string; role: string; name?: string }; profile?: any; error?: string }> {
  const cleanEmail = sanitizeText(email).toLowerCase().trim();

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, passcode }),
    }).catch(() => null);

    if (!res) {
      return {
        verified: false,
        error: navigator.onLine ? "The gallery couldn't be reached. Try again." : "No connection. Check your internet and try again.",
      };
    }

    if (res.status >= 500) {
      return {
        verified: false,
        error: "The gallery couldn't be reached. Try again.",
      };
    }

    const data = await res.json().catch(() => null);

    if (res.ok && data?.verified) {
      return { verified: true, user: data.user, profile: data.profile };
    }

    return {
      verified: false,
      error: data?.error || (res.status === 401 ? 'Incorrect email or password.' : "The gallery couldn't be reached. Try again."),
    };
  } catch {
    return {
      verified: false,
      error: "The gallery couldn't be reached. Try again.",
    };
  }
}

export async function dbGetMe(): Promise<{ ok: boolean; user?: any; profile?: any }> {
  try {
    const res = await fetch('/api/me');
    if (res && res.ok) {
      const data = await res.json();
      return { ok: true, user: data.user, profile: data.profile };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function dbLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // continue
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('wg_session_token');
    localStorage.removeItem('wg_user_session');
    localStorage.removeItem('wg_auth_user');
    localStorage.removeItem('wg_curator_session_authenticated');
    localStorage.removeItem('wg_admin_session_authenticated');
  }
}

// ==========================================
// 4. CONNECTION REQUESTS QUERY LAYER
// ==========================================

export async function dbInsertConnectionRequest(params: {
  requesterId: string;
  receiverId: string;
  requestedChannel: string;
  senderOfferedChannel?: string;
  note: string;
}): Promise<{ success: boolean; request?: Partial<ConnectionRequest>; error?: string }> {
  const newId = `req_${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const payload = {
    id: newId,
    receiverId: sanitizeText(params.receiverId),
    requestedChannel: sanitizeText(params.requestedChannel),
    senderOfferedChannel: params.senderOfferedChannel ? sanitizeText(params.senderOfferedChannel) : undefined,
    note: sanitizeText(params.note),
  };

  try {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (res && !res.ok) {
      const errData = await res.json().catch(() => null);
      return {
        success: false,
        error: errData?.error || 'Failed to send connection request',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error sending connection request',
    };
  }

  return {
    success: true,
    request: {
      id: newId,
      requester_id: params.requesterId,
      receiver_id: params.receiverId,
      requested_channel: params.requestedChannel,
      sender_offered_channel: params.senderOfferedChannel || null,
      note: sanitizeText(params.note),
      status: 'pending',
      created_at: now,
      expires_at: expiresAt,
    },
  };
}

export async function dbGetIncomingRequestsForReceiver(receiverId?: string): Promise<IncomingRequest[]> {
  try {
    const url = receiverId
      ? `/api/connections/incoming?receiverId=${encodeURIComponent(sanitizeText(receiverId))}`
      : '/api/connections/incoming';
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) return data.data;
    }
  } catch {
    // fallback
  }
  return [];
}

export async function dbGetSentRequestsForRequester(requesterId?: string): Promise<SentRequest[]> {
  try {
    const url = requesterId
      ? `/api/connections/sent?requesterId=${encodeURIComponent(sanitizeText(requesterId))}`
      : '/api/connections/sent';
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) return data.data;
    }
  } catch {
    // fallback
  }
  return [];
}

export async function dbApproveConnectionRequest(requestId: string): Promise<{ success: boolean; request?: any; error?: string }> {
  try {
    const res = await fetch(`/api/connections/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: requestId }),
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      return { success: true, request: data.request };
    }
    const errData = await res?.json().catch(() => null);
    return { success: false, error: errData?.error || 'Failed to approve request' };
  } catch (err: any) {
    console.warn('[DataService] Error in dbApproveConnectionRequest:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

export async function dbDeclineConnectionRequest(requestId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/connections/${encodeURIComponent(requestId)}/decline`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: requestId }),
    }).catch(() => null);

    return !!(res && res.ok);
  } catch (err) {
    console.warn('[DataService] Error in dbDeclineConnectionRequest:', err);
    return false;
  }
}

// ==========================================
// 5. INVITATION SEALS QUERY LAYER (SERVER-AUTHORITATIVE)
// ==========================================

export interface ServerInviteSeal {
  id: string;
  code: string;
  description: string | null;
  createdBy: string | null;
  usedBy: string | null;
  usedAt: string | null;
  createdAt: string;
  status: 'active' | 'used' | 'revoked';
}

export async function dbGetInviteSeals(): Promise<ServerInviteSeal[]> {
  try {
    const res = await fetch('/api/curator/seal', { headers: getAuthHeaders() }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        return data.data.map((s: any) => ({
          id: s.id,
          code: s.code,
          description: s.description || '',
          createdBy: s.created_by,
          usedBy: s.used_by,
          usedAt: s.used_at,
          createdAt: s.created_at,
          status: s.used_by ? 'used' : 'active',
        }));
      }
    }
  } catch (error) {
    console.warn('[DataService] Error in dbGetInviteSeals:', error);
  }
  return [];
}

export async function dbCreateInviteSeal(
  note?: string,
  code?: string
): Promise<{ success: boolean; seal?: ServerInviteSeal; error?: string }> {
  try {
    const res = await fetch('/api/curator/seal', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ description: note, code }),
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      const s = data.seal;
      return {
        success: true,
        seal: {
          id: s.id,
          code: s.code,
          description: s.description || '',
          createdBy: s.created_by,
          usedBy: s.used_by,
          usedAt: s.used_at,
          createdAt: s.created_at,
          status: s.used_by ? 'used' : 'active',
        },
      };
    }
    const errData = await res?.json().catch(() => null);
    return { success: false, error: errData?.error || 'Failed to forge seal' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error forging seal' };
  }
}

export async function dbDeleteInviteSeal(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/curator/seal/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => null);
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

export async function dbGetCuratorStats(): Promise<{
  activeCount: number;
  pendingCount: number;
  approvalsToday: number;
  dailyCap: number;
}> {
  try {
    const res = await fetch('/api/curator/stats', { headers: getAuthHeaders() }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data?.stats) return data.stats;
    }
  } catch {
    // fallback
  }
  return { activeCount: 0, pendingCount: 0, approvalsToday: 0, dailyCap: 10 };
}

