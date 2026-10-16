// THE HULL — the silhouette of a design. No DOM here.
//
// A design picks a silhouette and the silhouette simply GROWS with everything put inside: its
// area in squares is the design's volume. Shape is looks, not performance: the space dock counts
// the squares, not the box. Ships, platforms and docks are seen from above (nose to +x, spine on
// y = 0); structures are seen from the side, standing on the ground (down is +y).
// Silhouettes are built in (below) or drawn by the player in the editor and kept in a library.
import { PACK } from './hullpack.js';
export const HULL_VOLUME = 32;                 // volume per square of silhouette
export const HULL_CLASSES = { starship: 'Starship', platform: 'Platform', structure: 'Structure', dock: 'Space dock' };

// symmetric shapes: give one half, get the whole
const mirrorY = top => [...top, ...top.slice(1, -1).reverse().map(([x, y]) => [x, -y])];        // across the spine
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
export const TEMPLATES = {
  // ships, from above
  dart:   { klass: 'starship', name: 'Dart',       poly: mirrorY([[1, 0], [0.55, 0.14], [0.1, 0.22], [-0.3, 0.3], [-0.5, 0.26], [-0.56, 0.12], [-0.56, 0]]) },
  wedge:  { klass: 'starship', name: 'Wedge',      poly: mirrorY([[0.9, 0], [0.3, 0.26], [-0.35, 0.42], [-0.55, 0.38], [-0.6, 0.2], [-0.6, 0]]) },
  hammer: { klass: 'starship', name: 'Hammerhead', poly: mirrorY([[0.75, 0], [0.85, 0.16], [0.9, 0.42], [0.72, 0.5], [0.5, 0.42], [0.42, 0.16], [-0.3, 0.14], [-0.5, 0.24], [-0.6, 0.18], [-0.6, 0]]) },
  needle: { klass: 'starship', name: 'Needle',     poly: mirrorY([[0.9, 0], [0.45, 0.12], [-0.3, 0.17], [-0.6, 0.15], [-0.7, 0.08], [-0.7, 0]]) },
  // platforms, from above
  saucer: { klass: 'platform', name: 'Saucer', poly: mirrorY(arc(0, 0, 0.55, 0, Math.PI, 10).map(([x, y]) => [x + 0.06 * (1 - Math.abs(x) / 0.55), y * 0.9])) },
  hex:    { klass: 'platform', name: 'Hex',    poly: mirrorY([[0.7, 0], [0.35, 0.6], [-0.35, 0.6], [-0.7, 0]]) },
  cross:  { klass: 'platform', name: 'Cross',  poly: mirrorY([[0.7, 0], [0.7, 0.2], [0.2, 0.2], [0.2, 0.7], [-0.2, 0.7], [-0.2, 0.2], [-0.7, 0.2], [-0.7, 0]]) },
  // structures, from the side, standing on the ground
  hall:   { klass: 'structure', name: 'Hall',  poly: [[-0.7, 0.3], [-0.7, 0], [-0.5, -0.2], [0.5, -0.2], [0.7, 0], [0.7, 0.3]] },
  tower:  { klass: 'structure', name: 'Tower', poly: [[-0.6, 0.3], [-0.6, 0.05], [-0.2, 0.05], [-0.2, -0.6], [-0.1, -0.7], [0.1, -0.7], [0.2, -0.6], [0.2, 0.05], [0.6, 0.05], [0.6, 0.3]] },
  dome:   { klass: 'structure', name: 'Dome',  poly: [[-0.7, 0.25], [-0.7, 0.05], ...arc(0, 0.05, 0.5, Math.PI, 0, 10), [0.7, 0.05], [0.7, 0.25]] },
  block:  { klass: 'structure', name: 'Block', poly: [[-0.6, 0.3], [-0.6, -0.5], [-0.4, -0.6], [0.4, -0.6], [0.6, -0.5], [0.6, 0.3]] },
  // docks, from above: arms around the gantry, open to the front
  cradle: { klass: 'dock', name: 'Cradle', poly: [[0.7, -0.5], [-0.7, -0.5], [-0.7, 0.5], [0.7, 0.5], [0.7, 0.28], [-0.45, 0.28], [-0.45, -0.28], [0.7, -0.28]] },
  fork:   { klass: 'dock', name: 'Fork',   poly: [[0.7, -0.5], [-0.3, -0.5], [-0.5, -0.35], [-0.7, -0.35], [-0.7, 0.35], [-0.5, 0.35], [-0.3, 0.5], [0.7, 0.5], [0.7, 0.26], [-0.35, 0.26], [-0.35, -0.26], [0.7, -0.26]] },
};
for (const [id, t] of Object.entries(TEMPLATES)) t.id = id;
// his own silhouettes, shipped as built-ins (hullpack.js) — every copy of the game has them
for (const h of PACK) if (h && h.poly?.length >= 3 && !TEMPLATES[h.id]) TEMPLATES[h.id] = { ...h, klass: h.klass || 'starship', pack: true };

