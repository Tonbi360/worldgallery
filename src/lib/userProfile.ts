import { GalleryMember, ContactBridge } from '../types/gallery';
import { ContactChannelType, RESERVED_SYSTEM_HANDLES } from '../types/apply';

export const CURRENT_USER_STORAGE_KEY = 'wg_current_user_profile';
export const USER_PROFILE_UPDATE_EVENT = 'wg_user_profile_updated';
export const ALL_MEMBERS_STORAGE_KEY = 'wg_all_gallery_members';

export const DEFAULT_CURRENT_USER: GalleryMember = {
  id: 'mem-default',
  fullName: 'Gallery Member',
  handle: 'member',
  location: '',
  bio: '',
  tags: [],
  availability: 'open',
  avatarBg: '#2D6A4F',
  memberNumber: '#0001',
  cohort: 'Cohort 2026',
  photos: [],
  bridges: [],
};

export function getCurrentUserProfile(): GalleryMember {
  if (typeof window === 'undefined') return DEFAULT_CURRENT_USER;
  try {
    const stored = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CURRENT_USER, ...parsed };
    }
  } catch (err) {
    console.error('Failed to parse current user profile:', err);
  }
  return DEFAULT_CURRENT_USER;
}

export function saveCurrentUserProfile(profile: GalleryMember): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATE_EVENT, { detail: profile }));
  } catch (err) {
    console.error('Failed to save current user profile:', err);
    throw err;
  }
}

export function saveAllGalleryMembers(members: GalleryMember[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ALL_MEMBERS_STORAGE_KEY, JSON.stringify(members));
    window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATE_EVENT));
  } catch (err) {
    console.error('Failed to save all gallery members:', err);
  }
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
    return member;
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
