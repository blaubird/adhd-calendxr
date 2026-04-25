'use client';
import { useMemo } from 'react';

// Simple calculation for moon phase
function getMoonPhase(date: Date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();

  if (month < 3) {
    year--;
    month += 12;
  }
  ++month;
  
  const c = 365.25 * year;
  const e = 30.6 * month;
  const jd = c + e + day - 694039.09; // jd is total days elapsed
  const b = jd / 29.5305882; // divide by the moon cycle
  
  const phase = b - Math.floor(b);
  return phase; // 0 to 1
}

export function MoonPhase() {
  const phase = useMemo(() => getMoonPhase(new Date()), []);
  
  // Convert phase (0 to 1) to a visual representation
  // New Moon = 0, First Quarter = 0.25, Full Moon = 0.5, Last Quarter = 0.75
  
  // We'll create a glassy orb. The shadow determines the phase.
  const shadowPercent = Math.abs(0.5 - phase) * 2; // 1 at new moon, 0 at full moon
  const isWaxing = phase < 0.5;
  
  // We can use a linear gradient or box-shadow to simulate the phase on the sphere.
  // For a simple elegant dark UI, let's use a box shadow trick on a round div.
  
  return (
    <div className="moon-phase flex flex-col items-center gap-4 mt-6 pt-6 border-t border-slate-800">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Moon Phase</h3>
      <div className="flex flex-col items-center gap-4 w-full">
        <div 
          className="w-32 h-32 rounded-full bg-slate-200 relative overflow-hidden mx-auto"
          style={{
            boxShadow: '0 0 20px rgba(255,255,255,0.1), inset -10px -10px 25px rgba(0,0,0,0.6)',
          }}
        >
          {/* Shadow overlay to create the phase effect */}
          <div 
            className="absolute top-0 bottom-0 bg-slate-950 transition-all duration-1000"
            style={{
              left: isWaxing ? '0' : 'auto',
              right: isWaxing ? 'auto' : '0',
              width: `${shadowPercent * 100}%`,
              opacity: 0.85,
              borderRadius: isWaxing ? '0 100% 100% 0' : '100% 0 0 100%',
              transform: 'scaleX(1.5)', // stretch to make it look spherical
            }}
          />
          {/* Glass highlight */}
          <div className="absolute top-3 left-5 w-6 h-2 bg-white/30 rounded-full rotate-[-45deg] blur-[1px]" />
        </div>
        <span className="text-sm font-medium text-slate-300 tracking-wide">
          {phase < 0.05 || phase > 0.95 ? 'New Moon' 
            : phase < 0.25 ? 'Waxing Crescent' 
            : phase < 0.35 ? 'First Quarter' 
            : phase < 0.45 ? 'Waxing Gibbous' 
            : phase < 0.55 ? 'Full Moon' 
            : phase < 0.70 ? 'Waning Gibbous' 
            : phase < 0.80 ? 'Last Quarter' 
            : 'Waning Crescent'}
        </span>
      </div>
    </div>
  );
}
