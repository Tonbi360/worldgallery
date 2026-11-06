export interface IncomingRequest {
  id: string;
  senderHandle: string;
  senderName: string;
  senderAvatarBg: string;
  senderAvatarUrl?: string;
  channelType: string;
  channelLabel: string;
  note: string;
  timeAgo: string;
  expiresInDays: number;
  status: 'pending' | 'approved' | 'declined';
  senderUnmaskedContact?: {
    type: string;
    label: string;
    value: string;
    isLink?: boolean;
  };
  mySharedContact?: {
    type: string;
    label: string;
    value: string;
  };
}

export interface SentRequest {
  id: string;
  recipientHandle: string;
  recipientName: string;
  recipientAvatarBg: string;
  recipientAvatarUrl?: string;
  note: string;
  channelLabel: string;
  channelType?: string;
  sentDate?: string;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  expiresInDays?: number;
  unmaskedContact?: {
    type: string;
    label: string;
    value: string;
    isLink?: boolean;
  };
  mySharedContact?: {
    type: string;
    label: string;
    value: string;
  };
}
