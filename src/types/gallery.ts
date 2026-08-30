export interface ContactBridge {
  type: 'phone' | 'whatsapp' | 'signal' | 'email' | 'telegram' | 'instagram' | 'discord' | 'website' | 'other';
  label: string;
  maskedHint: string;
  unmaskedValue?: string;
  isLink?: boolean;
}

export interface GalleryMember {
  id: string;
  fullName: string;
  handle: string;
  location: string;
  bio: string;
  tags: string[];
  availability: 'open' | 'quiet' | 'paused';
  avatarBg: string;
  avatarUrl?: string;
  memberNumber?: string;
  cohort?: string;
  bridges?: ContactBridge[];
  photos?: string[];
}
