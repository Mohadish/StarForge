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
export const REFINE = { first: 3.5, decay: 0.85, qMin: 0.5, qMax: 1.6, gunK: 1.5, adaptK: 2, waterK: 2, shipK: 2, btK: 3, xenoK: 3, cheapK: 1, fieldK: 1, flatK: 0.3 };   // flatK: a theory's refinement adds this share of its breakthrough's flat boosts (× how much the refinement gives against the first)
export const CAPS = { cheap: 0.5, water: 0.85 };   // research can make projects at most half as dear
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
  // RESEARCH (his ask, 2026-10-31: "the labs just build on themselves — no tiers, only percentage boosts"; the same ids as the tech web's
  // labs family): the basics refine the labs' output; each breakthrough changes HOW the empire learns — more research, lab ships that learn
  // more where they park, breakthroughs found more often, projects that cost less, stronger research fields, anomalies that teach more
  labs: {
    basic:         { tier: 1, name: 'Laboratories', recipe: { information: 0.5, electrics: 0.3, optics: 0.2 }, step: 'science', dev: 'labs',
      text: 'Benches, instruments and patient people: every lab district studies a little more.' },
    academy:       { tier: 2, from: ['basic'], name: 'Academy Network', recipe: { information: 0.55, life: 0.25, electrics: 0.2 }, jump: { science: 20 }, step: 'science', dev: 'labs',
      text: 'Schools that feed the labs: more and better researchers — every lab district studies far more.' },
    fieldstations: { tier: 2, from: ['basic'], name: 'Field Stations', recipe: { optics: 0.4, information: 0.35, motion: 0.25 }, jump: { shipsci: 0.4 }, step: 'shipsci', dev: 'sensors',
      text: 'Labs that go to what they study: lab ships parked at places learn far more.' },
    archive:       { tier: 2, from: ['basic'], name: 'Specimen Archives', recipe: { life: 0.5, information: 0.35, materials: 0.15 }, jump: { bt: 0.4 }, step: 'bt', dev: 'labs',
      text: 'Everything ever found, kept and catalogued: breakthroughs come more often, in every family.' },
    simulation:    { tier: 3, from: ['academy'], needs: ['computer'], name: 'Simulation Labs', recipe: { information: 0.6, electrics: 0.3, energy: 0.1 }, jump: { cheap: 0.15 }, step: 'cheap', dev: 'computer',
      text: 'Experiments run in the machine first: every research project costs less. (needs a weapons-computer project done)' },
    genelab:       { tier: 3, from: ['archive'], name: 'Gene Sequencing Labs', recipe: { life: 0.55, information: 0.35, electrics: 0.1 }, jump: { fields: { life: 0.15 } }, step: 'fields:life', dev: 'labs',
      text: 'Life read at speed: life & chemistry is stronger for every project.' },
    observatory:   { tier: 4, from: ['fieldstations'], min: 2, name: 'Orbital Observatory', recipe: { optics: 0.55, information: 0.3, motion: 0.15 }, jump: { fields: { optics: 0.15 } }, step: 'fields:optics', dev: 'sensors',
      text: 'Telescopes above every world: optics is stronger for every project.' },
    xenobio:       { tier: 4, from: ['genelab'], name: 'Xenobiology Institute', recipe: { life: 0.45, information: 0.35, optics: 0.2 }, jump: { xeno: 0.5 }, step: 'xeno', dev: 'labs',
      text: 'Studies whatever lives and happens elsewhere: anomalies teach far more to the labs that study them.' },
  },
  // SCIENCE — the hard sciences, physics without the name (his call, 2026-10-31: "gravity shouldn't start as gravity — it should start
  // as the science path, out of energy, fields & motion and materials"): tiers I–II the physics laboratories (the fields stronger for
  // every project), tiers III–IV the THEORIES — a small flat boost to everything (`flat`: channel → %, the whole empire's know-how, as a
  // finished breakthrough), and in the tech web tier V collapses into Graviton Theory (the door to gravitics — not in the game yet)
  science: {
    physlab:     { tier: 1, name: 'Physics Laboratory', recipe: { energy: 0.4, motion: 0.35, materials: 0.25 }, step: 'fields:energy,motion,materials', dev: 'labs',
      text: 'Benches for the hard sciences: every refinement, energy, fields & motion and materials a little stronger for every project.' },
    collider:    { tier: 2, from: ['physlab'], name: 'Particle Collider', recipe: { energy: 0.45, motion: 0.35, electrics: 0.2 }, jump: { fields: { energy: 0.1, motion: 0.1, electrics: 0.1 } }, step: 'fields:energy,motion,electrics', dev: 'reactor',
      text: 'Matter smashed to see inside it: energy, fields & motion and electrics are stronger for every project.' },
    materialslab: { tier: 2, from: ['physlab'], name: 'Materials Science Lab', recipe: { materials: 0.5, thermal: 0.3, fabrication: 0.2 }, jump: { fields: { materials: 0.12, thermal: 0.08 } }, step: 'fields:materials,thermal', dev: 'works',
      text: 'New alloys studied before they are made: materials and thermal are stronger for every project.' },
    fieldlab:    { tier: 2, from: ['physlab'], name: 'Field Dynamics Lab', recipe: { motion: 0.5, energy: 0.3, electrics: 0.2 }, jump: { fields: { motion: 0.15 } }, step: 'fields:motion', dev: 'shield',
      text: 'Fields and forces mapped: fields & motion is stronger for every project — the road to gravity starts here.' },
    thermo:      { tier: 3, from: ['collider', 'materialslab'], name: 'Unified Thermodynamics', recipe: { thermal: 0.4, energy: 0.4, materials: 0.2 }, jump: { flat: { power_efficiency: 4, reactor_output: 3 } }, step: 'flat', dev: 'reactor',
      text: 'Less waste everywhere: everything aboard draws a little less power, every reactor gives a little more.' },
    mechanics:   { tier: 3, from: ['materialslab'], name: 'Continuum Mechanics', recipe: { materials: 0.5, motion: 0.3, fabrication: 0.2 }, jump: { flat: { affordability: 4, hull_integrity: 3 } }, step: 'flat', dev: 'works',
      text: 'How things bend and break: everything built a little cheaper and a little tougher.' },
    electro:     { tier: 3, from: ['fieldlab', 'collider'], name: 'Advanced Electrodynamics', recipe: { electrics: 0.45, energy: 0.35, motion: 0.2 }, jump: { flat: { thrust: 4, shield_capacity: 3, computing: 3 } }, step: 'flat', dev: 'shield',
      text: 'Currents and fields mastered: engines, shields and computers all a little better.' },
    relativity:  { tier: 4, from: ['electro', 'fieldlab'], name: 'Relativistic Physics', recipe: { motion: 0.5, energy: 0.35, information: 0.15 }, jump: { flat: { drive_efficiency: 5, weapon_range: 3, sensor_range: 3 } }, step: 'flat', dev: 'drive',
      text: 'Space and time understood: further between the stars, further on the field of battle.' },
    quantum:     { tier: 4, from: ['thermo', 'mechanics'], name: 'Quantum Mechanics', recipe: { energy: 0.4, information: 0.35, materials: 0.25 }, jump: { flat: { miniaturization: 4, research_ease: 4, weapon_efficiency: 3 } }, step: 'flat', dev: 'computer',
      text: 'The small made plain: everything a little smaller, research a little easier, weapons a little more efficient.' },
    fusiontest:  { tier: 4, from: ['collider'], needs: ['reactor'], name: 'Fusion Test Facility', recipe: { energy: 0.5, thermal: 0.35, materials: 0.15 }, jump: { fields: { energy: 0.12, thermal: 0.12 } }, step: 'fields:energy,thermal', dev: 'reactor',
      text: 'A star in a cage to study: energy and thermal are stronger for every project. (needs a reactor project done)' },
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
