// THE PLANET AS A GLOBE (his ask, 2026-10-23: "once we are in the star system, the terrain rendered on the planet — a texture wrapped
// round the sphere; rotate it; see the colony itself"): the world's own surface (terrain.js, drawn small) — and, a colony's, with what
// stands on it (surface.js renderColony) — wrapped round a sphere that turns slowly, lit from one side, a thin air glow on a world with
// air. The texture is made once per world (a colony's again only when it has grown a good deal — his call: no need to follow every
// building), the sphere's mapping once per radius; a frame only shifts the longitude. Shared by the star system map and the colony list.
import { terrain, paint } from './terrain.js';
import { renderColony, stateFromSurface } from './surface.js';
import { bOf, terrainKind } from './colony.js';

const CELL = { w: 48, h: 24 };                         // the globe's own small planet (the shapes follow the colony map's closely)
const TEX = new Map(), MAPS = new Map();
// the world's texture: { data, W, H } (RGBA) — pl: the place, kind: its world kind (model.js worldOf), grid: { w, h }, G: its colony's surface or null
export function globeTexture(pl, kind, grid, G = null) {
  const units = G ? Object.keys(G.units || {}).length : 0, key = `${pl.id}|${kind}|${grid.w}x${grid.h}`, have = TEX.get(key);
  if (have && (!G || Math.abs(have.units - units) < Math.max(3, have.units * 0.15))) return have;
  const T = terrain(pl.id + '|ground', grid.w, grid.h, terrainKind(kind), { cellW: CELL.w, cellH: CELL.h });
  let cv;
  if (G) cv = renderColony(T, stateFromSurface(G, T, bOf), 1);
  else { cv = document.createElement('canvas'); cv.width = T.W; cv.height = T.H; const g = cv.getContext('2d'), img = g.createImageData(T.W, T.H); paint(T, img.data, { frames: false, slots: false }); g.putImageData(img, 0, 0); }
  const tex = { data: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, W: cv.width, H: cv.height, units };
  if (TEX.size > 80) TEX.delete(TEX.keys().next().value); TEX.set(key, tex); return tex;
}
// the sphere at radius r: for every pixel of the disc its texture row, its base longitude (0..1) and its light
function sphereMap(r) {
  let m = MAPS.get(r); if (m) return m;
  const D = 2 * r + 2, px = [], v = [], u = [], lit = [], L = [-0.55, -0.45, 0.7], LN = Math.hypot(...L);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = (x + 0.5 - r - 1) / r, dy = (y + 0.5 - r - 1) / r, q = dx * dx + dy * dy; if (q > 1) continue;
    const dz = Math.sqrt(1 - q), lat = Math.asin(-dy), lon = Math.atan2(dx, dz);
    px.push(y * D + x); v.push(0.5 - lat / Math.PI); u.push(lon / (2 * Math.PI) + 0.5);
    const d = (dx * L[0] + dy * L[1] + dz * L[2]) / LN; lit.push(Math.max(0.12, Math.min(1.08, 0.18 + 0.95 * Math.max(0, d))) * (0.82 + 0.18 * dz));   // lit side, a dark limb
  }
  m = { D, px: Int32Array.from(px), v: Float32Array.from(v), u: Float32Array.from(u), lit: Float32Array.from(lit) }; MAPS.set(r, m); return m;
}
const BUF = new Map();
// draw the globe of texture `tex` at (x, y), radius r, turned by `turn` (0..1 of a revolution); air: the colour of a thin glow, or null
export function drawGlobe(g, tex, x, y, r, turn = 0, air = null) {
  r = Math.max(4, Math.round(r)); const m = sphereMap(r); let b = BUF.get(r);
  if (!b) { const c = document.createElement('canvas'); c.width = c.height = m.D; b = { c, g: c.getContext('2d'), img: null }; b.img = b.g.createImageData(m.D, m.D); BUF.set(r, b); }
  const out = b.img.data; out.fill(0); const { data, W, H } = tex;
  for (let i = 0; i < m.px.length; i++) {
    let uu = m.u[i] + turn; uu -= Math.floor(uu); const tx = Math.min(W - 1, (uu * W) | 0), ty = Math.min(H - 1, (m.v[i] * H) | 0), s = (ty * W + tx) * 4, o = m.px[i] * 4, l = m.lit[i];
    out[o] = data[s] * l; out[o + 1] = data[s + 1] * l; out[o + 2] = data[s + 2] * l; out[o + 3] = 255;
  }
  b.g.putImageData(b.img, 0, 0); g.drawImage(b.c, x - r - 1, y - r - 1);
  if (air) { const gr = g.createRadialGradient(x, y, r * 0.9, x, y, r * 1.22); gr.addColorStop(0, air + '00'); gr.addColorStop(0.35, air + '66'); gr.addColorStop(1, air + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.22, 0, 7); g.fill(); }
}
// a still globe as an image (the colony list's icon)
const ICONS = new Map();
export function globeIcon(pl, kind, grid, G, r = 13, air = null) {
  const tex = globeTexture(pl, kind, grid, G), key = `${pl.id}|${r}|${tex.units}`; let url = ICONS.get(key); if (url) return url;
  const c = document.createElement('canvas'); c.width = c.height = Math.ceil(r * 2.6); drawGlobe(c.getContext('2d'), tex, c.width / 2, c.height / 2, r, (pl.id.length * 0.137) % 1, air);
  url = c.toDataURL(); ICONS.set(key, url); return url;
}
