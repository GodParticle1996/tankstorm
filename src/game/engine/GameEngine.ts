// ═══════════════════════════════════════════════════════════
//  GameEngine — Pure TypeScript simulation (§2.1)
//  Owns ALL per-frame state. Runs its own rAF loop with fixed timestep.
//  React never sees per-frame data — only getSnapshot() on events.
//  NO imports from React, Three.js, or DOM. Fully headless-testable.
// ═══════════════════════════════════════════════════════════

import { WORLD, PHYSICS, SCORING } from "./constants";
import { Rng } from "./prng";
import { Terrain } from "./Terrain";
import { Physics } from "./Physics";
import { Collision } from "./Collision";
import { getWeapon, DRAFT_POOL } from "./weapons";
import type {
  GamePhase, TankState, ProjectileState, ZoneEffect,
  VisualEffect, ScorePopup, GameSnapshot, AimReadout,
  WeaponDef, ImpactSpec,
} from "./types";



// ─── Internal mutable engine state (never exposed directly) ───

interface EngineState {
  phase: GamePhase;
  round: number;
  currentPlayer: 0 | 1;
  wind: number;
  tanks: [TankState, TankState];
  projectiles: ProjectileState[];
  zones: ZoneEffect[];
  visualEffects: VisualEffect[];
  popups: ScorePopup[];
  winner: 0 | 1 | -1 | null;
  // Settlement tracking
  firingStartTime: number; // seconds since engine start
  quietTimer: number; // seconds since last activity
  // Per-shot score ledger (accumulates during flight, committed on settle)
  shotScoreLedger: { p1: number; p2: number };
  // Which volley each player has fired (for alternating first shot)
  p1FiredCount: number;
  p2FiredCount: number;
}

// ─── Snapshot version (for useSyncExternalStore change detection) ───

let snapshotVersion = 0;

export class GameEngine {
  readonly terrain: Terrain;
  private rng: Rng;
  private state: EngineState;

  // Fixed timestep accumulator
  private accumulator = 0;
  private lastFrameTime = 0;
  private running = false;
  private rafId = 0;
  private engineTime = 0; // total simulation time in seconds

  // Projectile ID counter
  private projectileIdCounter = 0;
  private zoneIdCounter = 0;
  private effectIdCounter = 0;
  private popupIdCounter = 0;

  // Per-frame aim readout (separate from snapshot — read directly by renderer)
  aimReadout: AimReadout = { angleDeg: 45, power: 50, trajectory: [] };

  // Snapshot subscribers (for useSyncExternalStore)
  private listeners: Set<() => void> = new Set();
  private cachedSnapshot: GameSnapshot | null = null;

  // Previous snapshot for change detection
  private lastSnapshotKey = "";

  // Salvo queue (for weapons with salvoDelayMs)
  private salvoQueue: { time: number; ownerId: 0 | 1; weaponId: string; angleDeg: number; power: number; index: number; total: number }[] = [];

  constructor(seed?: number) {
    this.rng = new Rng(seed ?? Date.now());
    this.terrain = new Terrain();
    this.state = this.createInitialState();
  }

  // ═════════════════════════════════════════════
  //  Public API
  // ═════════════════════════════════════════════

