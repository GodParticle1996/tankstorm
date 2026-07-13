// ═══════════════════════════════════════════════════════════
//  Physics — Y-up ballistic trajectory engine
//  Semi-implicit Euler (update velocity first, then position).
//  All constants from constants.ts, tuned for fixed dt = 1/120s.
//  No Math.random() — deterministic.
// ═══════════════════════════════════════════════════════════

import { PHYSICS, WORLD } from "./constants";
import type { ProjectileState, TankState } from "./types";

export class Physics {
  /**
   * Compute initial velocity from angle and power.
   * Y-up: angle 0° = right (+X), 90° = up (+Y), 180° = left (-X).
   * vx = cos(angle) * power * POWER_SCALE
   * vy = sin(angle) * power * POWER_SCALE
   */
  static computeVelocity(angleDeg: number, power: number): { vx: number; vy: number } {
    const angleRad = (angleDeg * Math.PI) / 180;
    const speed = power * PHYSICS.POWER_SCALE;
    return {
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
    };
  }

  /**
   * Semi-implicit Euler step: update velocity first, then position.
   * Gravity pulls toward y=0 (downward in Y-up = negative Y).
   * Wind adds horizontal acceleration.
   * massScale > 1 = heavier: less wind drift. Gravity is mass-independent
   * (dividing it by mass made heavy shells FLOATY — the opposite of heavy).
   */
  static stepProjectile(p: ProjectileState, wind: number, dt: number): void {
    // Save previous position for swept collision
    p.prevX = p.x;
    p.prevY = p.y;

    // Wind acceleration (reduced by mass)
    const windAccel = (wind * PHYSICS.WIND_SCALE) / p.massScale;

    // Update velocity (semi-implicit Euler)
    p.vx += windAccel * dt;
    p.vy -= PHYSICS.GRAVITY * dt;

    // Update position with new velocity
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
  }

  /**
   * Homing: steer velocity toward target. Activates after acquireDelay.
   * Turn rate is capped to prevent no-skill auto-hits.
   */
  static applyHoming(
    p: ProjectileState,
    targetX: number,
    targetY: number,
    dt: number,
  ): void {
    if (p.age < p.homingAcquireDelay) return;
    if (p.homingTurnRate <= 0) return;

    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const targetAngle = Math.atan2(dy, dx);
    const currentAngle = Math.atan2(p.vy, p.vx);

    // Angle difference, normalized to [-PI, PI]
    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Cap turn rate
    const maxTurnRad = (p.homingTurnRate * Math.PI) / 180 * dt;
    const turn = Math.abs(angleDiff) < maxTurnRad ? angleDiff : Math.sign(angleDiff) * maxTurnRad;

    const newAngle = currentAngle + turn;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.vx = Math.cos(newAngle) * speed;
    p.vy = Math.sin(newAngle) * speed;
  }

  /**
   * Bounce: reflect velocity off terrain surface normal.
   * For a heightmap, the surface normal is approximated from the slope.
   */
  static bounce(
    p: ProjectileState,
    surfaceAngleDeg: number,
    restitution: number,
  ): void {
    // Simple reflection: flip the component along the surface normal
    // For mostly-horizontal terrain, this is primarily flipping vy
    const angleRad = (surfaceAngleDeg * Math.PI) / 180;
    // Surface normal: perpendicular to slope, pointing up
    const nx = -Math.sin(angleRad);
    const ny = Math.cos(angleRad);

    // Reflect velocity: v' = v - 2(v·n)n * restitution
    const dot = p.vx * nx + p.vy * ny;
    p.vx = (p.vx - 2 * dot * nx) * restitution;
    p.vy = (p.vy - 2 * dot * ny) * restitution;
  }

  /** Check if projectile is out of world bounds */
  static isOutOfBounds(x: number, y: number): boolean {
    return x < -50 || x > WORLD.WIDTH + 50 || y < -200;
  }

  /** Compute turret tip position in world space (Y-up).
   *  Pivot matches the renderer's barrel pivot: TANK_HEIGHT + 2 above the tank bottom. */
  static getTurretTip(tank: TankState): { x: number; y: number } {
    const angleRad = (tank.angleDeg * Math.PI) / 180;
    return {
      x: tank.x + Math.cos(angleRad) * WORLD.TURRET_LENGTH,
      y: tank.y + WORLD.TANK_HEIGHT + 2 + Math.sin(angleRad) * WORLD.TURRET_LENGTH,
    };
  }

  /**
   * Predict trajectory points for aiming preview.
   * Uses the same semi-implicit Euler as the simulation.
   * Returns array of {x, y} in world space (Y-up).
   */
  static predictTrajectory(
    startX: number,
    startY: number,
    angleDeg: number,
    power: number,
    wind: number,
    massScale = 1,
    steps = 80,
    dt = 1 / 60,
  ): { x: number; y: number }[] {
    const { vx, vy } = this.computeVelocity(angleDeg, power);
    const points: { x: number; y: number }[] = [];
    let px = startX;
    let py = startY;
    let pvx = vx;
    let pvy = vy;

    for (let i = 0; i < steps; i++) {
      const windAccel = (wind * PHYSICS.WIND_SCALE) / massScale;
      pvx += windAccel * dt;
      pvy -= PHYSICS.GRAVITY * dt;
      px += pvx * dt;
      py += pvy * dt;
      points.push({ x: px, y: py });
      if (py < -50 || px > WORLD.WIDTH + 50 || px < -50) break;
    }

    return points;
  }
}
