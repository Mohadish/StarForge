// THE PLANET SANDBOX (planet.html): colony.js alone, to play with before it goes into the game — laid out as the planet POP-UP he
// drew (2026-10-18): the two focus widgets on top, equal; the planet in a frame that is always the HUGE world's outline (a smaller
// world sits centred in it); the eon's output under it as bars and icon rows. The fillet's reasons live on the widgets' hover.
import { newColony, endEon, compute, weightsOf, filletWhy, building, counts, normTri, xy, SLOT, DEV, FILLET, TRAITS, TRAIT, FACTORS, FACTOR_COLOR, KIND_WORD } from './colony.js';
import { SIZES, LARGEST } from './districts.js';
import { drawSurface, drawRect as drawRectV, drawTri as drawTriV, triFromPoint, dotFromPoint, toCanvas, cellAt as cellAtV, mapSize, nextPlan } from './colonyview.js';

const $ = id => document.getElementById(id);
let C = null, timer = null, hoverCell = -1;

function reset(landing = null) {
  const g = SIZES[$('size').value], home = $('kind').value === 'home';
  C = newColony({ w: g.w, h: g.h, seed: $('seed').value || 'home', home, people: home ? 100 : 12, landing, dot: C ? C.dot : { x: 0.5, y: 0.5 }, tri: C ? C.tri : undefined });
  const name = ($('seed').value || 'home').trim(); $('cname').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  $('cmeta').textContent = `${home ? 'HOMEWORLD' : 'COLONY'}   SIZE: ${g.name.toUpperCase()} ${g.w} × ${g.h}`;
  const cv = $('map'); [cv.width, cv.height] = mapSize();   // the frame never changes: the huge world's
  render();
}
// ---- THE PRODUCTION QUEUE (his ask): what the colony's industry builds — ships, platforms, a dock; the surface builds itself from
// development. Serial: the top card takes the eon's industry, what it does not need flows to the next, what no card needs becomes
// credits. `lanes` 2 splits the industry between the top two (his open question: "work on a couple of things at the same time").
// A prototype with a mock catalogue — in the game the catalogue is the empire's designs and the costs theirs.
const CATALOG = [
  { id: 'survey', name: 'Survey ship', kind: 'ship', cost: 160, icon: '🛸' }, { id: 'settler', name: 'Settler', kind: 'ship', cost: 420, icon: '🚀' },
  { id: 'corvette', name: 'Corvette', kind: 'ship', cost: 350, icon: '🚀' }, { id: 'raider', name: 'Raider', kind: 'ship', cost: 524, icon: '🚀' },
  { id: 'carrier', name: 'Carrier', kind: 'ship', cost: 313, icon: '🚀' }, { id: 'warship', name: 'Warship', kind: 'ship', cost: 2286, icon: '🚀' },
  { id: 'platform', name: 'Orbital platform', kind: 'platform', cost: 900, icon: '🛰' }, { id: 'dock', name: 'Space dock', kind: 'dock', cost: 1500, icon: '🏭' },
];
let Q = [], qid = 1, addOpen = false, lanes = 1, lastQ = { spent: 0, left: 0 }, dragId = null;
function queueEon(industry) {
  let left = industry; const n = Math.min(lanes, Q.length);
  if (n) {
    const share = industry / n, pool = [];                                   // each lane gets its share; what a lane does not need goes back to the pool for the next cards
    for (let i = 0; i < n; i++) pool.push(share); left = 0;
    for (let i = 0; i < Q.length && pool.length; i++) { const it = Q[i]; let got = pool.shift(); while (got > 0 && it.count > 0) { const need = it.cost - it.progress, put = Math.min(need, got); it.progress += put; got -= put; if (it.progress >= it.cost - 1e-9) { it.progress = 0; it.count--; it.built = (it.built || 0) + 1; LOG.unshift(`<div><b>eon ${C.eon + 1}</b> · <b style="color:var(--good)">${it.name}</b> built${it.count > 0 ? ` — ${it.count} more in the queue` : ''}</div>`); } } if (got > 0) pool.push(got); }
    left = pool.reduce((a, b) => a + b, 0);
    Q = Q.filter(it => it.count > 0);
  }
  return { spent: industry - left, left };
}
function step() { const r = C.last; lastQ = queueEon(r.industry); endEon(C); render(); }
const qAdd = id => { const d = CATALOG.find(x => x.id === id), same = Q.find(it => it.id === id && it === Q[Q.length - 1]); if (same) same.count++; else Q.push({ uid: qid++, id: d.id, name: d.name, kind: d.kind, cost: d.cost, icon: d.icon, progress: 0, count: 1 }); };
function renderQueue() {
  const r = C.last, ind = Math.max(0.01, r.industry), L = Math.max(1, Math.min(lanes, Q.length)), rate = ind / L; let ahead = 0;
  const cards = Q.map((it, i) => {
    // when it is ready: a card in a lane builds now; one behind waits its share of what is ahead of it (a lane's worth), then builds at a lane's rate
    const remaining = it.cost * it.count - it.progress, wait = i < L ? 0 : ahead / L, first = Math.ceil((wait + it.cost - it.progress) / rate), eta = Math.ceil((wait + remaining) / rate); ahead += remaining;
    const col = it.kind === 'dock' ? FACTOR_COLOR.industry : it.kind === 'platform' ? FACTOR_COLOR.science : 'var(--accent)';
    return `<div class="qcard ${i < lanes ? 'top' : ''}" draggable="true" data-q="${it.uid}" style="--c:${col}" title="drag to change its place in the line">
      <div class="qimg">${it.icon}</div>
      <div class="qinfo"><b>${it.name}</b>${it.cost} ⚙ each${i < lanes ? ` · <span style="color:var(--good)">building</span>` : ' · waiting'}<br>${it.count > 1 ? `first in ${first} eon${first === 1 ? '' : 's'}, all ${it.count} in ${eta}` : `ready in ${eta} eon${eta === 1 ? '' : 's'}`}
        <div class="qctl"><button class="x" data-qminus="${it.uid}" title="one fewer">−</button><input type="number" min="1" max="99" value="${it.count}" data-qcount="${it.uid}" title="how many of these — type it"><button class="x" data-qplus="${it.uid}" title="one more">＋</button><span class="tiny">of these</span></div></div>
      <div class="qbtns"><button class="x" data-qdel="${it.uid}" title="drop it">✕</button></div>
      <div class="qbar"><div style="width:${Math.round(100 * it.progress / it.cost)}%"></div></div></div>`;
  }).join('');
  $('queue').innerHTML = `<h2>Production</h2>
    <button class="go" id="qadd">＋ Add construction project</button>
    ${addOpen ? `<div class="qmenu">${CATALOG.map(d => `<button data-qcat="${d.id}"><span>${d.icon} ${d.name}</span><small>${d.cost} ⚙</small></button>`).join('')}</div>` : ''}
    ${cards || '<div class="tiny">Nothing in the line — the industry turns into credits.</div>'}
    <div class="tiny" style="margin-top:4px">This eon: ${Math.round(lastQ.spent)} ⚙ into the line, ${Math.round(lastQ.left)} ⚙ to credits.</div>
    <label class="tiny" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="qlanes" ${lanes > 1 ? 'checked' : ''}> work on the top two at once (the industry split)</label>`;
}
function run(on) { if (timer) { clearInterval(timer); timer = null; } if (on) timer = setInterval(step, 1000 / +$('speed').value); $('run').textContent = timer ? 'Pause ▮▮' : 'Run ▸▸'; $('run').classList.toggle('on', !!timer); }
function drawMap() { drawSurface($('map'), C, { next: building(C), hover: hoverCell }); }
function drawRect() { const cv = $('rect'); drawRectV(cv, C); cv.title = FACTORS.map(k => filletWhy(C, k, C.last)).join('\n'); }   // why a corner is rounded: on the hover, not on the page (his call)
function drawTri() { const cv = $('tri'); drawTriV(cv, C.tri); const r = C.last; cv.title = `industry ${Math.round(r.hands.industry)} M hands for ${Math.round(r.cap.industry)} M of works · research ${Math.round(r.hands.research)} M for ${Math.round(r.cap.science)} M of labs · ${Math.round(r.hands.development)} M builders → ${r.dev.toFixed(1)} points an eon`; }
// ---- the output of the eon: bars and ICON ROWS (his ask): plates = people eating (dim: unfed), sheaves = food past the mouths here
// (a surplus for the colonies round it — logistics, later); gears = industry, money = what no build queue takes (here all of it: the
// sandbox builds no ships); microscopes and tubes = science; hammers = the builders' work an eon
const n0 = v => Math.round(v), rep = (icon, n, max = 40) => icon.repeat(Math.max(0, Math.min(max, n)));
const bar = (name, val, max, col, text) => `<div class="bar"><span style="color:${col}">${name}</span><div class="track"><div style="width:${Math.min(100, 100 * val / Math.max(1, max))}%;background:${col}"></div></div><b>${text}</b></div>`;
function renderOut() {
  const r = C.last, next = building(C), full = C.cells.every(c => c.slots.length >= SLOT.per);
  const plates = Math.ceil(r.eat / 20), fedPlates = Math.min(plates, Math.ceil(Math.min(r.food, r.eat) / 20)), grain = Math.floor(Math.max(0, r.food - r.eat) / 20);
  const gears = Math.round(r.industry / 10), sci = Math.round(r.science / 10), hammers = Math.round(r.dev);
  if (!Q.length) lastQ = { spent: 0, left: r.industry };
  const cellName = i => xy(C, i).map(v => v + 1).join(',');
  const nextLine = !next ? (full ? `the planet is full and in balance — ${n0(r.hands.development)} M builders stand idle, move the triangle` : 'nothing to build') : next.demolish
    ? `tearing down a <b style="color:${FACTOR_COLOR[next.demolish]}">${KIND_WORD[next.demolish]}</b> slot in cell ${cellName(next.cell)} (${DEV.demolish} pts, ${r.dev > 0 ? Math.max(1, Math.ceil((DEV.demolish - C.progress) / r.dev)) + ' eon(s)' : 'nobody works'}), then <b style="color:${FACTOR_COLOR[next.kind]}">${KIND_WORD[next.kind]}</b> goes up in its place (${DEV.cost} pts)`
    : `next: <b style="color:${FACTOR_COLOR[next.kind]}">${KIND_WORD[next.kind]}</b> in cell ${cellName(next.cell)}${C.cells[next.cell].plan ? ' — planned' : TRAITS[C.cells[next.cell].trait] === next.kind ? ` — ${C.cells[next.cell].trait} ground` : ''} · ${DEV.cost} pts a slot, ${r.dev > 0 ? Math.max(1, Math.ceil((DEV.cost - C.progress) / r.dev)) + ' eon(s)' : 'nobody builds'}`;
  $('out').innerHTML = `
    ${bar('people', C.people, r.housing, FACTOR_COLOR.housing, `${n0(C.people)} / ${n0(r.housing)} M <span class="tiny">homes · ${r.growth >= 0 ? '+' : ''}${(r.growth * 100).toFixed(1)} %</span>`)}
    ${bar('food', Math.min(r.food, r.eat), r.eat, FACTOR_COLOR.food, `${n0(r.food)} / ${n0(r.eat)} M <span class="tiny">fed / eat</span>`)}
    <div class="icons" title="a plate = 20 M people eating (dim: unfed); a sheaf = 20 M more fed than live here — a surplus for the colonies round it (logistics, later)">${rep('🍽', fedPlates)}<span class="dim">${rep('🍽', plates - fedPlates)}</span> ${rep('🌾', grain, 30)}${r.fed < 1 ? ` <b style="color:var(--bad);font-size:12px">hungry — works at ${Math.round(r.hungry * 100)} %</b>` : ''}</div>
    ${bar('industry', r.industry, r.cap.industry, FACTOR_COLOR.industry, `${n0(r.industry)} <span class="tiny">${n0(r.hands.industry)} M hands / ${n0(r.cap.industry)} M works</span>`)}
    <div class="icons" title="a gear = 10 M at the works; a wrench = 10 of it into the production line; money = what no project takes — it turns into credits">${rep('⚙', gears)} <span style="color:var(--muted)">→</span> ${rep('🔧', Math.round(lastQ.spent / 10))}${rep('💰', Math.round(lastQ.left / 10))}<span class="tiny"> ${Q.length ? `${Math.round(lastQ.spent)} to the line · ${Math.round(lastQ.left)} credits` : 'credits (nothing in the line)'}</span></div>
    ${bar('science', r.science, r.cap.science, FACTOR_COLOR.science, `${n0(r.science)} <span class="tiny">${n0(r.hands.research)} M / ${n0(r.cap.science)} M labs</span>`)}
    <div class="icons" title="a microscope or a tube = 10 M at the labs">${Array.from({ length: Math.min(40, sci) }, (_, i) => i % 2 ? '🧪' : '🔬').join('')}</div>
    ${bar('building', C.progress, next && next.demolish ? DEV.demolish : DEV.cost, '#f5a3c7', `${(r.dev).toFixed(1)} <span class="tiny">pts/eon · ${n0(r.hands.development)} M builders</span>`)}
    <div class="icons" title="a hammer = one builder point an eon (a slot costs ${DEV.cost}, tearing one down ${DEV.demolish})">${rep('🔨', hammers)}</div>
    <div class="tiny" style="margin:0 0 2px 92px">${nextLine}${r.cap.pure ? ` · <span style="color:var(--bad)">${r.cap.pure} pure cell${r.cap.pure > 1 ? 's' : ''}</span>` : ''}</div>`;
  $('eon').textContent = `eon ${C.eon} · ${n0(C.people)} M people`;
}
const LOG = [];
function renderLog() {
  for (const e of C.log || []) LOG.unshift(e.kind === 'slot' ? `<div><b>eon ${C.eon}</b> · a <b style="color:${FACTOR_COLOR[e.slot]}">${KIND_WORD[e.slot]}</b> slot in cell ${xy(C, e.cell).map(v => v + 1).join(',')}${C.cells[e.cell].slots.length === SLOT.per ? ' — the cell is full' : ''}</div>` : `<div><b>eon ${C.eon}</b> · cell ${xy(C, e.cell).map(v => v + 1).join(',')}: a <span style="color:${FACTOR_COLOR[e.slot]}">${KIND_WORD[e.slot]}</span> slot torn down — <b style="color:${FACTOR_COLOR[e.to]}">${KIND_WORD[e.to]}</b> goes up in its place</div>`);
  C.log = []; LOG.length = Math.min(LOG.length, 60); $('log').innerHTML = LOG.join('') || '<div class="tiny">Nothing built yet.</div>';
}
function render() { drawMap(); drawRect(); drawTri(); renderOut(); renderQueue(); renderLog(); }
// the queue's clicks and drags (delegated: the column is re-rendered every eon)
$('queue').addEventListener('click', e => {
  const t = e.target.closest('button, input'); if (!t) return;
  if (t.id === 'qadd') { addOpen = !addOpen; return renderQueue(); }
  if (t.dataset.qcat) { qAdd(t.dataset.qcat); addOpen = false; return render(); }
  if (t.dataset.qplus) { const it = Q.find(x => x.uid === +t.dataset.qplus); if (it) it.count = Math.min(99, it.count + 1); return render(); }
  if (t.dataset.qminus) { const it = Q.find(x => x.uid === +t.dataset.qminus); if (it) it.count = Math.max(1, it.count - 1); return render(); }
  if (t.dataset.qdel) { Q = Q.filter(x => x.uid !== +t.dataset.qdel); return render(); }
  if (t.id === 'qlanes') { lanes = t.checked ? 2 : 1; return render(); }
});
$('queue').addEventListener('change', e => { const t = e.target; if (!t.dataset.qcount) return; const it = Q.find(x => x.uid === +t.dataset.qcount); if (it) it.count = Math.max(1, Math.min(99, Math.round(+t.value) || 1)); render(); });   // the typed count: "make 4 of this in one block"
$('queue').addEventListener('mousedown', e => { if (e.target.closest('input')) e.stopPropagation(); });
$('queue').addEventListener('dragstart', e => { const c = e.target.closest('.qcard'); if (!c) return; dragId = +c.dataset.q; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId)); });
$('queue').addEventListener('dragover', e => { const c = e.target.closest('.qcard'); if (!c || dragId == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.qcard.over').forEach(x => x.classList.remove('over')); c.classList.add('over'); });
$('queue').addEventListener('dragleave', e => { const c = e.target.closest('.qcard'); if (c) c.classList.remove('over'); });
$('queue').addEventListener('drop', e => {
  const c = e.target.closest('.qcard'); if (!c || dragId == null) return; e.preventDefault();
  const from = Q.findIndex(x => x.uid === dragId), to = Q.findIndex(x => x.uid === +c.dataset.q); if (from < 0 || to < 0 || from === to) { dragId = null; return render(); }
  const [it] = Q.splice(from, 1); Q.splice(to, 0, it); dragId = null; render();   // dropped on a card: it takes that card's place, the rest shift
});
$('queue').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.qcard.drag, .qcard.over').forEach(x => x.classList.remove('drag', 'over')); });

// ---- input
const cellAt = e => cellAtV($('map'), C, e);
$('map').addEventListener('click', e => {
  const i = cellAt(e); if (i < 0) return;
  if (e.shiftKey) { reset(i); return; }
  C.cells[i].plan = nextPlan(C.cells[i].plan); render();
});
$('map').addEventListener('mousemove', e => {
  const i = cellAt(e); if (i !== hoverCell) { hoverCell = i; drawMap(); } const tip = $('tip');
  if (i < 0) { tip.style.display = 'none'; return; }
  const cell = C.cells[i], out = C.last.perCell[i], [x, y] = xy(C, i);
  tip.innerHTML = `<b>cell ${x + 1},${y + 1}</b> · ${cell.trait === 'none' ? 'plain ground' : `${cell.trait} ground (${KIND_WORD[TRAITS[cell.trait]]} × ${TRAIT.boost})`}${cell.plan ? ` · planned: ${cell.plan.map(k => KIND_WORD[k]).join(' + ')}` : ''}<br>${cell.slots.length ? `slots: ${cell.slots.map(k => `<span style="color:${FACTOR_COLOR[k]}">${KIND_WORD[k]}</span>`).join(', ')}<br>yields: ${FACTORS.filter(k => out[k] > 0.5).map(k => `${KIND_WORD[k]} ${Math.round(out[k])} M`).join(' · ')}${out.staffed < 0.999 ? `<br><span style="color:var(--warn)">short of hands: no housing of its own (${Math.round(out.staffed * 100)} %)</span>` : ''}${out.purity > 0.99 ? '<br><span style="color:var(--bad)">pure: a focus shock hits it hardest</span>' : ''}` : 'empty'}`;
  tip.style.display = 'block'; tip.style.left = Math.min(window.innerWidth - 300, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
$('map').addEventListener('mouseleave', () => { hoverCell = -1; $('tip').style.display = 'none'; drawMap(); });
window.addEventListener('scroll', () => { $('tip').style.display = 'none'; }, { passive: true });
const drag = (cv, fn) => { let on = false; const at = e => toCanvas(cv, e); cv.addEventListener('pointerdown', e => { on = true; cv.setPointerCapture(e.pointerId); fn(...at(e)); render(); }); cv.addEventListener('pointermove', e => { if (on) { fn(...at(e)); render(); } }); cv.addEventListener('pointerup', () => { on = false; }); };
drag($('rect'), (px, py) => { C.dot = dotFromPoint($('rect'), px, py); });
drag($('tri'), (px, py) => { C.tri = triFromPoint(px, py); });
$('reset').addEventListener('click', () => { run(false); LOG.length = 0; Q = []; reset(); });
$('step').addEventListener('click', step);
$('run').addEventListener('click', () => run(!timer));
$('speed').addEventListener('change', () => { if (timer) run(true); });
for (const id of ['size', 'kind', 'seed']) $(id).addEventListener('change', () => { run(false); LOG.length = 0; reset(); });
const depth = () => { FILLET.maxR = +$('depth').value; $('depthV').textContent = `${FILLET.maxR} — a full corner capped near ${Math.round(100 * Math.pow(1 - (FILLET.maxR - FILLET.maxR / Math.SQRT2), 2))} %`; if (C) render(); };
$('depth').addEventListener('input', depth);
window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === ' ') { e.preventDefault(); run(!timer); } else if (e.key === 'ArrowRight') step(); });
$('size').innerHTML = Object.entries(SIZES).map(([k, s]) => `<option value="${k}" ${s === LARGEST ? 'selected' : ''}>${s.w} × ${s.h} · ${s.name} (${s.w * s.h * SLOT.per} slots)</option>`).join('');   // the whole ladder
depth(); reset();
window.sbsPlanet = { get C() { return C; }, get Q() { return Q; }, step, reset, compute, weightsOf, counts, qAdd, render };
