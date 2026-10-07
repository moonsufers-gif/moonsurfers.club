import React from 'react';
import { Flame } from 'lucide-react';

interface BrandLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  currentSector?: string;
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  className = '', 
  size = 'md',
  currentSector = 'ACC',
  onClick
}) => {
  const textSizes = {
    xs: 'text-base font-black',
    sm: 'text-lg sm:text-xl font-black',
    md: 'text-xl sm:text-2xl font-black',
    lg: 'text-2xl sm:text-3xl font-black',
    xl: 'text-3xl sm:text-4xl font-black'
  };

  const badgeTextSizes = {
    xs: 'text-[7px]',
    sm: 'text-[8px] sm:text-[9px]',
    md: 'text-[8px] sm:text-[9px]',
    lg: 'text-[9px] sm:text-[10px]',
    xl: 'text-[10px] sm:text-xs'
  };

  return (
    <div 
      onClick={onClick}
      className={`flex flex-col w-fit select-none ${onClick ? 'cursor-pointer hover:opacity-90 active:scale-95 transition-all' : ''} ${className}`}
    >
      <div className={`flex items-center justify-between w-full font-mono mb-0.5 text-red-500 font-bold uppercase tracking-widest ${badgeTextSizes[size]}`}>
        <span className="bg-red-600/90 text-white font-black px-1.5 py-0.2 uppercase tracking-wider rounded-xs italic">
          OUTLAW CHANNEL
        </span>
        <span className="text-red-400 font-extrabold">
          SEC [{currentSector}]
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 fill-red-500/40 animate-pulse drop-shadow-[0_0_14px_rgba(255,0,43,0.95)] shrink-0" />
        <h1 className={`${textSizes[size]} font-black text-white uppercase tracking-tighter font-syne italic leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]`}>
          MOONSURFERS
        </h1>
      </div>
    </div>
  );
};






