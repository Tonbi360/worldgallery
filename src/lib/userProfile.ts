import { GalleryMember, ContactBridge } from '../types/gallery';
import { ContactChannelType, RESERVED_SYSTEM_HANDLES } from '../types/apply';
import { sanitizeText, sanitizeStringArray } from './security';
import { dbGetAllActiveProfiles, dbGetProfileByHandle, dbUpsertProfile } from './dataService';

export const CURRENT_USER_STORAGE_KEY = 'wg_current_user_profile';
export const USER_PROFILE_UPDATE_EVENT = 'wg_user_profile_updated';
export const ALL_MEMBERS_STORAGE_KEY = 'wg_all_gallery_members';

export const DEFAULT_CURRENT_USER: GalleryMember = {
  id: 'mem-user',
  fullName: '',
  handle: '',
  location: '',
  bio: '',
  tags: [],
  availability: 'open',
  avatarBg: '#1C1C1E',
  memberNumber: '',
  cohort: 'Cohort 2026',
  photos: [],
  bridges: [],
};

export function sanitizeMember(member: GalleryMember): GalleryMember {
  return {
    ...member,
    fullName: sanitizeText(member.fullName || ''),
    handle: sanitizeText(member.handle || '').toLowerCase().replace(/^@/, ''),
    location: sanitizeText(member.location || ''),
    bio: sanitizeText(member.bio || ''),
    tags: sanitizeStringArray(member.tags || []),
    bridges: member.bridges?.map((b) => ({
      ...b,
      label: sanitizeText(b.label || ''),
      maskedHint: sanitizeText(b.maskedHint || ''),
      unmaskedValue: b.unmaskedValue ? sanitizeText(b.unmaskedValue) : undefined,
    })) || [],
  };
}

export function getCurrentUserProfile(): GalleryMember {
  if (typeof window === 'undefined') return DEFAULT_CURRENT_USER;

  let sessionName = '';
  let sessionHandle = '';
  let sessionRole = '';
  let sessionMemberNumber = '';

  try {
    const rawSession = localStorage.getItem('wg_user_session');
    if (rawSession) {
      const session = JSON.parse(rawSession);
      sessionName = session?.name || '';
      sessionHandle = (session?.handle || '').replace(/^@/, '');
      sessionRole = session?.role || '';
      sessionMemberNumber = session?.member_number || session?.memberNumber || '';
    }
  } catch {
    // Ignore
  }

  const isCurator =
    sessionRole === 'curator' ||
    localStorage.getItem('wg_curator_session_authenticated') === 'true' ||
    localStorage.getItem('wg_admin_session_authenticated') === 'true';

  try {
    const stored = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Purge obsolete placeholder texts if they were previously persisted
      if (parsed.fullName === 'Gallery Member') parsed.fullName = '';
      if (parsed.handle === 'member') parsed.handle = '';

      const sanitized = sanitizeMember({ ...DEFAULT_CURRENT_USER, ...parsed });

      if (!sanitized.fullName && (sessionName || isCurator)) {
        sanitized.fullName = isCurator ? (sessionName || 'Tonbara Timinipre Destiny') : sessionName;
      }
      if (!sanitized.handle && (sessionHandle || isCurator)) {
        sanitized.handle = isCurator ? (sessionHandle || 'tonbi360') : sessionHandle;
      }
      if (isCurator) {
        sanitized.memberNumber = sanitized.memberNumber || sessionMemberNumber || '#0001';
        sanitized.cohort = sanitized.cohort || 'Founder & Curator';
        sanitized.avatarBg = sanitized.avatarBg || '#1C1C1E';
      } else if (sessionMemberNumber && !sanitized.memberNumber) {
        sanitized.memberNumber = sessionMemberNumber;
      }

      return sanitized;
    }
  } catch (err) {
    console.error('Failed to parse current user profile:', err);
  }

  // If no stored profile row yet, construct real identity from active session
  if (isCurator) {
    return sanitizeMember({
      ...DEFAULT_CURRENT_USER,
      id: 'usr_curator',
      fullName: sessionName || 'Tonbara Timinipre Destiny',
      handle: sessionHandle || 'tonbi360',
      memberNumber: sessionMemberNumber || '#0001',
      cohort: 'Founder & Curator',
      avatarBg: '#1C1C1E',
      bio: 'Founder and Curator of World Gallery.',
      location: 'London & Global',
      tags: ['founder', 'curator'],
    });
  }

  if (sessionName || sessionHandle) {
    return sanitizeMember({
      ...DEFAULT_CURRENT_USER,
      fullName: sessionName,
      handle: sessionHandle,
      memberNumber: sessionMemberNumber || undefined,
      cohort: 'Cohort 2026',
    });
  }

  return DEFAULT_CURRENT_USER;
}

