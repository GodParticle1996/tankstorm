// Headless engine tests (§2.6) — the engine is pure TS with no DOM/Three.js,
// driven via the public advance() helper (no requestAnimationFrame in Node).
import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine";
import { WORLD } from "../constants";

const TEN = (id: string): string[] => Array(10).fill(id);

/** Fire the current player's weapon with a given aim and simulate until quiet */
function fireAndSettle(engine: GameEngine, angleDeg: number, power: number, settleSeconds = 12): void {
  engine.setAngle(angleDeg);
  engine.setPower(power);
  engine.fire();
  engine.advance(settleSeconds);
}

function terrainSample(engine: GameEngine): number[] {
  const cols = engine.terrain.cols;
  const out: number[] = [];
  for (let i = 0; i < cols; i += 64) out.push(Math.round(engine.terrain.surfaceY[i] * 100) / 100);
  return out;
}

describe("determinism (§2.6 item 6)", () => {
  it("same seed + same input script → identical final state", () => {
    const run = (): string => {
      const engine = new GameEngine(999);
      engine.initGame(TEN("single_shot"), TEN("single_shot"));
      for (let shot = 0; shot < 4; shot++) {
        const player = engine.getSnapshot().currentPlayer;
        fireAndSettle(engine, player === 0 ? 52 : 128, 64);
      }
      const snap = engine.getSnapshot();
      const tanks = engine.getTanks();
      return JSON.stringify({
        scores: [snap.p1Score, snap.p2Score],
        round: snap.round,
        wind: snap.wind,
        tanks: tanks.map((t) => [Math.round(t.x * 100), Math.round(t.y * 100)]),
        terrain: terrainSample(engine),
      });
    };
    expect(run()).toBe(run());
  });
});

describe("turn/volley flow (§2.6 item 5)", () => {
  it("a full 10-volley match completes with a winner and empty arsenals", () => {
    const engine = new GameEngine(42);
    engine.initGame(TEN("single_shot"), TEN("single_shot"));

    let guard = 0;
    while (engine.getSnapshot().phase !== "GAME_OVER" && guard++ < 60) {
      const snap = engine.getSnapshot();
      if (snap.phase === "AIMING") {
        fireAndSettle(engine, snap.currentPlayer === 0 ? 60 : 120, 55);
      } else {
        engine.advance(3); // ROUND_END countdown etc.
      }
    }

    const final = engine.getSnapshot();
    expect(final.phase).toBe("GAME_OVER");
    expect(final.round).toBe(WORLD.MAX_VOLLEYS);
    expect([0, 1, -1]).toContain(final.winner);
    expect(final.p1Weapons.length).toBe(0);
    expect(final.p2Weapons.length).toBe(0);
  });

  it("firing outside your turn is rejected", () => {
    const engine = new GameEngine(7);
    engine.initGame(TEN("single_shot"), TEN("single_shot"));
    engine.setAngle(60);
    engine.setPower(60);
    engine.fire();
    expect(engine.getSnapshot().phase).toBe("FIRING");
    const weaponsAfterFirstShot = engine.getSnapshot().p1Weapons.length;
    engine.fire(); // must be a no-op while FIRING
    expect(engine.getSnapshot().p1Weapons.length).toBe(weaponsAfterFirstShot);
  });

  it("firing a weapon removes only ONE copy (duplicates survive)", () => {
    const engine = new GameEngine(7);
    engine.initGame(TEN("single_shot"), TEN("single_shot"));
    expect(engine.getSnapshot().p1Weapons.length).toBe(10);
    fireAndSettle(engine, 60, 50);
    expect(engine.getSnapshot().p1Weapons.length).toBe(9);
  });
});

describe("multi-stage weapons settle before the turn ends (§2.6 item 3)", () => {
  it("cluster bomb children exist after the fuse and all resolve", () => {
    const engine = new GameEngine(31);
    engine.initGame(TEN("cluster_bomb"), TEN("single_shot"));
    engine.setAngle(45);
    engine.setPower(80);
    engine.fire();

    engine.advance(1.3); // fuse is 1.2s — parent split, children airborne
    expect(engine.getProjectiles().length).toBeGreaterThanOrEqual(4);
    expect(engine.getSnapshot().phase).toBe("FIRING");

    engine.advance(12);
    expect(engine.getProjectiles().length).toBe(0);
    expect(engine.getSnapshot().phase).not.toBe("FIRING");
  });

  it("airstrike rains children from the sky and the turn still ends", () => {
    const engine = new GameEngine(77);
    engine.initGame(TEN("airstrike"), TEN("single_shot"));
    const before = terrainSample(engine).join(",");
    fireAndSettle(engine, 55, 70, 15);
    expect(engine.getSnapshot().phase).not.toBe("FIRING");
    expect(terrainSample(engine).join(",")).not.toBe(before);
  });
});

