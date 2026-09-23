import React from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import { WatermarkProps } from '../types';

export const WatermarkOverlay: React.FC<WatermarkProps> = ({ 
  time, 
  date, 
  day, 
  address, 
  isVerified = true 
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* Bottom Left Watermark */}
      <div className="absolute bottom-6 left-5 text-white flex flex-col items-start drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">
        {/* Time */}
        <div className="text-[34px] sm:text-[38px] font-bold leading-none mb-1 tracking-tight drop-shadow-md">
          {time}
        </div>
        
        {/* Day and Date */}
        <div className="text-[12px] sm:text-[13px] font-medium tracking-wide mb-2 opacity-95">
          {day} {date}
        </div>

        {/* Separator Line */}
        <div className="w-[180px] sm:w-[220px] h-[1.5px] bg-white/90 mb-2.5 shadow-sm" />

        {/* Location Row */}
        <div className="flex items-start gap-1.5 mb-1 max-w-[260px] sm:max-w-[320px]">
          <div className="relative flex items-center justify-center shrink-0 mt-0.5">
            <div className="bg-white w-3 h-3 rounded-full absolute" />
            <MapPin size={13} fill="white" stroke="white" strokeWidth={3} className="relative z-10 text-black/20" />
            <div className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-white" />
          </div>
          <div className="text-[11px] sm:text-[12px] font-bold leading-tight ml-0.5 break-words line-clamp-2 drop-shadow-sm">
            {address}
          </div>
        </div>

        {/* Verification Row */}
        {isVerified && (
          <div className="flex items-center gap-1 mt-0.5 opacity-90">
            <div className="bg-white/20 p-0.5 rounded-full border border-white/30 backdrop-blur-xs">
              <ShieldCheck size={9} className="text-white fill-white/20" />
            </div>
            <span className="text-[8.5px] font-semibold tracking-tight">
              Time & location verified by Marki
            </span>
          </div>
        )}
      </div>

      {/* Bottom Right Branding */}
      <div className="absolute bottom-6 right-5 text-white flex flex-col items-end drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">
        <div className="text-[18px] sm:text-[20px] font-bold leading-tight flex items-baseline tracking-wide">
          Marki
          <div className="w-1.5 h-1.5 bg-white rounded-full ml-1 mb-0.5 shadow-md shadow-white/40" />
        </div>
        <div className="text-[7.5px] font-bold opacity-90 uppercase tracking-[0.2em] mt-0.5">
          Actual Time
        </div>
      </div>
    </div>
  );
};
