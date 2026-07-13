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
    // Outside the radius nothing changes
    expect(t.getSurfaceY(560)).toBeCloseTo(200, 5);
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

describe("Terrain edge queries", () => {
  it("clamps getSurfaceY outside the world", () => {
    const t = flatTerrain(123);
    expect(t.getSurfaceY(-999)).toBe(123);
    expect(t.getSurfaceY(99999)).toBe(123);
  });
});
