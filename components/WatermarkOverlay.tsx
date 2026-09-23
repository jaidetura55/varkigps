
import React from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import { WatermarkProps } from '../types';

export const WatermarkOverlay: React.FC<WatermarkProps> = ({ time, date, day, address, isVerified = true }) => {
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Bottom Left Watermark */}
      <div className="absolute bottom-6 left-5 text-white flex flex-col items-start drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
        {/* Time - Even Smaller */}
        <div className="text-[36px] font-bold leading-none mb-1 tracking-tight">
          {time}
        </div>
        
        {/* Day and Date */}
        <div className="text-[12px] font-medium tracking-wide mb-2">
          {day} {date}
        </div>

        {/* Separator Line */}
        <div className="w-[180px] h-[1px] bg-white mb-2.5" />

        {/* Location Row */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className="relative flex items-center justify-center">
            <div className="bg-white w-3 h-3 rounded-full absolute" />
            <MapPin size={13} fill="white" stroke="white" strokeWidth={3} className="relative z-10 text-black/20" />
            <div className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-white" />
          </div>
          <div className="text-[11px] font-bold ml-0.5">
            {address}
          </div>
        </div>

        {/* Verification Row */}
        {isVerified && (
          <div className="flex items-center gap-1 mt-0.5 opacity-90">
            <div className="bg-white/10 p-0.5 rounded-full border border-white/20">
              <ShieldCheck size={9} className="text-white fill-white/10" />
            </div>
            <span className="text-[8px] font-semibold tracking-tight">
              Time & location verified by Marki
            </span>
          </div>
        )}
      </div>

      {/* Bottom Right Branding */}
      <div className="absolute bottom-6 right-5 text-white flex flex-col items-end drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
        <div className="text-[18px] font-bold leading-tight flex items-baseline">
          Marki
          <div className="w-1 h-1 bg-white rounded-full ml-0.5 mb-0.5 shadow-md shadow-white/30" />
        </div>
        <div className="text-[7px] font-bold opacity-90 uppercase tracking-[0.2em] mt-0.5">
          Actual Time
        </div>
      </div>
    </div>
  );
};
