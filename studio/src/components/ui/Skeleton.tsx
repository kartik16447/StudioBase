import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return <div className={cn('sb-skel rounded-sm', className)} style={style} />;
};

export const TextLineSkeleton: React.FC<{ width?: string | number, height?: number, className?: string }> = ({ 
  width = '100%', 
  height = 12, 
  className = '' 
}) => {
  return <Skeleton className={cn('rounded-pill', className)} style={{ width, height }} />;
};

export const ScreenshotSkeleton: React.FC<{ aspect?: string, rounded?: string, className?: string }> = ({ 
  aspect = '16 / 10', 
  rounded = 'rounded-img', 
  className = '' 
}) => {
  return (
    <div 
      className={cn(rounded, 'relative overflow-hidden bg-[#FAFAFC] shadow-card', className)} 
      style={{ aspectRatio: aspect, boxShadow: '0 4px 20px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.04)' }}
    >
      {/* Fake browser chrome row */}
      <div className="h-9 px-3 border-b border-border flex items-center gap-2 bg-[#FAFAFC]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5EA]" />
        <Skeleton className="flex-1 mx-3 rounded-md" style={{ height: 20 }} />
      </div>
      <Skeleton className="absolute inset-0 top-9 rounded-none" />
    </div>
  );
};

export const SessionCardSkeleton: React.FC = () => {
  return (
    <div className="bg-surface rounded-card shadow-card overflow-hidden">
      <ScreenshotSkeleton aspect="16 / 10" rounded="rounded-none" className="!shadow-none" />
      <div className="p-5 space-y-3">
        <TextLineSkeleton width="80%" height={16} />
        <TextLineSkeleton width="55%" height={12} />
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="rounded-full" style={{ width: 22, height: 22 }} />
          <Skeleton className="rounded-full" style={{ width: 22, height: 22 }} />
          <TextLineSkeleton width={70} height={11} className="ml-auto" />
        </div>
      </div>
    </div>
  );
};

export const StepCardSkeleton: React.FC = () => {
  return (
    <div className="bg-surface rounded-card shadow-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="rounded-pill" style={{ width: 28, height: 22 }} />
        <TextLineSkeleton width={80} height={11} />
        <TextLineSkeleton width={120} height={12} />
      </div>
      <TextLineSkeleton width="92%" height={20} className="mb-2" />
      <TextLineSkeleton width="64%" height={20} className="mb-5" />
      <ScreenshotSkeleton aspect="16 / 9" />
    </div>
  );
};
