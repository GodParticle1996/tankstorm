// ═══════════════════════════════════════════════════════════
//  Game Page — Wires engine + renderer + input + HUD
//  Engine owns the loop. Renderer reads engine directly each frame.
//  React only renders the HUD via useSyncExternalStore.
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getEngine, useGameSnapshot } from "../game/GameStore";
import { GameRenderer } from "../game/rendering/GameRenderer";
import { InputManager } from "../game/input/InputManager";
import { HUD } from "../components/game/HUD";
import { DraftModal } from "../components/game/DraftModal";

/** Shows the weapon draft while the engine is in the DRAFT phase */
function DraftGate() {
  const snap = useGameSnapshot();
  if (snap.phase !== "DRAFT") return null;
  return <DraftModal />;
}

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const rafRef = useRef<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!mountRef.current) return;

    // The engine is a PERMANENT singleton — never destroyed on unmount.
    // Destroying + recreating it broke React's useSyncExternalStore
    // subscriptions under StrictMode's double-mount (components stayed
    // subscribed to the disposed instance and never saw initGame flip the
    // phase — the draft appeared to hang forever in dev).
    const engine = getEngine();

    // Fresh session: back to the DRAFT phase (mode select + weapon draft)
    // and (re)start the fixed-timestep loop. Idempotent across
    // StrictMode's mount → cleanup → mount cycle.
    engine.reset();

    // Create renderer (reads engine directly, no React)
    const renderer = new GameRenderer(mountRef.current, engine);
    rendererRef.current = renderer;

    // Create input manager
    const input = new InputManager(engine);
    inputRef.current = input;
    input.start();

    // Render loop (renderer reads engine state, runs at display refresh rate)
    const renderLoop = () => {
      renderer.render();
      rafRef.current = requestAnimationFrame(renderLoop);
    };
    rafRef.current = requestAnimationFrame(renderLoop);

    // ─── Cleanup (§Part 4 item 11 — prevent GPU leaks) ───
    // Renderer/input are per-mount; the engine only pauses.
    return () => {
      cancelAnimationFrame(rafRef.current);
      input.stop();
      engine.stop();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0a0f1e]">
      {/* Three.js canvas mount point */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* HUD overlay (React — only re-renders on discrete events) */}
      <HUD />

      {/* Weapon draft (shown while phase === DRAFT) */}
      <DraftGate />

      {/* Back button (top-left corner, below HUD) */}
      <button
        onClick={() => navigate("/")}
        className="absolute bottom-4 left-4 z-20 rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-all"
        style={{ background: "rgba(10,15,30,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        ← Menu
      </button>
    </div>
  );
}
