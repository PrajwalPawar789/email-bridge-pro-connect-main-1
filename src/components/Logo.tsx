import React from 'react';

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
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`relative flex items-center justify-center ${iconClassName}`}>
        <svg 
          viewBox="0 0 40 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="logoGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#6366f1" /> {/* Indigo-500 */}
              <stop offset="100%" stopColor="#8b5cf6" /> {/* Violet-500 */}
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* Background Shape - Rounded Square */}
          <rect x="2" y="2" width="36" height="36" rx="8" fill="url(#logoGradient)" opacity="0.1" />
          <rect x="2" y="2" width="36" height="36" rx="8" stroke="url(#logoGradient)" strokeWidth="1.5" strokeOpacity="0.3" />

          {/* Main Icon - Envelope/Bridge Fusion */}
          <path 
            d="M10 14L20 22L30 14" 
            stroke="url(#logoGradient)" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <path 
            d="M10 26V14M30 26V14" 
            stroke="url(#logoGradient)" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          {/* Bridge Arch */}
          <path 
            d="M10 26C10 26 14 20 20 20C26 20 30 26 30 26" 
            stroke="url(#logoGradient)" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </svg>
      </div>
      
      {showText && (
        <span className={`font-bold tracking-tight ${textClassName}`}>
          Email<span className="text-indigo-500">Bridge</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
