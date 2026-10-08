// THE OUTLINE EDITOR THAT LIVES ON THE PAINTER'S CANVAS (his ask: no separate editor — double-tap the
// painted ship and its outline appears over it; drag the points; double-tap to add one — on the line:
// there; elsewhere: at the end — or to remove one; right-click removes; a point may cross the spine to
// cut a hole). One half is drawn with symmetry on, the other mirrored. Points live on the game's
// 28 × 16 grid in half squares, exactly like the game's own editor, so a shape saved here is a shape the
// game reads. The host maps grid ↔ canvas pixels (it knows how the ship is scaled and placed).
import { areaOf, bboxOf } from './hull.js';

export const GW = 28, GH = 16;
const snap = v => Math.round(v * 2) / 2;

export function createShapeEditor(cv, host) {
  // host: { frame(): { toPx([gx, gy]) → [px, py], fromPx([px, py]) → [gx, gy] }, changed(what): repaint ('start' | 'edit' | 'drag' | 'end') }
  const st = { id: null, name: '', klass: 'starship', sym: 'y', pts: [] };
  const axisY = GH / 2, axisX = GW / 2;
  let editing = false, drag = -1, hover = -1, downAt = null, moved = false, lastTap = null;
  const fullPts = () => {
    const p = st.pts;
    if (st.sym === 'y') return [...p, ...p.slice(1, -1).reverse().map(([x, y]) => [x, 2 * axisY - y])];
    if (st.sym === 'x') return [...p, ...p.slice(1, -1).reverse().map(([x, y]) => [2 * axisX - x, y])];
    return p;
  };
  const toHull = pts => pts.map(([x, y]) => [x - GW / 2, y - GH / 2]);
  const fullPoly = () => toHull(fullPts());
  const valid = () => { const f = fullPts(); return f.length >= 3 && areaOf(f) > 0.5; };
  const clampPt = ([x, y]) => {
    x = Math.max(0, Math.min(GW, snap(x))); y = Math.max(0, Math.min(GH, snap(y)));
    if (st.sym === 'y' && Math.abs(y - axisY) < 0.3) y = axisY;                   // near the spine snaps onto it; past it is allowed
    if (st.sym === 'x' && Math.abs(x - axisX) < 0.3) x = axisX;
    return [x, y];
  };
  const mirrorPt = ([x, y]) => st.sym === 'y' ? [x, 2 * axisY - y] : st.sym === 'x' ? [2 * axisX - x, y] : [x, y];
  const pxOf = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const handleAt = px => { const F = host.frame(); return st.pts.findIndex(p => { const q = F.toPx(p); return Math.hypot(q[0] - px[0], q[1] - px[1]) < 11; }); };
  const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
  // the drawn line nearest a spot on the canvas (or its mirror image): which leg, and whether it was the ghost
  const segmentAt = px => {
    const F = host.frame(), P = st.pts.map(p => F.toPx(p)), M = st.sym ? st.pts.map(p => F.toPx(mirrorPt(p))) : null;
    let best = { i: -1, d: 10, ghost: false };
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const d = segDist(px, P[i], P[i + 1]); if (d < best.d) best = { i, d, ghost: false };
      if (M) { const dg = segDist(px, M[i], M[i + 1]); if (dg < best.d) best = { i, d: dg, ghost: true }; }
    }
    return best.i >= 0 ? best : null;
  };
  // a built-in or saved outline: a saved one keeps its half and symmetry; a built-in polygon that mirrors across the
  // spine (or the axis) is loaded as its one half with symmetry on, so it stays easy to reshape
  function load(h) {
    if (h.pts) { Object.assign(st, { id: h.id, name: h.name, klass: h.klass || 'starship', sym: h.sym || '', pts: h.pts.map(p => [...p]) }); return; }
    const poly = h.poly, eps = 1e-6, has = (x, y) => poly.some(([px, py]) => Math.abs(px - x) < eps && Math.abs(py - y) < eps);
    const symY = poly.every(([x, y]) => has(x, -y)), symX = !symY && poly.every(([x, y]) => has(-x, y));
    let pts = poly, sym = '';
    if (symY || symX) {
      const upper = symY ? ([, y]) => y <= eps : ([x]) => x >= -eps, n = poly.length;
      const start = poly.findIndex((p, i) => upper(p) && !upper(poly[(i + n - 1) % n]));
      if (start >= 0) { pts = []; for (let i = 0; i < n && upper(poly[(start + i) % n]); i++) pts.push(poly[(start + i) % n]); sym = symY ? 'y' : 'x'; }
    }
    const b = bboxOf(poly), s = Math.min((GW - 4) / (b.maxx - b.minx), (GH - 4) / (b.maxy - b.miny)) * 0.8, cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
    Object.assign(st, { id: null, name: (h.name || 'Shape') + ' II', klass: h.klass || 'starship', sym, pts: pts.map(([x, y]) => [snap(GW / 2 + (x - cx) * s), snap(GH / 2 + (y - cy) * s)]) });
  }
  const build = name => ({ id: st.id || 'u' + Math.random().toString(36).slice(2, 9), name: (name || st.name || 'My silhouette').trim(), klass: st.klass, sym: st.sym, pts: st.pts.map(p => [...p]), poly: fullPoly() });
  // the overlay: the outline over the painted ship, the axis, the drawn half's points, the mirrored half as a ghost
  function draw(g) {
    if (!editing) return;
    const F = host.frame(), f = fullPts(), ok = valid();
    g.save();
    if (f.length >= 2) {
      g.beginPath(); f.forEach((p, i) => { const q = F.toPx(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); if (f.length >= 3) g.closePath();
      if (ok) { g.fillStyle = 'rgba(95,227,208,.16)'; g.fill('evenodd'); }
      g.strokeStyle = ok ? 'rgba(95,227,208,.9)' : 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.stroke();
    }
    if (st.sym) { const a = st.sym === 'y' ? [F.toPx([0, axisY]), F.toPx([GW, axisY])] : [F.toPx([axisX, 0]), F.toPx([axisX, GH])]; g.setLineDash([6, 6]); g.strokeStyle = 'rgba(126,243,176,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0][0], a[0][1]); g.lineTo(a[1][0], a[1][1]); g.stroke(); g.setLineDash([]); }
    if (st.sym && f.length > st.pts.length) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(126,243,176,.5)'; g.beginPath(); f.slice(st.pts.length - 1).forEach((p, i) => { const q = F.toPx(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]); }
    st.pts.forEach((p, i) => { const q = F.toPx(p); g.beginPath(); g.arc(q[0], q[1], i === hover || i === drag ? 8 : 6, 0, 7); g.fillStyle = i === 0 ? '#ffd26a' : '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); });
    g.restore();
  }
  // a double TAP — mouse or finger, two quick touches in one place: outside edit mode it opens the outline;
  // inside: on a point removes it, on the line (or its mirror image) adds a point there, elsewhere adds one at the end
  const doubleTap = px => {
    if (!editing) { editing = true; host.changed('start'); return; }
    const i = handleAt(px);
    if (i >= 0) { st.pts.splice(i, 1); host.changed('edit'); return; }
    const seg = segmentAt(px), gp = host.frame().fromPx(px), p = clampPt(seg && seg.ghost ? mirrorPt(gp) : gp);
    if (seg) st.pts.splice(seg.i + 1, 0, p); else st.pts.push(p);
    host.changed('edit');
  };
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    downAt = [e.clientX, e.clientY]; moved = false;
    if (!editing) return;
    const i = handleAt(pxOf(e)); if (i >= 0) { drag = i; cv.setPointerCapture(e.pointerId); host.changed('dragstart'); }
  });
  cv.addEventListener('pointermove', e => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) moved = true;
    if (!editing) return;
    const px = pxOf(e);
    if (drag >= 0) { if (moved) { st.pts[drag] = clampPt(host.frame().fromPx(px)); host.changed('drag'); } return; }
    const i = handleAt(px); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'grab' : 'crosshair'; host.changed('hover'); }
  });
  const up = e => {
    if (downAt && !moved && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14) { lastTap = null; doubleTap(pxOf(e)); }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    downAt = null;
    if (drag >= 0) { drag = -1; host.changed('dragend'); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', e => e.preventDefault());
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (!editing) return; const i = handleAt(pxOf(e)); if (i >= 0) { st.pts.splice(i, 1); host.changed('edit'); } });
  return {
    get editing() { return editing; }, set editing(v) { editing = !!v; drag = -1; hover = -1; cv.style.cursor = editing ? 'crosshair' : ''; host.changed(editing ? 'start' : 'end'); },
    get dragging() { return drag >= 0; },
    state: () => st, load, fullPoly, valid, build, draw,
    undo() { st.pts.pop(); host.changed('edit'); }, clear() { st.pts = []; host.changed('edit'); },
    setSym(s) { st.sym = s; st.pts = st.pts.map(clampPt); host.changed('edit'); },
    setName(n) { st.name = n; },
  };
}
