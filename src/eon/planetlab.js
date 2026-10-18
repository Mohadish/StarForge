// THE PLANET SANDBOX (planet.html): colony.js alone, to play with before it goes into the game — laid out as the planet POP-UP he
// drew (2026-10-18): the two focus widgets on top, equal; the planet in a frame that is always the HUGE world's outline (a smaller
// world sits centred in it); the eon's output under it as bars and icon rows. The fillet's reasons live on the widgets' hover.
import { newColony, endEon, compute, effectiveDot, weightsOf, filletR, filletWhy, building, counts, normTri, xy, SLOT, DEV, FILLET, TRAITS, TRAIT_GLYPH, TRAIT, TRI, FACTORS, FACTOR_COLOR, KIND_WORD } from './colony.js';
import { SIZES, LARGEST } from './districts.js';

const $ = id => document.getElementById(id);
const CELL = 100, GAP = 4, FRAME = LARGEST, PLAN_CYCLE = [null, ['industry'], ['food'], ['housing'], ['science'], ['industry', 'housing'], ['food', 'science']];
const TRI_COLOR = { industry: '#ffb347', research: '#4fa3ff', development: '#f5a3c7' };   // his palette: research blue as science, development pink as housing
const RM = 30;                                       // the rectangle's margin inside its canvas
let C = null, timer = null, hoverCell = -1;