// silhouettes the player drew ({ id, name, klass, poly, … }) — the app loads and saves them. One of his with the same
// id as a pack shape is that shape, edited: it takes the pack copy's place everywhere.
const USER = new Map();
export function setUserHulls(list) { USER.clear(); for (const h of list || []) if (h && h.poly?.length >= 3) USER.set(h.id, { ...h, user: true }); }
export const hullDef = id => USER.get(id) || TEMPLATES[id] || null;
export const hullsFor = klass => [...Object.values(TEMPLATES).filter(t => !USER.has(t.id)), ...USER.values()].filter(h => h.klass === klass);

export const areaOf = poly => Math.abs(poly.reduce((a, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
export const bboxOf = poly => ({ minx: Math.min(...poly.map(p => p[0])), maxx: Math.max(...poly.map(p => p[0])), miny: Math.min(...poly.map(p => p[1])), maxy: Math.max(...poly.map(p => p[1])) });
export function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// where the outline crosses the vertical line at x: the topmost and bottommost y
export function edgeAt(poly, x) {
  let min = Infinity, max = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((xi <= x && x < xj) || (xj <= x && x < xi)) { const y = yi + (yj - yi) * (x - xi) / (xj - xi); min = Math.min(min, y); max = Math.max(max, y); }
  }
  return min <= max ? { min, max } : null;
}

// the silhouette of a design, scaled to its volume; `minArea` lets a dock be at least a frame
// around its gantry; a hull of the wrong class (or a deleted one) falls back to the class's first
export function hullOf(id, volume, minArea = 0, klass = null) {
  let T = hullDef(id);
  if (!T || (klass && T.klass !== klass)) T = hullsFor(klass)[0] || TEMPLATES.dart;
  const a0 = areaOf(T.poly) || 1, area = Math.max(volume / HULL_VOLUME, minArea, 0.5), s = Math.sqrt(area / a0);
  const b0 = bboxOf(T.poly), cx = (b0.minx + b0.maxx) / 2, cy = (b0.miny + b0.maxy) / 2;
  const poly = T.poly.map(([x, y]) => [(x - cx) * s, (y - cy) * s]), b = bboxOf(poly);
  return { id: T.id, klass: T.klass, poly, s, area, box: b, bw: b.maxx - b.minx, bh: b.maxy - b.miny, w: Math.ceil(b.maxx - b.minx - 0.02), h: Math.ceil(b.maxy - b.miny - 0.02) };
}

// shields sit along the length, evenly spaced; on a structure they sit over it
export const shieldSpots = (hull, radii) => radii.map((r, i) => ({ x: hull.box.minx + hull.bw * (i + 1) / (radii.length + 1), y: hull.klass === 'structure' ? (hull.box.miny + hull.box.maxy) / 2 : 0, r }));

// SHIELD COVER (his call, 2026-10-13: "the graphics is just cosmetics … I want to be able to change the shape of the ship and it
// shouldn't affect anything"): the cover is the fields' total reach against the hull's size in squares — which comes from the
// volume alone — never where the fields sit on the outline. More shields never cover less, and enough always cover it all.
// Each field lays FIELD_SHARE of its disc on the hull (0.7: what the fields really covered on big hulls under the old rule, which
// counted the outline under circles strung along the spine — a round ship got 99 % with seven and lost cover past fifteen).
export const FIELD_SHARE = 0.7;
export const fieldCover = (area, radii) => !radii.length ? 0 : Math.min(1, radii.reduce((a, r) => a + FIELD_SHARE * Math.PI * r * r, 0) / Math.max(area, 0.01));
// the BUBBLE that shows the cover (for drawing only): an ellipse round the hull's middle, grown until it holds `cover` of the
// hull's area — at full cover it wraps the whole ship (the smallest ellipse of the hull's proportions round its box, a little out)
export function fieldBubble(hull, cover) {
  const box = hull.box || bboxOf(hull.poly), bw = box.maxx - box.minx, bh = box.maxy - box.miny, cx = (box.minx + box.maxx) / 2, cy = (box.miny + box.maxy) / 2;
  const RX = bw / 2 * Math.SQRT2 + 0.25, RY = bh / 2 * Math.SQRT2 + 0.25;
  if (cover >= 0.999) return { cx, cy, rx: RX, ry: RY, cover: 1 };
  const step = Math.max(0.04, Math.min(bw, bh) / 30), pts = [];
  for (let x = box.minx + step / 2; x < box.maxx; x += step) for (let y = box.miny + step / 2; y < box.maxy; y += step) if (inside(hull.poly, x, y)) pts.push([x - cx, y - cy]);
  if (!pts.length || cover <= 0) return { cx, cy, rx: 0, ry: 0, cover: 0 };
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) { const s = (lo + hi) / 2, rx = RX * s, ry = RY * s; let n = 0; for (const [x, y] of pts) if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) n++; if (n / pts.length < cover) lo = s; else hi = s; }
  const s = (lo + hi) / 2; return { cx, cy, rx: RX * s, ry: RY * s, cover };
}
// how much of the hull lies under at least one field — the OLD rule, by position on the outline (no longer used for the cover)
export function coverage(hull, shields) {
  if (!shields.length) return 0;
  const step = Math.max(0.08, Math.min(hull.bw, hull.bh) / 28);
  let all = 0, under = 0;
  for (let x = hull.box.minx + step / 2; x < hull.box.maxx; x += step) for (let y = hull.box.miny + step / 2; y < hull.box.maxy; y += step) {
    if (!inside(hull.poly, x, y)) continue;
    all++; if (shields.some(s => Math.hypot(x - s.x, y - s.y) <= s.r)) under++;
  }
  return all ? under / all : 0;
}

