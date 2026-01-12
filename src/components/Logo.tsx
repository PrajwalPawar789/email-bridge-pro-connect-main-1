import React, { useId } from 'react';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({
  className = "",
  iconClassName = "w-8 h-8",
  textClassName = "text-2xl text-white",
  showText = true
}) => {
  const rawId = useId();
  const safeId = rawId.replace(/:/g, '');
  const baseId = `logoBase-${safeId}`;
  const highlightId = `logoHighlight-${safeId}`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`relative flex items-center justify-center ${iconClassName}`}>
        <svg 
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_10px_18px_rgba(15,23,42,0.3)]"
        >
          <defs>
            <linearGradient id={baseId} x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0b1120" />
              <stop offset="100%" stopColor="#111827" />
            </linearGradient>
            <linearGradient id={highlightId} x1="6" y1="6" x2="42" y2="6" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Background Shape */}
          <rect x="4" y="4" width="40" height="40" rx="12" fill={`url(#${baseId})`} />
          <rect x="4" y="4" width="40" height="40" rx="12" stroke="#1f2937" strokeWidth="1.4" />
          <rect x="6" y="6" width="36" height="36" rx="10" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
          <rect x="6" y="6" width="36" height="12" rx="8" fill={`url(#${highlightId})`} opacity="0.35" />

          {/* Bridge Mark */}
          <path
            d="M17 20L24 26L31 20"
            stroke="#f8fafc"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17 30V20M31 30V20"
            stroke="#f8fafc"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <path
            d="M17 30C19.5 24 28.5 24 31 30"
            stroke="#f8fafc"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <circle cx="24" cy="14.5" r="2" fill="#14b8a6" />
        </svg>
      </div>
      
      {showText && (
        <span className={`font-semibold tracking-wide ${textClassName}`}>
          Email
          <span className="ml-1 text-emerald-400">
            Bridge
          </span>
        </span>
      )}
    </div>
  );
};

export default Logo;
