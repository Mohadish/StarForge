// Colony: the planet's land as a map. Drag a building from the left onto the map = a construction
// order. Until you end the turn it can be dragged around, or dragged off the map (or right-clicked)
// to remove it. Ending the turn starts construction and locks it in place. Factories build the orders
// in the order they were placed.
import { $, clamp, fmt, esc, signed, uid, toast } from '../util.js';
import { CATS } from '../data/categories.js';
import { S, bp, design, commit } from '../core/state.js';
import { planetStats, GROWTH_PER_FOOD } from '../core/economy.js';
import { assemblyStats, outline, partDims } from '../core/assembly.js';
import { MAP_W, MAP_H, LAND, bbox, mapOccupancy, fitsAt, anchorAt } from '../core/colonymap.js';
import { row, card, warn, ok, note, plural } from './common.js';
import { openRefit } from './refit.js';
import { go } from './nav.js';

const CP = 28;                       // pixels per square of land
const L = id => bp(id);
let drag = null, hoverId = null, focus = null;
export const focusDesign = id => { focus = id; };
export const reset = () => { drag = null; hoverId = null; focus = null; };
const pct = x => Math.round(x * 100) + '%';

const TPL = `
<div class="page" style="grid-template-columns:260px 1fr 370px">
  <section>
    <h2>Buildings — drag onto the map</h2>
    <div id="clPal"></div>
    <button id="clNewB" style="width:100%;margin-top:6px">Design a new building ▸</button>
  </section>
  <section>
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Home — colony map</h2><span class="tiny" id="clLand"></span></div>
    <canvas id="clMap" width="${MAP_W * CP}" height="${MAP_H * CP}" style="max-width:100%;touch-action:none"></canvas>
    <div class="tiny" id="clHover" style="min-height:38px;margin-top:6px"></div>
    <div class="tiny" id="clLegend" style="margin-top:4px"></div>
  </section>
  <section>
    <h2>The planet</h2><div id="clPlanet"></div>
    <h2 style="margin-top:12px">Build queue</h2><div id="clQueue"></div>
    <h2 style="margin-top:12px">Upgrades in progress</h2><div id="clRefits"></div>
    <h2 style="margin-top:12px">Log</h2><div id="clLog" class="log"></div>
  </section>
</div>
<div id="clChip" class="dragchip hidden"></div>`;

export function mount(el) {
  el.innerHTML = TPL;
  el.addEventListener('click', onClick);
  $('clNewB').onclick = () => go('buildings');
  const cv = $('clMap');
  cv.addEventListener('pointerdown', onMapDown);
  cv.addEventListener('pointermove', onMapHover);
  cv.addEventListener('pointerleave', () => { if (!drag && hoverId) { hoverId = null; drawMap(); showHover(); } });
  cv.addEventListener('contextmenu', onMapRight);
  $('clPal').addEventListener('pointerdown', onPalDown);
  const mv = e => onDragMove(e), up = e => onDragUp(e);
  const key = e => { if (e.key === 'Escape' && drag) { drag = null; hideChip(); drawMap(); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('keydown', key);
  $('clLegend').innerHTML = ['habitat', 'farm', 'mine', 'factory', 'lab', 'reactor'].map(c => `<span class="sw" style="background:${CATS[c].color}"></span>${CATS[c].name}`).join('')
    + `<span class="sw" style="background:${CATS.armor.color}"></span>armor edge · dashed = planned (still movable) · striped = under construction (locked)`;
  refresh();
  return () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('keydown', key); drag = null; };
}

export function refresh() {
  if (!$('clMap')) return;
  const p = planetStats(S);
  $('clLand').textContent = `land: ${p.cells} built + ${p.plannedCells} planned / ${LAND} squares`;
  renderPalette(); drawMap(); showHover(); renderPlanet(p); renderQueue(p); renderRefits(); renderLog();
}

// ---------- drag & drop ----------
function cellFromEvent(e) {
  const cv = $('clMap'); if (!cv) return null;
  const r = cv.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) return null;
  return { x: Math.floor((e.clientX - r.left) * cv.width / r.width / CP), y: Math.floor((e.clientY - r.top) * cv.height / r.height / CP) };
}
const orderAt = c => { if (!c) return null; const id = mapOccupancy(S).get(c.x + ',' + c.y); return id || null; };

