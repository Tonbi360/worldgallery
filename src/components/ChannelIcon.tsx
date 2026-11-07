'use client';

import React from 'react';
import {
  Phone,
  Mail,
  Globe,
  Send,
  MoreHorizontal,
  MessageSquare,
} from 'lucide-react';

interface ChannelIconProps {
  type: string;
  className?: string;
  size?: number;
}

export function ChannelIcon({ type, className = 'w-4 h-4', size = 16 }: ChannelIconProps) {
  const normType = String(type || '').toLowerCase().trim();

  switch (normType) {
    case 'snapchat':
    case 'snap':
    case 'snaps':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="currentColor"
          className={`${className} text-[#FFFC00] drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]`}
          aria-label="Snapchat"
        >
          {/* Authentic Snapchat Ghost Silhouette */}
          <path d="M12 2C8.5 2 6 4.3 6 7.5c0 .6.1 1.2.2 1.7-.4.1-.9.2-1.2.4-.4.3-.5.7-.3 1.1.3.5 1 .7 1.6.5.3.9.7 1.8 1.4 2.5-.5.4-1.2.7-1.7 1-.3.2-.5.5-.4.8.1.4.5.6.9.5.7-.1 1.4-.4 2-.8.6.6 1.4 1 2.3 1.2-.2.3-.5.7-.9 1-.5.3-.8.7-.6 1.2.2.5.7.8 1.3.6 1.1-.3 2.1-.9 2.9-1.6.4.1.9.1 1.3 0 .8.7 1.8 1.3 2.9 1.6.6.2 1.1-.1 1.3-.6.2-.5-.1-.9-.6-1.2-.4-.3-.7-.7-.9-1 .9-.2 1.7-.6 2.3-1.2.6.4 1.3.7 2 .8.4.1.8-.1.9-.5.1-.3-.1-.6-.4-.8-.5-.3-1.2-.6-1.7-1 .7-.7 1.1-1.6 1.4-2.5.6.2 1.3 0 1.6-.5.2-.4.1-.8-.3-1.1-.3-.2-.8-.3-1.2-.4.1-.5.2-1.1.2-1.7C18 4.3 15.5 2 12 2z" />
        </svg>
      );

    case 'instagram':
    case 'insta':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${className} text-[#E1306C]`}
          aria-label="Instagram"
        >
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );

    case 'discord':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="currentColor"
          className={`${className} text-[#5865F2]`}
          aria-label="Discord"
        >
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      );

    case 'whatsapp':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${className} text-[#25D366]`}
          aria-label="WhatsApp"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );

    case 'telegram':
      return <Send className={`${className} text-[#229ED9]`} />;

    case 'phone':
      return <Phone className={`${className} text-emerald-600`} />;

    case 'email':
    case 'mail':
      return <Mail className={`${className} text-amber-600`} />;

    case 'website':
    case 'web':
      return <Globe className={`${className} text-teal-600`} />;

    case 'signal':
      return <MessageSquare className={`${className} text-blue-600`} />;

    case 'other':
    default:
      // Clean, elegant alternative icon instead of the confusing hotspot / radio broadcast icon
      return <MoreHorizontal className={`${className} text-ios-secondary`} />;
  }
}
