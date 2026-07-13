// ═══════════════════════════════════════════════════════════
//  Wind Helper — Display formatting (for HUD, not engine)
// ═══════════════════════════════════════════════════════════

export const Wind = {
  format(wind: number): { direction: string; strength: string } {
    if (Math.abs(wind) < 2) return { direction: "CALM", strength: "0" };
    return {
      direction: wind > 0 ? "→" : "←",
      strength: Math.abs(wind).toString(),
    };
  },
};