function onPalDown(e) {
  const c = e.target.closest('[data-design]');
  if (!c || e.button !== 0) return;
  const d = design(c.dataset.design);
  if (!d || !d.parts.length) return;
  e.preventDefault();
  const b = bbox(d.parts, L);
  drag = { src: 'new', designId: d.id, name: d.name, parts: d.parts.map(p => ({ ...p })), armor: d.armor, skip: null, bw: b.w, bh: b.h };
  onDragMove(e);
}

function onMapDown(e) {
  if (e.button !== 0) return;
  const c = cellFromEvent(e), id = orderAt(c);
  const q = id && S.production.queue.find(x => x.id === id);
  if (!q) return;
  if (q.started) { toast('Construction has started — it is locked in place.'); return; }
  e.preventDefault();
  drag = { src: 'move', itemId: q.id, name: q.name, parts: q.parts, armor: q.armor, skip: q.id, grabDx: c.x - q.ox, grabDy: c.y - q.oy };
  onDragMove(e);
}

function onDragMove(e) {
  if (!drag) return;
  const c = cellFromEvent(e);
  if (c) {
    if (drag.src === 'move') { drag.ox = c.x - drag.grabDx; drag.oy = c.y - drag.grabDy; }
    else { const a = anchorAt(drag.parts, L, c.x - Math.floor(drag.bw / 2), c.y - Math.floor(drag.bh / 2)); drag.ox = a.ox; drag.oy = a.oy; }
    drag.over = true;
    drag.valid = fitsAt(S, drag.parts, drag.ox, drag.oy, drag.skip);
    hideChip();
  } else {
    drag.over = false;
    showChip(e, drag.src === 'move' ? 'Let go here to remove it from the build queue' : 'Drop it on the map');
  }
  drawMap();
}

function onDragUp(e) {
  if (!drag) return;
  const d = drag; drag = null; hideChip();
  if (cellFromEvent(e)) {
    if (!d.valid) { toast('It does not fit there.'); drawMap(); return; }
    if (d.src === 'new') S.production.queue.push({ id: uid('q'), designId: d.designId, name: d.name, parts: d.parts, armor: d.armor, ox: d.ox, oy: d.oy, progress: 0, started: false });
    else { const q = S.production.queue.find(x => x.id === d.itemId); if (q) { q.ox = d.ox; q.oy = d.oy; } }
    focus = null;
    commit();
    return;
  }
  if (d.src === 'move') { removeOrder(d.itemId); return; }
  drawMap();
}

function onMapRight(e) {
  e.preventDefault();
  const id = orderAt(cellFromEvent(e)), q = id && S.production.queue.find(x => x.id === id);
  if (q && !q.started) removeOrder(q.id);
  else if (q) toast('Construction has started — it is locked in place.');
}

function removeOrder(id) {
  const q = S.production.queue.find(x => x.id === id);
  if (!q || q.started) return;
  S.production.queue = S.production.queue.filter(x => x.id !== id);
  commit();
  toast(`${esc(q.name)} removed from the build queue.`);
}

function showChip(e, text) {
  const c = $('clChip'); if (!c) return;
  c.textContent = text; c.classList.remove('hidden');
  c.style.left = (e.clientX + 14) + 'px'; c.style.top = (e.clientY + 14) + 'px';
  c.style.borderColor = drag.src === 'move' ? 'var(--bad)' : 'var(--accent)';
}
function hideChip() { $('clChip')?.classList.add('hidden'); }

// ---------- hover ----------
function onMapHover(e) {
  if (drag) return;
  const id = orderAt(cellFromEvent(e));
  if (id !== hoverId) { hoverId = id; drawMap(); showHover(); }
  const q = id && S.production.queue.find(x => x.id === id);
  $('clMap').style.cursor = q && !q.started ? 'grab' : 'default';
}

