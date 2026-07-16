// ═══════════════════════════════════════════════════════════
//  Battle Modes — pure data configs. Always 2 players; a mode only
//  changes world rules (gravity, wind, volleys, moves, multipliers)
//  and the visual theme. The engine reads the active ModeConfig;
//  the renderer reads its theme.
// ═══════════════════════════════════════════════════════════

import { PHYSICS } from "./constants";

export type TerrainTheme = "night" | "storm" | "lunar" | "inferno";

export interface ModeConfig {
  id: string;
  name: string;
  tagline: string;
  perks: string[]; // display bullets on the mode-select card
  volleys: number; // each player fires this many times
  moves: number; // tank moves per MATCH (Q/E)
  gravityScale: number; // 1 = normal
  windRange: number; // max |wind|; 0 = airless
  pointsMult: number; // score multiplier
  craterMult: number; // crater radius multiplier
  knockbackMult: number;
  premiumOnly: boolean; // draft/quick-start deal only premium weapons
  precarveCraters: number; // moonscape-style pre-cratered map
  theme: TerrainTheme;
}

export const MODES: ModeConfig[] = [
  {
    id: "classic",
    name: "Classic Battle",
    tagline: "The standard artillery duel",
    perks: ["10 volleys", "4 tank moves", "Normal gravity & wind"],
    volleys: 10, moves: 4,
    gravityScale: 1, windRange: PHYSICS.WIND_RANGE,
    pointsMult: 1, craterMult: 1, knockbackMult: 1,
    premiumOnly: false, precarveCraters: 0,
    theme: "night",
  },
  {
    id: "blitz",
    name: "Storm Blitz",
    tagline: "Short, loud, and windy",
    perks: ["5 volleys", "2 tank moves", "Winds up to ±80", "Points ×1.5"],
    volleys: 5, moves: 2,
    gravityScale: 1, windRange: 80,
    pointsMult: 1.5, craterMult: 1, knockbackMult: 1,
    premiumOnly: false, precarveCraters: 0,
    theme: "storm",
  },
  {
    id: "lunar",
    name: "Lunar War",
    tagline: "Low gravity on a cratered moonscape",
    perks: ["10 volleys", "Gravity ×0.4", "No wind (airless)", "Knockback ×1.3"],
    volleys: 10, moves: 4,
    gravityScale: 0.4, windRange: 0,
    pointsMult: 1, craterMult: 1.15, knockbackMult: 1.3,
    premiumOnly: false, precarveCraters: 5,
    theme: "lunar",
  },
  {
    id: "heavy",
    name: "Heavy Metal",
    tagline: "Premium-only arsenals, scorched earth",
    perks: ["8 volleys", "Premium weapons only", "Craters ×1.4", "Knockback ×1.5"],
    volleys: 8, moves: 4,
    gravityScale: 1, windRange: PHYSICS.WIND_RANGE,
    pointsMult: 1, craterMult: 1.4, knockbackMult: 1.5,
    premiumOnly: true, precarveCraters: 0,
    theme: "inferno",
  },
];

export const DEFAULT_MODE: ModeConfig = MODES[0];

export function getMode(id: string): ModeConfig {
  return MODES.find((m) => m.id === id) ?? DEFAULT_MODE;
}
