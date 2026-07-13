// ═══════════════════════════════════════════════════════════
//  TankStorm — Engine Type Definitions
//  World space: X right, Y UP, origin bottom-left.
//  Points-only model (no health). Composable weapon behaviors.
// ═══════════════════════════════════════════════════════════

// ─── FSM Phases ───

export type GamePhase =
  | "DRAFT" // weapon shop / draft phase (React modal, engine idle)
  | "AIMING" // current player adjusting angle/power
  | "FIRING" // projectile(s) in flight, waiting for settlement
  | "ROUND_END" // brief tally between volleys
  | "GAME_OVER";

// ─── Tank ───

export interface TankState {
  id: 0 | 1;
  x: number; // world X (center)
  y: number; // world Y (bottom, on terrain surface)
  angleDeg: number; // turret angle: 0 = right (+X), 90 = up, 180 = left
  power: number; // 0–100
  score: number; // cumulative points
  movesRemaining: number;
  weapons: string[]; // weapon IDs (single-use each)
  selectedWeapon: string;
  // Shield status (checked in single applyHitToTank chokepoint)
  shieldHp: number; // > 0 means shielded; absorbs damage
  // Falling state for tank settling
  vy: number; // vertical velocity while falling (0 when grounded)
  falling: boolean;
}

// ─── Projectile ───

export interface ProjectileState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponId: string;
  ownerId: 0 | 1;
  // Bounce
  bouncesRemaining: number;
  // Homing
  homingTurnRate: number; // deg/s, 0 = not homing
  homingAcquireDelay: number; // seconds before homing activates
  age: number; // seconds since spawn
  // Fuse (0 = no fuse, explodes on impact)
  fuse: number;
  // Track previous position for swept collision
  prevX: number;
  prevY: number;
  // Mass scale (affects wind/gravity resistance; 1 = normal)
  massScale: number;
}

// ─── Weapon System (composable ImpactSpec) ───

export type WeaponCategory =
  | "explosive"
  | "napalm"
  | "dirt"
  | "bounce"
  | "homing"
  | "laser"
  | "multishot"
  | "defense"
  | "special";

export interface ProjectileSpec {
  count: number; // shots fired (1 for most, 6 for scattershot)
  spreadDeg?: number; // angular spread when count > 1
  salvoDelayMs?: number; // sequential firing delay (Tommy Gun)
  windImmune?: boolean;
  massScale?: number; // Cannonball: heavier = less wind effect
  bounces?: number; // 0 default; Rubber Ball: 8
  bounceRestitution?: number;
  homing?: { turnRateDegPerSec: number; acquireDelayMs: number };
  fuse?: number; // seconds, 0 = impact-detonated
}

export type ImpactSpec =
  | { kind: "explosion"; radius: number; knockback: number; craterScale: number }
  | { kind: "carve"; shape: "crater" | "trench" | "shaft" | "wideShallow"; size: number }
  | { kind: "build"; shape: "wall" | "pillar" | "dome"; size: number; atSelf?: boolean }
  | { kind: "zone"; effect: "fire" | "radiation"; radius: number; ticks: number; pointsPerTick: number }
  | { kind: "split"; childWeaponId: string; count: number; spreadDeg: number; inheritVelocity: number }
  | { kind: "beam"; piercesTerrain: boolean; width: number }
  | { kind: "displaceTank"; mode: "pull" | "lift" | "random"; strength: number }
  // Grants the SHOOTER a damage-absorbing shield (checked in applyHitToTank)
  | { kind: "shield"; amount: number }
  // Teleports the shooter's tank to the impact point
  | { kind: "teleport" }
  // Rains child projectiles from the sky, centered on the impact X
  | { kind: "airstrike"; childWeaponId: string; count: number; spreadWidth: number };

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  basePoints: number; // base scoring value (not "damage" — points-only model)
  projectile: ProjectileSpec;
  impact: ImpactSpec[];
  isInstant?: boolean; // lasers/beams resolve on fire, skip ballistics
  premium?: boolean; // weighted higher-value tier in the draft (§2.5)
  hidden?: boolean; // child projectiles — never dealt in the draft
  description: string;
  icon: string;
  color: string;
}

// ─── Zone Effects (applied at turn transition, not per-frame) ───

export interface ZoneEffect {
  id: number;
  effect: "fire" | "radiation";
  x: number;
  y: number;
  radius: number;
  ticksRemaining: number;
  pointsPerTick: number;
  owner: 0 | 1;
}

// ─── Visual Effect (for renderer — NOT in simulation hot path) ───

export interface VisualEffect {
  id: number;
  type: "explosion" | "dust" | "fire" | "beam" | "spark" | "displace";
  x: number;
  y: number;
  radius: number;
  color: string;
  age: number;
  maxAge: number;
  // For beam effects
  x2?: number;
  y2?: number;
}

// ─── Score Popup (for HUD display) ───

export interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  maxAge: number;
}

// ─── Game Snapshot (what React sees — slow-changing, event-driven) ───

export interface GameSnapshot {
  phase: GamePhase;
  round: number;
  maxRounds: number;
  currentPlayer: 0 | 1;
  wind: number;
  // Per-player readouts (change on discrete events, not per-frame)
  p1Score: number;
  p2Score: number;
  p1Moves: number;
  p2Moves: number;
  p1Weapons: string[];
  p2Weapons: string[];
  p1Selected: string;
  p2Selected: string;
  p1Shield: boolean;
  p2Shield: boolean;
  winner: 0 | 1 | -1 | null;
  // Score popups for floating display
  popups: ScorePopup[];
}

// ─── Aim Readout (per-frame values — separate lightweight subscription) ───

export interface AimReadout {
  angleDeg: number;
  power: number;
  // Trajectory preview points for the aiming player
  trajectory: { x: number; y: number }[];
}
