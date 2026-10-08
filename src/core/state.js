// The whole game lives in one plain object `S`. Anything that changes it calls commit(),
// which saves and tells the open screen to redraw.
import { newGameState } from '../data/start.js';
import { evalBlueprint } from './blueprint.js';
import { autoPlace } from './colonymap.js';

export const SAVE_KEY = 'forge4x.save';
export const SAVE_VERSION = 2;
export let S = null;

const listeners = new Set();
export const onChange = f => listeners.add(f);

export const bp = id => S.blueprints.find(b => b.id === id);
export const design = id => S.designs.find(d => d.id === id);

// Evaluated stats (`b.s`) are never saved — they are recomputed from the wants on load.
function hydrate(s) { for (const b of s.blueprints || []) b.s = evalBlueprint(b.cat, b.v, b.w); return s; }

// Old saves are upgraded here one version at a time, so they always keep loading.
// Runs after hydrate (footprints need the blueprints' mass).
function migrate(s) {
  if (!s || typeof s.version !== 'number') return null;
  if (s.version === 1) {
    // v2: buildings stand on the colony map; factories no longer build ships (they will need a shipyard).
    const old = s.production?.queue || [];
    s.production = { queue: [] };
    for (const i of s.instances) if (i.kind === 'structure' && !i.map) i.map = autoPlace(s, i.parts) || undefined;
    for (const it of old) {
      const d = s.designs.find(x => x.id === it.designId);
      const parts = d && d.kind === 'structure' ? d.parts.map(p => ({ ...p })) : null;
      const spot = parts && autoPlace(s, parts);
      if (!spot) { s.credits += it.progress || 0; continue; }   // refund what was spent
      s.production.queue.push({ id: it.id, designId: d.id, name: d.name, parts, armor: d.armor, ox: spot.ox, oy: spot.oy, progress: it.progress || 0, started: true });
    }
    s.version = 2;
  }
  return s.version === SAVE_VERSION ? s : null;
}

export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S, function (k, v) { return k === 's' && this && this.cat ? undefined : v; }));
  } catch (e) { console.warn('save failed', e); }
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  if (raw) {
    try { const s = migrate(hydrate(JSON.parse(raw))); if (s) { S = s; return; } }
    catch (e) { console.warn('save unreadable — starting a new game', e); }
  }
  S = hydrate(newGameState());
  save();
}

export function newGame() { S = hydrate(newGameState()); commit(); }
export function commit() { save(); for (const f of listeners) f(); }
export function log(text, action = null) {
  S.log.push({ turn: S.turn, text, action });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
}
