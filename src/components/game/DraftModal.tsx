// ═══════════════════════════════════════════════════════════
//  DraftModal — Pocket-Tanks-style weapon draft (§2.5)
//  5 rounds. Each round deals 6 weapons (≥2 premium); players
//  alternate first pick (P1 first in odd rounds). Each player picks
//  1 per round, then receives 5 hidden random weapons → 10 total.
//  Pure React modal — the engine is only involved at the end via
//  initGame(p1Weapons, p2Weapons). UI randomness may use Math.random
//  (the seeded-PRNG rule applies to the engine only).
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
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

/**
 * Single source of truth for the draft's progress.
 *
 * All of round/pickInRound/picks/deal live in ONE object so they advance
 * atomically via a functional `setState` updater — no handler ever reads a
 * stale `round`/`pickInRound`/`picks`/`deal` from the render closure, which
 * is what caused the double-pick (6/5) and stuck-screen bugs under rapid
 * double-clicks.
 */
interface DraftState {
  /** 1..TOTAL_ROUNDS */
  round: number;
  /** 0 = first picker of the round, 1 = second */
  pickInRound: 0 | 1;
  /** [player1Picks, player2Picks] */
  picks: [string[], string[]];
  /** The 6 dealt cards for the current round */
  deal: string[];
  /** Re-entry lock: set true the instant a pick is accepted; cleared on the
   *  next commit so the second picker (or next round) can act. The cards
   *  derive their `disabled` prop from this for immediate visual feedback,
   *  and onPick also early-returns on a stale click for absolute safety. */
  locked: boolean;
}

/** Whose turn it is for a given state. P1 first in odd rounds (§2.5). */
function pickPickerFor(s: DraftState): 0 | 1 {
  const firstPicker: 0 | 1 = s.round % 2 === 1 ? 0 : 1;
  return s.pickInRound === 0 ? firstPicker : firstPicker === 0 ? 1 : 0;
}

function initialDraftState(): DraftState {
  return {
    round: 1,
    pickInRound: 0,
    picks: [[], []],
    deal: dealCards(new Set()),
    locked: false,
  };
}

export function DraftModal() {
  const [state, setState] = useState<DraftState>(initialDraftState);

  // Guarantees finishDraft / initGame runs at most once.
  const finishedRef = useRef(false);

  const currentPicker = pickPickerFor(state);
  const pickerColor = P_COLORS[currentPicker];

  const finishDraft = (finalPicks: [string[], string[]]) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const engine = getEngine();
    const p1 = [...finalPicks[0], ...hiddenWeapons(finalPicks[0])];
    const p2 = [...finalPicks[1], ...hiddenWeapons(finalPicks[1])];
    engine.initGame(p1, p2);
  };

  const onPick = (weaponId: string) => {
    // Re-entry guard: a click while a prior pick is still committing is a
    // no-op. This blocks the exact rapid-double-click race that caused 6/5.
    if (finishedRef.current) return;

    // Functional updater: never reads stale draft state from the closure.
    setState((prev) => {
      // ── Hard invariants: reject any pick that would break the draft ──
      // 1. A pick is already in flight (waiting for this commit).
      if (prev.locked) return prev;
      // 2. Card not dealt this round (already picked / stale click).
      if (!prev.deal.includes(weaponId)) return prev;
      // 3. The picker may never exceed TOTAL_ROUNDS picks.
      const picker = pickPickerFor(prev);
      if (prev.picks[picker].length >= TOTAL_ROUNDS) return prev;

      const nextPicks: [string[], string[]] = [
        picker === 0 ? [...prev.picks[0], weaponId] : prev.picks[0],
        picker === 1 ? [...prev.picks[1], weaponId] : prev.picks[1],
      ];

      if (prev.pickInRound === 0) {
        // Second player picks from the remaining 5 cards. Stays locked one
        // frame, then the next commit (pickInRound === 1) clears it below.
        return {
          ...prev,
          picks: nextPicks,
          deal: prev.deal.filter((id) => id !== weaponId),
          pickInRound: 1,
          locked: true,
        };
      }

      // Round complete
      if (prev.round === TOTAL_ROUNDS) {
        // Schedule the handoff AFTER the state commit so the modal can
        // unmount cleanly. Exactly-once is enforced by finishedRef.
        queueMicrotask(() => finishDraft(nextPicks));
        return { ...prev, picks: nextPicks, locked: true };
      }

      const taken = new Set([...nextPicks[0], ...nextPicks[1]]);
      return {
        ...prev,
        picks: nextPicks,
        round: prev.round + 1,
        pickInRound: 0,
        deal: dealCards(taken),
        locked: true,
      };
    });
  };

  // After every commit that left the draft locked (a pick just landed),
  // unlock so the next picker can act. Runs once per commit, after paint
  // is committed, so the locked state was already reflected in the DOM —
  // exactly one frame of disabled cards (instant to the user). If the
  // draft just finished, the modal unmounts and this never re-fires.
  useEffect(() => {
    if (!state.locked || finishedRef.current) return;
    setState((s) => (s.locked ? { ...s, locked: false } : s));
  }, [state]);

  const skipDraft = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
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
            {state.pickInRound === 0 ? "First pick of the round" : "Second pick — 5 cards left"}
            {" · "}each player also receives {HIDDEN_WEAPONS} mystery weapons
          </p>
          {/* Round progress dots */}
          <div className="flex items-center gap-2 mt-3">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <span key={i} className="rounded-full transition-all"
                style={{
                  width: i + 1 === state.round ? 22 : 8,
                  height: 8,
                  background: i + 1 < state.round
                    ? "rgba(255,255,255,0.55)"
                    : i + 1 === state.round
                      ? pickerColor
                      : "rgba(255,255,255,0.14)",
                }} />
            ))}
            <span className="text-[10px] text-white/35 ml-1 tabular-nums">ROUND {state.round}/{TOTAL_ROUNDS}</span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
          {state.deal.map((id) => {
            const w = getWeapon(id);
            if (!w) return null;
            return (
              <button
                key={id}
                data-draft-card
                disabled={state.locked}
                onClick={() => onPick(id)}
                className="group text-left rounded-2xl p-4 min-h-[104px] transition-all hover:scale-[1.03] hover:bg-white/10 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:pointer-events-none"
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
                PLAYER {p + 1} — {state.picks[p].length}/{TOTAL_ROUNDS} PICKS
              </p>
              <div className={`flex flex-wrap gap-1.5 ${p === 1 ? "justify-start" : ""}`}>
                {state.picks[p].map((id, i) => {
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
                {state.picks[p].length === 0 && <span className="text-[10px] text-white/20">no picks yet</span>}
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
