// Stress test: full matches with random arsenals across many seeds.
// Exercises every weapon archetype (explosions, splits, zones, carves,
// builds, bounces, homing, beams, shields, teleports, airstrikes) and
// asserts world invariants after every shot. Deterministic per seed.
import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine";
import { WORLD } from "../constants";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 42, 99, 1234, 55555, 987654];

function assertWorldSane(engine: GameEngine, context: string): void {
  const tanks = engine.getTanks();
  for (const tank of tanks) {
    expect(Number.isFinite(tank.x), `${context}: tank.x finite`).toBe(true);
    expect(Number.isFinite(tank.y), `${context}: tank.y finite`).toBe(true);
    expect(tank.x, `${context}: tank.x >= 0`).toBeGreaterThanOrEqual(0);
    expect(tank.x, `${context}: tank.x <= WIDTH`).toBeLessThanOrEqual(WORLD.WIDTH);
    expect(tank.y, `${context}: tank.y sane low`).toBeGreaterThan(-60);
    expect(tank.y, `${context}: tank.y sane high`).toBeLessThan(WORLD.HEIGHT + 200);
    expect(Number.isFinite(tank.score), `${context}: score finite`).toBe(true);
    expect(tank.shieldHp, `${context}: shield >= 0`).toBeGreaterThanOrEqual(0);
  }
  const terrain = engine.terrain;
  for (let i = 0; i < terrain.cols; i += 16) {
    const y = terrain.surfaceY[i];
    expect(Number.isFinite(y), `${context}: terrain[${i}] finite`).toBe(true);
    expect(y, `${context}: terrain[${i}] above floor`).toBeGreaterThanOrEqual(WORLD.TERRAIN_FLOOR_Y - 1);
    expect(y, `${context}: terrain[${i}] below ceil`).toBeLessThanOrEqual(WORLD.TERRAIN_CEIL_Y + 1);
  }
}

describe("stress: full random-arsenal matches stay sane", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: match completes, world stays valid on every shot`, () => {
      const engine = new GameEngine(seed);
      engine.quickStart(); // random 10-weapon arsenal per player from the full pool

      // Vary the aim deterministically per shot so different weapons
      // land short/long/high across the match
      let shotIdx = 0;
      let guard = 0;

      while (engine.getSnapshot().phase !== "GAME_OVER" && guard++ < 80) {
        const snap = engine.getSnapshot();
        if (snap.phase === "AIMING") {
          const player = snap.currentPlayer;
          const angleVar = [35, 45, 55, 65, 75, 85][shotIdx % 6];
          const power = [30, 55, 75, 95][shotIdx % 4];
          engine.setAngle(player === 0 ? angleVar : 180 - angleVar);
          engine.setPower(power);
          engine.fire();
          shotIdx++;
          engine.advance(20); // watchdog guarantees FIRING ends within 15s
          expect(engine.getSnapshot().phase, `seed ${seed} shot ${shotIdx}: FIRING must end`).not.toBe("FIRING");
          assertWorldSane(engine, `seed ${seed} shot ${shotIdx}`);
        } else {
          engine.advance(3); // ROUND_END countdown
        }
      }

      const final = engine.getSnapshot();
      expect(final.phase, `seed ${seed}: match must complete`).toBe("GAME_OVER");
      expect(final.round).toBe(WORLD.MAX_VOLLEYS);
      expect(shotIdx).toBe(WORLD.MAX_VOLLEYS * 2);
      expect([0, 1, -1]).toContain(final.winner);
    });
  }
});