function outputs(a) {
  const o = [];
  if (a.housing) o.push(`houses ${fmt(a.housing)} M`);
  if (a.food) o.push(`+${fmt(a.food)} food`);
  if (a.credits) o.push(`+${fmt(a.credits)} cr`);
  if (a.production) o.push(`builds ${fmt(a.production)} cr`);
  if (a.research) o.push(`+${fmt(a.research)} RP`);
  const pw = a.powerOut - a.civDraw;
  o.push(`${pw >= 0 ? '+' : '−'}${fmt(Math.abs(pw))} MW`);
  if (a.jobs) o.push(`${fmt(a.jobs)} M jobs`);
  return o.join(' · ');
}
function partsList(x) {
  const n = {};
  for (const p of x.parts) { const b = L(p.bp); if (b) n[b.name] = (n[b.name] || 0) + 1; }
  if (x.armor && L(x.armor)) n[L(x.armor).name] = 1;
  return Object.entries(n).map(([k, c]) => (c > 1 ? c + '× ' : '') + esc(k)).join(', ');
}
function showHover() {
  const el = $('clHover'); if (!el) return;
  const i = hoverId && S.instances.find(x => x.id === hoverId), q = hoverId && S.production.queue.find(x => x.id === hoverId);
  const x = i || q;
  if (!x) { el.innerHTML = 'Drag a building from the left onto the map. Until you end the turn you can move it, or drag it off the map (or right-click it) to remove it.'; return; }
  const a = assemblyStats(x, L);
  const status = i ? 'operating'
    : q.started ? `under construction — ${pct(q.progress / a.cost)} (${fmt(q.progress)} / ${fmt(a.cost)} cr), locked`
    : `planned — construction starts when you end the turn (${fmt(a.cost)} cr)`;
  el.innerHTML = `<b>${esc(x.name)}</b> · ${status}<br>${outputs(a)} · ${a.cells} squares · ${partsList(x)}`;
}

// ---------- drawing ----------
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

function drawMap() {
  const cv = $('clMap'); if (!cv) return;
  const g = cv.getContext('2d');
  for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) {
    const h = hash(x, y);
    g.fillStyle = `rgb(${24 + h % 10},${36 + (h >>> 4) % 12},${28 + (h >>> 8) % 8})`;
    g.fillRect(x * CP, y * CP, CP, CP);
  }
  g.strokeStyle = 'rgba(200,230,200,.05)';
  for (let x = 0; x <= MAP_W; x++) { g.beginPath(); g.moveTo(x * CP + 0.5, 0); g.lineTo(x * CP + 0.5, MAP_H * CP); g.stroke(); }
  for (let y = 0; y <= MAP_H; y++) { g.beginPath(); g.moveTo(0, y * CP + 0.5); g.lineTo(MAP_W * CP, y * CP + 0.5); g.stroke(); }
  for (const i of S.instances) if (i.kind === 'structure' && i.map) drawBuilding(g, i.parts, i.armor, i.map.ox, i.map.oy, { label: i.name, hover: hoverId === i.id });
  for (const q of S.production.queue) {
    if (drag && q.id === drag.skip) continue;
    const a = assemblyStats(q, L);
    drawBuilding(g, q.parts, q.armor, q.ox, q.oy, { label: q.name, planned: !q.started, building: q.started, progress: a.cost ? q.progress / a.cost : 0, hover: hoverId === q.id });
  }
  if (drag && drag.over) drawBuilding(g, drag.parts, drag.armor, drag.ox, drag.oy, { label: drag.name, ghost: drag.valid ? '#7ef3b0' : '#ff7979' });
}

