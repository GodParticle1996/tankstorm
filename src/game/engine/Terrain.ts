// ═══════════════════════════════════════════════════════════
//  Terrain — Y-up heightmap (1024 columns, Float32Array)
//  surfaceY[i] = world Y of terrain surface at column i.
//  Higher Y = higher terrain. X right, Y up, origin bottom-left.
//  No tunnels (Option A from review): dirt-movers carve trenches/pits.
// ═══════════════════════════════════════════════════════════

import { WORLD, PHYSICS } from "./constants";
import type { Rng } from "./prng";

export class Terrain {
  /** Heightmap: surfaceY[i] = Y of terrain surface at column i */
  surfaceY: Float32Array;
  readonly cols: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly step: number; // world units between columns
  /** Dirty flag — set when terrain is modified, cleared by renderer after mesh update */
  dirty = true;

  constructor(cols = WORLD.TERRAIN_COLS) {
    this.cols = cols;
    this.worldWidth = WORLD.WIDTH;
    this.worldHeight = WORLD.HEIGHT;
    this.step = this.worldWidth / (cols - 1);
    this.surfaceY = new Float32Array(cols);
  }

  // ─── Generation (seeded) ───

  generate(rng: Rng): void {
    const baseY = this.worldHeight * 0.35; // average terrain level
    const amplitude = this.worldHeight * 0.18;

    // Generate raw noise
    const raw: number[] = new Array(this.cols);

    // Use a sub-RNG for noise seeds so terrain gen doesn't disturb the main sequence
    const noiseSeed = rng.int(1, 99999);

    for (let i = 0; i < this.cols; i++) {
      const x = i / this.cols;

      // 3 octaves of value noise (fBm)
      let h = 0;
      h += this.valueNoise(x * 3 + 100, noiseSeed) * 0.5;
      h += this.valueNoise(x * 7 + 200, noiseSeed) * 0.3;
      h += this.valueNoise(x * 15 + 300, noiseSeed) * 0.2;
      // h ∈ ~[0, 1]

      raw[i] = baseY + (h - 0.5) * amplitude * 2;
    }

    // Smooth: simple 3-tap moving average, a few passes
    for (let pass = 0; pass < 2; pass++) {
      const smoothed = new Float32Array(this.cols);
      for (let i = 0; i < this.cols; i++) {
        const a = raw[Math.max(0, i - 1)];
        const b = raw[i];
        const c = raw[Math.min(this.cols - 1, i + 1)];
        smoothed[i] = (a + b + c) / 3;
      }
      for (let i = 0; i < this.cols; i++) raw[i] = smoothed[i];
    }

    // Flatten terrain near tank spawn zones
    const p1Col = Math.round((WORLD.WIDTH * WORLD.TANK_P1_X_FRAC) / this.step);
    const p2Col = Math.round((WORLD.WIDTH * WORLD.TANK_P2_X_FRAC) / this.step);
    const flattenRadius = Math.round(WORLD.TANK_FLATTEN_RADIUS / this.step);

    this.flattenZone(raw, p1Col, flattenRadius);
    this.flattenZone(raw, p2Col, flattenRadius);

    // Write to heightmap with clamping
    for (let i = 0; i < this.cols; i++) {
      this.surfaceY[i] = this.clampY(raw[i]);
    }
    this.dirty = true;
  }

  /** Flatten a zone around a column to the average height (smoothstep blend) */
  private flattenZone(arr: number[], centerCol: number, radius: number): void {
    const start = Math.max(0, centerCol - radius);
    const end = Math.min(this.cols - 1, centerCol + radius);
    // Compute average height in the zone
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i++) {
      sum += arr[i];
      count++;
    }
    const avg = sum / count;

