// THE AVENUES (his design, 2026-10-31 — the tech web, STAGE 1: farms and kinetic guns) — pure data and arithmetic, no DOM.
// A family is a set of AVENUES — ways of doing the thing — each in a TIER. Everyone holds the family's tier-1 avenue.
// · A project researches ONE avenue you hold (or one you were offered): the first time is its BREAKTHROUGH (the avenue's `jump`,
//   the real leap); every time after, a REFINEMENT — a small gain that shrinks each time (REFINE: +3.5 %, +3.0, +2.5… about 15 % after
//   six, never past ~23 %), spread over the avenue's stats by the research fields that fed it. The cards stack on the same tier.
// · A new avenue is DISCOVERED, never chosen (his rule: "when a breakthrough happens, it just happens"; no empty slots, no "not found
//   yet"): when the fields it leans on are strong (its quality ≥ BT.at) there is a chance every eon — more while you research the avenue it
//   grows out of (effort, steeply by quality: weak fields get there, slowly). It is then OFFERED ("your scientists found…") and waits —
//   in the report, in the picker, in the tree — until you research it.
// · Breakthrough gains are TECHNOLOGY (a level or an adaptation stamped on the districts: the builders refit them, colony.js); refinements
//   are PRACTICE — they count everywhere at once (S.refine, S.adaptR, S.waterR).
export const REFINE = { first: 3.5, decay: 0.85, qMin: 0.5, qMax: 1.6, gunK: 1.5, adaptK: 2, waterK: 2 };
export const BT = { at: 1.15, passive: 0.25, effort: 0.4, cap: 0.35 };
export const AV_NEED = { base: 900, tier: 1.5, per: 0.15 };   // research an avenue takes: base × tier^(t−1) × (1 + per × refinements done)
// the stats a gun's refinement improves, and the field that drives each (his: materials → damage, motion → range, fabrication → rate)
export const GUN_STEP = { damage: 'materials', range: 'motion', rate: 'fabrication' };
export const AVENUES = {
  farms: {
    farming: { tier: 1, name: 'Basic farming', recipe: { life: 0.6, thermal: 0.2, materials: 0.2 }, step: 'food', dev: 'farms',
      text: 'Better strains, better soil, better hands: every farm district feeds a little more.' },
    cold:    { tier: 2, from: ['farming'], name: 'Cold-hardy crops', recipe: { life: 0.5, thermal: 0.3, materials: 0.2 }, jump: { adapt: { cold: 0.35 } }, step: 'adapt:cold', dev: 'farms_cold',
      text: 'Crops that sleep through the frost: farms on cold worlds lose far less to the climate.' },
    heat:    { tier: 2, from: ['farming'], name: 'Heat-proof crops', recipe: { life: 0.45, thermal: 0.35, fabrication: 0.2 }, jump: { adapt: { heat: 0.35 } }, step: 'adapt:heat', dev: 'farms_hot',
      text: 'Deep roots and waxy leaves: farms on hot worlds lose far less to the climate.' },
    drought: { tier: 2, from: ['farming'], name: 'Drought-proof crops', recipe: { life: 0.5, materials: 0.25, information: 0.25 }, jump: { water: 0.3 }, step: 'water', dev: 'farms',
      text: 'Crops that drink little: a dry world\'s farms need far less water hauled in.' },
    hydro:   { tier: 3, from: ['farming'], min: 3, name: 'Hydroponics', recipe: { life: 0.4, fabrication: 0.3, electrics: 0.3 }, jump: { food: 20 }, step: 'food', dev: 'farms',
      text: 'Crops in racks of nutrient water under lamps: every farm district feeds far more.' },
    rad:     { tier: 3, from: ['heat', 'drought'], all: true, needs: ['shield'], name: 'Shielded farms', recipe: { life: 0.4, materials: 0.3, motion: 0.3 }, jump: { adapt: { radiation: 0.4 } }, step: 'adapt:radiation', dev: 'farms_rad',
      text: 'Fields under a lattice of shields, strains that mend their own seeds: farms under open radiation lose far less.' },
  },
  gun: {
    driver:     { tier: 1, name: 'Driver', recipe: { materials: 0.35, fabrication: 0.35, motion: 0.3 }, step: 'gun', look: 'auto',
      text: 'Shells thrown by powder and magnets: each refinement a little more damage, reach or rate — by the fields that fed it.' },
    pierce:     { tier: 2, from: ['driver'], name: 'Piercing Core', recipe: { materials: 0.5, thermal: 0.25, fabrication: 0.25 }, mul: { damage: 1.1 }, fx: { bypass: 0.35, sh: 0.8 }, step: 'gun', look: 'penetrator',
      text: 'A dense core that punches past the plating into the hull: a share of every hit skips the armour — but a shield stops more of it.' },
    concussion: { tier: 2, from: ['driver'], name: 'Concussion Shell', recipe: { materials: 0.3, fabrication: 0.3, motion: 0.4 }, fx: { shock: 0.4 }, step: 'gun', look: null,
      text: 'The blow carries through the plate: part of what the armour stops still reaches the hull.' },
    rail:       { tier: 2, from: ['driver'], name: 'Railgun', recipe: { motion: 0.5, electrics: 0.3, materials: 0.2 }, mul: { range: 1.4, rate: 0.85 }, fx: { pierce: 0.25 }, step: 'gun', look: 'rail',
      text: 'Hypervelocity slugs: long reach, part of every hit straight through the shield, slower to reload.' },
    flak:       { tier: 2, from: ['driver'], name: 'Flak Battery', recipe: { fabrication: 0.5, information: 0.3, materials: 0.2 }, mul: { damage: 0.8, rate: 1.3 }, fx: { flak: 2.2 }, step: 'gun', look: 'auto',
      text: 'Bursting shells: when no ship is in reach, the guns shred drones and missiles far better.' },
    shockpen:   { tier: 3, from: ['pierce'], name: 'Shock Penetrator', recipe: { materials: 0.4, electrics: 0.3, thermal: 0.3 }, mul: { damage: 1.15 }, fx: { bypass: 0.45, surg: 0.8, sh: 0.8 }, step: 'gun', look: 'penetrator',
      text: 'Punches through and jolts the ship\'s systems on impact: the hull takes it, and the crew reels.' },
    gauss:      { tier: 3, from: ['rail'], name: 'Gauss Lance', recipe: { motion: 0.5, materials: 0.3, electrics: 0.2 }, mul: { range: 1.8, damage: 1.25, rate: 0.75 }, fx: { pierce: 0.35 }, step: 'gun', look: 'rail',
      text: 'Superconducting rails: extreme reach, heavy slugs, part of every hit through the shield.' },
  },
};
export const hasAvenues = fam => !!AVENUES[fam];
export const baseAvenue = fam => Object.keys(AVENUES[fam] || {}).find(k => AVENUES[fam][k].tier === 1) || null;
// a refinement's gain (%) — the r-th one on this avenue (0 = the first), at this quality
export const refineGain = (r, q) => REFINE.first * Math.pow(REFINE.decay, r) * Math.max(REFINE.qMin, Math.min(REFINE.qMax, q));
export const qFactor = q => Math.max(REFINE.qMin, Math.min(REFINE.qMax, q));
// a gun's gain split over its stats by the fields that fed it: { stat: share } from the recipe's strengths ({ field: strength })
export function gunShares(A, strength) {
  const w = {}; let t = 0;
  for (const [stat, f] of Object.entries(GUN_STEP)) { const v = (A.recipe[f] || 0.15) * Math.max(0.1, strength[f] ?? 0.8); w[stat] = v; t += v; }
  for (const k in w) w[k] = t ? w[k] / t : 1 / 3; return w;
}
// the avenues that could be discovered now: not held, not offered; what they grow from is held (one of `from`, or all with `all`),
// the one they grow from refined at least `min` times, the families they `need` developed at least once
export function candidates(S, fam) {
  const L = AVENUES[fam] || {}, held = (S.av && S.av[fam]) || {}, offered = new Set((S.offers || []).filter(o => o.fam === fam).map(o => o.av)), out = [];
  for (const [id, A] of Object.entries(L)) {
    if (A.tier === 1 || held[id] || offered.has(id) || !A.from) continue;
    const ok = (A.all ? A.from.every : A.from.some).call(A.from, f => held[f] && (held[f].n || 0) >= (A.min || 1));
    if (!ok) continue;
    if (A.needs && !A.needs.every(nf => ((S.gens || {})[nf] || 0) >= 1 || Object.keys((S.av || {})[nf] || {}).length)) continue;
    out.push(id);
  }
  return out;
}
