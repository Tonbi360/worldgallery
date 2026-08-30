'use client';

import React, { useState } from 'react';
import {
  Phone,
  Mail,
  SendHorizontal,
  Instagram,
  Globe,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { buildDeepLink } from '../lib/deeplinks';

interface BridgeActionRowProps {
  key?: React.Key;
  channelType: string;
  channelLabel: string;
  unmaskedValue: string;
  identifierKey?: string;
  subtitle?: string;
}

export default function BridgeActionRow({
  channelType,
  channelLabel,
  unmaskedValue,
  identifierKey = 'bridge',
  subtitle,
}: BridgeActionRowProps) {
  const [copied, setCopied] = useState(false);
  const deepLink = buildDeepLink(channelType, unmaskedValue);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(unmaskedValue);
      haptics.notification('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLaunch = () => {
    haptics.impact('light');
  };

  const getChannelIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'phone':
      case 'whatsapp':
      case 'signal':
      case 'call':
        return <Phone className="w-3.5 h-3.5" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5" />;
      case 'telegram':
      case 'discord':
        return <SendHorizontal className="w-3.5 h-3.5" />;
      case 'instagram':
        return <Instagram className="w-3.5 h-3.5" />;
      case 'website':
      case 'portfolio':
        return <Globe className="w-3.5 h-3.5" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-[#F2F2F7] rounded-xl border border-ios-separator/30">
      {/* Left: Channel Info & Value */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-white text-ios-forest flex items-center justify-center flex-shrink-0 shadow-2xs">
          {getChannelIcon(channelType)}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-sans font-semibold text-[13px] text-ios-text truncate">
              {channelLabel}
            </span>
            {subtitle && (
              <span className="font-sans text-[11px] text-ios-secondary truncate">
                ({subtitle})
              </span>
            )}
          </div>
          <span className="font-mono text-[12.5px] text-ios-secondary truncate select-all">
            {unmaskedValue}
          </span>
        </div>
      </div>

      {/* Right: Actions (Primary launch + secondary copy) */}
      <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
        {deepLink.url ? (
          <>
            {/* Primary Action Button (Direct Launch) */}
            <a
              href={deepLink.url}
              target={deepLink.url.startsWith('mailto:') || deepLink.url.startsWith('tel:') ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={handleLaunch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ios-forest text-white font-sans text-[12.5px] font-semibold hover:bg-ios-forest-pressed active:scale-95 transition-all shadow-2xs cursor-pointer"
            >
              {getChannelIcon(channelType)}
              <span>{deepLink.label}</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>

            {/* Secondary Discrete Copy Icon */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy to clipboard"
              className="w-8 h-8 rounded-lg bg-white hover:bg-[#E5E5EA] active:scale-95 text-ios-secondary hover:text-ios-text flex items-center justify-center transition-all cursor-pointer shadow-2xs"
              aria-label="Copy contact"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-ios-forest stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </>
        ) : (
          /* For channels without deep-links: Copy stays primary */
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ios-forest text-white font-sans text-[12.5px] font-semibold hover:bg-ios-forest-pressed active:scale-95 transition-all shadow-2xs cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Copied ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
