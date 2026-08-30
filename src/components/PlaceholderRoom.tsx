import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface PlaceholderRoomProps {
  title?: string;
  subtitle?: string;
  badge?: string;
  onBack: () => void;
}

export default function PlaceholderRoom({
  title = 'The Gallery',
  subtitle = 'This room opens in an upcoming build.',
  badge = 'COMING SOON',
  onBack,
}: PlaceholderRoomProps) {
  const handleBack = () => {
    haptics.selection();
    onBack();
  };

  return (
    <main
      id="placeholder-room"
      className="relative flex flex-col justify-between w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ios-bg text-ios-text px-5 py-3 select-none"
    >
      {/* Navigation Top Bar with iOS Chevron */}
      <div className="flex items-center justify-between w-full pt-1">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-2 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Back</span>
        </button>
        <span className="w-12" />
      </div>

      {/* Center Calm Content */}
      <div className="flex flex-col items-center text-center my-auto px-4">
        <div className="w-14 h-14 rounded-[16px] bg-ios-forest shadow-xs flex items-center justify-center mb-4">
          <svg viewBox="0 0 48 48" className="w-8 h-8 text-white" fill="currentColor">
            <text
              x="50%"
              y="55%"
              fontSize="26"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="Georgia, serif"
              fontWeight="bold"
            >
              W
            </text>
          </svg>
        </div>

        <span className="font-sans text-[10px] font-bold tracking-[0.2em] text-ios-secondary/80 uppercase mb-1.5">
          {badge}
        </span>

        <h1 className="font-sans text-[26px] font-bold tracking-tight text-ios-text mb-2">
          {title}
        </h1>

        <p className="font-sans text-[14.5px] text-ios-secondary max-w-[260px] leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Bottom Safe Area Action */}
      <div className="w-full pb-2 safe-area-bottom">
        <button
          type="button"
          onClick={handleBack}
          className="w-full bg-ios-card text-ios-text border border-ios-separator/40 font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:bg-white active:scale-[0.98] transition-all text-center cursor-pointer"
        >
          Return to Entrance
        </button>
      </div>
    </main>
  );
}
