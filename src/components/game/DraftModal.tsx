// ═══════════════════════════════════════════════════════════
//  DraftModal — Pocket-Tanks-style weapon draft (§2.5)
//  5 rounds. Each round deals 6 weapons (≥2 premium); players
//  alternate first pick (P1 first in odd rounds). Each player picks
//  1 per round, then receives 5 hidden random weapons → 10 total.
//  Pure React modal — the engine is only involved at the end via
//  initGame(p1Weapons, p2Weapons). UI randomness may use Math.random
//  (the seeded-PRNG rule applies to the engine only).
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { getEngine } from "../../game/GameStore";
import { getWeapon, DRAFT_POOL, PREMIUM_POOL } from "../../game/engine/weapons";
import { WeaponIcon, PlayIcon, TankLogo } from "./icons";

const TOTAL_ROUNDS = 5;
const CARDS_PER_DEAL = 6;
const PREMIUM_PER_DEAL = 2;
const HIDDEN_WEAPONS = 5;

const P_COLORS = ["#3b82f6", "#f43f5e"] as const;

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal 6 cards: ≥2 premium, no repeats of anything already picked by either player */
function dealCards(taken: ReadonlySet<string>): string[] {
  const premium = shuffled(PREMIUM_POOL.filter((id) => !taken.has(id)));
  const rest = shuffled(DRAFT_POOL.filter((id) => !taken.has(id) && !premium.slice(0, PREMIUM_PER_DEAL).includes(id)));
  const deal = [
    ...premium.slice(0, PREMIUM_PER_DEAL),
    ...rest.filter((id) => !PREMIUM_POOL.includes(id)).slice(0, CARDS_PER_DEAL - PREMIUM_PER_DEAL),
  ];
  // Top up from anywhere if the pools ran short (55-weapon pool: never in practice)
  for (const id of rest) {
    if (deal.length >= CARDS_PER_DEAL) break;
    if (!deal.includes(id)) deal.push(id);
  }
  return shuffled(deal);
}

/** 5 hidden weapons: distinct within a player, may duplicate across players */
function hiddenWeapons(owned: readonly string[]): string[] {
  const pool = shuffled(DRAFT_POOL.filter((id) => !owned.includes(id)));
  return pool.slice(0, HIDDEN_WEAPONS);
}

