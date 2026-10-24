// THE WEAPON'S PHYSICAL FORM (his ask, 2026-10-24: "we want to give it a physical form — we are still missing the physical form of that
// weapon"): one drawing, from the component's LOOK (traits.js lookOf) — seen from above, the barrels forward (+x), the body round the
// origin, radius 1. The same drawing is the card's picture (weaponSvg), the turret on the ship in the designer and the turret in battle
// (drawWeapon, canvas). What it does shows: long barrels reach far, many fire fast, thick ones hit hard; a Disruptor's coils, an
// Ember's vents, a Rail's twin rails, a Cluster's crowded tubes, a Seeker's eye; the trait's colour in the glow. A placeholder
// generator, to be dressed later (his greeble / kitbash idea).
const BODY = '#1a2336', PLATE = '#2a3550', STEEL = '#c9d4e8', DARK = '#0b1120';
const rnd = seed => { let h = 2166136261; for (const ch of String(seed ?? 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } let s = h >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const isWeaponLook = L => !!L && (L.fam === 'beam' || L.fam === 'gun' || L.fam === 'missile');
const KIND_FAM = { weapon_energy: 'beam', weapon_kinetic: 'gun', weapon_missile: 'missile' }, FAM_COL = { beam: '#5fe3d0', gun: '#ffb347', missile: '#ff8a6b' };
// the plain weapon's look (no research behind it)
export const plainLook = kind => KIND_FAM[kind] ? { fam: KIND_FAM[kind], trait: null, col: FAM_COL[KIND_FAM[kind]], len: 1, thick: 1, barrels: KIND_FAM[kind] === 'missile' ? 0 : 1, tubes: 4, seed: 'plain' } : null;
// the drawing as primitives: c circle · r rect · p polygon · e ellipse; f fill, s stroke, w width, a alpha, g glow, d dashed
export function weaponParts(L) {
  const P = [], col = L.col || FAM_COL[L.fam] || '#9eb3d8', R = rnd(L.seed), len = L.len || 1, th = L.thick || 1;
  const c = (cx, cy, r, o = {}) => P.push({ t: 'c', cx, cy, r, ...o }), r = (x, y, w, h, o = {}) => P.push({ t: 'r', x, y, w, h, ...o }), p = (pts, o = {}) => P.push({ t: 'p', pts, ...o }), e = (cx, cy, rx, ry, o = {}) => P.push({ t: 'e', cx, cy, rx, ry, ...o });
  const rivets = (n, rad) => { const a0 = R() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i * 6.283 / n; c(Math.cos(a) * rad, Math.sin(a) * rad, 0.06, { f: STEEL, a: 0.55 }); } };
  if (L.fam === 'beam') {
    const B = 0.3 + 1.5 * len, n = L.barrels || 1, hw = (L.trait === 'long' ? 0.1 : L.trait === 'ember' ? 0.19 : 0.14) * th, ys = n === 2 ? [-0.3, 0.3] : [0];
    c(0, 0, 1, { f: BODY, s: col, w: 0.09 }); c(0, 0, 0.64, { f: PLATE, s: STEEL, w: 0.04, a: 0.9 }); rivets(6, 0.82);
    for (const y of ys) {
      r(0.15, y - hw, B - 0.15, 2 * hw, { f: STEEL, s: DARK, w: 0.04 });
      if (L.trait === 'disruptor') for (let k = 0; k < 3; k++) e(0.55 + k * (B - 0.7) / 3, y, 0.07, 0.3 * th + 0.05, { s: col, w: 0.08, g: 1 });
      if (L.trait === 'ember') for (let k = 0; k < 3; k++) { const x = 0.5 + k * (B - 0.75) / 3; r(x, y - hw - 0.14, 0.08, 0.14, { f: col, a: 0.85 }); r(x, y + hw, 0.08, 0.14, { f: col, a: 0.85 }); }
      if (L.trait === 'ember') p([[B, y - hw], [B + 0.25, y - hw - 0.12], [B + 0.25, y + hw + 0.12], [B, y + hw]], { f: PLATE, s: col, w: 0.05 });
      c(B + (L.trait === 'ember' ? 0.27 : 0.04), y, (L.trait === 'long' ? 0.17 : 0.13) * th + 0.04, { f: col, g: 1 });
    }
    if (L.trait === 'long') r(-0.2, -0.85, 0.5, 0.22, { f: PLATE, s: col, w: 0.04 });   // a sight
  } else if (L.fam === 'gun') {
    const B = 0.3 + 1.5 * len, n = L.barrels || 1;
    r(-0.95, -0.85, 1.75, 1.7, { f: BODY, s: col, w: 0.09, rx: 0.3 }); r(-0.6, -0.55, 1.05, 1.1, { f: PLATE, s: STEEL, w: 0.04, rx: 0.15, a: 0.9 }); rivets(4, 0.95);
    if (L.trait === 'rail') {
      for (const y of [-0.17, 0.17]) r(0.2, y - 0.055, B, 0.11, { f: STEEL, s: DARK, w: 0.03 });
      r(0.25, -0.03, B - 0.1, 0.06, { f: col, a: 0.75, g: 1 });
      for (let k = 0; k < 3; k++) r(0.45 + k * (B - 0.5) / 3, -0.24, 0.07, 0.48, { f: PLATE });
    } else {
      const hw = (n >= 3 ? 0.075 : n === 2 ? 0.1 : 0.16) * th * (L.trait === 'penetrator' ? 1.25 : 1), ys = n >= 3 ? [-0.24, 0, 0.24] : n === 2 ? [-0.2, 0.2] : [0];
      for (const y of ys) { r(0.2, y - hw, B, 2 * hw, { f: STEEL, s: DARK, w: 0.035 }); r(0.2 + B - 0.18, y - hw * 1.5, 0.18, hw * 3, { f: PLATE, s: col, w: 0.04 }); }   // the barrel and its muzzle brake
      if (n >= 3) r(0.2 + B * 0.55, -0.36, 0.1, 0.72, { f: PLATE, s: col, w: 0.04 });   // the clamp of a rotary
      if (L.trait === 'penetrator') { p([[0.2 + B, -hw], [0.2 + B + 0.28, 0], [0.2 + B, hw]], { f: col, g: 1 }); e(0.55, 0, 0.09, hw * 1.9, { s: col, w: 0.06 }); }
    }
  } else if (L.fam === 'missile') {
    const far = L.trait === 'far', X1 = far ? 0.95 + 0.5 * len : 0.95;
    r(-0.95, -0.9, X1 + 0.95, 1.8, { f: BODY, s: col, w: 0.09, rx: 0.2 });
    if (far) for (const s of [-1, 1]) p([[-0.95, s * 0.9], [-1.25, s * 1.15], [-0.55, s * 0.9]], { f: PLATE, s: col, w: 0.04 });   // fins
    const n = L.tubes || 4, cols = n <= 2 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), w = X1 + 0.65, cw = w / cols, rh = 1.5 / rows, tr = Math.min(cw, rh) * 0.36;
    for (let i = 0; i < n; i++) { const cx = -0.75 + cw * ((i % cols) + 0.5), cy = -0.75 + rh * (Math.floor(i / cols) + 0.5); c(cx, cy, tr, { f: DARK, s: col, w: 0.05 }); if (L.trait === 'bunker') c(cx, cy, tr * 0.55, { f: col, a: 0.75 }); }
    if (L.trait === 'seeker') c(X1 + 0.02, 0, 0.26, { f: col, g: 1, s: DARK, w: 0.04 });   // the seeker's eye
  }
  return P;
}
// the dashed ghost of a form not found yet (a project under way): the family's outline and a question mark
function ghostParts(fam) {
  const P = [], d = { s: '#9eb3d8', w: 0.06, d: 1, a: 0.7 };
  if (fam === 'gun') P.push({ t: 'r', x: -0.95, y: -0.85, w: 1.75, h: 1.7, rx: 0.3, ...d }, { t: 'r', x: 0.2, y: -0.12, w: 2.0, h: 0.24, ...d });
  else if (fam === 'missile') P.push({ t: 'r', x: -0.95, y: -0.9, w: 1.9, h: 1.8, rx: 0.2, ...d });
  else P.push({ t: 'c', cx: 0, cy: 0, r: 1, ...d }, { t: 'r', x: 0.15, y: -0.12, w: 2.1, h: 0.24, ...d });
  return P;
}
const VIEW = { x: -1.3, y: -1.3, w: 4.9, h: 2.6 };
const svgOf = (q, uid) => {
  const st = (q.f ? ` fill="${q.f}"` : ' fill="none"') + (q.s ? ` stroke="${q.s}" stroke-width="${q.w || 0.05}"` : '') + (q.a != null ? ` opacity="${q.a}"` : '') + (q.d ? ' stroke-dasharray="0.18 0.12"' : '') + (q.g ? ` filter="url(#gl${uid})"` : '');
  if (q.t === 'c') return `<circle cx="${q.cx.toFixed(3)}" cy="${q.cy.toFixed(3)}" r="${q.r.toFixed(3)}"${st}/>`;
  if (q.t === 'e') return `<ellipse cx="${q.cx.toFixed(3)}" cy="${q.cy.toFixed(3)}" rx="${q.rx.toFixed(3)}" ry="${q.ry.toFixed(3)}"${st}/>`;
  if (q.t === 'r') return `<rect x="${q.x.toFixed(3)}" y="${q.y.toFixed(3)}" width="${Math.max(0.01, q.w).toFixed(3)}" height="${Math.max(0.01, q.h).toFixed(3)}"${q.rx ? ` rx="${q.rx}"` : ''}${st}/>`;
  return `<polygon points="${q.pts.map(([x, y]) => x.toFixed(3) + ',' + y.toFixed(3)).join(' ')}"${st}/>`;
};
let seq = 0;
// the card's picture: the weapon on a dark plate (unknown: the dashed ghost and a ?)
export function weaponSvg(L, { w = 96, h = 51, unknown = false, bg = true, title = '' } = {}) {
  if (!L || !L.fam) return '';
  const id = ++seq, col = L.col || FAM_COL[L.fam] || '#9eb3d8', parts = unknown ? ghostParts(L.fam) : weaponParts(L);
  return `<svg class="wart" width="${w}" height="${h}" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" style="vertical-align:middle">${title ? `<title>${title}</title>` : ''}<defs><filter id="gl${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.06" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="bg${id}" cx="35%" cy="50%" r="70%"><stop offset="0" stop-color="${unknown ? '#9eb3d8' : col}" stop-opacity=".22"/><stop offset="1" stop-color="${unknown ? '#9eb3d8' : col}" stop-opacity="0"/></radialGradient></defs>`
    + (bg ? `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" rx="0.3" fill="#060b16"/><rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" rx="0.3" fill="url(#bg${id})"/>` : '')
    + parts.map(q => svgOf(q, id)).join('') + (unknown ? `<text x="1.15" y="0.42" font-size="1.25" font-weight="800" text-anchor="middle" fill="#ffd26a" font-family="system-ui,sans-serif">?</text>` : '') + '</svg>';
}
// the turret on a canvas: at (x, y), radius r (px), turned to ang; alpha for fading ships
export function drawWeapon(g, L, x, y, r, ang = 0, alpha = 1) {
  if (!L || !L.fam || !(r > 0.5)) return;
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(r, r); g.globalAlpha *= alpha;
  for (const q of weaponParts(L)) {
    const a0 = g.globalAlpha; if (q.a != null) g.globalAlpha = a0 * q.a;
    if (q.g) { g.shadowColor = q.f || q.s || '#fff'; g.shadowBlur = Math.max(2, r * 0.35); } else g.shadowBlur = 0;
    g.beginPath();
    if (q.t === 'c') g.arc(q.cx, q.cy, q.r, 0, 7);
    else if (q.t === 'e') g.ellipse(q.cx, q.cy, q.rx, q.ry, 0, 0, 7);
    else if (q.t === 'r') { if (q.rx && g.roundRect) g.roundRect(q.x, q.y, q.w, q.h, q.rx); else g.rect(q.x, q.y, q.w, q.h); }
    else q.pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py));
    if (q.t === 'p') g.closePath();
    if (q.f) { g.fillStyle = q.f; g.fill(); }
    if (q.s) { g.strokeStyle = q.s; g.lineWidth = q.w || 0.05; g.stroke(); }
    g.globalAlpha = a0;
  }
  g.restore();
}
// where the muzzle is, in r units forward of the centre (for the flash)
export const muzzleOf = L => !L ? 1 : L.fam === 'missile' ? 1 : 0.35 + 1.5 * (L.len || 1);