// Where the guns sit. Every weapon module is one GROUP with its own stretch of the hull, laid out
// symmetrically: pairs mirrored across the spine, column after column from the front, and an odd
// gun alone on the spine behind them (3 = two forward, one in the middle; 4 = two and two; 5 = two,
// two, one…). Groups never share a spot: missile launchers forward, then kinetics, then beams;
// orbital weapons in a row along the belly; on a structure every group is a row on the roof.
// A group the player has dragged keeps its own place along the hull (`pos`, 0 = tail, 1 = nose).
// guns: [{ modId, kind, n, pos?, size? }] → [{ modId, kind, x, y, size }]
// `room` scales the spacing between guns (1 = the game's own; the painter's turret mounts are big and ask for more)
const ORDER = { weapon_missile: 0, weapon_kinetic: 1, weapon_energy: 2 };
export function hardPoints(hull, guns, room = 1) {
  const out = [], roomFor = g => (0.55 + 0.35 * Math.sqrt(g.size || 1)) * room;   // a bigger gun needs more room
  const at = (g, x, y) => out.push({ modId: g.modId, kind: g.kind, x, y, size: g.size || 1 });
  const groupX = (g, fallback) => g.pos != null ? hull.box.minx + hull.bw * g.pos : fallback;
  if (hull.klass === 'structure') {                                               // rows on the roof, side by side, centred
    const widths = guns.map(g => g.n * roomFor(g)), total = widths.reduce((a, w) => a + w + 0.3, -0.3), squeeze = Math.min(1, hull.bw * 0.9 / Math.max(total, 0.1));
    let left = (hull.box.minx + hull.box.maxx) / 2 - total * squeeze / 2;
    guns.forEach((g, i) => {
      const step = roomFor(g) * squeeze, cx = groupX(g, left + widths[i] * squeeze / 2);
      for (let k = 0; k < g.n; k++) { const x = cx + (k - (g.n - 1) / 2) * step, e = edgeAt(hull.poly, x); at(g, x, (e ? e.min : hull.box.miny) - 0.1 * Math.sqrt(g.size || 1)); }
      left += (widths[i] + 0.3) * squeeze;
    });
    return out;
  }
  const onBelly = g => g.kind === 'weapon_orbital' || g.kind === 'hangar';          // bays sit along the belly
  const flank = guns.filter(g => !onBelly(g)).sort((a, b) => (ORDER[a.kind] ?? 3) - (ORDER[b.kind] ?? 3)), belly = guns.filter(onBelly);
  // flank groups from the front backwards. ROWS (his ask, 2026-10-16): when one line along each flank cannot hold them, the guns
  // take more lines inward — like the plating's rings — as many as the hull's height affords amidships; only then does the line
  // squeeze, and never past a readable gap
  const half = (() => { const e = edgeAt(hull.poly, (hull.box.minx + hull.box.maxx) / 2); return e ? (e.max - e.min) / 2 : hull.bh / 2; })();
  const rowGap = Math.max(0.6, ...flank.map(roomFor)), rowsMax = Math.max(1, Math.floor((half * 0.75 - 0.45) / rowGap) + 1);   // a row needs a gun's room; the innermost keeps off the spine and its mirror
  const colsOf = (g, R) => Math.ceil(g.n / (2 * R)), widthOf = (g, R) => colsOf(g, R) * roomFor(g), totalOf = R => flank.reduce((a, g) => a + widthOf(g, R) + 0.25, 0);
  let R = 1; while (R < rowsMax && totalOf(R) > hull.bw * 0.8) R++;
  const widths = flank.map(g => widthOf(g, R)), total = totalOf(R), squeeze = Math.max(0.6, Math.min(1, hull.bw * 0.8 / Math.max(total, 0.1)));
  let front = hull.box.maxx - hull.bw * 0.1;
  flank.forEach((g, i) => {
    const step = roomFor(g) * squeeze, w = widths[i] * squeeze, cx = groupX(g, front - w / 2); let left = g.n, c = 0;
    for (; left > 0 && c < 400; c++) {                                             // columns run on past the planned width where the hull was too thin for its inner rows
      const x = cx + w / 2 - (c + 0.5) * step, e = edgeAt(hull.poly, x), yOut = Math.max(0.15, (e ? e.max : hull.bh / 2) * 0.75);
      for (let r = 0; r < R && left > 0; r++) {
        const y = yOut - r * rowGap; if (r > 0 && y < 0.45) break;                 // no room for an inner row here (the nose): the rest go on in the next column
        if (left >= 2) { at(g, x, y); at(g, x, -y); left -= 2; } else { at(g, x, 0); left--; }   // the odd one rides the spine
      }
    }
    front -= Math.max(w, c * step) + 0.25 * squeeze;
  });
  // belly groups: a row each along the spine, side by side, behind the flank groups so that an odd
  // flank gun riding the spine never lands on them
  const bw = belly.map(g => g.n * roomFor(g)), btotal = bw.reduce((a, w) => a + w + 0.3, -0.3);
  const tail = hull.box.minx + hull.bw * 0.08, end = flank.length ? front - 0.3 : (hull.box.minx + hull.box.maxx) / 2 + btotal / 2;
  const crowded = end - btotal < tail, by = crowded ? 0.45 : 0;                  // no room behind the flank groups: the row drops just below the spine
  let bleft = Math.max(tail, end - btotal);
  belly.forEach((g, i) => {
    const step = roomFor(g), cx = groupX(g, bleft + bw[i] / 2);
    for (let k = 0; k < g.n; k++) at(g, cx + (k - (g.n - 1) / 2) * step, by);
    bleft += bw[i] + 0.3;
  });
  return out;
}