export function DraftModal() {
  const [round, setRound] = useState(1);
  const [pickInRound, setPickInRound] = useState(0); // 0 = first picker, 1 = second
  const [picks, setPicks] = useState<[string[], string[]]>([[], []]);
  const [deal, setDeal] = useState<string[]>(() => dealCards(new Set()));

  const firstPicker: 0 | 1 = round % 2 === 1 ? 0 : 1; // P1 first in odd rounds (§2.5)
  const currentPicker: 0 | 1 = pickInRound === 0 ? firstPicker : (firstPicker === 0 ? 1 : 0);
  const pickerColor = P_COLORS[currentPicker];

  const finishDraft = (finalPicks: [string[], string[]]) => {
    const engine = getEngine();
    const p1 = [...finalPicks[0], ...hiddenWeapons(finalPicks[0])];
    const p2 = [...finalPicks[1], ...hiddenWeapons(finalPicks[1])];
    engine.initGame(p1, p2);
  };

  const onPick = (weaponId: string) => {
    const next: [string[], string[]] = [
      currentPicker === 0 ? [...picks[0], weaponId] : picks[0],
      currentPicker === 1 ? [...picks[1], weaponId] : picks[1],
    ];
    setPicks(next);

    if (pickInRound === 0) {
      // Second player picks from the remaining 5 cards
      setDeal(deal.filter((id) => id !== weaponId));
      setPickInRound(1);
      return;
    }

    // Round complete
    if (round === TOTAL_ROUNDS) {
      finishDraft(next);
      return;
    }
    const taken = new Set([...next[0], ...next[1]]);
    setRound(round + 1);
    setPickInRound(0);
    setDeal(dealCards(taken));
  };

  const skipDraft = () => {
    getEngine().quickStart();
  };

  return (
    // Fully OPAQUE — the WebGL canvas behind holds no meaningful scene yet
    // (translucency let the empty terrain slab bleed through as an artifact)
    <div className="absolute inset-0 z-40 overflow-y-auto animate-fade-in"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #16203d 0%, #0a0f1e 65%)" }}>

      {/* Subtle grid, matching the landing page */}
      <div className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(0,212,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.08) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
          maskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center min-h-full">
      <div className="w-full max-w-4xl px-6 py-8 flex flex-col items-center gap-5 shrink-0 my-auto">

        {/* Header */}
        <div className="text-center flex flex-col items-center">
          <div className="flex items-center gap-3 mb-3">
            <TankLogo size={30} />
            <span className="text-sm font-black tracking-[0.25em] text-white/50">TANKSTORM</span>
          </div>
          <p className="text-[11px] tracking-[0.3em] text-white/40 font-semibold mb-1">
            WEAPON DRAFT
          </p>
          <h2 className="text-3xl font-black" style={{ color: pickerColor }}>
            PLAYER {currentPicker + 1} PICKS
          </h2>
          <p className="text-xs text-white/35 mt-1">
            {pickInRound === 0 ? "First pick of the round" : "Second pick — 5 cards left"}
            {" · "}each player also receives {HIDDEN_WEAPONS} mystery weapons
          </p>
          {/* Round progress dots */}
          <div className="flex items-center gap-2 mt-3">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <span key={i} className="rounded-full transition-all"
                style={{
                  width: i + 1 === round ? 22 : 8,
                  height: 8,
                  background: i + 1 < round
                    ? "rgba(255,255,255,0.55)"
                    : i + 1 === round
                      ? pickerColor
                      : "rgba(255,255,255,0.14)",
                }} />
            ))}
            <span className="text-[10px] text-white/35 ml-1 tabular-nums">ROUND {round}/{TOTAL_ROUNDS}</span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
          {deal.map((id) => {
            const w = getWeapon(id);
            if (!w) return null;
            return (
              <button
                key={id}
                data-draft-card
                onClick={() => onPick(id)}
                className="group text-left rounded-2xl p-4 min-h-[104px] transition-all hover:scale-[1.03] hover:bg-white/10 active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.045)",
                  border: `1px solid ${w.premium ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.1)"}`,
                  boxShadow: w.premium ? "0 0 18px rgba(251,191,36,0.1)" : "0 4px 16px rgba(0,0,0,0.25)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl"
                    style={{ background: `${w.color}1a`, border: `1px solid ${w.color}33` }}>
                    <WeaponIcon category={w.category} color={w.color} size={20} />
                  </span>
                  <div className="flex items-center gap-2">
                    {w.premium && (
                      <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded"
                        style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}>
                        PREMIUM
                      </span>
                    )}
                    <span className="text-sm font-bold tabular-nums" style={{ color: w.color }}>
                      {w.basePoints > 0 ? w.basePoints : "—"}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-bold text-white group-hover:text-white">{w.name}</p>
                <p className="text-[11px] text-white/40 leading-snug mt-0.5">{w.description}</p>
              </button>
            );
          })}
        </div>

        {/* Picks so far */}
        <div className="flex items-start justify-between w-full gap-6">
          {[0, 1].map((p) => (
            <div key={p} className="flex-1">
              <p className="text-[10px] tracking-widest font-semibold mb-1.5" style={{ color: P_COLORS[p] }}>
                PLAYER {p + 1} — {picks[p].length}/{TOTAL_ROUNDS} PICKS
              </p>
              <div className={`flex flex-wrap gap-1.5 ${p === 1 ? "justify-start" : ""}`}>
                {picks[p].map((id, i) => {
                  const w = getWeapon(id);
                  if (!w) return null;
                  return (
                    <span key={`${id}-${i}`} title={w.name}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-white/70"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <WeaponIcon category={w.category} color={w.color} size={11} />
                      {w.name}
                    </span>
                  );
                })}
                {picks[p].length === 0 && <span className="text-[10px] text-white/20">no picks yet</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Skip */}
        <button
          data-draft-skip
          onClick={skipDraft}
          className="mt-1 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm text-white/50 hover:text-white transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <PlayIcon size={13} /> Skip draft — random arsenals
        </button>
      </div>
      </div>
    </div>
  );
}
