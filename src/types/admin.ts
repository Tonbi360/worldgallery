import { ContactBridge } from './gallery';

export interface PendingApplicant {
  id: string;
  fullName: string;
  handle: string;
  location: string;
  bio: string;
  tags: string[];
  availability: 'open' | 'quiet' | 'paused';
  avatarBg: string;
  avatarUrl?: string;
  photos?: string[];
  bridges?: ContactBridge[];
  appliedAt: string;
  entryType: 'queue' | 'invite';
  invitedBy?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionNote?: string;
}

export interface InviteSeal {
  id: string;
  code: string;
  description: string;
  createdAt: string;
  status: 'active' | 'used';
  usedByHandle?: string;
  usedAt?: string;
}

export interface CuratorTelemetry {
  verifiedHumans: number;
  restingRequests: number;
  activeBridges: number;
  approvedToday: number;
  dailyCap: number;
}
