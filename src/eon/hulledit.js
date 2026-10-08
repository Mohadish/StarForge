// The silhouette editor: draw a closed outline on a grid — one half with symmetry on, or the whole
// thing — name it, keep it in the library and put it on a design. Only the shape matters: the game
// scales it to whatever goes inside.
import { TEMPLATES, HULL_CLASSES, areaOf, bboxOf } from './hull.js';

const GW = 28, GH = 16, CS = 24;                 // grid squares and pixels per square
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snap = v => Math.round(v * 2) / 2;

export function createHullEditor(root, api) {
  // api: { save(hull), remove(id), use(id), library: () => user hulls, onClose() }
  let st = null, drag = -1, hover = -1;
  root.innerHTML = `<div class="hed">
    <div class="hed-top">
      <input id="hedName" type="text" placeholder="name it" style="width:170px">
      <select id="hedClass">${Object.entries(HULL_CLASSES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <select id="hedSym" title="draw one half, the game mirrors the other"><option value="y">mirror across the spine (top / bottom)</option><option value="x">mirror left / right</option><option value="">no symmetry</option></select>
      <select id="hedBase" title="start from a built-in shape"><option value="">start from…</option></select>
      <span style="flex:1"></span>
      <button id="hedCancel" class="x">close</button>
    </div>
    <canvas id="hedCv" width="${GW * CS}" height="${GH * CS}"></canvas>
    <div class="tiny" id="hedHint"></div>
    <div class="hed-top">
      <button id="hedUndo">Undo point</button><button id="hedClear">Clear</button>
      <span style="flex:1"></span>
      <button id="hedSave">Save to library</button><button id="hedUse" class="go">Save &amp; use on this design</button>
    </div>
    <div id="hedLib"></div>
  </div>`;
  const $ = id => root.querySelector('#' + id), cv = $('hedCv'), g = cv.getContext('2d');
  const axisY = GH / 2, axisX = GW / 2;

  const fullPts = () => {
    if (!st) return [];
    const p = st.pts;
    if (st.sym === 'y') return [...p, ...p.slice(1, -1).reverse().map(([x, y]) => [x, 2 * axisY - y])];
    if (st.sym === 'x') return [...p, ...p.slice(1, -1).reverse().map(([x, y]) => [2 * axisX - x, y])];
    return p;
  };
  const toHull = pts => pts.map(([x, y]) => [x - GW / 2, y - GH / 2]);
  const closed = () => !!st && st.pts.length >= 3;                        // three points make a shape; there is no open state
  const valid = () => { const f = fullPts(); return f.length >= 3 && areaOf(f) > 0.5; };
  const clampPt = ([x, y]) => {
    x = Math.max(0, Math.min(GW, snap(x))); y = Math.max(0, Math.min(GH, snap(y)));
    if (st.sym === 'y' && Math.abs(y - axisY) < 0.3) y = axisY;           // near the spine snaps onto it; PAST it is allowed — that is how you cut a hole down the middle
    if (st.sym === 'x' && Math.abs(x - axisX) < 0.3) x = axisX;
    return [x, y];
  };
  const cellAt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width / CS, (e.clientY - r.top) * cv.height / r.height / CS]; };
  const handleAt = ([x, y]) => st.pts.findIndex(p => Math.hypot(p[0] - x, p[1] - y) * CS < 9);
  // the drawn line nearest a spot (and its mirror image, when there is one): which leg, and whether it was the ghost
  const mirrorPt = ([x, y]) => st.sym === 'y' ? [x, 2 * axisY - y] : st.sym === 'x' ? [2 * axisX - x, y] : [x, y];
  const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
  const segmentAt = c => {
    let best = { i: -1, d: 9 / CS, ghost: false };
    const m = mirrorPt(c);
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const d = segDist(c, st.pts[i], st.pts[i + 1]); if (d < best.d) best = { i, d, ghost: false };
      if (st.sym) { const dg = segDist(m, st.pts[i], st.pts[i + 1]); if (dg < best.d) best = { i, d: dg, ghost: true }; }
    }
    return best.i >= 0 ? best : null;
  };

  function draw() {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(140,180,240,.10)'; g.lineWidth = 1;
    for (let x = 0; x <= GW; x++) { g.beginPath(); g.moveTo(x * CS + 0.5, 0); g.lineTo(x * CS + 0.5, cv.height); g.stroke(); }
    for (let y = 0; y <= GH; y++) { g.beginPath(); g.moveTo(0, y * CS + 0.5); g.lineTo(cv.width, y * CS + 0.5); g.stroke(); }
    if (!st) return;
    // the axis, and the ground for a structure
    g.setLineDash([6, 6]); g.strokeStyle = 'rgba(126,243,176,.5)'; g.lineWidth = 1.5;
    if (st.sym === 'y') { g.beginPath(); g.moveTo(0, axisY * CS); g.lineTo(cv.width, axisY * CS); g.stroke(); }
    if (st.sym === 'x') { g.beginPath(); g.moveTo(axisX * CS, 0); g.lineTo(axisX * CS, cv.height); g.stroke(); }
    g.setLineDash([]);
    if (st.klass === 'structure') { g.strokeStyle = 'rgba(255,179,71,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, (GH - 1) * CS); g.lineTo(cv.width, (GH - 1) * CS); g.stroke(); }
    g.fillStyle = 'rgba(158,179,216,.5)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'right';
    g.fillText(st.klass === 'structure' ? 'ground is the orange line · up is up' : 'NOSE → (front is to the right)', cv.width - 10, 18);
    const f = fullPts(), ok = closed() && valid();
    if (f.length >= 2) {
      g.beginPath(); f.forEach(([x, y], i) => i ? g.lineTo(x * CS, y * CS) : g.moveTo(x * CS, y * CS));
      if (closed()) g.closePath();
      if (ok) { g.fillStyle = 'rgba(95,227,208,.25)'; g.fill('evenodd'); }
      g.strokeStyle = ok ? '#5fe3d0' : 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.stroke();
    }
    // the drawn half is bright, the mirrored half is a ghost
    if (st.sym && f.length > st.pts.length) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(126,243,176,.6)'; g.beginPath(); f.slice(st.pts.length - 1).forEach(([x, y], i) => i ? g.lineTo(x * CS, y * CS) : g.moveTo(x * CS, y * CS)); g.stroke(); g.setLineDash([]); }
    st.pts.forEach(([x, y], i) => { g.beginPath(); g.arc(x * CS, y * CS, i === hover || i === drag ? 7 : 5, 0, 7); g.fillStyle = i === 0 ? '#ffd26a' : '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); });
    $('hedHint').textContent = (closed() ? (valid() ? 'Drag a point to move it. ' : 'Not a shape yet — it needs some area. ') : 'Three points make a shape. ')
      + `Double-click on empty space to add a point at the end, on the line to add one there, on a point to remove it.${st.sym === 'y' ? ' Draw above the spine; the other half mirrors. Cross the spine to cut a hole down the middle.' : st.sym === 'x' ? ' Draw right of the axis; the other half mirrors.' : ''}`;
    api.onChange?.(ok ? build() : null);                                      // whoever listens gets the live outline (the painter)
  }
  function renderLib() {
    const mine = (api.library() || []).filter(h => h.klass === st.klass);
    $('hedLib').innerHTML = `<div class="tiny" style="margin:8px 0 4px">Your ${HULL_CLASSES[st.klass].toLowerCase()} silhouettes${mine.length ? '' : ': none yet'}</div>`
      + mine.map(h => `<span class="chip" style="border-color:var(--line);cursor:pointer" data-hload="${h.id}" title="open it in the editor">${esc(h.name)}</span><button class="x" data-hdel="${h.id}" title="delete it">✕</button> `).join('');
    const base = $('hedBase'); const cur = base.value;
    base.innerHTML = '<option value="">start from…</option>' + Object.values(TEMPLATES).filter(t => t.klass === st.klass).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    base.value = cur && [...base.options].some(o => o.value === cur) ? cur : '';
  }
  // a built-in or saved outline, laid on the grid as points to edit (symmetry off: it is the whole shape)
  function loadPoly(poly, keep = {}) {
    // a shape that mirrors across the spine (or the axis) is loaded as its one half with symmetry ON, so it stays easy to reshape
    const eps = 1e-6, has = (x, y) => poly.some(([px, py]) => Math.abs(px - x) < eps && Math.abs(py - y) < eps);
    const symY = poly.every(([x, y]) => has(x, -y)), symX = !symY && poly.every(([x, y]) => has(-x, y));
    let pts = poly, sym = '';
    if (symY || symX) {
      const upper = symY ? ([, y]) => y <= eps : ([x]) => x >= -eps, n = poly.length;   // editor up = hull −y; editor right = hull +x
      const start = poly.findIndex((p, i) => upper(p) && !upper(poly[(i + n - 1) % n]));
      if (start >= 0) { pts = []; for (let i = 0; i < n && upper(poly[(start + i) % n]); i++) pts.push(poly[(start + i) % n]); sym = symY ? 'y' : 'x'; }
    }
    const b = bboxOf(poly), s = Math.min((GW - 4) / (b.maxx - b.minx), (GH - 4) / (b.maxy - b.miny)) * 0.8;
    const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
    st.pts = pts.map(([x, y]) => [snap(GW / 2 + (x - cx) * s), snap(GH / 2 + (y - cy) * s)]);
    st.sym = sym; Object.assign(st, keep);
    $('hedSym').value = st.sym;
  }
  function open(o = {}) {
    st = { id: null, name: '', klass: o.klass || 'starship', sym: o.klass === 'structure' ? 'x' : 'y', pts: [] };
    const h = o.hull && (api.library() || []).find(x => x.id === o.hull);
    if (h) { Object.assign(st, { id: h.id, name: h.name, klass: h.klass, sym: h.sym || '', pts: h.pts.map(p => [...p]) }); }
    else if (o.hull && TEMPLATES[o.hull]) { st.klass = TEMPLATES[o.hull].klass; loadPoly(TEMPLATES[o.hull].poly); st.name = TEMPLATES[o.hull].name + ' II'; }
    $('hedName').value = st.name; $('hedClass').value = st.klass; $('hedSym').value = st.sym;
    root.classList.remove('hidden'); renderLib(); draw();
  }
  function close() { root.classList.add('hidden'); st = null; api.onClose?.(); }
  function build() {
    const f = fullPts();
    return { id: st.id || 'u' + Math.random().toString(36).slice(2, 9), name: $('hedName').value.trim() || 'My silhouette', klass: st.klass, sym: st.sym, pts: st.pts.map(p => [...p]), poly: toHull(f) };
  }
  function save(use) {
    if (!valid()) { draw(); return; }
    const h = build(); st.id = h.id; api.save(h);
    if (use) { api.use(h.id); close(); } else { renderLib(); draw(); }
  }

  // a double TAP — mouse or finger, two quick touches in one place — does what a double-click would:
  // on a point removes it; on the line (or its mirror image) adds a point there; elsewhere adds one at the end
  let downAt = null, moved = false, lastTap = null;
  const doubleTap = e => {
    const c = cellAt(e), i = handleAt(c);
    if (i >= 0) { st.pts.splice(i, 1); draw(); return; }
    const seg = segmentAt(c), p = clampPt(seg && seg.ghost ? mirrorPt(c) : c);
    if (seg) st.pts.splice(seg.i + 1, 0, p); else st.pts.push(p);
    draw();
  };
  cv.addEventListener('pointerdown', e => {
    if (!st || e.button !== 0) return;
    downAt = [e.clientX, e.clientY]; moved = false;
    const c = cellAt(e), i = handleAt(c);
    if (i >= 0) { drag = i; cv.setPointerCapture(e.pointerId); }           // a single touch only ever grabs a point; adding is a double tap
  });
  cv.addEventListener('pointermove', e => {
    if (!st) return;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) moved = true;
    const c = cellAt(e);
    if (drag >= 0) { if (moved) { st.pts[drag] = clampPt(c); draw(); } return; }
    const i = handleAt(c); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'grab' : 'crosshair'; draw(); }
  });
  const up = e => {
    if (st && downAt && !moved && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14) { lastTap = null; doubleTap(e); }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    downAt = null;
    if (drag >= 0) { drag = -1; draw(); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', e => e.preventDefault());                 // the tap logic above already handled it; no zoom, no second go
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (!st) return; const i = handleAt(cellAt(e)); if (i >= 0) { st.pts.splice(i, 1); draw(); } });
  $('hedUndo').onclick = () => { if (!st) return; st.pts.pop(); draw(); };
  $('hedClear').onclick = () => { if (!st) return; st.pts = []; draw(); };
  $('hedCancel').onclick = close;
  $('hedSave').onclick = () => save(false);
  $('hedUse').onclick = () => save(true);
  $('hedName').oninput = e => { if (st) st.name = e.target.value; };
  $('hedClass').onchange = e => { if (!st) return; st.klass = e.target.value; renderLib(); draw(); };
  $('hedSym').onchange = e => { if (!st) return; st.sym = e.target.value; st.pts = st.pts.map(clampPt); draw(); };
  $('hedBase').onchange = e => { if (!st || !e.target.value) return; const T = TEMPLATES[e.target.value]; loadPoly(T.poly); if (!$('hedName').value) { st.name = T.name + ' II'; $('hedName').value = st.name; } draw(); };
  root.addEventListener('click', e => {
    const l = e.target.closest('[data-hload]'), d = e.target.closest('[data-hdel]');
    if (l) { const h = api.library().find(x => x.id === l.dataset.hload); if (h) open({ hull: h.id }); }
    if (d && confirm('Delete this silhouette? Designs using it fall back to a built-in one.')) { api.remove(d.dataset.hdel); renderLib(); }
  });
  draw();
  return { open, close, isOpen: () => !root.classList.contains('hidden') };
}
