// ═══════════════════════════════════════════════════════════
//  Weapon Registry — Composable data-driven weapons (§2.3)
//  Each weapon is a data record referencing shared ImpactSpec behaviors.
//  8 archetypes: explosion, split, zone, carve, build, bounce, homing, beam.
//  Remaining ~32 weapons are data entry (~15 lines each).
//  v1.0 ships ~40 weapons. 5 fiddly ones cut (§2.3 cut list).
// ═══════════════════════════════════════════════════════════

import type { WeaponDef } from "./types";

export const WEAPONS: WeaponDef[] = [
  // ═══════════════════════════════════════════════
  //  ARCHETYPE 1: Single Shot (explosion)
  // ═══════════════════════════════════════════════
  {
    id: "single_shot", name: "Single Shot", category: "explosive", basePoints: 20,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 35, knockback: 0, craterScale: 1.0 }],
    description: "Basic round, small crater", icon: "💥", color: "#ff6b35",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 2: Cluster Bomb (split)
  // ═══════════════════════════════════════════════
  {
    id: "cluster_bomb", name: "Cluster Bomb", category: "explosive", basePoints: 25,
    projectile: { count: 1, windImmune: false, fuse: 1.2 },
    impact: [{ kind: "split", childWeaponId: "cluster_child", count: 5, spreadDeg: 360, inheritVelocity: 0.3 }],
    description: "Splits into 5 mini-bombs", icon: "🧨", color: "#ff6b35",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 3: Napalm (zone)
  // ═══════════════════════════════════════════════
  {
    id: "napalm", name: "Napalm", category: "napalm", basePoints: 15,
    projectile: { count: 1, windImmune: false },
    impact: [
      { kind: "explosion", radius: 30, knockback: 0, craterScale: 0.3 },
      { kind: "zone", effect: "fire", radius: 45, ticks: 3, pointsPerTick: 5 },
    ],
    description: "Burning gel, damage over time", icon: "🔥", color: "#ff4500",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 4: Dirt Mover (carve)
  // ═══════════════════════════════════════════════
  {
    id: "dirt_mover", name: "Dirt Mover", category: "dirt", basePoints: 5,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "carve", shape: "crater", size: 50 }],
    description: "Removes large dirt chunk", icon: "⛏️", color: "#a16207",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 5: Magic Wall (build)
  // ═══════════════════════════════════════════════
  {
    id: "magic_wall", name: "Magic Wall", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "build", shape: "wall", size: 35 }],
    description: "Builds dirt wall at target", icon: "🧱", color: "#a78bfa",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 6: Skipper (bounce)
  // ═══════════════════════════════════════════════
  {
    id: "skipper", name: "Skipper", category: "bounce", basePoints: 18,
    projectile: { count: 1, windImmune: false, bounces: 5, bounceRestitution: 0.55 },
    impact: [{ kind: "explosion", radius: 30, knockback: 0, craterScale: 0.5 }],
    description: "Bounces 5x across terrain", icon: "🪨", color: "#06b6d4",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 7: Heatseeker (homing)
  // ═══════════════════════════════════════════════
  {
    id: "heatseeker", name: "Heatseeker", category: "homing", basePoints: 35,
    projectile: {
      count: 1, windImmune: true,
      homing: { turnRateDegPerSec: 90, acquireDelayMs: 400 },
    },
    impact: [{ kind: "explosion", radius: 40, knockback: 5, craterScale: 0.8 }],
    description: "Tracks enemy tank heat", icon: "🧭", color: "#ef4444",
  },

  // ═══════════════════════════════════════════════
  //  ARCHETYPE 8: Laser (beam — instant raycast)
  // ═══════════════════════════════════════════════
  {
    id: "laser", name: "Laser", category: "laser", basePoints: 25,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: false, width: 3 }],
    isInstant: true,
    description: "Instant beam, pierces terrain", icon: "📡", color: "#00ff88",
  },

  // ═══════════════════════════════════════════════
  //  REMAINING EXPLOSIVES
  // ═══════════════════════════════════════════════
  {
    id: "double_shot", name: "Double Shot", category: "explosive", basePoints: 15,
    projectile: { count: 2, spreadDeg: 5, windImmune: false },
    impact: [{ kind: "explosion", radius: 30, knockback: 0, craterScale: 0.8 }],
    description: "Two quick rounds", icon: "💥", color: "#ff6b35",
  },
  {
    id: "big_shot", name: "Big Shot", category: "explosive", basePoints: 35,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 50, knockback: 3, craterScale: 1.2 }],
    description: "Medium explosion radius", icon: "🔴", color: "#ff8c42",
  },
  {
    id: "heavy_artillery", name: "Heavy Artillery", category: "explosive", basePoints: 50, premium: true,
    projectile: { count: 1, windImmune: false, massScale: 1.3 },
    impact: [{ kind: "explosion", radius: 65, knockback: 8, craterScale: 1.5 }],
    description: "Large blast, big crater", icon: "💣", color: "#ff5722",
  },
  {
    id: "nuke", name: "Nuke", category: "explosive", basePoints: 80, premium: true,
    projectile: { count: 1, windImmune: false, massScale: 1.5 },
    impact: [{ kind: "explosion", radius: 90, knockback: 20, craterScale: 2.0 }],
    description: "Massive explosion, huge crater", icon: "☢️", color: "#fbbf24",
  },
  {
    id: "mega_nuke", name: "Mega Nuke", category: "explosive", basePoints: 100, premium: true,
    projectile: { count: 1, windImmune: false, massScale: 1.8 },
    impact: [{ kind: "explosion", radius: 110, knockback: 30, craterScale: 2.5 }],
    description: "Screen-shaking devastation", icon: "☣️", color: "#f59e0b",
  },
  {
    id: "fission_bomb", name: "Fission Bomb", category: "explosive", basePoints: 60, premium: true,
    projectile: { count: 1, windImmune: false },
    impact: [
      { kind: "explosion", radius: 70, knockback: 10, craterScale: 1.5 },
      { kind: "zone", effect: "radiation", radius: 60, ticks: 4, pointsPerTick: 8 },
    ],
    description: "Leaves radiation zone (DoT)", icon: "⚛️", color: "#84cc16",
  },
  {
    id: "impact_grenade", name: "Impact Grenade", category: "explosive", basePoints: 22,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 35, knockback: 2, craterScale: 0.9 }],
    description: "Explodes on contact, no bounce", icon: "🎚️", color: "#ef4444",
  },
  {
    id: "mortar", name: "Mortar", category: "explosive", basePoints: 30,
    projectile: { count: 1, windImmune: false, massScale: 1.4 },
    impact: [{ kind: "explosion", radius: 45, knockback: 5, craterScale: 1.0 }],
    description: "High arc, steep descent", icon: "🎯", color: "#f97316",
  },
  {
    id: "cannonball", name: "Cannonball", category: "explosive", basePoints: 28,
    projectile: { count: 1, windImmune: true, massScale: 2.0 },
    impact: [{ kind: "explosion", radius: 40, knockback: 6, craterScale: 1.1 }],
    description: "Heavy, wind-immune", icon: "⚫", color: "#6b7280",
  },

  // ═══════════════════════════════════════════════
  //  NAPALM & FIRE
  // ═══════════════════════════════════════════════
  {
    id: "fire_storm", name: "Fire Storm", category: "napalm", basePoints: 25,
    projectile: { count: 1, windImmune: false },
    impact: [
      { kind: "explosion", radius: 40, knockback: 0, craterScale: 0.2 },
      { kind: "zone", effect: "fire", radius: 65, ticks: 5, pointsPerTick: 6 },
    ],
    description: "Wide fire spread", icon: "🌪️", color: "#ff6b00",
  },
  // Flamethrower → redesigned as short-range fire cone burst (§2.3)
  {
    id: "fire_burst", name: "Fire Burst", category: "napalm", basePoints: 20,
    projectile: { count: 6, spreadDeg: 25, windImmune: true },
    impact: [
      { kind: "explosion", radius: 20, knockback: 0, craterScale: 0.1 },
      { kind: "zone", effect: "fire", radius: 30, ticks: 2, pointsPerTick: 4 },
    ],
    description: "Short-range fire cone burst", icon: "🔥", color: "#ff3300",
  },
  {
    id: "volcano", name: "Volcano", category: "napalm", basePoints: 40, premium: true,
    projectile: { count: 1, windImmune: true, fuse: 0.5 },
    impact: [
      { kind: "explosion", radius: 50, knockback: 15, craterScale: 1.3 },
      { kind: "zone", effect: "fire", radius: 55, ticks: 4, pointsPerTick: 7 },
    ],
    description: "Erupts upward fire pillar", icon: "🌋", color: "#dc2626",
  },
  {
    id: "inferno", name: "Inferno", category: "napalm", basePoints: 45, premium: true,
    projectile: { count: 1, windImmune: false },
    impact: [
      { kind: "explosion", radius: 50, knockback: 0, craterScale: 0.2 },
      { kind: "zone", effect: "fire", radius: 80, ticks: 6, pointsPerTick: 8 },
    ],
    description: "Massive fire area, long burn", icon: "☀️", color: "#ff0000",
  },

  // ═══════════════════════════════════════════════
  //  DIRT MOVERS (redesigned as trenches/pits — §1.4)
  // ═══════════════════════════════════════════════
  {
    id: "digger", name: "Digger", category: "dirt", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "carve", shape: "shaft", size: 80 }],
    description: "Digs deep open pit", icon: "🔩", color: "#92400e",
  },
  {
    id: "well_digger", name: "Well Digger", category: "dirt", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "carve", shape: "shaft", size: 100 }],
    description: "Creates deep circular pit", icon: "🕳️", color: "#78350f",
  },
  {
    id: "jackhammer", name: "Jackhammer", category: "dirt", basePoints: 8,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "carve", shape: "crater", size: 25 }],
    description: "Rapid small terrain destruction", icon: "🔨", color: "#b45309",
  },
  {
    id: "tunneler", name: "Tunneler", category: "dirt", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "carve", shape: "trench", size: 30 }],
    description: "Carves trench toward enemy", icon: "🚇", color: "#92400e",
  },
  {
    id: "excavator", name: "Excavator", category: "dirt", basePoints: 5,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "carve", shape: "wideShallow", size: 70 }],
    description: "Removes wide shallow area", icon: "🏗️", color: "#a16207",
  },
  {
    id: "landslide", name: "Landslide", category: "dirt", basePoints: 15,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 50, knockback: 3, craterScale: 1.8 }],
    description: "Collapses terrain at impact", icon: "⛰️", color: "#78716c",
  },
  {
    id: "terraformer", name: "Terraformer", category: "dirt", basePoints: 0,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "build", shape: "pillar", size: 45 }],
    description: "Raises a dirt pillar", icon: "🏔️", color: "#a8a29e",
  },

  // ═══════════════════════════════════════════════
  //  BOUNCING & RICOCHET
  // ═══════════════════════════════════════════════
  {
    id: "rubber_ball", name: "Rubber Ball", category: "bounce", basePoints: 12,
    projectile: { count: 1, windImmune: false, bounces: 8, bounceRestitution: 0.6 },
    impact: [{ kind: "explosion", radius: 28, knockback: 0, craterScale: 0.3 }],
    description: "Bounces 8x, low damage", icon: "⚪", color: "#67e8f9",
  },
  {
    id: "ricochet", name: "Ricochet", category: "bounce", basePoints: 28,
    projectile: { count: 1, windImmune: false, bounces: 3, bounceRestitution: 0.5 },
    impact: [{ kind: "explosion", radius: 38, knockback: 2, craterScale: 0.6 }],
    description: "Bounces 3x, high damage", icon: "🪃", color: "#0ea5e9",
  },
  {
    id: "pinball", name: "Pinball", category: "bounce", basePoints: 22,
    projectile: { count: 1, windImmune: false, bounces: 6, bounceRestitution: 0.7 },
    impact: [{ kind: "explosion", radius: 32, knockback: 1, craterScale: 0.4 }],
    description: "Chaotic bouncing, random angles", icon: "🕹️", color: "#3b82f6",
  },
  // Boomerang CUT (§2.3 — curve-back logic is fiddly)

  // ═══════════════════════════════════════════════
  //  HOMING & GUIDED
  // ═══════════════════════════════════════════════
  {
    id: "homing_missile", name: "Homing Missile", category: "homing", basePoints: 40, premium: true,
    projectile: {
      count: 1, windImmune: true,
      homing: { turnRateDegPerSec: 120, acquireDelayMs: 400 },
    },
    impact: [{ kind: "explosion", radius: 45, knockback: 6, craterScale: 0.9 }],
    description: "Guided flight to target", icon: "🚀", color: "#dc2626",
  },
  {
    id: "smart_bomb", name: "Smart Bomb", category: "homing", basePoints: 50, premium: true,
    projectile: {
      count: 1, windImmune: true,
      homing: { turnRateDegPerSec: 150, acquireDelayMs: 300 },
    },
    impact: [{ kind: "explosion", radius: 50, knockback: 8, craterScale: 1.0 }],
    description: "Adjusts mid-flight for accuracy", icon: "🎯", color: "#b91c1c",
  },
  {
    id: "swarm", name: "Swarm", category: "homing", basePoints: 18,
    projectile: {
      count: 3, spreadDeg: 15, windImmune: true,
      homing: { turnRateDegPerSec: 80, acquireDelayMs: 500 },
    },
    impact: [{ kind: "explosion", radius: 30, knockback: 3, craterScale: 0.5 }],
    description: "3 mini homing missiles", icon: "🐝", color: "#fbbf24",
  },
  // Tracker Dart CUT (§2.3 — cross-turn targeting state complicates FSM)

  // ═══════════════════════════════════════════════
  //  LASERS & BEAMS (instant raycasts — §2.3)
  // ═══════════════════════════════════════════════
  {
    id: "super_laser", name: "Super Laser", category: "laser", basePoints: 45, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: false, width: 6 }],
    isInstant: true,
    description: "Thicker beam, more damage", icon: "🔦", color: "#00ff00",
  },
  {
    id: "phaser", name: "Phaser", category: "laser", basePoints: 30,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: true, width: 4 }],
    isInstant: true,
    description: "Phases through all terrain", icon: "⚡", color: "#a3e635",
  },
  {
    id: "railgun", name: "Railgun", category: "laser", basePoints: 60, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: false, width: 2 }],
    isInstant: true,
    description: "Extreme velocity, pinpoint", icon: "🔫", color: "#22d3ee",
  },
  // Death Ray → fat instant beam (§2.3 — sweeping cut)
  {
    id: "death_ray", name: "Death Ray", category: "laser", basePoints: 80, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: true, width: 12 }],
    isInstant: true,
    description: "Massive beam, pierces terrain", icon: "☄️", color: "#fde047",
  },

  // ═══════════════════════════════════════════════
  //  MULTI-SHOT
  // ═══════════════════════════════════════════════
  {
    id: "tommy_gun", name: "Tommy Gun", category: "multishot", basePoints: 3,
    projectile: { count: 8, spreadDeg: 12, windImmune: false, salvoDelayMs: 80 },
    impact: [{ kind: "explosion", radius: 18, knockback: 0, craterScale: 0.3 }],
    description: "8 rapid low-damage shots", icon: "🔫", color: "#fbbf24",
  },
  {
    id: "beehive", name: "Beehive", category: "multishot", basePoints: 6,
    projectile: {
      count: 6, spreadDeg: 30, windImmune: true,
      homing: { turnRateDegPerSec: 60, acquireDelayMs: 600 },
    },
    impact: [{ kind: "explosion", radius: 22, knockback: 1, craterScale: 0.3 }],
    description: "6 seeking micro-drones", icon: "🐝", color: "#facc15",
  },
  {
    id: "scattershot", name: "Scattershot", category: "multishot", basePoints: 10,
    projectile: { count: 6, spreadDeg: 20, windImmune: false },
    impact: [{ kind: "explosion", radius: 28, knockback: 1, craterScale: 0.5 }],
    description: "6-shot spread", icon: "🎯", color: "#f97316",
  },
  {
    id: "hailstorm", name: "Hailstorm", category: "multishot", basePoints: 5,
    projectile: { count: 12, spreadDeg: 40, windImmune: true, massScale: 1.5 },
    impact: [{ kind: "explosion", radius: 20, knockback: 0, craterScale: 0.2 }],
    description: "12 ice pellets from above", icon: "🧊", color: "#38bdf8",
  },
  // Flea Circus CUT (§2.3 — 25 bouncing bodies = perf/settlement stress)

  // ═══════════════════════════════════════════════
  //  DEFENSE
  // ═══════════════════════════════════════════════
  {
    id: "dome_protect", name: "Dome Protect", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "shield", amount: 30 }],
    description: "Energy shield, absorbs 30 pts", icon: "🛡️", color: "#60a5fa",
  },
  {
    id: "bubble_wrap", name: "Bubble Wrap", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "shield", amount: 18 }],
    description: "Light shield, absorbs 18 pts", icon: "🫧", color: "#93c5fd",
  },
  {
    id: "energy_shield", name: "Energy Shield", category: "defense", basePoints: 0, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "shield", amount: 45 }],
    description: "Heavy shield, absorbs 45 pts", icon: "🔰", color: "#38bdf8",
  },
  {
    id: "barrier", name: "Barrier", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "build", shape: "wall", size: 30 }],
    description: "Creates tall wall at target", icon: "🚧", color: "#818cf8",
  },
  {
    id: "fortress", name: "Fortress", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "build", shape: "dome", size: 55, atSelf: true }],
    description: "Buries your tank in a dirt dome", icon: "🏰", color: "#6366f1",
  },
  {
    id: "repair_kit", name: "Repair Kit", category: "defense", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "build", shape: "dome", size: 40, atSelf: true }],
    description: "Restores terrain around tank", icon: "🔧", color: "#10b981",
  },

  // ═══════════════════════════════════════════════
  //  SPECIAL & CHAOS
  // ═══════════════════════════════════════════════
  {
    id: "gravity_well", name: "Gravity Well", category: "special", basePoints: 15,
    projectile: { count: 1, windImmune: true },
    impact: [
      { kind: "explosion", radius: 30, knockback: 0, craterScale: 0.5 },
      { kind: "displaceTank", mode: "pull", strength: 40 },
    ],
    description: "Pulls enemy toward impact", icon: "🌀", color: "#8b5cf6",
  },
  {
    id: "lightning_strike", name: "Lightning Strike", category: "special", basePoints: 40,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "beam", piercesTerrain: true, width: 5 }],
    isInstant: true,
    description: "Instant bolt from sky", icon: "⚡", color: "#fde047",
  },
  {
    id: "tornado", name: "Tornado", category: "special", basePoints: 25,
    projectile: { count: 1, windImmune: true },
    impact: [
      { kind: "explosion", radius: 30, knockback: 0, craterScale: 0.2 },
      { kind: "displaceTank", mode: "lift", strength: 60 },
    ],
    description: "Lifts & throws enemy tank", icon: "🌪️", color: "#06b6d4",
  },
  {
    id: "black_hole", name: "Black Hole", category: "special", basePoints: 50, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [
      { kind: "carve", shape: "crater", size: 70 },
      { kind: "displaceTank", mode: "pull", strength: 80 },
    ],
    description: "Sucks in terrain + tank", icon: "🕳️", color: "#1e1b4b",
  },

  // ═══════════════════════════════════════════════
  //  PREMIUM ORDNANCE & NEW POWERS
  // ═══════════════════════════════════════════════
  {
    id: "mirv", name: "MIRV", category: "explosive", basePoints: 30, premium: true,
    projectile: { count: 1, windImmune: false, fuse: 1.0, massScale: 1.2 },
    impact: [{ kind: "split", childWeaponId: "mirv_child", count: 5, spreadDeg: 70, inheritVelocity: 0.85 }],
    description: "Splits at apex into 5 warheads", icon: "🚀", color: "#f472b6",
  },
  {
    id: "airstrike", name: "Airstrike", category: "special", basePoints: 12, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [
      { kind: "explosion", radius: 20, knockback: 0, craterScale: 0.4 },
      { kind: "airstrike", childWeaponId: "strike_bomb", count: 4, spreadWidth: 170 },
    ],
    description: "Calls 4 bombs from the sky", icon: "✈️", color: "#fbbf24",
  },
  {
    id: "meteor_shower", name: "Meteor Shower", category: "special", basePoints: 10, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "airstrike", childWeaponId: "meteor_child", count: 6, spreadWidth: 320 }],
    description: "6 burning meteors rain down", icon: "☄️", color: "#fb7185",
  },
  {
    id: "acid_rain", name: "Acid Rain", category: "napalm", basePoints: 8, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "airstrike", childWeaponId: "acid_drop", count: 5, spreadWidth: 220 }],
    description: "Corrosive droplets from above", icon: "🧪", color: "#a3e635",
  },
  {
    id: "bunker_buster", name: "Bunker Buster", category: "explosive", basePoints: 45, premium: true,
    projectile: { count: 1, windImmune: false, massScale: 1.6 },
    impact: [
      { kind: "carve", shape: "shaft", size: 45 },
      { kind: "explosion", radius: 45, knockback: 6, craterScale: 0.8 },
    ],
    description: "Drills deep, then detonates", icon: "🗜️", color: "#f59e0b",
  },
  {
    id: "sniper", name: "Sniper Round", category: "explosive", basePoints: 55, premium: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "explosion", radius: 16, knockback: 0, craterScale: 0.4 }],
    description: "Tiny blast, huge reward", icon: "🎯", color: "#e879f9",
  },
  {
    id: "payload", name: "Payload", category: "explosive", basePoints: 40, premium: true,
    projectile: { count: 1, windImmune: false, massScale: 1.3 },
    impact: [
      { kind: "explosion", radius: 55, knockback: 8, craterScale: 1.3 },
      { kind: "split", childWeaponId: "payload_child", count: 2, spreadDeg: 90, inheritVelocity: 0.4 },
    ],
    description: "Big blast + 2 bomblets", icon: "📦", color: "#fb923c",
  },
  {
    id: "earthquake", name: "Earthquake", category: "dirt", basePoints: 10, premium: true,
    projectile: { count: 1, windImmune: true, massScale: 1.5 },
    impact: [
      { kind: "carve", shape: "wideShallow", size: 130 },
      { kind: "displaceTank", mode: "random", strength: 50 },
    ],
    description: "Sinks terrain, shakes enemy", icon: "🌍", color: "#a8a29e",
  },
  {
    id: "warp", name: "Warp", category: "special", basePoints: 0,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "teleport" }],
    description: "Teleport your tank to impact", icon: "🌀", color: "#a855f7",
  },
  {
    id: "napalm_strike", name: "Napalm Strike", category: "napalm", basePoints: 20, premium: true,
    projectile: { count: 1, windImmune: false },
    impact: [
      { kind: "explosion", radius: 35, knockback: 0, craterScale: 0.3 },
      { kind: "zone", effect: "fire", radius: 55, ticks: 4, pointsPerTick: 6 },
      { kind: "airstrike", childWeaponId: "strike_bomb", count: 2, spreadWidth: 90 },
    ],
    description: "Fire + follow-up bombs", icon: "🔥", color: "#ea580c",
  },

  // ═══════════════════════════════════════════════
  //  CHILD WEAPONS (spawned by split/airstrike — never dealt)
  // ═══════════════════════════════════════════════
  {
    id: "cluster_child", name: "Cluster Bomb Child", category: "explosive", basePoints: 10, hidden: true,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 22, knockback: 0, craterScale: 0.5 }],
    description: "Mini-bomb from cluster", icon: "💥", color: "#ff6b35",
  },
  {
    id: "mirv_child", name: "MIRV Warhead", category: "explosive", basePoints: 14, hidden: true,
    projectile: { count: 1, windImmune: false, massScale: 1.2 },
    impact: [{ kind: "explosion", radius: 28, knockback: 1, craterScale: 0.6 }],
    description: "MIRV warhead", icon: "💥", color: "#f472b6",
  },
  {
    id: "strike_bomb", name: "Strike Bomb", category: "explosive", basePoints: 15, hidden: true,
    projectile: { count: 1, windImmune: true },
    impact: [{ kind: "explosion", radius: 32, knockback: 3, craterScale: 0.7 }],
    description: "Airstrike bomb", icon: "💥", color: "#fbbf24",
  },
  {
    id: "meteor_child", name: "Meteor", category: "napalm", basePoints: 10, hidden: true,
    projectile: { count: 1, windImmune: true, massScale: 1.4 },
    impact: [
      { kind: "explosion", radius: 24, knockback: 1, craterScale: 0.6 },
      { kind: "zone", effect: "fire", radius: 25, ticks: 2, pointsPerTick: 4 },
    ],
    description: "Burning meteor", icon: "☄️", color: "#fb7185",
  },
  {
    id: "acid_drop", name: "Acid Drop", category: "napalm", basePoints: 8, hidden: true,
    projectile: { count: 1, windImmune: true },
    impact: [
      { kind: "explosion", radius: 14, knockback: 0, craterScale: 0.3 },
      { kind: "zone", effect: "radiation", radius: 28, ticks: 2, pointsPerTick: 5 },
    ],
    description: "Corrosive splash", icon: "🧪", color: "#a3e635",
  },
  {
    id: "payload_child", name: "Bomblet", category: "explosive", basePoints: 15, hidden: true,
    projectile: { count: 1, windImmune: false },
    impact: [{ kind: "explosion", radius: 30, knockback: 2, craterScale: 0.6 }],
    description: "Payload bomblet", icon: "💥", color: "#fb923c",
  },
];

/** Quick lookup map */
export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
);

/** Get a weapon definition by ID */
export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPON_MAP[id];
}

/** Default starter weapons (if no draft — for quick play) */
export const DEFAULT_WEAPONS: string[] = [
  "single_shot", "big_shot", "cluster_bomb", "mortar", "napalm",
  "digger", "skipper", "laser", "magic_wall", "heatseeker",
];

/** Weapons available in the draft pool (excludes hidden child weapons) */
export const DRAFT_POOL: string[] = WEAPONS
  .filter((w) => !w.hidden)
  .map((w) => w.id);

/** Premium subset of the draft pool (§2.5 — deals guarantee at least 2) */
export const PREMIUM_POOL: string[] = WEAPONS
  .filter((w) => !w.hidden && w.premium)
  .map((w) => w.id);
