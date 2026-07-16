// ═══════════════════════════════════════════════════════════
//  TankStorm — Engine Constants
//  All world/physics constants defined once, tuned for fixed dt.
//  World space: X right, Y UP, origin bottom-left. Units = world units.
//  Battlefield = 1000 × 500 world units.
// ═══════════════════════════════════════════════════════════

export const WORLD = {
  WIDTH: 1000,
  HEIGHT: 500,
  TERRAIN_COLS: 1024, // heightmap resolution (Float32Array length)
  TERRAIN_FLOOR_Y: 20, // lowest surface can go (craters can't carve below this)
  TERRAIN_CEIL_Y: 480, // highest surface can go (generation/build can't exceed this)
  TANK_WIDTH: 24,
  TANK_HEIGHT: 14,
  TURRET_LENGTH: 18,
  TANK_P1_X_FRAC: 0.2, // 20% of world width
  TANK_P2_X_FRAC: 0.8, // 80% of world width
  TANK_FLATTEN_RADIUS: 40, // flatten terrain within this window around spawn
  MAX_MOVES: 4,
  MAX_VOLLEYS: 10, // each player fires 10 times
  MOVE_SPEED: 15, // world units per move (a small hop, 4 per match)
  MAX_SLOPE_DEG: 60, // refuse movement if slope exceeds this
  EDGE_BONUS: 25, // bonus for knocking tank off map edge
} as const;

export const PHYSICS = {
  FIXED_DT: 1 / 120, // fixed timestep in seconds (120 Hz)
  MAX_FRAME_DELTA: 0.1, // clamp frame delta to survive hitches
  GRAVITY: 500, // world units / s² (Y-up: gravity pulls toward y=0)
  POWER_SCALE: 7.3, // power(0-100) → velocity = power * POWER_SCALE
  WIND_SCALE: 1.2, // wind(-50..+50) → acceleration = wind * WIND_SCALE
  WIND_RANGE: 50, // max absolute wind value
  HOMING_ACQUIRE_DELAY: 0.4, // seconds of ballistic flight before homing activates
  HOMING_TURN_RATE: 90, // degrees per second
  BOUNCE_RESTITUTION: 0.55, // energy retained on bounce
  TANK_FALL_GRAVITY: 600, // gravity for settling falling tanks
  SETTLE_EPSILON: 0.5, // tank is "on ground" if within this of surface
  SETTLE_GRACE_MS: 500, // grace period after quiet before turn ends
  WATCHDOG_MAX_SECONDS: 15, // force-detonate if FIRING exceeds this
} as const;

export const SCORING = {
  DIRECT_HIT_DIST: 0, // within blast radius * 0.3
  NEAR_MISS_DIST: 30, // within 30 world units
  NEAR_MISS_MULT: 0.5,
  GRAZE_DIST: 60, // within 60 world units
  GRAZE_MULT: 0.25,
  SELF_DAMAGE_MULT: 0.5, // shooter loses abs(score) * this
  EDGE_BONUS: 25, // flat bonus for knocking opponent off map edge
} as const;

export const PARTICLES = {
  POOL_SIZE: 4000, // preallocated particle slots
  MAX_PER_EXPLOSION: 60,
} as const;
