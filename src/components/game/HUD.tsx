// ═══════════════════════════════════════════════════════════
//  HUD — Main overlay (uses snapshot store, NOT per-frame data)
//  No health bars (points-only model §1.5). Reduced blur (§2.8).
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameSnapshot, getEngine } from "../../game/GameStore";
import { getWeapon } from "../../game/engine/weapons";
import { Wind } from "../../game/engine/WindHelper";
import { sfx } from "../../game/audio/Sfx";
import {
  WeaponIcon, PauseIcon, PlayIcon, RestartIcon, HomeIcon,
  SoundOnIcon, SoundOffIcon,
} from "./icons";

/**
 * Angle/power readout — per-frame values written imperatively to the DOM
 * (§1.1: React must never see per-frame data). Reads engine.aimReadout
 * in a rAF loop and updates text/width directly.
 */
function AimReadoutPanel({ player }: { player: 0 | 1 }) {
  const angleRef = useRef<HTMLSpanElement>(null);
  const powerRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const engine = getEngine();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = engine.aimReadout;
      // Player-relative angle over the full 360° range: for both players
      // 0° = toward the enemy, 90° = straight up, 180° = backwards
      const display = player === 1 ? (540 - a.angleDeg) % 360 : a.angleDeg;
      if (angleRef.current) angleRef.current.textContent = `${Math.round(display)}°`;
      if (powerRef.current) powerRef.current.textContent = `${Math.round(a.power)}`;
      if (barRef.current) barRef.current.style.width = `${Math.max(0, Math.min(100, a.power))}%`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player]);

  const playerColor = player === 0 ? "#3b82f6" : "#f43f5e";

  return (
    <div className="pointer-events-auto rounded-2xl p-3 w-44"
      style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-white/40 tracking-widest font-semibold">ANGLE</span>
        <span ref={angleRef} className="text-lg font-bold tabular-nums text-white">45°</span>
      </div>
      <div className="flex items-center justify-between px-1 mt-1">
        <span className="text-[10px] text-white/40 tracking-widest font-semibold">POWER</span>
        <span ref={powerRef} className="text-lg font-bold tabular-nums" style={{ color: playerColor }}>50</span>
      </div>
      <div className="mx-1 mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div ref={barRef} className="h-full rounded-full"
          style={{ width: "50%", background: `linear-gradient(90deg, ${playerColor}88, ${playerColor})` }} />
      </div>
      <p className="px-1 mt-2 text-[9px] leading-relaxed text-white/30">
        W/S aim · A/D power<br />SPACE hold+release fire · Q/E move
      </p>
    </div>
  );
}