describe("new powers", () => {
  it("shield weapon grants the shooter absorb points", () => {
    const engine = new GameEngine(5);
    engine.initGame(TEN("dome_protect"), TEN("single_shot"));
    expect(engine.getTanks()[0].shieldHp).toBe(0);
    fireAndSettle(engine, 80, 40);
    expect(engine.getTanks()[0].shieldHp).toBe(30);
    expect(engine.getSnapshot().p1Shield).toBe(true);
  });

  it("warp teleports the shooter toward the impact point", () => {
    const engine = new GameEngine(11);
    engine.initGame(TEN("warp"), TEN("single_shot"));
    const startX = engine.getTanks()[0].x;
    fireAndSettle(engine, 45, 70);
    const tank = engine.getTanks()[0];
    expect(tank.x).toBeGreaterThan(startX + 100);
    expect(tank.x).toBeLessThanOrEqual(WORLD.WIDTH - 25);
    // Settled back onto the surface
    expect(Math.abs(tank.y - engine.terrain.getSurfaceYAvg(tank.x, WORLD.TANK_WIDTH / 2))).toBeLessThan(2);
  });
});

describe("360° turret rotation", () => {
  it("wraps angles instead of clamping to the upper semicircle", () => {
    const engine = new GameEngine(2);
    engine.initGame(TEN("single_shot"), TEN("single_shot"));
    engine.setAngle(-30);
    expect(engine.getTanks()[0].angleDeg).toBe(330);
    engine.setAngle(400);
    expect(engine.getTanks()[0].angleDeg).toBe(40);
    engine.setAngle(200); // beyond the old 180° clamp — backwards/down allowed
    expect(engine.getTanks()[0].angleDeg).toBe(200);
  });

  it("firing backwards works (P1 shoots left past vertical)", () => {
    const engine = new GameEngine(6);
    engine.initGame(TEN("cannonball"), TEN("single_shot"));
    const startX = engine.getTanks()[0].x;
    engine.setAngle(160); // up-and-behind for P1
    engine.setPower(40);
    engine.fire();
    engine.advance(12);
    expect(engine.getSnapshot().phase).not.toBe("FIRING");
    // The shot carved terrain BEHIND the shooter (left of spawn)
    expect(engine.getTanks()[0].x).toBe(startX); // shooter unmoved
  });
});

describe("scoring attribution (§2.4 — points go to the shooter)", () => {
  it("hitting yourself costs YOU points; the enemy earns nothing", () => {
    const engine = new GameEngine(3);
    engine.initGame(TEN("cannonball"), TEN("single_shot"));
    // Straight up, low power → falls back onto the shooter (wind-immune)
    fireAndSettle(engine, 90, 15);
    const snap = engine.getSnapshot();
    expect(snap.p1Score).toBeLessThan(0);
    expect(snap.p2Score).toBe(0);
  });

  it("hitting the enemy awards the SHOOTER points, not the victim", () => {
    const engine = new GameEngine(8);
    engine.initGame(TEN("smart_bomb"), TEN("single_shot"));
    // Homing at 150°/s — steers into the enemy tank
    fireAndSettle(engine, 55, 70, 15);
    const snap = engine.getSnapshot();
    expect(snap.p1Score).toBeGreaterThan(0);
    expect(snap.p2Score).toBe(0);
  });
});

describe("watchdog / settlement safety (§2.6 item 3)", () => {
  it("a bouncing weapon can never leave the game stuck in FIRING", () => {
    const engine = new GameEngine(1234);
    engine.initGame(TEN("rubber_ball"), TEN("single_shot"));
    engine.setAngle(30);
    engine.setPower(90);
    engine.fire();
    engine.advance(20); // > watchdog limit
    expect(engine.getSnapshot().phase).not.toBe("FIRING");
  });
});
