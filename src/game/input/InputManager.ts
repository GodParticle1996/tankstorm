// ═══════════════════════════════════════════════════════════
//  Input Manager (§2.8 — keys canonical, engine is single source of truth)
//  Talks to GameEngine directly. Gates ALL gameplay input on
//  phase === AIMING. Input leaking into FIRING is a classic bug.
// ═══════════════════════════════════════════════════════════

import type { GameEngine } from "../engine/GameEngine";

/**
 * Hot-seat controls (turn-based — only current player inputs):
 *   W / ↑     = aim up
 *   S / ↓     = aim down
 *   A / ←     = decrease power
 *   D / →     = increase power
 *   Space     = fire (hold-to-charge: hold to increase power, release to fire)
 *   Q / ,     = move left
 *   E / .     = move right
 *   1-0       = select weapon
 *   ESC / P   = pause
 */
export class InputManager {
  private engine: GameEngine;
  private keys: Set<string> = new Set();
  private rafId = 0;
  private charging = false;
  private chargeStartPower = 0;

  // Continuous adjustment rates (per frame at ~60fps)
  private static readonly ANGLE_RATE = 1.2; // deg per frame
  private static readonly POWER_RATE = 1.0; // power per frame

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  start(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    cancelAnimationFrame(this.rafId);
    this.keys.clear();
  }

  private isAiming(): boolean {
    return this.engine.getSnapshot().phase === "AIMING";
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key;

    // Prevent default for game keys (§Part 4 item 13)
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) {
      e.preventDefault();
    }

    // Pause toggle (works in any phase except GAME_OVER)
    if (key === "Escape" || key.toLowerCase() === "p") {
      this.engine.togglePause();
      this.engine.forceNotify();
      return;
    }

    if (!this.isAiming()) return;
    if (this.engine.isPaused()) return;

    this.keys.add(key.toLowerCase());

    // Movement (single press)
    if (key.toLowerCase() === "q" || key === ",") {
      this.engine.moveTank(-1);
    }
    if (key.toLowerCase() === "e" || key === ".") {
      this.engine.moveTank(1);
    }

    // Fire: hold space to charge, release to fire (§2.8)
    if (key === " " && !this.charging) {
      this.charging = true;
      this.chargeStartPower = this.engine.getSnapshot().phase === "AIMING"
        ? this.getCurrentPower()
        : 50;
    }

    // Weapon selection (1-9, 0)
    if (/^[0-9]$/.test(key)) {
      const idx = key === "0" ? 9 : parseInt(key) - 1;
      const snap = this.engine.getSnapshot();
      const weapons = snap.currentPlayer === 0 ? snap.p1Weapons : snap.p2Weapons;
      if (idx < weapons.length) {
        this.engine.selectWeapon(weapons[idx]);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());

    // Release space = fire (hold-to-charge mechanic)
    if (e.key === " " && this.charging) {
      this.charging = false;
      if (this.isAiming() && !this.engine.isPaused()) {
        this.engine.fire();
      }
    }
  };

  private getCurrentPower(): number {
    // Read aim readout directly from engine (per-frame, no React)
    return this.engine.aimReadout.power;
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);

    if (!this.isAiming() || this.engine.isPaused()) return;

    // Continuous angle adjustment.
    // One global angle convention (0°=right, 90°=up, 180°=left), but "aim up"
    // must RAISE the barrel for both players: P1 raises toward 90 by increasing
    // the angle, P2 (starting at 135) raises toward 90 by DECREASING it.
    const aimDir = this.engine.getSnapshot().currentPlayer === 0 ? 1 : -1;
    if (this.keys.has("w") || this.keys.has("arrowup")) {
      this.engine.adjustAngle(InputManager.ANGLE_RATE * aimDir);
    }
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      this.engine.adjustAngle(-InputManager.ANGLE_RATE * aimDir);
    }

    // Continuous power adjustment (keyboard A/D or arrows)
    if (!this.charging) {
      if (this.keys.has("d") || this.keys.has("arrowright")) {
        this.engine.adjustPower(InputManager.POWER_RATE);
      }
      if (this.keys.has("a") || this.keys.has("arrowleft")) {
        this.engine.adjustPower(-InputManager.POWER_RATE);
      }
    } else {
      // Hold-to-charge: power increases while space is held
      this.engine.adjustPower(InputManager.POWER_RATE * 1.5);
    }
  };
}