export function HUD() {
  const snap = useGameSnapshot();
  const navigate = useNavigate();
  const engine = getEngine();
  const [muted, setMuted] = useState(sfx.muted);

  // The draft screen replaces the HUD entirely
  if (snap.phase === "DRAFT") return null;

  const isP1Turn = snap.phase === "AIMING" && snap.currentPlayer === 0;
  const isP2Turn = snap.phase === "AIMING" && snap.currentPlayer === 1;
  const isAiming = snap.phase === "AIMING";
  const isFiring = snap.phase === "FIRING";
  const isPaused = engine.isPaused();

  const p1Weapon = getWeapon(snap.p1Selected);
  const p2Weapon = getWeapon(snap.p2Selected);
  const currentWeapon = snap.currentPlayer === 0 ? p1Weapon : p2Weapon;
  const currentWeapons = snap.currentPlayer === 0 ? snap.p1Weapons : snap.p2Weapons;
  const currentMoves = snap.currentPlayer === 0 ? snap.p1Moves : snap.p2Moves;

  const windInfo = Wind.format(snap.wind);

  return (
    <>
      {/* ─── Top Bar ─── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between p-4 pointer-events-none">
        {/* Wind */}
        <div className="pointer-events-auto" style={{ backdropFilter: "blur(10px)" }}>
          <div className="rounded-xl px-4 py-2 flex items-center gap-3"
            style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
            <span className="text-[10px] text-white/40 tracking-widest font-semibold">WIND</span>
            {windInfo.direction === "CALM" ? (
              <span className="text-white/50 text-sm font-medium">CALM</span>
            ) : (
              <>
                <span className="text-lg font-bold" style={{
                  color: snap.wind > 0 ? "#00d4ff" : "#ff6b35",
                  transform: snap.wind > 0 ? "none" : "scaleX(-1)",
                  display: "inline-block",
                }}>→</span>
                <span className="text-lg font-bold tabular-nums" style={{
                  color: snap.wind > 0 ? "#00d4ff" : "#ff6b35",
                }}>{windInfo.strength}</span>
              </>
            )}
          </div>
        </div>

        {/* Score board */}
        <div className="pointer-events-auto rounded-2xl px-5 py-3 flex items-center gap-6"
          style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
          {/* P1 */}
          <div className={`flex items-center gap-3 transition-all ${isP1Turn ? "opacity-100" : "opacity-50"}`}>
            <div className="w-3 h-3 rounded-full" style={{
              background: "#3b82f6",
              boxShadow: isP1Turn ? "0 0 12px #3b82f6" : "none",
            }} />
            <div>
              <div className="text-xs text-white/40 font-medium tracking-wide flex items-center gap-1.5">
                PLAYER 1
                {snap.p1Shield && <WeaponIcon category="defense" color="#60a5fa" size={11} />}
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "#3b82f6" }}>
                {snap.p1Score}
              </div>
            </div>
          </div>

          {/* Round + battle mode */}
          <div className="flex flex-col items-center px-4 border-x border-white/10">
            <div className="text-[10px] text-white/40 tracking-widest font-semibold">VOLLEY</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {snap.round}<span className="text-white/30 text-sm">/{snap.maxRounds}</span>
            </div>
            <div className="text-[8px] text-white/30 tracking-[0.2em] font-semibold whitespace-nowrap">
              {snap.modeName.toUpperCase()}
            </div>
          </div>

          {/* P2 */}
          <div className={`flex items-center gap-3 transition-all ${isP2Turn ? "opacity-100" : "opacity-50"}`}>
            <div>
              <div className="text-xs text-white/40 font-medium tracking-wide flex items-center justify-end gap-1.5">
                {snap.p2Shield && <WeaponIcon category="defense" color="#60a5fa" size={11} />}
                PLAYER 2
              </div>
              <div className="text-2xl font-bold tabular-nums text-right" style={{ color: "#f43f5e" }}>
                {snap.p2Score}
              </div>
            </div>
            <div className="w-3 h-3 rounded-full" style={{
              background: "#f43f5e",
              boxShadow: isP2Turn ? "0 0 12px #f43f5e" : "none",
            }} />
          </div>
        </div>

        {/* Sound + Pause */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { sfx.setMuted(!muted); setMuted(!muted); }}
            className="pointer-events-auto rounded-xl px-3 py-2.5 text-white/60 hover:text-white transition-all"
            style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <SoundOffIcon size={16} /> : <SoundOnIcon size={16} />}
          </button>
          <button
            onClick={() => { engine.togglePause(); engine.forceNotify(); }}
            className="pointer-events-auto rounded-xl px-4 py-2.5 text-white/60 hover:text-white transition-all"
            style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
            title="Pause (ESC)"
          >
            {isPaused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
          </button>
        </div>
      </div>

      {/* ─── Turn banner ─── */}
      {isAiming && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-fade-in">
          <div className="rounded-full px-5 py-1.5 text-sm font-semibold tracking-wide"
            style={{
              background: "rgba(10,15,30,0.55)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
              color: snap.currentPlayer === 0 ? "#3b82f6" : "#f43f5e",
            }}>
            PLAYER {snap.currentPlayer + 1} — AIM & FIRE
          </div>
        </div>
      )}

      {/* ─── Firing banner ─── */}
      {isFiring && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="rounded-full px-5 py-1.5 text-sm text-white/50 tracking-wide animate-fade-in flex items-center gap-2"
            style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: snap.currentPlayer === 0 ? "#3b82f6" : "#f43f5e" }} />
            PROJECTILE IN FLIGHT...
          </div>
        </div>
      )}

      {/* ─── Bottom Bar: Weapon panel + aim readout ─── */}
      {isAiming && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pointer-events-none">
          <div className="flex items-end justify-center gap-4">
            {/* Weapon panel */}
            <div className="pointer-events-auto rounded-2xl p-3"
              style={{ background: "rgba(10,15,30,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[10px] text-white/40 tracking-widest font-semibold">
                  P{snap.currentPlayer + 1} ARSENAL
                </span>
                <span className="text-[10px] text-white/20">·</span>
                <span className="text-[10px] text-white/30">{currentMoves} moves left</span>
              </div>
              <div className="flex gap-1.5 flex-wrap max-w-[480px]">
                {currentWeapons.map((weaponId, idx) => {
                  const weapon = getWeapon(weaponId);
                  if (!weapon) return null;
                  const isSelected = snap.currentPlayer === 0
                    ? snap.p1Selected === weaponId
                    : snap.p2Selected === weaponId;
                  return (
                    <button
                      key={`${weaponId}-${idx}`}
                      onClick={() => engine.selectWeapon(weaponId)}
                      className={`relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 ${
                        isSelected
                          ? "scale-105"
                          : "bg-white/5 hover:bg-white/10 border border-white/5"
                      }`}
                      style={isSelected ? {
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        boxShadow: `0 0 12px ${weapon.color}40`,
                      } : {}}
                      title={weapon.name}
                    >
                      <WeaponIcon category={weapon.category} color={weapon.color} size={18} />
                      <span className="text-[8px] text-white/40 mt-0.5 font-medium">
                        {idx < 9 ? idx + 1 : 0}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Selected weapon info */}
              <div className="mt-2 px-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {currentWeapon?.name ?? "—"}
                </span>
                <span className="text-[10px] text-white/30">
                  {currentWeapon?.description}
                </span>
              </div>
            </div>

            {/* Aim readout (angle/power — per-frame, imperative DOM updates) */}
            <AimReadoutPanel player={snap.currentPlayer} />
          </div>
        </div>
      )}

      {/* ─── Round End banner ─── */}
      {snap.phase === "ROUND_END" && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-scale-in">
          <div className="rounded-2xl px-8 py-4 text-center"
            style={{ background: "rgba(10,15,30,0.7)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(20px)" }}>
            <p className="text-xs text-white/40 tracking-widest mb-1">VOLLEY {snap.round} COMPLETE</p>
            <p className="text-2xl font-bold text-white">
              {snap.p1Score} <span className="text-white/30 text-lg">—</span> {snap.p2Score}
            </p>
            <p className="text-sm text-white/40 mt-1">Next volley starting...</p>
          </div>
        </div>
      )}

      {/* ─── Pause overlay ─── */}
      {isPaused && snap.phase !== "GAME_OVER" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="rounded-3xl p-8 w-80 flex flex-col items-center gap-6 animate-scale-in"
            style={{ background: "rgba(10,15,30,0.8)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(30px)" }}>
            <h2 className="text-3xl font-bold text-gradient">PAUSED</h2>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => { engine.togglePause(); engine.forceNotify(); }}
                className="rounded-xl py-3 px-6 text-white font-semibold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <PlayIcon size={15} /> Resume
              </button>
              <button
                onClick={() => { engine.reset(); engine.forceNotify(); }}
                className="rounded-xl py-3 px-6 text-white font-semibold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <RestartIcon size={15} /> Restart Match
              </button>
              <button
                onClick={() => navigate("/")}
                className="rounded-xl py-3 px-6 text-white/60 font-semibold hover:bg-white/10 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <HomeIcon size={15} /> Main Menu
              </button>
            </div>
            <p className="text-xs text-white/30">Press ESC to resume</p>
          </div>
        </div>
      )}

      {/* ─── Game Over ─── */}
      {snap.phase === "GAME_OVER" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="rounded-3xl p-10 w-[420px] flex flex-col items-center gap-6 animate-scale-in"
            style={{ background: "rgba(10,15,30,0.8)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(30px)" }}>
            <div className="text-center">
              <p className="text-sm text-white/40 tracking-widest font-semibold mb-2">MATCH COMPLETE</p>
              <h2 className="text-5xl font-black mb-1" style={{
                color: snap.winner === 0 ? "#3b82f6" : snap.winner === 1 ? "#f43f5e" : "#a855f7",
              }}>
                {snap.winner === 0 ? "PLAYER 1" : snap.winner === 1 ? "PLAYER 2" : "DRAW"}
              </h2>
              {snap.winner !== -1 && <p className="text-lg text-white/50 font-medium">WINS THE BATTLE!</p>}
              {snap.winner === -1 && <p className="text-lg text-white/50 font-medium">IT'S A TIE!</p>}
            </div>
            <div className="flex items-center gap-8 w-full justify-center py-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full mb-2" style={{ background: "#3b82f6" }} />
                <span className="text-xs text-white/40">PLAYER 1</span>
                <span className="text-3xl font-bold tabular-nums" style={{ color: "#3b82f6" }}>{snap.p1Score}</span>
              </div>
              <span className="text-white/20 text-2xl font-light">vs</span>
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full mb-2" style={{ background: "#f43f5e" }} />
                <span className="text-xs text-white/40">PLAYER 2</span>
                <span className="text-3xl font-bold tabular-nums" style={{ color: "#f43f5e" }}>{snap.p2Score}</span>
              </div>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { engine.reset(); engine.forceNotify(); }}
                className="flex-1 rounded-xl py-3 px-6 text-white font-semibold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <RestartIcon size={15} /> Rematch
              </button>
              <button
                onClick={() => navigate("/")}
                className="flex-1 rounded-xl py-3 px-6 text-white/60 font-semibold hover:bg-white/10 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <HomeIcon size={15} /> Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