function drawBuilding(g, parts, armor, ox, oy, o) {
  g.save();
  g.globalAlpha = o.ghost ? 0.65 : o.planned ? 0.5 : 1;
  for (const p of parts) {
    const b = L(p.bp); if (!b) continue;
    const d = partDims(p, L);
    g.fillStyle = o.ghost || CATS[b.cat].color;
    g.fillRect((p.x + ox) * CP + 1, (p.y + oy) * CP + 1, d.w * CP - 2, d.h * CP - 2);
  }
  g.globalAlpha = 1;
  if (o.building) {                       // stripes = under construction
    g.save(); g.beginPath();
    for (const p of parts) { const d = partDims(p, L); g.rect((p.x + ox) * CP, (p.y + oy) * CP, d.w * CP, d.h * CP); }
    g.clip();
    g.strokeStyle = 'rgba(4,7,15,.45)'; g.lineWidth = 5;
    const bb = bbox(parts, L), x0 = (bb.minX + ox) * CP, y0 = (bb.minY + oy) * CP, w = bb.w * CP, h = bb.h * CP;
    for (let s = -h; s < w; s += 14) { g.beginPath(); g.moveTo(x0 + s, y0 + h); g.lineTo(x0 + s + h, y0); g.stroke(); }
    g.restore();
  }
  const ab = armor && L(armor);
  g.strokeStyle = o.ghost || (o.hover ? '#ffffff' : ab ? CATS.armor.color : '#04070f');
  g.lineWidth = ab || o.hover ? 3 : 2;
  if (o.planned) g.setLineDash([6, 4]);
  for (const [x1, y1, x2, y2] of outline(parts, L).edges) { g.beginPath(); g.moveTo((x1 + ox) * CP, (y1 + oy) * CP); g.lineTo((x2 + ox) * CP, (y2 + oy) * CP); g.stroke(); }
  g.setLineDash([]);
  const bb = bbox(parts, L), lx = (bb.minX + ox) * CP, ly = (bb.minY + oy) * CP;
  if (o.label && bb.w * CP >= 56) { g.fillStyle = '#04070f'; g.font = 'bold 11px sans-serif'; g.fillText(o.label.slice(0, Math.floor(bb.w * CP / 7)), lx + 5, ly + 14); }
  if (o.building) {
    g.fillStyle = 'rgba(4,7,15,.8)'; g.fillRect(lx + 3, ly + bb.h * CP - 9, bb.w * CP - 6, 6);
    g.fillStyle = '#7ef3b0'; g.fillRect(lx + 3, ly + bb.h * CP - 9, (bb.w * CP - 6) * clamp(o.progress, 0, 1), 6);
  }
  g.restore();
}

// ---------- side panels ----------
function renderPalette() {
  const p = planetStats(S);
  const ds = S.designs.filter(d => d.kind === 'structure' && d.parts.length);
  $('clPal').innerHTML = ds.map(d => {
    const a = assemblyStats(d, L), b = bbox(d.parts, L);
    const built = S.instances.filter(i => i.designId === d.id).length, queued = S.production.queue.filter(q => q.designId === d.id).length;
    return `<div class="bp drag ${focus === d.id ? 'sel' : ''}" data-design="${d.id}"><div class="n"><span>${esc(d.name)}</span><span class="tiny">${b.w}×${b.h}</span></div>
      <div class="tiny">${outputs(a)}</div>
      <div class="tiny"><b style="color:var(--cost)">${fmt(a.cost)} cr</b> · ${a.cells} squares · ${p.prodOut > 0 ? '≈' + plural(Math.ceil(a.cost / p.prodOut), 'turn') : 'no factories'} · ${built} built${queued ? ` · ${queued} queued` : ''}</div></div>`;
  }).join('') || '<div class="tiny">No building designs yet.</div>';
}

