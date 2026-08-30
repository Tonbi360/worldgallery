/**
 * Deep-link builders using exact native application URI schemes
 */

export function sanitizeDigits(val: string): string {
  return val.replace(/\D/g, '');
}

export function sanitizeHandle(val: string): string {
  return val.replace(/^@/, '').trim();
}

export interface DeepLinkResult {
  url: string | null;
  label: string;
  isExternal: boolean;
}

export function buildDeepLink(channel: string, value: string): DeepLinkResult {
  const cleanVal = (value || '').trim();
  if (!cleanVal) {
    return { url: null, label: 'Copy', isExternal: false };
  }

  const normChannel = (channel || '').toLowerCase();

  switch (normChannel) {
    case 'whatsapp': {
      const digits = sanitizeDigits(cleanVal);
      return {
        url: digits ? `https://wa.me/${digits}` : null,
        label: 'Open WhatsApp',
        isExternal: true,
      };
    }

    case 'telegram': {
      const handle = sanitizeHandle(cleanVal);
      return {
        url: handle ? `https://t.me/${handle}` : null,
        label: 'Open Telegram',
        isExternal: true,
      };
    }

    case 'signal': {
      const digits = sanitizeDigits(cleanVal);
      return {
        url: digits ? `https://signal.me/#p/+${digits}` : null,
        label: 'Chat on Signal',
        isExternal: true,
      };
    }

    case 'email': {
      return {
        url: `mailto:${cleanVal}`,
        label: 'Send Email',
        isExternal: true,
      };
    }

    case 'phone':
    case 'call': {
      const digits = sanitizeDigits(cleanVal);
      return {
        url: digits ? `tel:+${digits}` : `tel:${cleanVal}`,
        label: 'Call',
        isExternal: true,
      };
    }

    case 'instagram': {
      const handle = sanitizeHandle(cleanVal);
      return {
        url: handle ? `https://instagram.com/${handle}` : null,
        label: 'Open Instagram',
        isExternal: true,
      };
    }

    case 'discord': {
      const handle = sanitizeHandle(cleanVal);
      return {
        url: handle ? `https://discord.com/users/${handle}` : null,
        label: 'Open Discord',
        isExternal: true,
      };
    }

    case 'website':
    case 'portfolio': {
      const url = cleanVal.startsWith('http://') || cleanVal.startsWith('https://')
        ? cleanVal
        : `https://${cleanVal}`;
      return {
        url,
        label: 'Visit Site',
        isExternal: true,
      };
    }

    default:
      return {
        url: null,
        label: 'Copy',
        isExternal: false,
      };
  }
}