  /** Start the game loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Stop the game loop */
  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /** Subscribe to snapshot changes (for useSyncExternalStore) */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Get current snapshot (for useSyncExternalStore getSnapshot) */
  getSnapshot = (): GameSnapshot => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = this.buildSnapshot();
    }
    return this.cachedSnapshot;
  };

  /** Get snapshot version (for change detection) */
  getSnapshotVersion = (): number => snapshotVersion;

  /** Initialize / reset the game with weapon arrays from draft */
  initGame(p1Weapons: string[], p2Weapons: string[]): void {
    this.terrain.generate(this.rng);
    this.state = this.createInitialState();
    this.state.tanks[0].weapons = [...p1Weapons];
    this.state.tanks[0].selectedWeapon = p1Weapons[0] ?? "";
    this.state.tanks[1].weapons = [...p2Weapons];
    this.state.tanks[1].selectedWeapon = p2Weapons[0] ?? "";
    // Settle tanks on terrain surface
    this.state.tanks[0].y = this.terrain.getSurfaceYAvg(this.state.tanks[0].x, WORLD.TANK_WIDTH / 2);
    this.state.tanks[1].y = this.terrain.getSurfaceYAvg(this.state.tanks[1].x, WORLD.TANK_WIDTH / 2);
    this.state.phase = "AIMING";
    this.state.wind = this.generateWind();
    this.updateAimReadout();
    this.notifyChange();
  }

  /** Quick start without draft — each player gets Single Shot + 9 random distinct weapons */
  quickStart(): void {
    const randomArsenal = (): string[] => {
      const pool = DRAFT_POOL.filter((id) => id !== "single_shot");
      this.rng.shuffle(pool);
      return ["single_shot", ...pool.slice(0, 9)];
    };
    this.initGame(randomArsenal(), randomArsenal());
  }

  // ─── Input actions (called by InputManager, gated by phase) ───

  setAngle(deg: number): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    tank.angleDeg = Math.max(0, Math.min(180, deg));
    this.updateAimReadout();
  }

  adjustAngle(delta: number): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    this.setAngle(tank.angleDeg + delta);
  }

  setPower(power: number): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    tank.power = Math.max(0, Math.min(100, power));
    this.updateAimReadout();
  }

  adjustPower(delta: number): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    this.setPower(tank.power + delta);
  }

  selectWeapon(weaponId: string): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    if (!tank.weapons.includes(weaponId)) return;
    tank.selectedWeapon = weaponId;
    this.updateAimReadout();
    this.notifyChange();
  }

  moveTank(direction: -1 | 1): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    if (tank.movesRemaining <= 0) return;
    const newX = tank.x + direction * WORLD.MOVE_SPEED;
    // Keep walking range inside the knockback clamp (15) so voluntary
    // movement can never trigger the "knocked off the edge" bonus.
    if (newX < 25 || newX > WORLD.WIDTH - 25) return;
    if (!this.terrain.canMoveTo(newX)) return;
    tank.x = newX;
    tank.y = this.terrain.getSurfaceYAvg(newX, WORLD.TANK_WIDTH / 2);
    tank.movesRemaining--;
    this.updateAimReadout();
    this.notifyChange();
  }

  fire(): void {
    if (this.state.phase !== "AIMING") return;
    const tank = this.state.tanks[this.state.currentPlayer];
    const weapon = getWeapon(tank.selectedWeapon);
    if (!weapon) return;

    // Remove ONE copy from the arsenal (single-use; filter would nuke duplicates)
    const weaponIdx = tank.weapons.indexOf(tank.selectedWeapon);
    if (weaponIdx >= 0) tank.weapons.splice(weaponIdx, 1);
    tank.selectedWeapon = tank.weapons[0] ?? "";

    // Muzzle flash at the turret tip
    const muzzle = Physics.getTurretTip(tank);
    this.spawnVisualEffect("spark", muzzle.x, muzzle.y, 10, weapon.color, 0.25);

    // Increment fired count for this player
    if (tank.id === 0) this.state.p1FiredCount++;
    else this.state.p2FiredCount++;

    // Handle instant weapons (lasers/beams)
    if (weapon.isInstant) {
      this.fireInstant(weapon, tank);
      return;
    }

    // Salvo or multi-shot
    const count = weapon.projectile.count;
    const delay = weapon.projectile.salvoDelayMs ?? 0;

    if (delay > 0 && count > 1) {
      // Queue salvo shots
      for (let i = 0; i < count; i++) {
        this.salvoQueue.push({
          time: this.engineTime + (i * delay) / 1000,
          ownerId: tank.id,
          weaponId: weapon.id,
          angleDeg: tank.angleDeg,
          power: tank.power,
          index: i,
          total: count,
        });
      }
    } else {
      // Fire all simultaneously
      this.spawnProjectiles(weapon, tank, count);
    }

    this.state.phase = "FIRING";
    this.state.firingStartTime = this.engineTime;
    this.state.quietTimer = 0;
    this.state.shotScoreLedger = { p1: 0, p2: 0 };
    this.updateAimReadout(); // clears the aim preview while the shot flies
    this.notifyChange();
  }

  togglePause(): void {
    if (this.state.phase === "GAME_OVER" || this.state.phase === "DRAFT") return;
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
  }

  isPaused(): boolean {
    return !this.running && this.state.phase !== "GAME_OVER" && this.state.phase !== "DRAFT";
  }

  reset(): void {
    this.stop();
    // NOTE: id counters are intentionally NOT reset — the renderer
    // deduplicates effects and keys popup sprites by id, so ids must
    // stay monotonic across restarts or post-restart effects get
    // skipped / reuse the wrong sprite texture.
    this.salvoQueue = [];
    this.accumulator = 0;
    this.engineTime = 0;
    // Back to the DRAFT phase — the Game page shows the draft screen again;
    // completing (or skipping) it calls initGame with fresh arsenals.
    this.state = this.createInitialState();
    this.updateAimReadout();
    this.start();
    this.notifyChange();
  }

  /**
   * Advance the simulation by a fixed amount of time, headlessly.
   * Used by tests (no requestAnimationFrame in Node) and by future
   * AI shot simulation. Runs whole fixed-dt steps.
   */
  advance(seconds: number): void {
    let t = 0;
    while (t < seconds) {
      this.step(PHYSICS.FIXED_DT);
      t += PHYSICS.FIXED_DT;
    }
  }

  // ═════════════════════════════════════════════
  //  Game Loop (fixed timestep accumulator — §1.2)
  // ═════════════════════════════════════════════

  private loop = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const frameDelta = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // Clamp frame delta to survive tab-switch hitches (§1.2)
    const clampedDelta = Math.min(frameDelta, PHYSICS.MAX_FRAME_DELTA);
    this.accumulator += clampedDelta;

    // Run fixed-timestep simulation steps
    while (this.accumulator >= PHYSICS.FIXED_DT) {
      this.step(PHYSICS.FIXED_DT);
      this.accumulator -= PHYSICS.FIXED_DT;
    }

    // Render interpolation alpha (not used here but available to renderer)
    // const alpha = this.accumulator / PHYSICS.FIXED_DT;
  };

  // ═════════════════════════════════════════════
  //  Simulation Step (pure, deterministic — §1.2, §2.1)
  // ═════════════════════════════════════════════

  private step(dt: number): void {
    this.engineTime += dt;

    // Visual effects and score popups age in EVERY phase — otherwise
    // popups spawned at settlement (zone ticks, edge bonus) freeze
    // on screen during AIMING/ROUND_END.
    this.updateVisualEffects(dt);
    this.updatePopups(dt);

    if (this.state.phase === "ROUND_END") {
      this.state.quietTimer += dt;
      if (this.state.quietTimer >= 2.0) {
        this.startNewRound();
      }
      return;
    }

    if (this.state.phase !== "FIRING") return;

    // ─── FIRING phase ───

    // Process salvo queue
    this.processSalvoQueue();

    // Update projectiles
    this.updateProjectiles(dt);

    // Settle tanks (gravity fall after terrain modification — §1.7)
    this.settleTanks(dt);

    // Check settlement (§1.6)
    this.checkSettlement(dt);

    // Watchdog (§1.6)
    if (this.engineTime - this.state.firingStartTime > PHYSICS.WATCHDOG_MAX_SECONDS) {
      this.forceDetonateAll();
    }
  }

  // ═════════════════════════════════════════════
  //  Projectile Update
  // ═════════════════════════════════════════════

  private updateProjectiles(dt: number): void {
    const alive: ProjectileState[] = [];

    for (const p of this.state.projectiles) {
      const weapon = getWeapon(p.weaponId);
      if (!weapon) continue;

      // Homing (§2.3 — acquire delay prevents no-skill auto-hits)
      if (p.homingTurnRate > 0) {
        const target = this.state.tanks[p.ownerId === 0 ? 1 : 0];
        Physics.applyHoming(p, target.x, target.y + WORLD.TANK_HEIGHT / 2, dt);
      }

      // Physics step (semi-implicit Euler — §1.2)
      const wind = weapon.projectile.windImmune ? 0 : this.state.wind;
      Physics.stepProjectile(p, wind, dt);

      // Dev-mode NaN assertion (§Part 4 item 10)
      if (import.meta.env?.DEV) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) {
          console.error("[TankStorm] NaN detected in projectile", p);
          continue; // drop the projectile
        }
      }

      // Fuse check
      if (p.fuse > 0 && p.age >= p.fuse) {
        this.resolveImpact(p, p.x, p.y, 0, "terrain");
        continue;
      }

      // Swept collision (§1.8)
      const result = Collision.sweptCheck(
        p.prevX, p.prevY, p.x, p.y,
        this.terrain, this.state.tanks,
      );

      if (result.target === "none") {
        // Out of bounds check
        if (Physics.isOutOfBounds(p.x, p.y)) {
          continue; // remove projectile
        }
        alive.push(p);
      } else if (result.target === "terrain") {
        // Bounce or impact?
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (p.bouncesRemaining > 0 && weapon.projectile.bounces && speed > 30) {
          p.bouncesRemaining--;
          Physics.bounce(p, result.surfaceAngleDeg, weapon.projectile.bounceRestitution ?? 0.55);
          // Reposition at the impact point, nudged out along the surface
          // normal — otherwise the projectile is left inside the terrain and
          // the next sweep re-collides immediately (stuttering bouncers).
          const slopeRad = (result.surfaceAngleDeg * Math.PI) / 180;
          p.x = result.x - Math.sin(slopeRad) * 1.5;
          p.y = result.y + Math.cos(slopeRad) * 1.5;
          p.prevX = p.x;
          p.prevY = p.y;
          // Dust effect on bounce
          this.spawnVisualEffect("dust", result.x, result.y, 12, "#888", 0.3);
          alive.push(p);
        } else {
          this.resolveImpact(p, result.x, result.y, result.surfaceAngleDeg, "terrain");
        }
      } else if (result.target === "tank") {
        this.resolveImpact(p, result.x, result.y, 0, "tank");
      } else if (result.target === "boundary") {
        this.resolveImpact(p, result.x, result.y, 0, "boundary");
      }
    }

    this.state.projectiles = alive;
  }

  // ═════════════════════════════════════════════
  //  Impact Resolution (composable ImpactSpec[] — §2.3)
  // ═════════════════════════════════════════════

  private resolveImpact(
    p: ProjectileState,
    hitX: number,
    hitY: number,
    surfaceAngleDeg: number,
    target: "terrain" | "tank" | "boundary",
  ): void {
    const weapon = getWeapon(p.weaponId);
    if (!weapon) return;

    // Execute each ImpactSpec in order
    for (const spec of weapon.impact) {
      this.executeImpactSpec(spec, p, hitX, hitY);
    }

    // If no impact specs produce scoring, do a basic proximity score
    // (handles weapons that only have carve/build without explosion)
    if (weapon.impact.every((s) => s.kind !== "explosion")) {
      this.proximityScore(p, hitX, hitY, weapon.basePoints, 30);
    }

    this.state.quietTimer = 0;
  }

  private executeImpactSpec(spec: ImpactSpec, p: ProjectileState, x: number, y: number): void {
    switch (spec.kind) {
      case "explosion": {
        // Carve crater
        this.terrain.carveCrater(x, y, spec.radius * spec.craterScale);
        // Visual effect
        this.spawnVisualEffect("explosion", x, y, spec.radius, getWeapon(p.weaponId)?.color ?? "#ff6b35", 0.8);
        // Score via single chokepoint
        this.applyExplosionScore(p, x, y, spec.radius, getWeapon(p.weaponId)?.basePoints ?? 0);
        // Knockback
        if (spec.knockback > 0) {
          this.applyKnockback(p, x, y, spec.knockback);
        }
        break;
      }

      case "carve": {
        switch (spec.shape) {
          case "crater":
            this.terrain.carveCrater(x, y, spec.size);
            break;
          case "shaft":
            this.terrain.carveShaft(x, this.terrain.getSurfaceY(x), spec.size, spec.size * 0.3);
            break;
          case "wideShallow":
            this.terrain.carveWideShallow(x, y, spec.size);
            break;
          case "trench": {
            // Carve toward enemy
            const enemy = this.state.tanks[p.ownerId === 0 ? 1 : 0];
            this.terrain.carveTrench(x, y, enemy.x, this.terrain.getSurfaceY(enemy.x), spec.size * 0.3);
            break;
          }
        }
        this.spawnVisualEffect("dust", x, y, spec.size, "#a16207", 0.5);
        break;
      }

      case "build": {
        // Build at the impact point, or at the shooter's tank for self-cast
        // defense weapons (Fortress, Repair Kit)
        const targetX = spec.atSelf ? this.state.tanks[p.ownerId].x : x;
        const targetY = spec.atSelf ? this.state.tanks[p.ownerId].y : y;
        switch (spec.shape) {
          case "wall":
            this.terrain.buildTerrain(targetX, spec.size, 80, "wall");
            break;
          case "pillar":
            this.terrain.buildTerrain(targetX, spec.size, 120, "pillar");
            break;
          case "dome":
            this.terrain.buildTerrain(targetX, spec.size, 60, "dome");
            break;
        }
        this.spawnVisualEffect("dust", targetX, targetY, spec.size, "#a78bfa", 0.5);
        break;
      }

      case "zone": {
        this.state.zones.push({
          id: this.zoneIdCounter++,
          effect: spec.effect,
          x, y,
          radius: spec.radius,
          ticksRemaining: spec.ticks,
          pointsPerTick: spec.pointsPerTick,
          owner: p.ownerId,
        });
        this.spawnVisualEffect("fire", x, y, spec.radius, spec.effect === "fire" ? "#ff4500" : "#84cc16", 2.0);
        break;
      }

      case "split": {
        const childWeapon = getWeapon(spec.childWeaponId);
        if (!childWeapon) break;
        for (let i = 0; i < spec.count; i++) {
          const spreadAngle = (spec.spreadDeg / spec.count) * (i - spec.count / 2 + 0.5);
          const angleRad = (spreadAngle * Math.PI) / 180;
          const speed = this.rng.range(150, 200);
          this.state.projectiles.push({
            id: this.projectileIdCounter++,
            x, y,
            vx: p.vx * spec.inheritVelocity + Math.cos(angleRad - Math.PI / 2) * speed,
            vy: p.vy * spec.inheritVelocity + Math.sin(angleRad - Math.PI / 2) * speed + 100,
            weaponId: spec.childWeaponId,
            ownerId: p.ownerId,
            bouncesRemaining: 0,
            homingTurnRate: 0,
            homingAcquireDelay: 0,
            age: 0,
            fuse: 1.5,
            prevX: x,
            prevY: y,
            massScale: 1,
          });
        }
        break;
      }

      case "beam": {
        // Beams are handled in fireInstant, but if we get here (shouldn't),
        // just apply damage at the impact point
        this.spawnVisualEffect("spark", x, y, 10, getWeapon(p.weaponId)?.color ?? "#00ff88", 0.3);
        break;
      }

      case "shield": {
        // Grant the SHOOTER a damage-absorbing shield (consumed in applyHitToTank)
        const owner = this.state.tanks[p.ownerId];
        owner.shieldHp = Math.max(owner.shieldHp, spec.amount);
        this.spawnPopup(owner.x, owner.y + WORLD.TANK_HEIGHT + 12, `SHIELD ${spec.amount}`, "#60a5fa");
        this.spawnVisualEffect("spark", owner.x, owner.y + 10, 16, "#60a5fa", 0.4);
        break;
      }

      case "teleport": {
        // Move the shooter's tank to the impact point
        const owner = this.state.tanks[p.ownerId];
        this.spawnVisualEffect("spark", owner.x, owner.y + 10, 14, "#a855f7", 0.4);
        owner.x = Math.max(25, Math.min(WORLD.WIDTH - 25, x));
        owner.y = this.terrain.getSurfaceYAvg(owner.x, WORLD.TANK_WIDTH / 2);
        owner.vy = 0;
        owner.falling = true; // settle onto the surface next steps
        this.spawnVisualEffect("spark", owner.x, owner.y + 10, 14, "#a855f7", 0.4);
        break;
      }

      case "airstrike": {
        // Rain child projectiles from above, centered on the impact X
        const startX = x - spec.spreadWidth / 2;
        for (let i = 0; i < spec.count; i++) {
          const rawX = startX + (spec.spreadWidth * (i + 0.5)) / spec.count + this.rng.range(-10, 10);
          const px = Math.max(5, Math.min(WORLD.WIDTH - 5, rawX));
          const py = WORLD.HEIGHT + 60 + this.rng.range(0, 50);
          this.state.projectiles.push({
            id: this.projectileIdCounter++,
            x: px, y: py,
            vx: 0, vy: -80,
            weaponId: spec.childWeaponId,
            ownerId: p.ownerId,
            bouncesRemaining: 0,
            homingTurnRate: 0,
            homingAcquireDelay: 0,
            age: 0,
            fuse: 0,
            prevX: px, prevY: py,
            massScale: 1,
          });
        }
        this.spawnVisualEffect("spark", x, y, 14, "#ffd166", 0.35);
        break;
      }

      case "displaceTank": {
        const enemy = this.state.tanks[p.ownerId === 0 ? 1 : 0];
        switch (spec.mode) {
          case "pull": {
            const dx = x - enemy.x;
            const dy = y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
              enemy.x += (dx / dist) * spec.strength;
              enemy.x = Math.max(15, Math.min(WORLD.WIDTH - 15, enemy.x));
              enemy.falling = true;
            }
            break;
          }
          case "lift": {
            enemy.y += spec.strength;
            enemy.vy = 50;
            enemy.falling = true;
            break;
          }
          case "random": {
            enemy.x += this.rng.range(-spec.strength, spec.strength);
            enemy.x = Math.max(15, Math.min(WORLD.WIDTH - 15, enemy.x));
            enemy.falling = true;
            break;
          }
        }
        break;
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Single Damage Chokepoint (§Part 4 item 8)
  // ═════════════════════════════════════════════

  /**
   * applyHitToTank — THE single function through which ALL damage flows.
   * Self-damage negative points, shield absorption, scoring multipliers.
   * Per-explosion once-per-tank guard prevents double-counting.
   */
  private applyHitToTank(
    tankIdx: 0 | 1,
    explosionX: number,
    explosionY: number,
    basePoints: number,
    blastRadius: number,
    ownerId: 0 | 1,
    explosionId: number,
  ): void {
    // Once-per-tank guard per explosion
    if (!this.hitGuard) this.hitGuard = new Map();
    const guardKey = `${explosionId}_${tankIdx}`;
    if (this.hitGuard.has(guardKey)) return;
    this.hitGuard.set(guardKey, true);

    const tank = this.state.tanks[tankIdx];
    const dx = tank.x - explosionX;
    const dy = (tank.y + WORLD.TANK_HEIGHT / 2) - explosionY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Scoring based on distance (§2.4)
    let multiplier = 0;
    if (dist <= blastRadius * 0.3) multiplier = 1.0;
    else if (dist <= 30) multiplier = SCORING.NEAR_MISS_MULT;
    else if (dist <= 60) multiplier = SCORING.GRAZE_MULT;
    else if (dist <= blastRadius) multiplier = SCORING.GRAZE_MULT * 0.5;

    if (multiplier === 0) return;

    let score = basePoints * multiplier;

    // Shield absorption (the victim's shield eats the points)
    if (tank.shieldHp > 0) {
      const absorbed = Math.min(tank.shieldHp, score);
      tank.shieldHp -= absorbed;
      score -= absorbed;
      this.spawnPopup(tank.x, tank.y + WORLD.TANK_HEIGHT + 10, "SHIELD", "#60a5fa");
      // Fully absorbed — no points change hands, no "+0" popup
      if (Math.abs(score) < 0.5) return;
    }

    // Self-damage penalty (§1.5)
    if (tankIdx === ownerId) {
      score = -Math.abs(score) * SCORING.SELF_DAMAGE_MULT;
    }

    // Points always go to the SHOOTER: positive for hitting the enemy,
    // negative for hitting yourself. The victim never earns points.
    const shooter = this.state.tanks[ownerId];
    shooter.score += score;
    if (ownerId === 0) this.state.shotScoreLedger.p1 += score;
    else this.state.shotScoreLedger.p2 += score;

    // Score popup (§2.4 — core feedback loop)
    const text = score >= 0 ? `+${Math.round(score)}` : `${Math.round(score)}`;
    const color = score >= 0
      ? (ownerId === 0 ? "#3b82f6" : "#f43f5e")
      : "#ef4444";
    this.spawnPopup(tank.x, tank.y + WORLD.TANK_HEIGHT + 10, text, color);
  }

  private hitGuard: Map<string, boolean> | null = null;
  private explosionIdCounter = 0;

  /** Apply explosion score to both tanks */
  private applyExplosionScore(
    p: ProjectileState,
    x: number,
    y: number,
    radius: number,
    basePoints: number,
  ): void {
    const explosionId = this.explosionIdCounter++;
    this.hitGuard = new Map(); // reset guard for this explosion
    this.applyHitToTank(0, x, y, basePoints, radius, p.ownerId, explosionId);
    this.applyHitToTank(1, x, y, basePoints, radius, p.ownerId, explosionId);
  }

  /** Proximity score without explosion (for carve-only weapons) */
  private proximityScore(
    p: ProjectileState,
    x: number,
    y: number,
    basePoints: number,
    radius: number,
  ): void {
    if (basePoints <= 0) return;
    const explosionId = this.explosionIdCounter++;
    this.hitGuard = new Map();
    this.applyHitToTank(0, x, y, basePoints, radius, p.ownerId, explosionId);
    this.applyHitToTank(1, x, y, basePoints, radius, p.ownerId, explosionId);
  }

  // ═════════════════════════════════════════════
  //  Knockback
  // ═════════════════════════════════════════════

  private applyKnockback(p: ProjectileState, x: number, y: number, strength: number): void {
    for (let t = 0; t < 2; t++) {
      const tank = this.state.tanks[t];
      const dx = tank.x - x;
      const dy = (tank.y + WORLD.TANK_HEIGHT / 2) - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 80) {
        const force = (1 - dist / 80) * strength;
        if (dist > 1) {
          tank.x += (dx / dist) * force;
          tank.x = Math.max(15, Math.min(WORLD.WIDTH - 15, tank.x));
        }
        tank.y += force * 0.5;
        tank.falling = true;
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Instant Weapons (lasers/beams — §2.3)
  // ═════════════════════════════════════════════

  private fireInstant(weapon: WeaponDef, tank: TankState): void {
    const tip = Physics.getTurretTip(tank);
    const angleRad = (tank.angleDeg * Math.PI) / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);

    // Raycast against terrain (unless piercesTerrain)
    let endX: number, endY: number;
    if (weapon.impact[0]?.kind === "beam" && !(weapon.impact[0] as { piercesTerrain: boolean }).piercesTerrain) {
      const hit = Collision.raycastTerrain(tip.x, tip.y, dirX, dirY, this.terrain);
      endX = hit.x;
      endY = hit.y;
      if (hit.hit) {
        // Carve a small trench along the beam path
        const beamSpec = weapon.impact[0] as { width: number };
        this.terrain.carveCrater(hit.x, hit.y, beamSpec.width * 2);
      }
    } else {
      // Piercing beam — goes full length
      endX = tip.x + dirX * 1200;
      endY = tip.y + dirY * 1200;
    }

    // Check if beam hits a tank
    for (let t = 0; t < 2; t++) {
      if (t === tank.id) continue; // don't hit self
      const enemy = this.state.tanks[t];
      // Simple line-segment vs AABB test
      if (this.segmentHitsAABB(tip.x, tip.y, endX, endY, enemy)) {
        endX = enemy.x;
        endY = enemy.y + WORLD.TANK_HEIGHT / 2;
        // Apply beam damage
        const explosionId = this.explosionIdCounter++;
        this.hitGuard = new Map();
        this.applyHitToTank(t as 0 | 1, endX, endY, weapon.basePoints, 20, tank.id, explosionId);
        break;
      }
    }

    // Visual beam effect (radius carries the beam width for the renderer)
    const beamWidth = weapon.impact[0]?.kind === "beam" ? (weapon.impact[0] as { width: number }).width : 3;
    this.spawnVisualEffectBeam(tip.x, tip.y, endX, endY, beamWidth * 2, weapon.color, 0.4);

    // Enter FIRING phase briefly for settlement (beam resolves instantly)
    this.state.phase = "FIRING";
    this.state.firingStartTime = this.engineTime;
    this.state.quietTimer = 0;
    this.state.shotScoreLedger = { p1: 0, p2: 0 };
    this.updateAimReadout(); // clears the aim preview
    this.notifyChange();
  }

  private segmentHitsAABB(x1: number, y1: number, x2: number, y2: number, tank: TankState): boolean {
    const halfW = WORLD.TANK_WIDTH / 2;
    const left = tank.x - halfW;
    const right = tank.x + halfW;
    const bottom = tank.y;
    const top = tank.y + WORLD.TANK_HEIGHT;
    // Liang-Barsky line clipping
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - left, right - x1, y1 - bottom, top - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
      }
    }
    return t0 < t1;
  }

  // ═════════════════════════════════════════════
  //  Tank Settling (§1.7 — after every terrain edit)
  // ═════════════════════════════════════════════

  private settleTanks(dt: number): void {
    for (let t = 0; t < 2; t++) {
      const tank = this.state.tanks[t];
      if (!tank.falling && this.terrain.isGrounded(tank.x, tank.y, WORLD.TANK_WIDTH / 2)) {
        continue;
      }
      const result = this.terrain.settleTankStep(
        tank.x, tank.y, tank.vy, WORLD.TANK_WIDTH / 2, dt,
      );
      tank.y = result.y;
      tank.vy = result.vy;
      tank.falling = result.falling;
      if (tank.falling) this.state.quietTimer = 0;
    }
  }

  // ═════════════════════════════════════════════
  //  Settlement Condition (§1.6)
  // ═════════════════════════════════════════════

  private checkSettlement(dt: number): void {
    if (this.state.phase !== "FIRING") return;

    // Check if world is quiet
    const noProjectiles = this.state.projectiles.length === 0 && this.salvoQueue.length === 0;
    const noFalling = !this.state.tanks[0].falling && !this.state.tanks[1].falling;
    // Zone effects (fire, radiation) do NOT block settlement (§1.6)
    const isQuiet = noProjectiles && noFalling;

    if (isQuiet) {
      this.state.quietTimer += dt;
      // 500ms post-quiet grace timer (§1.6)
      if (this.state.quietTimer >= PHYSICS.SETTLE_GRACE_MS / 1000) {
        this.onSettled();
      }
    } else {
      this.state.quietTimer = 0;
    }
  }

  /**
   * Called when the world has settled after a shot.
   * A "volley" = both players fire once. The round counter tracks volleys.
   * Within a volley, players alternate shots without incrementing the round
   * or changing wind. Wind only changes when a new volley begins.
   */
  private onSettled(): void {
    // Apply zone effects at turn transition (§1.6)
    this.applyZoneEffects();

    // Check for edge bonus (tank knocked off map)
    this.checkEdgeBonus();

    const p1Fired = this.state.p1FiredCount;
    const p2Fired = this.state.p2FiredCount;
    // Game over only when BOTH players have fired all their volleys
    if (p1Fired >= WORLD.MAX_VOLLEYS && p2Fired >= WORLD.MAX_VOLLEYS) {
      this.state.phase = "GAME_OVER";
      this.state.winner = this.determineWinner();
      this.notifyChange();
      return;
    }

    // Check if both players have fired the same number of times → volley complete
    const volleyComplete = p1Fired === p2Fired;

    if (volleyComplete) {
      // Both players fired — start a new volley with new wind
      this.state.phase = "ROUND_END";
      this.state.quietTimer = 0;
    } else {
      // Only one player fired — switch to the other player (same wind, same volley)
      // Moves are NOT reset here — each player gets MAX_MOVES per volley, not per shot
      this.state.currentPlayer = this.state.currentPlayer === 0 ? 1 : 0;
      this.state.phase = "AIMING";
      this.updateAimReadout();
    }

    this.notifyChange();
  }

  private startNewRound(): void {
    this.state.round++;
    // Wind rerolls only when a new volley begins (§Part 5 — both players share wind)
    this.state.wind = this.generateWind();
    // Alternate who goes first each volley (§1.5 — fairness)
    this.state.currentPlayer = this.state.round % 2 === 0 ? 1 : 0;
    // Moves are NOT replenished — each player gets MAX_MOVES for the whole match
    this.state.phase = "AIMING";
    this.updateAimReadout();
    this.notifyChange();
  }

  // ═════════════════════════════════════════════
  //  Zone Effects (applied at turn transition — §1.6)
  // ═════════════════════════════════════════════

  private applyZoneEffects(): void {
    for (let i = this.state.zones.length - 1; i >= 0; i--) {
      const zone = this.state.zones[i];
      zone.ticksRemaining--;

      // Apply damage to any tank inside the zone
      for (let t = 0; t < 2; t++) {
        const tank = this.state.tanks[t];
        const dx = tank.x - zone.x;
        const dy = (tank.y + WORLD.TANK_HEIGHT / 2) - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= zone.radius) {
          let score = zone.pointsPerTick;
          if (t === zone.owner) score = -Math.abs(score) * SCORING.SELF_DAMAGE_MULT;
          // Zone points go to the zone's OWNER (negative if they sit in it themselves)
          this.state.tanks[zone.owner].score += score;
          const rounded = Math.round(score);
          this.spawnPopup(tank.x, tank.y + WORLD.TANK_HEIGHT + 10,
            rounded >= 0 ? `+${rounded}` : `${rounded}`,
            rounded >= 0 ? "#ff4500" : "#ef4444");
        }
      }

      if (zone.ticksRemaining <= 0) {
        this.state.zones.splice(i, 1);
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Edge Bonus (§1.5 — tank knocked off map)
  // ═════════════════════════════════════════════

  private checkEdgeBonus(): void {
    for (let t = 0; t < 2; t++) {
      const tank = this.state.tanks[t];
      if (tank.x <= 15 || tank.x >= WORLD.WIDTH - 15) {
        // Reposition at edge
        tank.x = Math.max(20, Math.min(WORLD.WIDTH - 20, tank.x));
        tank.y = this.terrain.getSurfaceYAvg(tank.x, WORLD.TANK_WIDTH / 2);
        // Award bonus to the other player
        const shooter = t === 0 ? 1 : 0;
        this.state.tanks[shooter].score += SCORING.EDGE_BONUS;
        this.spawnPopup(tank.x, tank.y + 30, `+${SCORING.EDGE_BONUS}`, "#fbbf24");
      }
    }
  }

  // ═════════════════════════════════════════════
  //  Watchdog (§1.6 — force-detonate after 15s)
  // ═════════════════════════════════════════════

  private forceDetonateAll(): void {
    console.warn("[TankStorm] Watchdog: force-detonating all projectiles after 15s");
    for (const p of this.state.projectiles) {
      const weapon = getWeapon(p.weaponId);
      if (!weapon) continue;
      // Force impact at current position
      for (const spec of weapon.impact) {
        this.executeImpactSpec(spec, p, p.x, p.y);
      }
    }
    this.state.projectiles = [];
    this.salvoQueue = [];
  }

  // ═════════════════════════════════════════════
  //  Salvo Queue
  // ═════════════════════════════════════════════

  private processSalvoQueue(): void {
    const remaining: typeof this.salvoQueue = [];
    for (const item of this.salvoQueue) {
      if (this.engineTime >= item.time) {
        const tank = this.state.tanks[item.ownerId];
        const weapon = getWeapon(item.weaponId);
        if (weapon) {
          // Deterministic per-shot spread — otherwise every salvo round
          // (Tommy Gun) flies the identical trajectory
          const spread = weapon.projectile.spreadDeg ?? 0;
          const offset = item.total > 1
            ? (spread / (item.total - 1)) * (item.index - (item.total - 1) / 2)
            : 0;
          this.spawnProjectiles(weapon, tank, 1, item.angleDeg + offset, item.power);
        }
      } else {
        remaining.push(item);
      }
    }
    this.salvoQueue = remaining;
  }

  // ═════════════════════════════════════════════
  //  Projectile Spawning
  // ═════════════════════════════════════════════

  private spawnProjectiles(
    weapon: WeaponDef,
    tank: TankState,
    count: number,
    angleOverride?: number,
    powerOverride?: number,
  ): void {
    const angle = angleOverride ?? tank.angleDeg;
    const power = powerOverride ?? tank.power;
    const tip = Physics.getTurretTip({ ...tank, angleDeg: angle, power });
    const spread = weapon.projectile.spreadDeg ?? 0;

    for (let i = 0; i < count; i++) {
      let pAngle = angle;
      if (count > 1 && spread > 0) {
        const offset = (spread / count) * (i - count / 2 + 0.5);
        pAngle = angle + offset;
      }
      const { vx: pvx, vy: pvy } = Physics.computeVelocity(pAngle, power);

      this.state.projectiles.push({
        id: this.projectileIdCounter++,
        x: tip.x,
        y: tip.y,
        vx: pvx,
        vy: pvy,
        weaponId: weapon.id,
        ownerId: tank.id,
        bouncesRemaining: weapon.projectile.bounces ?? 0,
        homingTurnRate: weapon.projectile.homing?.turnRateDegPerSec ?? 0,
        homingAcquireDelay: (weapon.projectile.homing?.acquireDelayMs ?? 0) / 1000,
        age: 0,
        fuse: weapon.projectile.fuse ?? 0,
        prevX: tip.x,
        prevY: tip.y,
        massScale: weapon.projectile.massScale ?? 1,
      });
    }
  }

  // ═════════════════════════════════════════════
  //  Visual Effects & Popups (for renderer)
  // ═════════════════════════════════════════════

  private spawnVisualEffect(
    type: VisualEffect["type"],
    x: number,
    y: number,
    radius: number,
    color: string,
    maxAge: number,
  ): void {
    this.state.visualEffects.push({
      id: this.effectIdCounter++,
      type, x, y, radius, color, age: 0, maxAge,
    });
  }

  private spawnVisualEffectBeam(
    x1: number, y1: number, x2: number, y2: number,
    width: number, color: string, maxAge: number,
  ): void {
    this.state.visualEffects.push({
      id: this.effectIdCounter++,
      type: "beam", x: x1, y: y1, x2, y2, radius: width, color, age: 0, maxAge,
    });
  }

  private updateVisualEffects(dt: number): void {
    for (let i = this.state.visualEffects.length - 1; i >= 0; i--) {
      this.state.visualEffects[i].age += dt;
      if (this.state.visualEffects[i].age >= this.state.visualEffects[i].maxAge) {
        this.state.visualEffects.splice(i, 1);
      }
    }
  }

  private spawnPopup(x: number, y: number, text: string, color: string): void {
    this.state.popups.push({
      id: this.popupIdCounter++,
      x, y, text, color, age: 0, maxAge: 1.5,
    });
  }

  private updatePopups(dt: number): void {
    for (let i = this.state.popups.length - 1; i >= 0; i--) {
      this.state.popups[i].age += dt;
      this.state.popups[i].y += 30 * dt; // float upward
      if (this.state.popups[i].age >= this.state.popups[i].maxAge) {
        this.state.popups.splice(i, 1);
      }
    }
  }

  /** Get visual effects for the renderer (read-only, called each frame) */
  getVisualEffects(): readonly VisualEffect[] {
    return this.state.visualEffects;
  }

  /** Get score popups for the renderer */
  getPopups(): readonly ScorePopup[] {
    return this.state.popups;
  }

  /** Get projectiles for the renderer (read-only, called each frame) */
  getProjectiles(): readonly ProjectileState[] {
    return this.state.projectiles;
  }

  /** Get zones for the renderer */
  getZones(): readonly ZoneEffect[] {
    return this.state.zones;
  }

  /** Get tank states for the renderer (read-only) */
  getTanks(): readonly [TankState, TankState] {
    return this.state.tanks;
  }

  // ═════════════════════════════════════════════
  //  Aim Readout (per-frame — read directly by renderer, NOT React)
  // ═════════════════════════════════════════════

  private updateAimReadout(): void {
    if (this.state.phase !== "AIMING") {
      this.aimReadout.trajectory = [];
      return;
    }
    const tank = this.state.tanks[this.state.currentPlayer];
    const weapon = getWeapon(tank.selectedWeapon);
    const tip = Physics.getTurretTip(tank);
    const massScale = weapon?.projectile.massScale ?? 1;
    // Preview only the first part of the arc (aiming stays a skill),
    // and clip it at the terrain so it never draws through mountains.
    const raw = Physics.predictTrajectory(
      tip.x, tip.y, tank.angleDeg, tank.power,
      this.state.wind, massScale, 26,
    );
    const trajectory: { x: number; y: number }[] = [];
    for (const pt of raw) {
      trajectory.push(pt);
      if (this.terrain.isSolid(pt.x, pt.y)) break;
    }
    this.aimReadout = {
      angleDeg: tank.angleDeg,
      power: tank.power,
      trajectory,
    };
  }

  // ═════════════════════════════════════════════
  //  Wind & Helpers
  // ═════════════════════════════════════════════

  private generateWind(): number {
    // Curved distribution — extreme winds less common
    const raw = this.rng.range(-1, 1);
    const curved = Math.sign(raw) * Math.pow(Math.abs(raw), 1.5);
    return Math.round(curved * PHYSICS.WIND_RANGE);
  }

  private determineWinner(): 0 | 1 | -1 {
    const [p1, p2] = this.state.tanks;
    if (p1.score > p2.score) return 0;
    if (p2.score > p1.score) return 1;
    return -1;
  }

  // ═════════════════════════════════════════════
  //  State Creation
  // ═════════════════════════════════════════════

  private createInitialState(): EngineState {
    const p1X = WORLD.WIDTH * WORLD.TANK_P1_X_FRAC;
    const p2X = WORLD.WIDTH * WORLD.TANK_P2_X_FRAC;

    return {
      phase: "DRAFT",
      round: 1,
      currentPlayer: 0,
      wind: 0,
      tanks: [
        {
          id: 0, x: p1X, y: 200, angleDeg: 45, power: 50,
          score: 0, movesRemaining: WORLD.MAX_MOVES,
          weapons: [], selectedWeapon: "",
          shieldHp: 0, vy: 0, falling: false,
        },
        {
          id: 1, x: p2X, y: 200, angleDeg: 135, power: 50,
          score: 0, movesRemaining: WORLD.MAX_MOVES,
          weapons: [], selectedWeapon: "",
          shieldHp: 0, vy: 0, falling: false,
        },
      ],
      projectiles: [],
      zones: [],
      visualEffects: [],
      popups: [],
      winner: null,
      firingStartTime: 0,
      quietTimer: 0,
      shotScoreLedger: { p1: 0, p2: 0 },
      p1FiredCount: 0,
      p2FiredCount: 0,
    };
  }

  // ═════════════════════════════════════════════
  //  Snapshot (for React useSyncExternalStore — §1.1)
  // ═════════════════════════════════════════════

  private buildSnapshot(): GameSnapshot {
    const [p1, p2] = this.state.tanks;
    return {
      phase: this.state.phase,
      round: this.state.round,
      maxRounds: WORLD.MAX_VOLLEYS,
      currentPlayer: this.state.currentPlayer,
      wind: this.state.wind,
      p1Score: Math.round(p1.score),
      p2Score: Math.round(p2.score),
      p1Moves: p1.movesRemaining,
      p2Moves: p2.movesRemaining,
      p1Weapons: [...p1.weapons],
      p2Weapons: [...p2.weapons],
      p1Selected: p1.selectedWeapon,
      p2Selected: p2.selectedWeapon,
      p1Shield: p1.shieldHp > 0,
      p2Shield: p2.shieldHp > 0,
      winner: this.state.winner,
      popups: [...this.state.popups],
    };
  }

  /**
   * Notify React subscribers that the snapshot changed.
   * Only called on discrete game events, NOT per frame.
   */
  private notifyChange(): void {
    // Build new snapshot
    const snap = this.buildSnapshot();

    // Check if anything actually changed (avoid spurious notifications)
    const key = `${snap.phase}|${snap.round}|${snap.currentPlayer}|${snap.wind}|${snap.p1Score}|${snap.p2Score}|${snap.p1Moves}|${snap.p2Moves}|${snap.p1Selected}|${snap.p2Selected}|${snap.p1Shield}|${snap.p2Shield}|${snap.winner}|${snap.p1Weapons.length}|${snap.p2Weapons.length}`;

    if (key !== this.lastSnapshotKey) {
      this.lastSnapshotKey = key;
      this.cachedSnapshot = snap;
      snapshotVersion++;
      this.listeners.forEach((fn) => fn());
    }
  }

  /** Manually force a snapshot update (e.g. after pause toggle) */
  forceNotify(): void {
    this.cachedSnapshot = this.buildSnapshot();
    this.lastSnapshotKey = "";
    snapshotVersion++;
    this.listeners.forEach((fn) => fn());
  }

  /** Dispose — stop loop, clear listeners */
  dispose(): void {
    this.stop();
    this.listeners.clear();
  }
}
