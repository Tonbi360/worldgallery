'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  X,
  Check,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { GalleryMember } from '../types/gallery';
import { IncomingRequest } from '../types/activity';
import { getCurrentUserProfile, getAllGalleryMembers, USER_PROFILE_UPDATE_EVENT } from '../lib/userProfile';
import AvatarMenu from './AvatarMenu';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface GalleryDirectoryProps {
  onNavigate: (path: string) => void;
  onSelectMember?: (member: GalleryMember) => void;
}

export default function GalleryDirectory({
  onNavigate,
  onSelectMember,
}: GalleryDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'open' | 'quiet' | 'paused'
  >('all');
  const [activeScrubLetter, setActiveScrubLetter] = useState<string | null>(
    null
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(1);
  const [currentUser, setCurrentUser] = useState<GalleryMember>(getCurrentUserProfile());
  const [membersList, setMembersList] = useState<GalleryMember[]>(getAllGalleryMembers());

  // Listen for user profile updates from EditPortrait
  useEffect(() => {
    const handleProfileUpdate = () => {
      setCurrentUser(getCurrentUserProfile());
      setMembersList(getAllGalleryMembers());
    };
    window.addEventListener(USER_PROFILE_UPDATE_EVENT, handleProfileUpdate);
    return () => window.removeEventListener(USER_PROFILE_UPDATE_EVENT, handleProfileUpdate);
  }, []);

  // Load incoming requests count
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wg_incoming_requests');
      if (stored) {
        const parsed: IncomingRequest[] = JSON.parse(stored);
        setPendingRequestsCount(parsed.filter((r) => r.status === 'pending').length);
      } else {
        setPendingRequestsCount(0);
      }
    } catch {
      setPendingRequestsCount(0);
    }
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const scrubberRef = useRef<HTMLDivElement>(null);
  const lastScrubbedLetterRef = useRef<string | null>(null);

  // Filter members based on Search Query + Availability Filter
  const filteredMembers = useMemo(() => {
    return membersList.filter((member) => {
      // 1. Availability filter
      if (
        availabilityFilter !== 'all' &&
        member.availability !== availabilityFilter
      ) {
        return false;
      }

      // 2. Search query
      if (!searchQuery.trim()) return true;

      const q = searchQuery.trim().toLowerCase();
      const nameMatch = member.fullName.toLowerCase().includes(q);
      const handleMatch = member.handle.toLowerCase().includes(q);
      const locationMatch = member.location.toLowerCase().includes(q);
      const tagMatch = member.tags.some((t) => t.toLowerCase().includes(q));

      return nameMatch || handleMatch || locationMatch || tagMatch;
    });
  }, [membersList, searchQuery, availabilityFilter]);

  // Live counts for availability filter pills
  const counts = useMemo(() => {
    const total = membersList.length;
    const open = membersList.filter((m) => m.availability === 'open').length;
    const quiet = membersList.filter((m) => m.availability === 'quiet').length;
    const paused = membersList.filter((m) => m.availability === 'paused').length;
    return { all: total, open, quiet, paused };
  }, [membersList]);

  // Group filtered members by First Letter of full name
  const groupedMembers = useMemo(() => {
    const map: { [letter: string]: GalleryMember[] } = {};
    ALPHABET.forEach((l) => {
      map[l] = [];
    });

    filteredMembers.forEach((member) => {
      const first = (member.fullName.trim()[0] || '#').toUpperCase();
      if (map[first]) {
        map[first].push(member);
      } else {
        if (!map['#']) map['#'] = [];
        map['#'].push(member);
      }
    });

    // Sort members inside each letter bucket alphabetically
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => a.fullName.localeCompare(b.fullName));
    });

    return map;
  }, [filteredMembers]);

  // Letters that actually have members in the active filter
  const populatedLetters = useMemo(() => {
    return new Set(
      Object.keys(groupedMembers).filter(
        (l) => groupedMembers[l] && groupedMembers[l].length > 0
      )
    );
  }, [groupedMembers]);

  // Scroll to a letter group with haptic trigger
  const scrollToLetter = useCallback((letter: string) => {
    const targetElement = letterRefs.current[letter];
    if (targetElement && scrollContainerRef.current) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Handle Scrub gesture across alphabet list
  const handleScrubMove = useCallback(
    (clientY: number) => {
      if (!scrubberRef.current) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const percent = Math.max(0, Math.min(1, relativeY / rect.height));
      const index = Math.floor(percent * ALPHABET.length);
      const letter = ALPHABET[Math.min(ALPHABET.length - 1, Math.max(0, index))];

      if (letter && letter !== lastScrubbedLetterRef.current) {
        lastScrubbedLetterRef.current = letter;
        setActiveScrubLetter(letter);
        haptics.selection();
        if (populatedLetters.has(letter)) {
          scrollToLetter(letter);
        }
      }
    },
    [populatedLetters, scrollToLetter]
  );

  // Scrubber Touch & Mouse Listeners
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleScrubMove(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    handleScrubMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    setIsScrubbing(false);
    setTimeout(() => {
      setActiveScrubLetter(null);
      lastScrubbedLetterRef.current = null;
    }, 450);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleScrubMove(e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleScrubMove(moveEvent.clientY);
    };

    const onMouseUp = () => {
      setIsScrubbing(false);
      setTimeout(() => {
        setActiveScrubLetter(null);
        lastScrubbedLetterRef.current = null;
      }, 450);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Member row tap handler
  const handleMemberClick = (member: GalleryMember) => {
    haptics.impact('light');
    if (onSelectMember) {
      onSelectMember(member);
    }
    // Route to placeholder portrait room
    onNavigate(`/profile/${member.handle}`);
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <main
      id="gallery-directory-screen"
      className="relative flex flex-col w-full h-[100dvh] overflow-hidden bg-ios-bg text-ios-text select-none"
    >
      {/* 1. Header (No back button, left: WG seal mark, right: own avatar with dropdown menu) */}
      <header className="relative flex items-center justify-between w-full px-5 pt-3 pb-2 flex-shrink-0 z-30 bg-ios-bg max-w-2xl mx-auto">
        {/* Left: WG Seal Mark */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-ios-forest text-white flex items-center justify-center shadow-2xs">
            <span className="font-serif font-bold text-[14px] tracking-tighter">
              WG
            </span>
          </div>
          <span className="font-serif font-semibold text-[15.5px] tracking-tight text-ios-text hidden sm:inline">
            World Gallery
          </span>
        </div>

        {/* Right: Own Avatar Button with Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setIsAvatarMenuOpen((prev) => !prev);
            }}
            style={{ backgroundColor: currentUser.avatarBg || '#2D6A4F' }}
            className="relative w-8 h-8 rounded-full text-white flex items-center justify-center font-serif text-[13px] font-bold shadow-xs active:scale-95 transition-transform border border-white/60 cursor-pointer overflow-hidden"
            aria-label="Account Menu"
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>
                {currentUser.fullName
                  ? currentUser.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'TT'}
              </span>
            )}
            {pendingRequestsCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#D97706] border-1.5 border-white animate-pulse" />
            ) : (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ios-forest border-1.5 border-white" />
            )}
          </button>

          {/* iOS Glass Dropdown Menu */}
          <AvatarMenu
            isOpen={isAvatarMenuOpen}
            onClose={() => setIsAvatarMenuOpen(false)}
            pendingRequestsCount={pendingRequestsCount}
            onNavigate={onNavigate}
            onSignOut={() => onNavigate('/')}
          />
        </div>
      </header>

      {/* 2. Top Controls & Title Container */}
      <div className="w-full px-5 pt-1 pb-2 flex-shrink-0 z-10 bg-ios-bg max-w-2xl mx-auto">
        {/* Large Title & Subtitle */}
        <div className="mb-3.5">
          <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-0.5">
            The Gallery
          </h1>
          <p className="font-sans text-[14.5px] text-ios-secondary leading-normal">
            A quiet registry of craft and presence.
          </p>
        </div>

        {/* iOS Inset Search Bar */}
        <div className="relative flex items-center w-full bg-[#E5E5EA]/75 focus-within:bg-[#E5E5EA] rounded-xl px-3 py-2 transition-colors mb-3">
          <Search className="w-4.5 h-4.5 text-ios-secondary/70 mr-2.5 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, handle, or craft..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent border-0 outline-none font-sans text-[15.5px] text-ios-text placeholder:text-ios-secondary/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setSearchQuery('');
              }}
              className="p-1 text-ios-secondary hover:text-ios-text active:scale-90 transition-all cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Segmented Availability Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-0.5">
          {/* All */}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setAvailabilityFilter('all');
            }}
            className={`font-sans text-[13px] font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              availabilityFilter === 'all'
                ? 'bg-ios-text text-white shadow-xs'
                : 'bg-white text-ios-secondary hover:text-ios-text border border-ios-separator/40'
            }`}
          >
            <span>All</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                availabilityFilter === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#F2F2F7] text-ios-secondary'
              }`}
            >
              {counts.all}
            </span>
          </button>

          {/* Open */}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setAvailabilityFilter('open');
            }}
            className={`font-sans text-[13px] font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              availabilityFilter === 'open'
                ? 'bg-[#E8F5E9] text-ios-forest border border-ios-forest/30 shadow-xs font-bold'
                : 'bg-white text-ios-secondary hover:text-ios-text border border-ios-separator/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-ios-forest" />
            <span>Open</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                availabilityFilter === 'open'
                  ? 'bg-ios-forest/15 text-ios-forest'
                  : 'bg-[#F2F2F7] text-ios-secondary'
              }`}
            >
              {counts.open}
            </span>
          </button>

          {/* Quiet */}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setAvailabilityFilter('quiet');
            }}
            className={`font-sans text-[13px] font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              availabilityFilter === 'quiet'
                ? 'bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/30 shadow-xs font-bold'
                : 'bg-white text-ios-secondary hover:text-ios-text border border-ios-separator/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <span>Quiet</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                availabilityFilter === 'quiet'
                  ? 'bg-[#D97706]/15 text-[#D97706]'
                  : 'bg-[#F2F2F7] text-ios-secondary'
              }`}
            >
              {counts.quiet}
            </span>
          </button>

          {/* Paused */}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setAvailabilityFilter('paused');
            }}
            className={`font-sans text-[13px] font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              availabilityFilter === 'paused'
                ? 'bg-[#E5E5EA] text-[#6B7280] border border-[#6B7280]/30 shadow-xs font-bold'
                : 'bg-white text-ios-secondary hover:text-ios-text border border-ios-separator/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#6B7280]" />
            <span>Paused</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                availabilityFilter === 'paused'
                  ? 'bg-[#6B7280]/15 text-[#6B7280]'
                  : 'bg-[#F2F2F7] text-ios-secondary'
              }`}
            >
              {counts.paused}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Member Directory List & Scrubber Container */}
      <div className="relative flex-1 w-full overflow-hidden flex max-w-2xl mx-auto">
        {/* Scrollable Members List */}
        <div
          ref={scrollContainerRef}
          className="relative flex-1 h-full overflow-y-auto overflow-x-hidden px-5 pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Flat Search Results (while searching) */}
          {isSearching ? (
            <div className="pt-2">
              {filteredMembers.length > 0 ? (
                <div className="bg-ios-card rounded-2xl shadow-ios-card overflow-hidden">
                  {filteredMembers.map((member, idx) => (
                    <MemberRowItem
                      key={member.id}
                      member={member}
                      isLast={idx === filteredMembers.length - 1}
                      onClick={() => handleMemberClick(member)}
                    />
                  ))}
                </div>
              ) : (
                /* Search Zero Results */
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <span className="font-serif font-bold text-[20px] text-ios-text mb-1">
                    No humans match.
                  </span>
                  <p className="font-serif italic text-[14px] text-ios-secondary max-w-[280px]">
                    &ldquo;Every presence in the gallery is unique and
                    intentional.&rdquo;
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* A-Z Grouped List */
            <div className="pt-1 space-y-5">
              {filteredMembers.length === 0 ? (
                /* Empty Directory State (Global) */
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-ios-forest/10 text-ios-forest flex items-center justify-center mb-3">
                    <Users className="w-6 h-6" />
                  </div>
                  <h2 className="font-serif font-bold text-[22px] text-ios-text mb-1">
                    The gallery awaits
                  </h2>
                  <p className="font-sans text-[14.5px] text-ios-secondary">
                    Be the first approved member.
                  </p>
                </div>
              ) : (
                ALPHABET.map((letter) => {
                  const members = groupedMembers[letter] || [];
                  if (members.length === 0) return null;

                  return (
                    <div
                      key={letter}
                      ref={(el) => {
                        letterRefs.current[letter] = el;
                      }}
                      className="relative scroll-mt-2"
                    >
                      {/* Sticky Letter Header: Forest Green SERIF ~20px museum-marker style */}
                      <div className="sticky top-0 z-10 bg-ios-bg/95 backdrop-blur-xs py-1.5 mb-1 px-1">
                        <span className="font-serif font-bold text-[20px] text-ios-forest tracking-tight">
                          {letter}
                        </span>
                      </div>

                      {/* Grouped Card for this Letter */}
                      <div className="bg-ios-card rounded-2xl shadow-ios-card overflow-hidden">
                        {members.map((member, idx) => (
                          <MemberRowItem
                            key={member.id}
                            member={member}
                            isLast={idx === members.length - 1}
                            onClick={() => handleMemberClick(member)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 4. Right-Edge Alphabet Scrubber (Hidden when searching) */}
        {!isSearching && (
          <div
            ref={scrubberRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            className="flex-shrink-0 flex flex-col justify-between items-center py-4 px-1.5 touch-none select-none z-20 cursor-pointer"
            style={{ height: 'calc(100% - 10px)' }}
          >
            {ALPHABET.map((letter) => {
              const hasMembers = populatedLetters.has(letter);
              const isActive = activeScrubLetter === letter;

              return (
                <div
                  key={letter}
                  className={`font-sans text-[10px] font-bold transition-all ${
                    isActive
                      ? 'text-ios-forest scale-130 font-black'
                      : hasMembers
                      ? 'text-ios-secondary/80 hover:text-ios-text'
                      : 'text-ios-secondary/25'
                  }`}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Central Floating HUD Bubble on Touch/Scrub */}
      <AnimatePresence>
        {isScrubbing && activeScrubLetter && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
          >
            <div className="w-20 h-20 rounded-2xl bg-ios-text/90 backdrop-blur-md text-white shadow-2xl flex items-center justify-center border border-white/20">
              <span className="font-serif font-bold text-[38px] text-white">
                {activeScrubLetter}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

interface MemberRowItemProps {
  member: GalleryMember;
  isLast: boolean;
  onClick: () => void;
}

// Sub-Component: Member Row Item
const MemberRowItem: React.FC<MemberRowItemProps> = ({
  member,
  isLast,
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);

  const initials = member.fullName
    ? member.fullName
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'W';

  const firstTag = member.tags?.[0];

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] active:bg-ios-separator/20 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* 48px Avatar with Availability Dot Overlay */}
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-serif font-bold text-[16px] shadow-2xs overflow-hidden"
            style={{ backgroundColor: member.avatarBg || '#2D6A4F' }}
          >
            {member.avatarUrl && !imageError ? (
              <img
                src={member.avatarUrl}
                alt={member.fullName}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {/* Availability Dot Overlay */}
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white shadow-2xs ${
              member.availability === 'open'
                ? 'bg-ios-forest'
                : member.availability === 'quiet'
                ? 'bg-[#D97706]'
                : 'bg-[#6B7280]'
            }`}
            title={`Availability: ${member.availability}`}
          />
        </div>

        {/* Info Column */}
        <div className="flex flex-col min-w-0 flex-1">
          {/* Row 1: Name + Verified Seal Check */}
          <div className="flex items-center gap-1.5">
            <span className="font-sans text-[16px] font-semibold text-ios-text truncate group-hover:text-ios-forest transition-colors">
              {member.fullName}
            </span>
            <div className="w-3.5 h-3.5 rounded-full bg-ios-forest/15 text-ios-forest flex items-center justify-center flex-shrink-0">
              <Check className="w-2.5 h-2.5 stroke-[3.5]" />
            </div>
          </div>

          {/* Row 2: @handle • location */}
          <div className="font-sans text-[13.5px] text-ios-secondary truncate">
            <span>@{member.handle.replace(/^@/, '')}</span>
            {member.location && (
              <>
                <span className="mx-1 text-ios-secondary/50">•</span>
                <span>{member.location}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: First Tag Chip & Subtle Chevron */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {firstTag && (
          <span className="bg-[#F2F2F7] text-ios-secondary font-sans font-medium text-[11.5px] px-2.5 py-0.5 rounded-full border border-ios-separator/30 capitalize max-w-[110px] truncate hidden xs:inline-block">
            #{firstTag}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-ios-secondary/50 group-hover:text-ios-secondary transition-colors" />
      </div>

      {/* Hairline separator (omitted on last row) */}
      {!isLast && (
        <div className="absolute bottom-0 left-[68px] right-0 border-b-[0.5px] border-ios-separator/60 pointer-events-none" />
      )}
    </div>
  );
}
