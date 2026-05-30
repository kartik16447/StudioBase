import React from 'react';

// Minimal 1.5px line icons (lucide-ish geometry), drawn inline so the demo
// carries no icon-library dependency.

export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

function Svg({
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.5,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Crosshair = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <line x1="12" y1="2.5" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21.5" y2="12" />
  </Svg>
);

export const MessageSquare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </Svg>
);

export const Scan = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="2.4" />
  </Svg>
);

export const Paintbrush = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l4 4-7.5 7.5a3.5 3.5 0 0 1-1.8 1L6 18.5l1-3.7a3.5 3.5 0 0 1 1-1.8z" />
    <path d="M6 18.5C4.8 18.5 4 19.5 3.5 21c1.6.2 3-.2 3.6-1.3" />
    <line x1="15" y1="5" x2="19" y2="9" />
  </Svg>
);

export const Eye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const Bold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4h6a3.5 3.5 0 0 1 0 7h-6z" />
    <path d="M6.5 11h7a3.5 3.5 0 0 1 0 7h-7z" />
  </Svg>
);

export const Italic = (p: IconProps) => (
  <Svg {...p}>
    <line x1="10" y1="4" x2="18" y2="4" />
    <line x1="6" y1="20" x2="14" y2="20" />
    <line x1="14" y1="4" x2="10" y2="20" />
  </Svg>
);

export const Underline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4v6a5.5 5.5 0 0 0 11 0V4" />
    <line x1="5" y1="20" x2="19" y2="20" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.5 1.5" />
    <path d="M14.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.5-1.5" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </Svg>
);

export const Mic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <line x1="12" y1="17.5" x2="12" y2="21" />
    <line x1="9" y1="21" x2="15" y2="21" />
  </Svg>
);

// A single arrow that callers rotate via the `rotate` prop (degrees).
export const Arrow = ({ rotate = 0, ...p }: IconProps & { rotate?: number }) => (
  <Svg {...p} style={{ ...p.style, transform: `rotate(${rotate}deg)` }}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <path d="M6 11l6-6 6 6" />
  </Svg>
);

export const Ban = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

export const SquareShape = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="0.5" />
  </Svg>
);

export const RoundedShape = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
  </Svg>
);

export const CircleShape = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
  </Svg>
);

export const ZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="7" />
    <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
    <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
    <line x1="16" y1="16" x2="21" y2="21" />
  </Svg>
);

export const Palette = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="8" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <path d="M8.5 16c.8-1.5 2.2-2.5 3.5-2.5s2.7 1 3.5 2.5" />
  </Svg>
);
