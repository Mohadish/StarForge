// A SHIP AS A CODE (his ask, 2026-10-12: "a code just like the one you have for the fleet, but specifically for the ship …
// then you can lock in ships that you like"). One ship's exact design — every module with every dial, its silhouette (a
// hand-drawn one travels inside the code), its name, and the coat it was painted in — as one line. Paste it into a ship
// of a fleet (the Fleet Generator's ship editor) or into the Painter, and it is that ship, exactly, at its own price.
// The same record is what the SHIP LIBRARY keeps (library.js). No DOM.
import { hullDef } from './hull.js';
import { KINDS } from './modules.js';

export const SHIP_PREFIX = 'SHIP1:';
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/\s+/g, '')))));
const rid = p => p + Math.random().toString(36).slice(2, 9);
// the record of a design: modules as they are (capsules are the empire's, not the ship's: left behind), the silhouette's id,
// and the silhouette itself when it is a hand-drawn one (a built-in is known everywhere)
export function shipRecord(design, { name, style, colA, colB } = {}) {
  const def = hullDef(design.hull), drawn = def && def.user ? (({ user, ...h }) => h)(def) : null;
  return { v: 1, name: name || design.name || 'Ship', hull: design.hull, modules: design.modules.map(m => ({ ...m, caps: [] })), ...(drawn ? { hullDef: drawn } : {}), ...(style ? { style, colA, colB } : {}) };
}
export const shipCode = rec => SHIP_PREFIX + enc(rec);
export const okShip = r => !!(r && Array.isArray(r.modules) && r.modules.length && r.modules.every(m => m && KINDS[m.kind]));
export function shipFromCode(code) {
  try { const m = String(code || '').trim().match(/^SHIP1:(.+)$/s); if (!m) return null; const r = dec(m[1]); return okShip(r) ? r : null; } catch (e) { return null; }
}
// a design to build from a record: fresh module ids where one is missing, the record's own id kept (so its painted
// picture is not repainted on every rebuild)
export const designOf = rec => ({ id: rec.did || rec.id || rid('d'), name: rec.name || 'Ship', hull: rec.hull, modules: rec.modules.map(m => ({ ...m, id: m.id || rid('m'), caps: [] })) });
// a design read back as the chips builder's tray (Fleet Generator): one weapon chip is two guns, a drone chip four drones,
// armour four layers, shields two, fast two thrusters, a fabricator one — so a fixed design can be loosened into chips
export function chipsOfDesign(design, gunsPerChip = 2) {               // gunsPerChip: the game reads a chip as ONE gun (battle.js designFromStacks)
  const out = [], add = (type, kind, h, role = null) => { const x = out.find(c => c.kind === kind && c.role === role); if (x) x.h += h; else out.push({ type, kind, h, role }); };
  for (const m of design.modules) {
    const n = m.n || 1;
    if (m.kind === 'hangar') add('weapon', 'hangar', Math.max(1, Math.round(n * (m.cnt || 1))),m.preset && m.preset !== 'standard' ? m.preset : null);
    else if (KINDS[m.kind]?.mount && !KINDS[m.kind].orbital) add('weapon', m.kind, Math.max(1, Math.round(n / gunsPerChip)), m.preset && m.preset !== 'standard' && m.preset !== 'custom' ? m.preset : null);
    else if (m.kind === 'armor') add('trait', 'armor', Math.max(1, Math.round(n / 4)));
    else if (m.kind === 'shield') add('trait', 'shield', Math.max(1, Math.round(n / 2)));
    else if (m.kind === 'thruster') add('trait', 'fast', Math.max(1, Math.round(n / 2)));
    else if (m.kind === 'works') add('trait', 'fab', n);
    else if (m.kind === 'lab') add('trait', 'lab', n);                            // the game's civil chips
    else if (m.kind === 'habitat') add('trait', 'habitat', n);
    else if (m.kind === 'gantry') add('trait', 'gantry', n);
  }
  return out;
}
