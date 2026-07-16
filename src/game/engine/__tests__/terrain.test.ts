// Crater/build math on the heightmap (§2.6 item 2)
import { describe, it, expect } from "vitest";
import { Terrain } from "../Terrain";
import { WORLD } from "../constants";

function flatTerrain(height = 200): Terrain {
  const t = new Terrain();
  t.surfaceY.fill(height);
  return t;
}

describe("Terrain.carveCrater", () => {
  it("lowers the surface to the circle bottom at the center", () => {
    const t = flatTerrain(200);
    t.carveCrater(500, 200, 50);
    // At the crater center the floor is cy - r = 150
    expect(t.getSurfaceY(500)).toBeCloseTo(150, 0);
    // Just inside the rim it is barely lowered
    expect(t.getSurfaceY(455)).toBeGreaterThan(170);
    // Just outside the crater the RIM is raised (ejected dirt)
    expect(t.getSurfaceY(560)).toBeGreaterThan(200);
    // Well beyond the rim band nothing changes
    expect(t.getSurfaceY(650)).toBeCloseTo(200, 5);
  });

  it("clamps at the terrain floor", () => {
    const t = flatTerrain(WORLD.TERRAIN_FLOOR_Y + 10);
    t.carveCrater(500, WORLD.TERRAIN_FLOOR_Y + 10, 80);
    expect(t.getSurfaceY(500)).toBeGreaterThanOrEqual(WORLD.TERRAIN_FLOOR_Y);
  });

  it("does not index out of bounds at the map edges", () => {
    const t = flatTerrain(200);
    expect(() => {
      t.carveCrater(0, 200, 60);
      t.carveCrater(WORLD.WIDTH, 200, 60);
      t.carveCrater(-30, 200, 60);
      t.carveCrater(WORLD.WIDTH + 30, 200, 60);
    }).not.toThrow();
    expect(t.getSurfaceY(0)).toBeCloseTo(140, 0);
    expect(t.getSurfaceY(WORLD.WIDTH)).toBeCloseTo(140, 0);
    for (let i = 0; i < t.cols; i++) {
      expect(Number.isFinite(t.surfaceY[i])).toBe(true);
    }
  });
});

describe("Terrain.buildTerrain", () => {
  it("raises terrain but never above the ceiling", () => {
    const t = flatTerrain(400);
    t.buildTerrain(500, 40, 1000, "pillar");
    expect(t.getSurfaceY(500)).toBeLessThanOrEqual(WORLD.TERRAIN_CEIL_Y);
    expect(t.getSurfaceY(500)).toBeGreaterThan(400);
  });
});

describe("landslide relaxation (angle of repose)", () => {
  it("slumps steep crater walls until no slope exceeds the repose angle", () => {
    const t = flatTerrain(300);
    t.carveCrater(500, 300, 60); // deep crater with near-vertical walls
    expect(t.relaxing).toBe(true);

    let guard = 0;
    while (t.relaxStep(1 / 120) && guard++ < 120 * 10) { /* run to rest */ }
    expect(t.relaxing).toBe(false);

    for (let i = 0; i < t.cols - 1; i++) {
      const diff = Math.abs(t.surfaceY[i] - t.surfaceY[i + 1]);
      expect(diff, `adjacent slope at col ${i}`).toBeLessThanOrEqual(2.0);
    }
  });

  it("conserves mass while sliding (transfers, not deletions)", () => {
    const t = flatTerrain(250);
    t.carveCrater(500, 250, 40);
    const before = t.surfaceY.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (t.relaxStep(1 / 120) && guard++ < 1200) { /* settle */ }
    const after = t.surfaceY.reduce((a, b) => a + b, 0);
    expect(Math.abs(after - before)).toBeLessThan(1);
  });

  it("throws ejected dirt onto a raised rim outside the crater", () => {
    const t = flatTerrain(200);
    t.carveCrater(500, 200, 50);
    const rimY = Math.max(t.getSurfaceY(442), t.getSurfaceY(558));
    expect(rimY).toBeGreaterThan(200);
  });

  it("never runs longer than its hard time cap", () => {
    const t = flatTerrain(300);
    t.carveCrater(500, 300, 90);
    let steps = 0;
    while (t.relaxStep(1 / 120)) steps++;
    expect(steps).toBeLessThanOrEqual(120 * 3.6);
  });
});

describe("Terrain edge queries", () => {
  it("clamps getSurfaceY outside the world", () => {
    const t = flatTerrain(123);
    expect(t.getSurfaceY(-999)).toBe(123);
    expect(t.getSurfaceY(99999)).toBe(123);
  });
});
