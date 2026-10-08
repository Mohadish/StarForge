// The colony map: a grid of land squares. A building's footprint is its real part layout
// (one design-grid square = one square of land), anchored on the map by an offset (ox, oy):
// map square = part square + (ox, oy). Built structures carry `map: {ox, oy}`; construction
// orders in the build queue carry `ox, oy` directly.
import { occupancy } from './assembly.js';
import { lookupFor } from './blueprint.js';

export const MAP_W = 25, MAP_H = 16, LAND = MAP_W * MAP_H;

export function bbox(parts, look) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of occupancy(parts, look).keys()) {
    const [x, y] = k.split(',').map(Number);
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, w: 0, h: 0 };
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function cellsAt(parts, look, ox, oy) {
  return [...occupancy(parts, look).keys()].map(k => { const [x, y] = k.split(',').map(Number); return [x + ox, y + oy]; });
}

// Who stands where: built structures and placed construction orders.
export function mapOccupancy(S, skipId = null) {
  const L = lookupFor(S), occ = new Map();
  for (const i of S.instances) {
    if (i.kind !== 'structure' || !i.map || i.id === skipId) continue;
    for (const [x, y] of cellsAt(i.parts, L, i.map.ox, i.map.oy)) occ.set(x + ',' + y, i.id);
  }
  for (const q of S.production.queue) {
    if (q.ox === undefined || q.id === skipId) continue;
    for (const [x, y] of cellsAt(q.parts, L, q.ox, q.oy)) occ.set(x + ',' + y, q.id);
  }
  return occ;
}

export function fitsAt(S, parts, ox, oy, skipId = null, occ = mapOccupancy(S, skipId)) {
  const cells = cellsAt(parts, lookupFor(S), ox, oy);
  if (!cells.length) return false;
  for (const [x, y] of cells) if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || occ.has(x + ',' + y)) return false;
  return true;
}

// Offset that puts the building's top-left corner on map square (mx, my).
export function anchorAt(parts, look, mx, my) { const b = bbox(parts, look); return { ox: mx - b.minX, oy: my - b.minY }; }

// First free spot, scanning from the top-left (used when loading old saves).
export function autoPlace(S, parts) {
  const L = lookupFor(S), b = bbox(parts, L), occ = mapOccupancy(S);
  for (let y = 0; y + b.h <= MAP_H; y++) for (let x = 0; x + b.w <= MAP_W; x++) {
    const a = { ox: x - b.minX, oy: y - b.minY };
    if (fitsAt(S, parts, a.ox, a.oy, null, occ)) return a;
  }
  return null;
}
