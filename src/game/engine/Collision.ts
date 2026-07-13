// ═══════════════════════════════════════════════════════════
//  Collision — Swept segment collision (§1.8)
//  Tests the segment from prevPos → newPos against:
//    1. Terrain heightmap (sample 4–8 points along the segment)
//    2. Tank AABBs (intersection test)
//  Binary-search refines the impact point to ~0.5 world units.
//  Y-up coordinates throughout.
// ═══════════════════════════════════════════════════════════

import { WORLD } from "./constants";
import type { TankState } from "./types";
import type { Terrain } from "./Terrain";

export type CollisionTarget = "terrain" | "tank" | "boundary" | "none";

export interface CollisionResult {
  target: CollisionTarget;
  hitTank: 0 | 1 | -1;
  x: number; // impact point
  y: number;
  // Surface angle at impact (for bounce calculations)
  surfaceAngleDeg: number;
}

export class Collision {
  /**
   * Swept collision test: check the segment from (prevX, prevY) to (newX, newY)
   * against terrain and tanks. Returns the first impact, or none.
   *
   * This prevents tunneling at high velocities where a projectile would
   * skip through terrain ridges if only the endpoint were tested.
   */
  static sweptCheck(
    prevX: number,
    prevY: number,
    newX: number,
    newY: number,
    terrain: Terrain,
    tanks: [TankState, TankState],
  ): CollisionResult {
    const SAMPLES = 8;

    // First: quick check — is the endpoint inside a tank?
    for (let t = 0; t < 2; t++) {
      const hit = this.pointInTankAABB(newX, newY, tanks[t]);
      if (hit) {
        return {
          target: "tank",
          hitTank: t as 0 | 1,
          x: newX,
          y: newY,
          surfaceAngleDeg: 0,
        };
      }
    }

    // Sample along the segment for terrain and tank hits
    for (let s = 1; s <= SAMPLES; s++) {
      const t = s / SAMPLES;
      const sx = prevX + (newX - prevX) * t;
      const sy = prevY + (newY - prevY) * t;

      // Terrain collision: point is below surface (Y-up: y <= surfaceY means inside terrain)
      if (terrain.isSolid(sx, sy)) {
        // Binary-search refine between previous sample and this sample
        const refined = this.binarySearchTerrain(
          s === 1 ? prevX : prevX + (newX - prevX) * ((s - 1) / SAMPLES),
          s === 1 ? prevY : prevY + (newY - prevY) * ((s - 1) / SAMPLES),
          sx,
          sy,
          terrain,
        );

        return {
          target: "terrain",
          hitTank: -1,
          x: refined.x,
          y: refined.y,
          // Signed slope — bounce reflection needs the slope DIRECTION
          surfaceAngleDeg: terrain.getSlopeSignedDeg(refined.x),
        };
      }

      // Tank AABB collision
      for (let ti = 0; ti < 2; ti++) {
        if (this.pointInTankAABB(sx, sy, tanks[ti])) {
          return {
            target: "tank",
            hitTank: ti as 0 | 1,
            x: sx,
            y: sy,
            surfaceAngleDeg: 0,
          };
        }
      }
    }

    // Boundary check
    if (newX < 0 || newX > WORLD.WIDTH || newY < -10) {
      return {
        target: "boundary",
        hitTank: -1,
        x: Math.max(0, Math.min(WORLD.WIDTH, newX)),
        y: newY,
        surfaceAngleDeg: 0,
      };
    }

    return { target: "none", hitTank: -1, x: newX, y: newY, surfaceAngleDeg: 0 };
  }

  /**
   * Binary-search refine the terrain impact point to ~0.5 world units.
   * Finds the exact point where the segment crosses the terrain surface.
   */
  private static binarySearchTerrain(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    terrain: Terrain,
  ): { x: number; y: number } {
    let lo = 0;
    let hi = 1;
    const PRECISION = 0.5; // world units
    const segmentLen = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

    let iterations = 0;
    const maxIter = Math.ceil(Math.log2(segmentLen / PRECISION)) + 2;

    while (hi - lo > PRECISION / segmentLen && iterations < maxIter) {
      const mid = (lo + hi) / 2;
      const mx = x0 + (x1 - x0) * mid;
      const my = y0 + (y1 - y0) * mid;

      if (terrain.isSolid(mx, my)) {
        hi = mid; // hit is earlier
      } else {
        lo = mid; // hit is later
      }
      iterations++;
    }

    const t = (lo + hi) / 2;
    return {
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
    };
  }

  /**
   * Check if a point is inside a tank's AABB (axis-aligned bounding box).
   * Tank center is at (tank.x, tank.y + TANK_HEIGHT/2) — y is the bottom.
   * Hitbox ≈ 24×14 world units (from constants).
   */
  static pointInTankAABB(x: number, y: number, tank: TankState): boolean {
    const halfW = WORLD.TANK_WIDTH / 2;
    const bottomY = tank.y;
    const topY = tank.y + WORLD.TANK_HEIGHT;
    return (
      x >= tank.x - halfW &&
      x <= tank.x + halfW &&
      y >= bottomY &&
      y <= topY
    );
  }

  /**
   * Raycast a beam (laser) against terrain. Returns the first hit point.
   * Marches along the ray in small steps until terrain is hit or out of bounds.
   */
  static raycastTerrain(
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    terrain: Terrain,
    maxDist = 1200,
  ): { x: number; y: number; hit: boolean } {
    const stepSize = 2; // world units per step
    const steps = Math.ceil(maxDist / stepSize);
    const norm = Math.sqrt(dirX * dirX + dirY * dirY);
    const ndx = dirX / norm;
    const ndy = dirY / norm;

    for (let s = 0; s <= steps; s++) {
      const x = startX + ndx * s * stepSize;
      const y = startY + ndy * s * stepSize;

      if (x < 0 || x > WORLD.WIDTH || y < -10) {
        return { x, y, hit: false };
      }

      if (terrain.isSolid(x, y)) {
        return { x, y, hit: true };
      }
    }

    return { x: startX + ndx * maxDist, y: startY + ndy * maxDist, hit: false };
  }
}
