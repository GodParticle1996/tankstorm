// ═══════════════════════════════════════════════════════════
//  Landing Page — Glassmorphism hero with Play Now CTA
// ═══════════════════════════════════════════════════════════

import { useNavigate } from "react-router-dom";
import { TankLogo, TargetIcon, MountainIcon, BurstIcon, PlayIcon } from "../components/game/icons";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="w-full h-full overflow-auto relative"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #1a2340 0%, #0a0f1e 60%)" }}>

      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(0,212,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.08) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
          maskImage: "radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%)",
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-float"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              width: `${2 + (i % 4)}px`,
              height: `${2 + (i % 4)}px`,
              background: i % 3 === 0 ? "#00d4ff" : i % 3 === 1 ? "#3b82f6" : "#a855f7",
              opacity: 0.3 + (i % 3) * 0.15,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${3 + (i % 3)}s`,
              boxShadow: `0 0 8px currentColor`,
            }}
          />
        ))}
      </div>

      {/* Content — my-auto centers when there's room, scrolls naturally when
          there isn't; shrink-0 stops flex from compressing sections into each
          other on short windows (the overlap bug). */}
      <div className="relative z-10 flex flex-col items-center min-h-full px-6">
        <div className="flex flex-col items-center w-full max-w-5xl shrink-0 my-auto py-10">
        {/* Title */}
        <div className="text-center mb-2 animate-fade-in shrink-0">
          <div className="mb-2 flex justify-center animate-float">
            <TankLogo size={56} />
          </div>
          <h1 className="text-6xl md:text-7xl font-black tracking-tight text-gradient-shimmer mb-2">
            TANKSTORM
          </h1>
          <p className="text-base md:text-lg text-white/40 font-medium tracking-wide">
            A modern 2-player turn-based artillery game
          </p>
        </div>

        {/* CTA */}
        <div className="mt-6 animate-scale-in shrink-0">
          <button
            onClick={() => navigate("/game")}
            className="group relative px-12 py-4 rounded-2xl text-xl font-bold text-white transition-all active:scale-95 hover:scale-105"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(59,130,246,0.2))",
              border: "1px solid rgba(0,212,255,0.3)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 0 30px rgba(0,212,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <span className="flex items-center gap-3">
              <PlayIcon size={18} color="#00d4ff" /> Play Now
              <span className="text-sm text-white/40 group-hover:text-white/60 transition-colors">2-Player Hot-Seat</span>
            </span>
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 max-w-4xl w-full shrink-0">
          {[
            { icon: <BurstIcon size={30} color="#ff6b35" />, title: "50+ Weapons", desc: "Explosives, napalm, lasers, homing missiles, airstrikes, teleports, shields — each with unique physics" },
            { icon: <MountainIcon size={30} color="#a78bfa" />, title: "Destructible Terrain", desc: "Every shot reshapes the battlefield. Craters, pits, walls — the terrain is your weapon" },
            { icon: <TargetIcon size={30} color="#00d4ff" />, title: "Skill-Based Aiming", desc: "Wind, gravity, angle, power. Master the ballistic arc or let the terrain bury you" },
          ].map((feat, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 animate-fade-in"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderTopColor: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                animationDelay: `${0.2 + i * 0.15}s`,
              }}
            >
              <div className="mb-2">{feat.icon}</div>
              <h3 className="text-lg font-bold text-white mb-1">{feat.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>

        {/* How to play */}
        <div className="mt-8 max-w-2xl w-full rounded-2xl p-5 animate-fade-in shrink-0"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
            animationDelay: "0.6s",
          }}>
          <h3 className="text-sm font-bold text-white/60 tracking-widest mb-4 text-center">HOW TO PLAY</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              ["W / ↑", "Aim turret up"],
              ["S / ↓", "Aim turret down"],
              ["D / →", "Increase power"],
              ["A / ←", "Decrease power"],
              ["Space", "Hold to charge, release to fire"],
              ["Q / E", "Move tank (4 moves per match)"],
              ["1-0", "Select weapon"],
              ["ESC", "Pause"],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center gap-3">
                <kbd className="px-2 py-0.5 rounded text-xs font-mono font-semibold"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {key}
                </kbd>
                <span className="text-white/40">{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-white/20 shrink-0">
          10 volleys · Highest score wins · Points-only · No health bars
        </p>
        </div>
      </div>
    </div>
  );
}