export async function saveCurrentUserProfileAsync(profile: GalleryMember): Promise<void> {
  saveCurrentUserProfile(profile);
  try {
    await dbUpsertProfile(profile);
  } catch (err) {
    console.warn('[Database] Async profile persist notice:', err);
  }
}

export function saveCurrentUserProfile(profile: GalleryMember): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = sanitizeMember(profile);
    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATE_EVENT, { detail: sanitized }));

    // Non-blocking database synchronization
    dbUpsertProfile(sanitized).catch(() => {});
  } catch (err) {
    console.error('Failed to save current user profile:', err);
    throw err;
  }
}

export function saveAllGalleryMembers(members: GalleryMember[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = members.map(sanitizeMember);
    localStorage.setItem(ALL_MEMBERS_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATE_EVENT));
  } catch (err) {
    console.error('Failed to save all gallery members:', err);
  }
}

export async function fetchAllGalleryMembersFromDb(): Promise<GalleryMember[]> {
  try {
    const dbMembers = await dbGetAllActiveProfiles();
    if (dbMembers && dbMembers.length > 0) {
      saveAllGalleryMembers(dbMembers);
      return dbMembers;
    }
  } catch (error) {
    console.warn('[Database] Falling back to local gallery directory:', error);
  }
  return getAllGalleryMembers();
}

export function getAllGalleryMembers(): GalleryMember[] {
  let baseList: GalleryMember[] = [];

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(ALL_MEMBERS_STORAGE_KEY);
      if (stored) {
        baseList = JSON.parse(stored);
      }
    } catch {
      baseList = [];
    }
  }

  // Filter out any legacy placeholder records
  baseList = baseList.filter((m) => m.handle !== 'member' && m.fullName !== 'Gallery Member');

  const current = getCurrentUserProfile();

  // If list is empty but current user profile exists, include current user
  if (baseList.length === 0 && current.handle && current.handle !== 'member') {
    baseList = [current];
  }

  // Ensure current user is synchronized in the returned list
  return baseList.map((member) => {
    if (member.id === current.id || (member.handle && current.handle && member.handle.toLowerCase() === current.handle.toLowerCase())) {
      return current;
    }
    return sanitizeMember(member);
  });
}

// Live Privacy Masking Utility
export function maskContactValue(type: ContactChannelType | string, value: string): string {
  const val = value.trim();
  if (!val) return '••••••••';

  if (type === 'phone' || type === 'whatsapp' || type === 'signal') {
    const digits = val.replace(/\D/g, '');
    if (digits.length < 4) return '••• ••• ••';

    const last2 = digits.slice(-2);
    let countryCode = '';
    if (val.startsWith('+')) {
      const match = val.match(/^\+(\d{1,4})/);
      if (match) {
        countryCode = `+${match[1]} `;
      } else {
        countryCode = '+ ';
      }
    } else if (digits.length >= 11) {
      const ccLen = digits.length >= 12 ? 3 : (digits.length === 11 ? (digits.startsWith('1') ? 1 : 2) : 1);
      countryCode = `+${digits.slice(0, ccLen)} `;
    }

    return `${countryCode}••• ••• ${last2}`.trim();
  }

  if (type === 'email') {
    const parts = val.split('@');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const user = parts[0];
      const domain = parts[1];
      const domainParts = domain.split('.');
      const firstUserChar = user[0] || 'u';
      const firstDomainChar = domainParts[0]?.[0] || 'd';
      const tld = domainParts.length > 1 ? '.' + domainParts.slice(1).join('.') : '';
      return `${firstUserChar}•••@${firstDomainChar}•••${tld}`;
    }
    return `${val[0] || 'e'}•••@••••.com`;
  }

  if (type === 'website') {
    return val;
  }

  // Handles (Telegram, Instagram, Discord, Other)
  const clean = val.replace(/^@/, '');
  if (clean.length <= 2) {
    return `@${clean[0] || ''}•••`;
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  return `@${first}•••${last}`;
}

export function isHandleAvailable(handle: string, currentHandle: string): boolean {
  const clean = handle.replace(/^@/, '').toLowerCase().trim();
  const cleanCurrent = currentHandle.replace(/^@/, '').toLowerCase().trim();
  if (!clean) return false;
  if (clean === cleanCurrent) return true;

  if (RESERVED_SYSTEM_HANDLES.has(clean)) return false;

  // Check existing gallery members
  const existingMembers = getAllGalleryMembers();
  const memberExists = existingMembers.some(
    (m) => m.id !== 'mem-default' && m.handle.toLowerCase() === clean
  );
  return !memberExists;
}
