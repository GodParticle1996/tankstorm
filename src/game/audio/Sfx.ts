// ═══════════════════════════════════════════════════════════
//  Sfx — tiny WebAudio synthesizer for game sounds.
//  No audio assets: everything is oscillators + filtered noise.
//  Lives in the presentation layer (renderer/HUD trigger it);
//  the engine never imports this. Safe in headless tests
//  (no AudioContext / localStorage in Node → silently disabled).
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = "tankstorm_muted";

class Sfx {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed: Record<string, number> = {};
  muted = false;

  constructor() {
    try {
      this.muted = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? "1" : "0");
    } catch {
      // storage unavailable — mute state just won't persist
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof AudioContext === "undefined") return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Rate-limit a sound type (cluster bombs would otherwise stack 5 booms) */
  private throttled(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed[key] ?? -Infinity) < minIntervalMs) return true;
    this.lastPlayed[key] = now;
    return false;
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate; // 1s of white noise, reused by every boom
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Explosion: filtered noise burst + sub-bass thump. Size 0..1 scales it. */
  boom(radius: number): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.throttled("boom", 60)) return;
    const size = Math.min(1, radius / 90);
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500 + size * 700, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 0.4 + size * 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16 + size * 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45 + size * 0.35);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.9);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(70 + size * 30, t);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.18 + size * 0.15, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.4);
  }

  /** Laser/beam zap: descending sawtooth sweep */
  zap(): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.throttled("zap", 80)) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Muzzle pop / small spark */
  pop(): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.throttled("pop", 50)) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Soft thud (bounces, dirt) */
  thud(): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.throttled("thud", 70)) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }
}

export const sfx = new Sfx();