    for (let i = start; i <= end; i++) {
      const dist = Math.abs(i - centerCol);
      const t = 1 - dist / radius;
      const blend = t * t * (3 - 2 * t); // smoothstep
      arr[i] = arr[i] * (1 - blend) + avg * blend;
    }
  }

  // ─── Value Noise ───

  private valueNoise(x: number, seed: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const a = this.hash(i, seed);
    const b = this.hash(i + 1, seed);
    const t = f * f * (3 - 2 * f); // smoothstep
    return a * (1 - t) + b * t;
  }

  private hash(n: number, seed: number): number {
    const s = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  // ─── Queries (all clamped at edges) ───

  /** Get terrain surface Y at a world X (linear interpolation, edge-clamped) */
  getSurfaceY(worldX: number): number {
    if (worldX <= 0) return this.surfaceY[0];
    if (worldX >= this.worldWidth) return this.surfaceY[this.cols - 1];
    const fi = worldX / this.step;
    const i0 = Math.floor(fi);
    const i1 = Math.min(i0 + 1, this.cols - 1);
    const t = fi - i0;
    return this.surfaceY[i0] * (1 - t) + this.surfaceY[i1] * t;
  }

  /** Check if a point (worldX, worldY) is inside terrain (below surface in Y-up) */
  isSolid(worldX: number, worldY: number): boolean {
    return worldY <= this.getSurfaceY(worldX);
  }

  /** Average surface Y across tank width (3 samples for slope stability) */
  getSurfaceYAvg(worldX: number, halfWidth: number): number {
    const left = this.getSurfaceY(worldX - halfWidth);
    const mid = this.getSurfaceY(worldX);
    const right = this.getSurfaceY(worldX + halfWidth);
    return (left + mid + right) / 3;
  }

  /** Check slope at worldX — returns absolute slope angle in degrees (movement checks) */
  getSlopeDeg(worldX: number): number {
    return Math.abs(this.getSlopeSignedDeg(worldX));
  }

  /** Signed slope angle in degrees (positive = rising to the right) — used for bounce reflection */
  getSlopeSignedDeg(worldX: number): number {
    const dx = 5;
    const yL = this.getSurfaceY(worldX - dx);
    const yR = this.getSurfaceY(worldX + dx);
    return Math.atan2(yR - yL, dx * 2) * (180 / Math.PI);
  }

  // ─── Destruction / Modification ───

  private clampY(y: number): number {
    return Math.max(WORLD.TERRAIN_FLOOR_Y, Math.min(WORLD.TERRAIN_CEIL_Y, y));
  }

  /**
   * Carve a circular crater at (cx, cy) with radius r.
   * For each column within r of cx: if the terrain surface is inside the
   * crater circle, lower it to the circle's bottom edge.
   * In Y-up: "lower" = decrease Y. The bottom edge of the circle at column x
   * is: cy - sqrt(r² - (x-cx)²)
   */
  carveCrater(cx: number, cy: number, r: number): void {
    const startCol = Math.max(0, Math.floor((cx - r) / this.step));
    const endCol = Math.min(this.cols - 1, Math.ceil((cx + r) / this.step));

    for (let i = startCol; i <= endCol; i++) {
      const px = i * this.step;
      const dx = px - cx;
      const dxSq = dx * dx;
      const rSq = r * r;

      if (dxSq >= rSq) continue;

      // Bottom edge of crater circle at this column
      const circleBottom = cy - Math.sqrt(rSq - dxSq);

      // If current surface is above the circle bottom, lower it
      if (this.surfaceY[i] > circleBottom) {
        this.surfaceY[i] = this.clampY(circleBottom);
      }
    this.dirty = true;
    }
  }

  /**
   * Carve a wide shallow pit (Excavator-style).
   * Lower terrain in a wide area to a shallow depth.
   */
  carveWideShallow(cx: number, cy: number, r: number): void {
    const startCol = Math.max(0, Math.floor((cx - r) / this.step));
    const endCol = Math.min(this.cols - 1, Math.ceil((cx + r) / this.step));
    const shallowDepth = r * 0.3;

    for (let i = startCol; i <= endCol; i++) {
      const px = i * this.step;
      const dx = Math.abs(px - cx);
      if (dx >= r) continue;
      const depth = (1 - dx / r) * shallowDepth;
      this.surfaceY[i] = this.clampY(this.surfaceY[i] - depth);
    }
    this.dirty = true;
  }

  /**
   * Carve a deep vertical shaft (Digger/Well Digger — open pit, not tunnel).
   */
  carveShaft(cx: number, surfaceY: number, depth: number, width: number): void {
    const startCol = Math.max(0, Math.floor((cx - width) / this.step));
    const endCol = Math.min(this.cols - 1, Math.ceil((cx + width) / this.step));
    const targetY = surfaceY - depth;

    for (let i = startCol; i <= endCol; i++) {
      const px = i * this.step;
      const dx = Math.abs(px - cx);
      if (dx < width) {
        // Lower to the target depth (carve a pit)
        this.surfaceY[i] = Math.min(this.surfaceY[i], this.clampY(targetY));
      }
    this.dirty = true;
    }
  }

  /**
   * Carve a horizontal trench toward enemy (Tunneler → trench).
   * Lowers terrain along a line from (startX, startY) toward (endX, endY).
   */
  carveTrench(startX: number, startY: number, endX: number, endY: number, width: number): void {
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    // Guard: zero-length trench (impact exactly at the target) would divide by zero
    const steps = Math.max(1, Math.ceil(length / this.step));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = startX + dx * t;
      const cy = startY + dy * t;
      // Lower terrain in a small circle at each point along the path
      const startCol = Math.max(0, Math.floor((cx - width) / this.step));
      const endCol = Math.min(this.cols - 1, Math.ceil((cx + width) / this.step));
      for (let i = startCol; i <= endCol; i++) {
        const px = i * this.step;
        const colDx = Math.abs(px - cx);
        if (colDx < width) {
          this.surfaceY[i] = Math.min(this.surfaceY[i], this.clampY(cy));
        }
      }
    this.dirty = true;
    }
  }

  /**
   * Raise terrain (build) at (cx, cy) with radius r.
   * For wall: narrow tall. For pillar: narrow. For dome: wide rounded.
   */
  buildTerrain(cx: number, r: number, height: number, shape: "wall" | "pillar" | "dome"): void {
    const startCol = Math.max(0, Math.floor((cx - r) / this.step));
    const endCol = Math.min(this.cols - 1, Math.ceil((cx + r) / this.step));

    for (let i = startCol; i <= endCol; i++) {
      const px = i * this.step;
      const dx = Math.abs(px - cx);
      if (dx >= r) continue;

      let lift: number;
      if (shape === "wall") {
        // Narrow, tall — almost uniform lift within radius
        lift = height * (1 - Math.pow(dx / r, 4));
      } else if (shape === "pillar") {
        // Very narrow, full height
        lift = height * (1 - Math.pow(dx / r, 2));
      } else {
        // dome — smooth rounded
        const t = dx / r;
        lift = height * Math.sqrt(Math.max(0, 1 - t * t));
      }

      this.surfaceY[i] = this.clampY(this.surfaceY[i] + lift);
    }
    this.dirty = true;
  }

  // ─── Tank Settling ───

  /**
   * Settle a tank: sample terrain height at tank's X (average of 3 samples).
   * If tank is above terrain, it falls with gravity until contact.
   * If terrain rose into the tank (wall weapons), push tank up to surface.
   * Returns true if tank is still falling (needs more updates).
   *
   * This is called after every terrain modification and every knockback.
   */
  settleTankStep(
    tankX: number,
    tankY: number,
    tankVy: number,
    halfWidth: number,
    dt: number,
  ): { y: number; vy: number; falling: boolean } {
    const surfaceY = this.getSurfaceYAvg(tankX, halfWidth);

    // Y-up: higher Y = higher up. Surface is at surfaceY.
    // tankY > surfaceY = floating above terrain → fall down (gravity)
    // tankY < surfaceY = buried in terrain → push up to surface
    if (tankY > surfaceY + PHYSICS.SETTLE_EPSILON) {
      // Tank is floating above terrain — apply gravity, fall down
      const newVy = tankVy - PHYSICS.TANK_FALL_GRAVITY * dt;
      const newY = tankY + newVy * dt;

      // Check if landed this step
      if (newY <= surfaceY + PHYSICS.SETTLE_EPSILON) {
        // Landed
        return { y: surfaceY, vy: 0, falling: false };
      }
      return { y: newY, vy: newVy, falling: true };
    } else if (tankY < surfaceY - PHYSICS.SETTLE_EPSILON) {
      // Tank is buried in terrain — push up to surface
      return { y: surfaceY, vy: 0, falling: false };
    } else {
      // On surface
      return { y: surfaceY, vy: 0, falling: false };
    }
  }

  /** Quick check: is the tank currently grounded? */
  isGrounded(tankX: number, tankY: number, halfWidth: number): boolean {
    const surfaceY = this.getSurfaceYAvg(tankX, halfWidth);
    return Math.abs(tankY - surfaceY) <= PHYSICS.SETTLE_EPSILON;
  }

  /** Check if movement is possible (slope not too steep) */
  canMoveTo(worldX: number): boolean {
    return this.getSlopeDeg(worldX) <= WORLD.MAX_SLOPE_DEG;
  }
}
