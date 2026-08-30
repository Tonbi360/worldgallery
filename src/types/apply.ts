export type ContactChannelType =
  | 'whatsapp'
  | 'telegram'
  | 'signal'
  | 'instagram'
  | 'discord'
  | 'phone'
  | 'email'
  | 'website'
  | 'other';

export interface ContactBridge {
  id: string;
  type: ContactChannelType;
  customTypeName?: string;
  value: string;
}

export interface ApplyDraft {
  // Step 1
  email: string;
  password: string;
  // Step 2
  avatarUrl: string;
  avatarBg: string;
  fullName: string;
  handle: string;
  location: string;
  bio: string;
  availability: 'open' | 'quiet' | 'paused';
  tags: string[];
  // Step 3
  bridges: ContactBridge[];
  // Step 4
  entryChoice: 'invite' | 'waiting';
  inviteCode: string;
  // Meta
  currentStep: number;
  updatedAt: number;
}

export const INITIAL_APPLY_DRAFT: ApplyDraft = {
  email: '',
  password: '',
  avatarUrl: '',
  avatarBg: '#2D6A4F', // Forest Green default
  fullName: '',
  handle: '',
  location: '',
  bio: '',
  availability: 'open',
  tags: [],
  bridges: [
    {
      id: 'bridge-1',
      type: 'telegram',
      value: '',
    },
  ],
  entryChoice: 'waiting',
  inviteCode: '',
  currentStep: 1,
  updatedAt: Date.now(),
};

export const CURATED_PALETTE = [
  { hex: '#2D6A4F', name: 'Forest' },
  { hex: '#1B4332', name: 'Pine' },
  { hex: '#007AFF', name: 'System Blue' },
  { hex: '#5856D6', name: 'Indigo' },
  { hex: '#AF52DE', name: 'Purple' },
  { hex: '#FF2D55', name: 'Rose' },
  { hex: '#FF3B30', name: 'Coral' },
  { hex: '#FF9500', name: 'Amber' },
  { hex: '#D97706', name: 'Ochre' },
  { hex: '#854D0E', name: 'Umber' },
  { hex: '#0D9488', name: 'Teal' },
  { hex: '#0284C7', name: 'Ocean' },
  { hex: '#4B5563', name: 'Slate' },
  { hex: '#1F2937', name: 'Charcoal' },
  { hex: '#78716C', name: 'Stone' },
  { hex: '#44403C', name: 'Espresso' },
];

export const RESERVED_SYSTEM_HANDLES = new Set(['curator', 'admin', 'world', 'gallery', 'root', 'support']);

export const CHANNEL_CONFIGS: Record<
  ContactChannelType,
  { label: string; placeholder: string; isLaunch: boolean; appName: string }
> = {
  whatsapp: { label: 'WhatsApp', placeholder: '+1 (555) 000-0000', isLaunch: true, appName: 'WhatsApp' },
  telegram: { label: 'Telegram', placeholder: '@username or phone', isLaunch: true, appName: 'Telegram' },
  signal: { label: 'Signal', placeholder: '+1 (555) 000-0000', isLaunch: true, appName: 'Signal' },
  instagram: { label: 'Instagram', placeholder: '@handle', isLaunch: true, appName: 'Instagram' },
  discord: { label: 'Discord', placeholder: 'username#0000 or handle', isLaunch: false, appName: 'Discord' },
  phone: { label: 'Phone', placeholder: '+1 (555) 000-0000', isLaunch: true, appName: 'Phone' },
  email: { label: 'Email', placeholder: 'direct@domain.com', isLaunch: true, appName: 'Mail' },
  website: { label: 'Website', placeholder: 'https://domain.com', isLaunch: true, appName: 'browser' },
  other: { label: 'Other', placeholder: 'Handle or link', isLaunch: false, appName: 'app' },
};
