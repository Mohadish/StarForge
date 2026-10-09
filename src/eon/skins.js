// SKINS for the battle. A fleet's LOOK — a plating style and a two-colour wash — is drawn at random from the
// fleet's name, so the same fleet wears the same coat in every fight, and the two sides of a fight never share
// a style. Each design is painted ONCE into a sprite (the painter's hull: rings, spine, greebles, the turret
// mounts under the battle's own hard points, engines, wash, lights) and drawn rotated on the field; the turrets
// are the field's, live, on top of the mounts. No DOM.
import { STYLES, loadStyle } from './styles.js';
import { paintHull, recipeFor } from './paint.js';
import { B } from './battle.js';

const STYLE_LIST = Object.values(STYLES).filter(s => s.ribbon);
const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const die = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };

// the look of the fleet with this name: a style, and a wash of two hues a third of the wheel or more apart; `avoid`
// is the other side's look — the same style is skipped so the two fleets read apart
export function lookOf(name, avoid = null) {
  const rng = die(hashOf(String(name)));
  let i = Math.floor(rng() * STYLE_LIST.length);
  if (avoid && STYLE_LIST[i].id === avoid.style.id) i = (i + 1 + Math.floor(rng() * (STYLE_LIST.length - 1))) % STYLE_LIST.length;
  return lookFrom(STYLE_LIST[i].id, rng() * 360, null, rng);
}
// a look CHOSEN rather than drawn: a style and two hues (the second a third of the wheel or more from the first when not given)
export function lookFrom(styleId, hA, hB = null, rng = Math.random) {
  const style = STYLES[styleId] && STYLES[styleId].ribbon ? STYLES[styleId] : STYLE_LIST[0];
  if (hB === null || hB === undefined) hB = (hA + 120 + rng() * 120) % 360;
  return { key: style.id + '|' + Math.round(hA) + '|' + Math.round(hB), style, hueA: hA, hueB: hB, washA: hsl(hA, 62, 66), washB: hsl(hB, 62, 58), lightColor: hsl(hA, 85, 78) };
}
export const styleChoices = () => STYLE_LIST.map(s => ({ id: s.id, name: s.name }));
// a look from two picked colours (hex); the lights take the first colour, brighter
const lighten = (hex, k) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#ffe7b0'; const n = parseInt(m[1], 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
export function lookFromColors(styleId, colA = '#7fb3ff', colB = '#ffb347') {
  const style = STYLES[styleId] && STYLES[styleId].ribbon ? STYLES[styleId] : STYLE_LIST[0];
  return { key: style.id + '|' + colA + '|' + colB, style, washA: colA, washB: colB, lightColor: lighten(colA, 0.45) };
}

const sprites = new Map(), loading = new Map();
// the sprite of this ship in this look: at once when painted before, else null — the sheets load, it is painted, and
// `onReady` is called (draw again). A style whose sheets will not load stays null for good: the plain plate shows.
export function spriteOf(ship, look, onReady) {
  const key = ship.design.id + '|' + look.key, had = sprites.get(key); if (had !== undefined) return had || null;
  if (!loading.has(key)) {
    const st = look.style;
    loading.set(key, Promise.all([loadStyle(st), st.deco ? loadStyle({ sheet: st.deco.sheet }).catch(() => null) : null, st.turrets ? loadStyle({ sheet: st.turrets.sheet }).catch(() => null) : null])
      .then(([img, deco, tur]) => { const sp = paint(ship, look, img, deco, tur); sprites.set(key, sp); loading.delete(key); if (onReady) onReady(sp); })
      .catch(e => { console.warn('skin failed', e); sprites.set(key, false); loading.delete(key); }));
  }
  return null;
}
// a THUMBNAIL of one ship in a look — for a fleet list: the fleet's biggest ship, large. A square canvas `px` wide with
// the painted ship fitted into it, nose to the right. Resolves when the sheets are in; null when the style cannot load.
export function thumbOf(ship, look, px = 160) {
  return new Promise(res => {
    let settled = false; const finish = v => { if (!settled) { settled = true; res(v); } };
    const done = sp => {
      if (!sp) return finish(null);
      const c = document.createElement('canvas'); c.width = px; c.height = px; const g = c.getContext('2d'), S = sp.S, hull = ship.ds.hull;
      const cw = (hull.bw + 1.2) * S, ch = (hull.bh + 1.2) * S, sx = (sp.w - cw) / 2, sy = (sp.h - ch) / 2, k = Math.min(px * 0.95 / cw, px * 0.95 / ch);   // the hull and a little round it, not the whole sprite with its margins
      g.drawImage(sp.cv, sx, sy, cw, ch, (px - cw * k) / 2, (px - ch * k) / 2, cw * k, ch * k); finish(c);
    };
    const sp = spriteOf(ship, look, done); if (sp) done(sp);
    setTimeout(() => finish(null), 12000);
  });
}
function paint(ship, look, img, deco, tur) {
  const hull = ship.ds.hull, b = hull.box, bw = hull.bw, bh = hull.bh, midx = (b.minx + b.maxx) / 2;
  const S = Math.max(20, Math.min(72, 640 / bw)), m = 1.5 + 0.35 * bh;    // px a square; a margin in squares for engine plumes, greebles over the edge and barrels
  const cv = new OffscreenCanvas(Math.ceil((bw + 2 * m) * S), Math.ceil((bh + 2 * m) * S));
  const guns = ship.guns.map(g => ({ kind: g.kind, x: g.mx / B.unit + midx, y: g.my / B.unit, size: g.size || 1 }));          // the battle's own hard points, back in hull squares
  const bays = (ship.ds.mounts || []).filter(mt => mt.kind === 'hangar').map(mt => ({ kind: 'hangar', x: mt.x, y: mt.y, size: mt.size || 1 }));
  const r = paintHull(cv, hull.poly, img, look.style, { ...recipeFor(ship.ds.t.volume), px: S, center: [midx, 0], hardpoints: [...guns, ...bays], wash: 0.6, washA: look.washA, washB: look.washB, lights: 0.5, lightColor: look.lightColor }, deco);
  return { cv, S, w: cv.width, h: cv.height, r: r.hardpoints.map(h => h.r), turrets: tur && look.style.turrets ? { img: tur, cells: look.style.turrets.cells } : null };   // r: the mount radius per gun, in sprite px, in the guns' order
}
