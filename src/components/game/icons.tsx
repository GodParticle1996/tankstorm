// ═══════════════════════════════════════════════════════════
//  Icons — inline SVG icon set.
//  The app runs on Linux/WSL Electron where color-emoji fonts are
//  usually missing (emoji render as □ tofu). All game iconography
//  is therefore vector SVG, colored via currentColor.
// ═══════════════════════════════════════════════════════════

import type { ReactNode } from "react";
import type { WeaponCategory } from "../../game/engine/types";

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

function Svg({ size = 20, color, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={color ? { color } : undefined}
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ─── Weapon category icons ───

const CATEGORY_ICONS: Record<WeaponCategory, ReactNode> = {
  // Starburst
  explosive: (
    <path
      d="M12 1.5l1.8 5.4 4.6-3.3-2.3 5.2 5.7.7-5 2.5 3.7 4.4-5.5-1.6-.9 5.6-2.2-5.3-4.4 3.6 1.6-5.5-5.6-.9 5.3-2.2-3.6-4.4 5.5 1.6L12 1.5z"
      fill="currentColor"
    />
  ),
  // Flame
  napalm: (
    <path
      d="M12 2c.6 3.2 3.2 4.8 4.6 7.2 1.5 2.4 1.6 5.6-.4 7.9A6.9 6.9 0 0 1 12 19.5 6.9 6.9 0 0 1 7.8 17c-2-2.3-1.9-5.5-.4-7.9.4-.7 1-1.4 1.5-2.1.3 1.2 1 2.3 2 2.9C10.6 7.1 11.2 4.4 12 2z"
      fill="currentColor"
    />
  ),
  // Shovel digging into ground
  dirt: (
    <>
      <path d="M13.5 3.5l7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 9L9.5 14.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.5 12.5c1.6 1.6 2 4 .7 5.3-1.5 1.5-4.7 2.7-7.5 3 .3-2.8 1.5-6 3-7.5 1.3-1.3 3.7-.9 5.3.7z" fill="currentColor" />
    </>
  ),
  // Bouncing-ball arcs
  bounce: (
    <>
      <path
        d="M2.5 18C4 10.5 6.5 10.5 8 18c1.2-6 3.3-6 4.5 0 1-4.5 2.5-4.5 3.5 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="19.5" cy="17.5" r="2.5" fill="currentColor" />
    </>
  ),
  // Crosshair
  homing: (
    <>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // Lightning beam
  laser: (
    <path d="M13.5 1.5L4 14h6l-2 8.5L17.5 10h-6l2-8.5z" fill="currentColor" />
  ),
  // Fan of three shots
  multishot: (
    <>
      <path d="M12 21L6 8M12 21l.2-14M12 21l6-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5.5" cy="5.5" r="2.2" fill="currentColor" />
      <circle cx="12.2" cy="4.2" r="2.2" fill="currentColor" />
      <circle cx="18.7" cy="5.5" r="2.2" fill="currentColor" />
    </>
  ),
  // Shield
  defense: (
    <path
      d="M12 2l8 3v6.2c0 4.8-3.4 9.1-8 10.8-4.6-1.7-8-6-8-10.8V5l8-3z"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  ),
  // Vortex spiral
  special: (
    <path
      d="M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 3.5 3.5 0 1 0-7 0 5.5 5.5 0 1 0 11 0 7.5 7.5 0 1 0-15 0 9.5 9.5 0 0 0 9.5 9.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  ),
};

export function WeaponIcon({ category, ...props }: IconProps & { category: WeaponCategory }) {
  return <Svg {...props}>{CATEGORY_ICONS[category]}</Svg>;
}

// ─── UI icons ───

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l13-7.5L7 4.5z" fill="currentColor" />
    </Svg>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M20 12a8 8 0 1 1-2.7-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M20 2v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Landing page feature icons ───

export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </Svg>
  );
}

export function MountainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2 20L9 6l4 7 2.5-4L22 20H2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BurstIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 1.5l1.8 5.4 4.6-3.3-2.3 5.2 5.7.7-5 2.5 3.7 4.4-5.5-1.6-.9 5.6-2.2-5.3-4.4 3.6 1.6-5.5-5.6-.9 5.3-2.2-3.6-4.4 5.5 1.6L12 1.5z"
        fill="currentColor"
      />
    </Svg>
  );
}

// ─── Tank logo (hero mark on the landing page) ───

export function TankLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 96 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tanklogo-grad" x1="0" y1="0" x2="96" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* barrel */}
      <rect x="52" y="16" width="34" height="5" rx="2.5" transform="rotate(-24 52 16)" fill="url(#tanklogo-grad)" />
      {/* muzzle flash */}
      <path d="M84 1l2.4 4 4.4-1.6-2 4.2 4.2 2-4.6 1.4.6 4.6-3.8-2.8-3 3.4-.4-4.8-4.8-.6 3.8-2.8-2.2-4.2 4.6 1.6L84 1z" fill="#00d4ff" opacity="0.9" />
      {/* turret dome */}
      <path d="M38 30a12 12 0 0 1 24 0z" fill="url(#tanklogo-grad)" />
      {/* hull */}
      <path d="M22 32h56c3 0 5 2 5 5v5H17v-5c0-3 2-5 5-5z" fill="url(#tanklogo-grad)" opacity="0.85" />
      {/* tracks */}
      <rect x="14" y="44" width="72" height="14" rx="7" fill="url(#tanklogo-grad)" opacity="0.6" />
      <circle cx="26" cy="51" r="4" fill="#0a0f1e" />
      <circle cx="40" cy="51" r="4" fill="#0a0f1e" />
      <circle cx="54" cy="51" r="4" fill="#0a0f1e" />
      <circle cx="68" cy="51" r="4" fill="#0a0f1e" />
    </svg>
  );
}
