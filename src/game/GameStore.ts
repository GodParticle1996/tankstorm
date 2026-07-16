// ═══════════════════════════════════════════════════════════
//  Game Store — React bridge via useSyncExternalStore (§1.1)
//  React subscribes to slow-changing snapshots only.
//  Per-frame values (projectile positions, particles, aim trajectory)
//  are read directly from the engine by the renderer — never React.
// ═══════════════════════════════════════════════════════════

import { useSyncExternalStore } from "react";
import { GameEngine } from "./engine/GameEngine";
import type { GameSnapshot } from "./engine/types";

// Singleton engine instance (created once per game session)
let engine: GameEngine | null = null;

/** Get or create the singleton engine */
export function getEngine(): GameEngine {
  if (!engine) {
    engine = new GameEngine();
  }
  return engine;
}

/** Destroy the engine (on route unmount) */
export function destroyEngine(): void {
  if (engine) {
    engine.dispose();
    engine = null;
  }
}

// ─── Empty snapshot for SSR/initial ───
const EMPTY_SNAPSHOT: GameSnapshot = {
  phase: "DRAFT",
  round: 1,
  maxRounds: 10,
  modeName: "Classic Battle",
  currentPlayer: 0,
  wind: 0,
  p1Score: 0,
  p2Score: 0,
  p1Moves: 4,
  p2Moves: 4,
  p1Weapons: [],
  p2Weapons: [],
  p1Selected: "",
  p2Selected: "",
  p1Shield: false,
  p2Shield: false,
  winner: null,
  popups: [],
};

/**
 * React hook to subscribe to the game engine's snapshot.
 * Only re-renders when discrete game events occur (score change,
 * phase change, round change, weapon selection, etc.) — NOT per frame.
 */
export function useGameSnapshot(): GameSnapshot {
  const eng = getEngine();

  const snapshot = useSyncExternalStore(
    eng.subscribe,
    eng.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  return snapshot;
}