function renderPlanet(p) {
  const spare = p.foodOut - p.eat;
  let h = card(row('People', `${fmt(p.pop)} M of ${fmt(p.housing)} M housing`) + row('Jobs', `${fmt(p.jobs)} M · idle ${fmt(p.idle)} M`)
    + row('Food', `${fmt(p.foodOut)} made · ${fmt(p.eat)} eaten`, spare < 0 ? 'up' : '')
    + row('Power', `${fmt(p.powerOut)} made · ${fmt(p.powerDraw)} used MW`, p.powerScale < 1 ? 'up' : '')
    + row('Per turn', `${signed(p.creditsOut)} cr · ${fmt(p.prodOut)} build · ${fmt(p.rpOut)} RP`));
  if (p.workScale < 0.999) h += warn(`Short of workers → every structure runs at ${pct(p.workScale)}.`);
  if (p.powerScale < 0.999) h += warn(`Brown-out → every structure runs at ${pct(p.powerScale)}. Build a reactor.`);
  if (spare < 0) h += warn(`Famine next turn: about ${fmt(-spare * 0.5)} M people will die. Build farms.`);
  else if (p.pop >= p.housing - 1e-6) h += note('Housing is full — the population stops growing.');
  else h += ok(`Growing: +${fmt(Math.min(p.housing - p.pop, spare * GROWTH_PER_FOOD))} M people next turn.`);
  $('clPlanet').innerHTML = h;
}

function renderQueue(p) {
  let ahead = 0;
  $('clQueue').innerHTML = S.production.queue.length ? S.production.queue.map(q => {
    const a = assemblyStats(q, L), left = Math.max(0, a.cost - q.progress);
    ahead += left;
    const eta = p.prodOut > 0 ? Math.max(1, Math.ceil(ahead / p.prodOut - 1e-9)) : Infinity;
    const when = Number.isFinite(eta) ? 'ready in about ' + plural(eta, 'turn') : 'no factories';
    const st = q.started ? `building · ${fmt(q.progress)} / ${fmt(a.cost)} cr · ${when}` : `planned · starts when you end the turn · ${fmt(a.cost)} cr · ${when}`;
    return `<div class="bp" style="cursor:default"><div class="n"><span>${esc(q.name)}</span>${q.started ? '<span class="tiny">locked</span>' : `<button class="x" data-unq="${q.id}" title="remove">✕</button>`}</div>
      ${q.started ? `<div class="prog"><div style="width:${100 * Math.min(1, q.progress / a.cost)}%;background:var(--cost)"></div></div>` : ''}
      <div class="tiny">${st}${left > S.credits + p.creditsOut * 3 ? ' · <b class="up">needs more credits</b>' : ''}</div></div>`;
  }).join('') : '<div class="tiny">Empty. Drag a building onto the map.</div>';
}

function renderRefits() {
  $('clRefits').innerHTML = S.refits.length ? S.refits.map(o => {
    const f = L(o.from), t = L(o.to);
    return `<div class="bp" style="cursor:default;border-left-color:${CATS[t?.cat]?.color || '#fff'}"><div class="n"><span>${esc(f?.name)} → ${esc(t?.name)}</span><button class="x" data-cancelrf="${o.id}" title="stop — units already refitted stay refitted">✕</button></div>
      <div class="prog"><div style="width:${100 * o.done / Math.max(1, o.total)}%;background:var(--time)"></div></div>
      <div class="tiny">${o.done} / ${o.total} units · ${plural(Math.max(0, o.T - o.elapsed), 'turn')} left · ×${o.mult.toFixed(2)} cost</div></div>`;
  }).join('') : '<div class="tiny">None.</div>';
}

function renderLog() {
  $('clLog').innerHTML = S.log.slice(-60).reverse().map(l => `<div><span class="t">T${l.turn}</span>${esc(l.text)}${l.action?.type === 'refit' && L(l.action.to) ? ` <button class="x go" data-refit="${l.action.to}">Plan upgrade ▸</button>` : ''}</div>`).join('');
}

function onClick(e) {
  const t = e.target.closest('[data-unq],[data-cancelrf],[data-refit]');
  if (!t) return;
  if (t.dataset.unq) removeOrder(t.dataset.unq);
  if (t.dataset.cancelrf) { S.refits = S.refits.filter(o => o.id !== t.dataset.cancelrf); commit(); }
  if (t.dataset.refit) openRefit(t.dataset.refit);
}