function reset(landing = null) {
  const g = SIZES[$('size').value], home = $('kind').value === 'home';
  C = newColony({ w: g.w, h: g.h, seed: $('seed').value || 'home', home, people: home ? 100 : 12, landing, dot: C ? C.dot : { x: 0.5, y: 0.5 }, tri: C ? C.tri : undefined });
  const name = ($('seed').value || 'home').trim(); $('cname').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  $('cmeta').textContent = `${home ? 'HOMEWORLD' : 'COLONY'}   SIZE: ${g.name.toUpperCase()} ${g.w} × ${g.h}`;
  const cv = $('map'); cv.width = FRAME.w * (CELL + GAP) + GAP; cv.height = FRAME.h * (CELL + GAP) + GAP;   // the frame never changes: the huge world's
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
// a smaller world sits centred in the frame
const origin = () => [Math.round((FRAME.w - C.w) / 2 * (CELL + GAP)), Math.round((FRAME.h - C.h) / 2 * (CELL + GAP))];

// ---- the map: cells as 2 × 2 slot quarters, each kind its colour and a little glyph pattern (a placeholder tapestry until his sprites)
function drawMap() {
  const cv = $('map'), g = cv.getContext('2d'), next = building(C), [ox, oy] = origin();
  g.clearRect(0, 0, cv.width, cv.height);
  if (C.w < FRAME.w || C.h < FRAME.h) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.setLineDash([4, 6]); g.strokeRect(ox + GAP - 2.5, oy + GAP - 2.5, C.w * (CELL + GAP) - GAP + 5, C.h * (CELL + GAP) - GAP + 5); g.setLineDash([]); }
  C.cells.forEach((cell, i) => {
    const [x, y] = xy(C, i), px = ox + GAP + x * (CELL + GAP), py = oy + GAP + y * (CELL + GAP), started = cell.slots.length > 0;
    g.fillStyle = started ? '#0f1726' : '#090d18'; g.fillRect(px, py, CELL, CELL);
    const half = CELL / 2, spots = [[0, 0], [half, 0], [0, half], [half, half]];
    for (let s = 0; s < SLOT.per; s++) {
      const [sx, sy] = spots[s], kind = cell.slots[s];
      if (kind) {
        g.fillStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.28; g.fillRect(px + sx + 2, py + sy + 2, half - 4, half - 4); g.globalAlpha = 1; glyph(g, kind, px + sx + 2, py + sy + 2, half - 4);
        if (next && next.demolish && next.cell === i && s === next.slot) {   // being torn down: a red cross over it, the progress toward the demolition
          const p = Math.min(1, C.progress / DEV.demolish); g.fillStyle = 'rgba(255,121,121,.35)'; g.fillRect(px + sx + 2, py + sy + 2, (half - 4) * p, half - 4);
          g.strokeStyle = '#ff7979'; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
          g.fillStyle = '#ff7979'; g.font = 'bold 20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', px + sx + half / 2, py + sy + half / 2 + 1);
        }
      }
      else if (next && !next.demolish && next.cell === i && s === cell.slots.length) {   // the crane: the next slot being built, its kind's colour, filled by the progress
        g.strokeStyle = FACTOR_COLOR[next.kind]; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
        const p = Math.min(1, C.progress / DEV.cost); g.fillStyle = FACTOR_COLOR[next.kind]; g.globalAlpha = 0.35; g.fillRect(px + sx + 4, py + sy + half - 4 - (half - 8) * p, half - 8, (half - 8) * p); g.globalAlpha = 1;
        g.fillStyle = FACTOR_COLOR[next.kind]; g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚒', px + sx + half / 2, py + sy + half / 2 + 1);
      } else if (started) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); }
    }
    // the frame: planned cells carry their kinds' colours; a pure full cell a warning; the landing a ring
    g.lineWidth = cell.plan ? 2 : 1; g.strokeStyle = cell.plan ? FACTOR_COLOR[cell.plan[0]] : started ? 'rgba(126,243,176,.45)' : 'rgba(255,255,255,.1)'; g.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1); g.lineWidth = 1;
    if (cell.plan) { g.fillStyle = '#04070f'; g.fillRect(px + 2, py + CELL - 16, 15 + 10 * (cell.plan.length - 1), 14); g.font = 'bold 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; cell.plan.forEach((k, j) => { g.fillStyle = FACTOR_COLOR[k]; g.fillText(KIND_WORD[k][0].toUpperCase(), px + 4 + j * 10, py + CELL - 5); }); }
    if (cell.trait !== 'none') { g.font = '14px system-ui'; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = FACTOR_COLOR[TRAITS[cell.trait]]; g.fillText(TRAIT_GLYPH[cell.trait], px + CELL - 4, py + 15); }
    if (i === C.landing) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(px + CELL / 2, py + CELL / 2, 5, 0, 6.283); g.stroke(); }
    if (cell.slots.length === SLOT.per && new Set(cell.slots).size === 1) { g.fillStyle = 'rgba(255,121,121,.9)'; g.font = '10px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('pure', px + 3, py + 12); }
    if (i === hoverCell) { g.strokeStyle = '#fff'; g.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3); }
  });
}
// a kind's little pattern inside a slot (drawn for 34 px, scaled to the slot): chimneys, furrows, blocks, a dome
function glyph(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 34, s / 34);
  g.fillStyle = FACTOR_COLOR[kind]; g.strokeStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.9; g.lineWidth = 1;
  if (kind === 'industry') { for (let k = 0; k < 3; k++) g.fillRect(5 + k * 9, 34 - 6 - (k === 1 ? 14 : 9), 4, k === 1 ? 14 : 9); g.fillRect(3, 34 - 6, 28, 2); }
  else if (kind === 'food') { for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(4, 6 + k * 6); g.lineTo(30, 6 + k * 6); g.stroke(); } }
  else if (kind === 'housing') { for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) g.fillRect(5 + j * 9, 6 + k * 11, 6, 8); }
  else { g.beginPath(); g.arc(17, 19, 10.6, Math.PI, 0); g.fill(); g.fillRect(6, 19, 22, 2); }
  g.restore();
}
// ---- the rectangle: the four corners, the rounded shape the fillet leaves, the wish (hollow) and the effective dot (solid)
function drawRect() {
  const cv = $('rect'), g = cv.getContext('2d'), M = RM, S = cv.width - 2 * M, X = v => M + v * S, Y = v => M + v * S;
  g.clearRect(0, 0, cv.width, cv.height);
  const r = Object.fromEntries(FACTORS.map(k => [k, filletR(C, k)]));
  g.beginPath();
  g.moveTo(X(r.industry), Y(0)); g.lineTo(X(1 - r.food), Y(0)); if (r.food) g.arc(X(1 - r.food), Y(r.food), r.food * S, -Math.PI / 2, 0);
  g.lineTo(X(1), Y(1 - r.science)); if (r.science) g.arc(X(1 - r.science), Y(1 - r.science), r.science * S, 0, Math.PI / 2);
  g.lineTo(X(r.housing), Y(1)); if (r.housing) g.arc(X(r.housing), Y(1 - r.housing), r.housing * S, Math.PI / 2, Math.PI);
  g.lineTo(X(0), Y(r.industry)); if (r.industry) g.arc(X(r.industry), Y(r.industry), r.industry * S, Math.PI, Math.PI * 1.5);
  g.closePath();
  const grad = g.createLinearGradient(X(0), Y(0), X(1), Y(1)); grad.addColorStop(0, 'rgba(255,179,71,.18)'); grad.addColorStop(1, 'rgba(79,163,255,.18)');
  g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
  g.font = 'bold 12px system-ui'; g.textBaseline = 'middle';
  const lab = (k, x, y, align) => { g.fillStyle = FACTOR_COLOR[k]; g.textAlign = align; g.fillText(KIND_WORD[k] + (C.sup[k] < 0.97 ? ' ' + Math.round(C.sup[k] * 100) + '%' : ''), x, y); };
  lab('industry', X(0), Y(0) - 14, 'left'); lab('food', X(1), Y(0) - 14, 'right'); lab('housing', X(0), Y(1) + 14, 'left'); lab('science', X(1), Y(1) + 14, 'right');
  const w = C.dot, e = effectiveDot(C);
  if (Math.hypot(w.x - e.x, w.y - e.y) > 0.002) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(w.x), Y(w.y)); g.lineTo(X(e.x), Y(e.y)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = '#fff'; g.beginPath(); g.arc(X(w.x), Y(w.y), 6, 0, 6.283); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(e.x), Y(e.y), 5, 0, 6.283); g.fill();
  cv.title = FACTORS.map(k => filletWhy(C, k, C.last)).join('\n');   // why a corner is rounded: on the hover, not on the page (his call)
}
// ---- the triangle: industry left, research right, development top
const TRI_PTS = { industry: [28, 222], research: [222, 222], development: [125, 34] };
function drawTri() {
  const cv = $('tri'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  const P = TRI_PTS; g.beginPath(); g.moveTo(...P.industry); g.lineTo(...P.research); g.lineTo(...P.development); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
  const t = normTri(C.tri), x = TRI.reduce((a, k) => a + t[k] * P[k][0], 0), y = TRI.reduce((a, k) => a + t[k] * P[k][1], 0);
  g.font = 'bold 12px system-ui'; g.textBaseline = 'middle';
  g.fillStyle = TRI_COLOR.industry; g.textAlign = 'left'; g.fillText(`industry ${Math.round(t.industry * 100)}%`, 6, 238);
  g.fillStyle = TRI_COLOR.research; g.textAlign = 'right'; g.fillText(`research ${Math.round(t.research * 100)}%`, 244, 238);
  g.fillStyle = TRI_COLOR.development; g.textAlign = 'center'; g.fillText(`development ${Math.round(t.development * 100)}%`, 125, 16);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
  const r = C.last; cv.title = `industry ${Math.round(r.hands.industry)} M hands for ${Math.round(r.cap.industry)} M of works · research ${Math.round(r.hands.research)} M for ${Math.round(r.cap.science)} M of labs · ${Math.round(r.hands.development)} M builders → ${r.dev.toFixed(1)} points an eon`;
}
function triFromPoint(px, py) {                     // barycentric, clamped into the triangle
  const [ax, ay] = TRI_PTS.industry, [bx, by] = TRI_PTS.research, [cx, cy] = TRI_PTS.development, det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  let a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, c = 1 - a - b;
  a = Math.max(0, a); b = Math.max(0, b); c = Math.max(0, c); const s = a + b + c || 1; return { industry: a / s, research: b / s, development: c / s };
}
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
const cellAt = e => { const cv = $('map'), b = cv.getBoundingClientRect(), [ox, oy] = origin(), lx = e.clientX - b.left - ox - GAP, ly = e.clientY - b.top - oy - GAP, x = Math.floor(lx / (CELL + GAP)), y = Math.floor(ly / (CELL + GAP)); return lx >= 0 && ly >= 0 && x < C.w && y < C.h && lx % (CELL + GAP) < CELL && ly % (CELL + GAP) < CELL ? y * C.w + x : -1; };
$('map').addEventListener('click', e => {
  const i = cellAt(e); if (i < 0) return;
  if (e.shiftKey) { reset(i); return; }
  const cell = C.cells[i], at = PLAN_CYCLE.findIndex(p => JSON.stringify(p) === JSON.stringify(cell.plan)); cell.plan = PLAN_CYCLE[(at + 1) % PLAN_CYCLE.length]; render();
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
const drag = (cv, fn) => { let on = false; const at = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }; cv.addEventListener('pointerdown', e => { on = true; cv.setPointerCapture(e.pointerId); fn(...at(e)); render(); }); cv.addEventListener('pointermove', e => { if (on) { fn(...at(e)); render(); } }); cv.addEventListener('pointerup', () => { on = false; }); };
drag($('rect'), (px, py) => { const S = $('rect').width - 2 * RM; C.dot = { x: Math.max(0, Math.min(1, (px - RM) / S)), y: Math.max(0, Math.min(1, (py - RM) / S)) }; });
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
