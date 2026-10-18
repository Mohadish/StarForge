// THE PLANET SANDBOX (planet.html): colony.js alone, to play with before it goes into the game — the grid with its slots growing
// out of the landing, the development rectangle with its live fillet, the effort triangle, the eon's numbers, and a log.
// It is also the sketch of the planet POP-UP he wants (click a planet → its surface and these two controls, no sidebars).
import { newColony, endEon, compute, effectiveDot, weightsOf, filletR, filletWhy, building, counts, normTri, xy, SLOT, DEV, FILLET, TRAITS, TRAIT_GLYPH, TRAIT, CORNER, TRI, FACTORS, FACTOR_COLOR, KIND_WORD } from './colony.js';
import { SIZES } from './districts.js';

const $ = id => document.getElementById(id);
const CELL = 76, GAP = 4, PLAN_CYCLE = [null, ['industry'], ['food'], ['housing'], ['science'], ['industry', 'housing'], ['food', 'science']];
const TRI_COLOR = { industry: '#ffb347', research: '#4fa3ff', development: '#f5a3c7' };   // his palette: research blue as science, development pink as housing
let C = null, timer = null, hoverCell = -1;

function reset(landing = null) {
  const g = SIZES[$('size').value], home = $('kind').value === 'home';
  C = newColony({ w: g.w, h: g.h, seed: $('seed').value || 'home', home, people: home ? 100 : 12, landing, dot: C ? C.dot : { x: 0.5, y: 0.5 }, tri: C ? C.tri : undefined });
  $('plname').textContent = `— a ${SIZES[$('size').value].name} world, ${g.w} × ${g.h} cells, ${g.w * g.h * SLOT.per} slots`;
  const cv = $('map'); cv.width = g.w * (CELL + GAP) + GAP; cv.height = g.h * (CELL + GAP) + GAP;
  render();
}
function step() { endEon(C); render(); }
function run(on) { if (timer) { clearInterval(timer); timer = null; } if (on) timer = setInterval(step, 1000 / +$('speed').value); $('run').textContent = timer ? 'Pause ▮▮' : 'Run ▸▸'; $('run').classList.toggle('on', !!timer); }

// ---- the map: cells as 2 × 2 slot quarters, each kind its colour and a little glyph pattern (a placeholder tapestry until his sprites)
function drawMap() {
  const cv = $('map'), g = cv.getContext('2d'), r = C.last, next = building(C);
  g.clearRect(0, 0, cv.width, cv.height);
  C.cells.forEach((cell, i) => {
    const [x, y] = xy(C, i), px = GAP + x * (CELL + GAP), py = GAP + y * (CELL + GAP), started = cell.slots.length > 0;
    g.fillStyle = started ? '#0f1726' : '#090d18'; g.fillRect(px, py, CELL, CELL);
    const half = CELL / 2, spots = [[0, 0], [half, 0], [0, half], [half, half]];
    for (let s = 0; s < SLOT.per; s++) {
      const [sx, sy] = spots[s], kind = cell.slots[s];
      if (kind) {
        g.fillStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.28; g.fillRect(px + sx + 2, py + sy + 2, half - 4, half - 4); g.globalAlpha = 1; glyph(g, kind, px + sx + 2, py + sy + 2, half - 4);
        if (next && next.demolish && next.cell === i && s === next.slot) {   // being torn down: a red cross over it, the progress toward the demolition
          const p = Math.min(1, C.progress / DEV.demolish); g.fillStyle = 'rgba(255,121,121,.35)'; g.fillRect(px + sx + 2, py + sy + 2, (half - 4) * p, half - 4);
          g.strokeStyle = '#ff7979'; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
          g.fillStyle = '#ff7979'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', px + sx + half / 2, py + sy + half / 2 + 1);
        }
      }
      else if (next && !next.demolish && next.cell === i && s === cell.slots.length) {   // the crane: the next slot being built, its kind's colour, filled by the progress
        g.strokeStyle = FACTOR_COLOR[next.kind]; g.setLineDash([3, 3]); g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); g.setLineDash([]);
        const p = Math.min(1, C.progress / DEV.cost); g.fillStyle = FACTOR_COLOR[next.kind]; g.globalAlpha = 0.35; g.fillRect(px + sx + 4, py + sy + half - 4 - (half - 8) * p, half - 8, (half - 8) * p); g.globalAlpha = 1;
        g.fillStyle = FACTOR_COLOR[next.kind]; g.font = '15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⚒', px + sx + half / 2, py + sy + half / 2 + 1);
      } else if (started) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(px + sx + 3.5, py + sy + 3.5, half - 7, half - 7); }
    }
    // the frame: planned cells carry their kinds' colours; a pure full cell a warning tint; the landing a ring
    g.lineWidth = cell.plan ? 2 : 1; g.strokeStyle = cell.plan ? FACTOR_COLOR[cell.plan[0]] : started ? 'rgba(126,243,176,.45)' : 'rgba(255,255,255,.1)'; g.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1); g.lineWidth = 1;
    if (cell.plan) { g.fillStyle = '#04070f'; g.fillRect(px + 2, py + CELL - 15, 14 + 9 * (cell.plan.length - 1), 13); g.font = 'bold 10px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; cell.plan.forEach((k, j) => { g.fillStyle = FACTOR_COLOR[k]; g.fillText(KIND_WORD[k][0].toUpperCase(), px + 4 + j * 9, py + CELL - 5); }); }
    if (cell.trait !== 'none') { g.font = '12px system-ui'; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = FACTOR_COLOR[TRAITS[cell.trait]]; g.fillText(TRAIT_GLYPH[cell.trait], px + CELL - 3, py + 13); }
    if (i === C.landing) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(px + CELL / 2, py + CELL / 2, 5, 0, 6.283); g.stroke(); }
    if (cell.slots.length === SLOT.per && new Set(cell.slots).size === 1) { g.fillStyle = 'rgba(255,121,121,.9)'; g.font = '10px system-ui'; g.textAlign = 'left'; g.fillText('pure', px + 3, py + 12); }
    if (i === hoverCell) { g.strokeStyle = '#fff'; g.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3); }
  });
}
// a kind's little pattern inside a slot: chimneys, furrows, blocks, a dome
function glyph(g, kind, x, y, s) {
  g.fillStyle = FACTOR_COLOR[kind]; g.strokeStyle = FACTOR_COLOR[kind]; g.globalAlpha = 0.9;
  if (kind === 'industry') { for (let k = 0; k < 3; k++) g.fillRect(x + 5 + k * 9, y + s - 6 - (k === 1 ? 14 : 9), 4, k === 1 ? 14 : 9); g.fillRect(x + 3, y + s - 6, s - 6, 2); }
  else if (kind === 'food') { for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 4, y + 6 + k * 6); g.lineTo(x + s - 4, y + 6 + k * 6); g.stroke(); } }
  else if (kind === 'housing') { for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) g.fillRect(x + 5 + j * 9, y + 6 + k * 11, 6, 8); }
  else { g.beginPath(); g.arc(x + s / 2, y + s / 2 + 2, s / 3.2, Math.PI, 0); g.fill(); g.fillRect(x + 6, y + s / 2 + 2, s - 12, 2); }
  g.globalAlpha = 1;
}
// ---- the rectangle: the four corners, the rounded shape the fillet leaves, the wish (hollow) and the effective dot (solid)
function drawRect() {
  const cv = $('rect'), g = cv.getContext('2d'), M = 24, S = cv.width - 2 * M, X = v => M + v * S, Y = v => M + v * S;
  g.clearRect(0, 0, cv.width, cv.height);
  // the reachable shape: trace the square, rounding each corner by its fillet (arc centre r in on both axes)
  const r = Object.fromEntries(FACTORS.map(k => [k, filletR(C, k)]));
  g.beginPath();
  g.moveTo(X(r.industry), Y(0)); g.lineTo(X(1 - r.food), Y(0)); if (r.food) g.arc(X(1 - r.food), Y(r.food), r.food * S, -Math.PI / 2, 0);
  g.lineTo(X(1), Y(1 - r.science)); if (r.science) g.arc(X(1 - r.science), Y(1 - r.science), r.science * S, 0, Math.PI / 2);
  g.lineTo(X(r.housing), Y(1)); if (r.housing) g.arc(X(r.housing), Y(1 - r.housing), r.housing * S, Math.PI / 2, Math.PI);
  g.lineTo(X(0), Y(r.industry)); if (r.industry) g.arc(X(r.industry), Y(r.industry), r.industry * S, Math.PI, Math.PI * 1.5);
  g.closePath();
  const grad = g.createLinearGradient(X(0), Y(0), X(1), Y(1)); grad.addColorStop(0, 'rgba(255,179,71,.18)'); grad.addColorStop(1, 'rgba(95,227,208,.18)');
  g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.setLineDash([3, 4]); g.strokeRect(X(0), Y(0), S, S); g.setLineDash([]);   // the full square, ghosted
  g.font = 'bold 11px system-ui'; g.textBaseline = 'middle';
  const lab = (k, x, y, align) => { g.fillStyle = FACTOR_COLOR[k]; g.textAlign = align; g.fillText(KIND_WORD[k] + (C.sup[k] < 0.97 ? ' ' + Math.round(C.sup[k] * 100) + '%' : ''), x, y); };
  lab('industry', X(0), Y(0) - 12, 'left'); lab('food', X(1), Y(0) - 12, 'right'); lab('housing', X(0), Y(1) + 12, 'left'); lab('science', X(1), Y(1) + 12, 'right');
  const w = C.dot, e = effectiveDot(C);
  if (Math.hypot(w.x - e.x, w.y - e.y) > 0.002) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(w.x), Y(w.y)); g.lineTo(X(e.x), Y(e.y)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = '#fff'; g.beginPath(); g.arc(X(w.x), Y(w.y), 6, 0, 6.283); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(e.x), Y(e.y), 5, 0, 6.283); g.fill();
}
// ---- the triangle: industry left, research right, development top
const TRI_PTS = { industry: [22, 180], research: [198, 180], development: [110, 22] };
function drawTri() {
  const cv = $('tri'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  const P = TRI_PTS; g.beginPath(); g.moveTo(...P.industry); g.lineTo(...P.research); g.lineTo(...P.development); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
  const t = normTri(C.tri), x = TRI.reduce((a, k) => a + t[k] * P[k][0], 0), y = TRI.reduce((a, k) => a + t[k] * P[k][1], 0);
  g.font = 'bold 11px system-ui'; g.textBaseline = 'middle';
  g.fillStyle = TRI_COLOR.industry; g.textAlign = 'left'; g.fillText(`industry ${Math.round(t.industry * 100)}%`, 4, 194);
  g.fillStyle = TRI_COLOR.research; g.textAlign = 'right'; g.fillText(`research ${Math.round(t.research * 100)}%`, 216, 194);
  g.fillStyle = TRI_COLOR.development; g.textAlign = 'center'; g.fillText(`development ${Math.round(t.development * 100)}%`, 110, 10);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
}
function triFromPoint(px, py) {                     // barycentric, clamped into the triangle
  const [ax, ay] = TRI_PTS.industry, [bx, by] = TRI_PTS.research, [cx, cy] = TRI_PTS.development, det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  let a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, c = 1 - a - b;
  a = Math.max(0, a); b = Math.max(0, b); c = Math.max(0, c); const s = a + b + c || 1; return { industry: a / s, research: b / s, development: c / s };
}
// ---- the numbers of the eon
const n0 = v => Math.round(v), bar = (name, val, max, col, text) => `<div class="bar"><span style="color:${col}">${name}</span><div class="track"><div style="width:${Math.min(100, 100 * val / Math.max(1, max))}%;background:${col}"></div></div><b>${text}</b></div>`;
const rep = (icon, n, max = 40) => icon.repeat(Math.max(0, Math.min(max, n)));
function renderOut() {
  const r = C.last, n = r.counts, w = r.weights, next = building(C), t = normTri(C.tri), full = C.cells.every(c => c.slots.length >= SLOT.per);
  // ICON ROWS (his ask): plates = people eating (dim: unfed), sheaves = food past the mouths here (a surplus for the colonies round it —
  // logistics, later); gears = industry, coins = what no build queue takes (here all of it: the sandbox builds no ships); microscopes
  // and tubes = science; cranes = the builders' work an eon
  const plates = Math.ceil(r.eat / 20), fedPlates = Math.min(plates, Math.ceil(Math.min(r.food, r.eat) / 20)), grain = Math.floor(Math.max(0, r.food - r.eat) / 20);
  const foodIcons = `<div class="icons" title="a plate = 20 M people eating (dim: unfed); a sheaf = 20 M more fed than live here — a surplus for the colonies round it (logistics, later)">${rep('🍽', fedPlates)}<span class="dim">${rep('🍽', plates - fedPlates)}</span> ${rep('🌾', grain, 30)}${r.fed < 1 ? ` <b style="color:var(--bad);font-size:12px">hungry — works at ${Math.round(r.hungry * 100)} %</b>` : ''}</div>`;
  const gears = Math.round(r.industry / 10), queued = 0, coins = Math.max(0, gears - queued);
  const indIcons = `<div class="icons" title="a gear = 10 M at the works; a coin = 10 M of industry no build queue takes — it turns into credits">${rep('⚙', gears)} <span style="color:var(--muted)">→</span> ${rep('🪙', coins)}<span class="tiny"> credits (nothing queued here)</span></div>`;
  const sci = Math.round(r.science / 10), sciIcons = `<div class="icons" title="a microscope or a tube = 10 M at the labs">${Array.from({ length: Math.min(40, sci) }, (_, i) => i % 2 ? '🧪' : '🔬').join('')}</div>`;
  const cranes = Math.round(r.dev), buildIcons = `<div class="icons" title="a crane = one builder point an eon (a slot costs ${DEV.cost}, tearing one down ${DEV.demolish})">${rep('🏗', cranes)}${!next && full ? `<span class="tiny"> — the planet is full and in balance: ${n0(r.hands.development)} M builders stand idle, move the triangle</span>` : ''}</div>`;
  const nextLine = !next ? 'nothing to build' : next.demolish
    ? `tearing down a <b style="color:${FACTOR_COLOR[next.demolish]}">${KIND_WORD[next.demolish]}</b> slot in cell ${xy(C, next.cell).map(v => v + 1).join(',')} (${DEV.demolish} pts, ${r.dev > 0 ? Math.max(1, Math.ceil((DEV.demolish - C.progress) / r.dev)) + ' eon(s)' : 'nobody works'}), then <b style="color:${FACTOR_COLOR[next.kind]}">${KIND_WORD[next.kind]}</b> goes up in its place (${DEV.cost} pts)`
    : `next: <b style="color:${FACTOR_COLOR[next.kind]}">${KIND_WORD[next.kind]}</b> in cell ${xy(C, next.cell).map(v => v + 1).join(',')}${C.cells[next.cell].plan ? ' — planned' : TRAITS[C.cells[next.cell].trait] === next.kind ? ` — ${C.cells[next.cell].trait} ground` : ''} · a slot costs ${DEV.cost} pts, ${r.dev > 0 ? Math.max(1, Math.ceil((DEV.cost - C.progress) / r.dev)) + ' eon(s)' : 'nobody builds'}`;
  const slotBars = FACTORS.map(k => bar(KIND_WORD[k], n[k], Math.max(1, n.total), FACTOR_COLOR[k], `${n[k]} <span class="tiny">of ${n.total} · aim ${Math.round(w[k] * 100)} %</span>`)).join('');
  $('out').innerHTML = `
    ${bar('people', C.people, r.housing, FACTOR_COLOR.housing, `${n0(C.people)} / ${n0(r.housing)} M <span class="tiny">homes</span>`)}
    ${bar('food', Math.min(r.food, r.eat), r.eat, FACTOR_COLOR.food, `${n0(r.food)} / ${n0(r.eat)} M <span class="tiny">fed / eat</span>`)}
    ${foodIcons}
    ${bar('industry', r.industry, r.cap.industry, FACTOR_COLOR.industry, `${n0(r.industry)} <span class="tiny">${n0(r.hands.industry)} M hands / ${n0(r.cap.industry)} M works</span>`)}
    ${indIcons}
    ${bar('science', r.science, r.cap.science, FACTOR_COLOR.science, `${n0(r.science)} <span class="tiny">${n0(r.hands.research)} M / ${n0(r.cap.science)} M labs</span>`)}
    ${sciIcons}
    ${bar('building', C.progress, next && next.demolish ? DEV.demolish : DEV.cost, '#f5a3c7', `${(r.dev).toFixed(1)} <span class="tiny">pts/eon · ${n0(r.hands.development)} M builders</span>`)}
    ${buildIcons}
    <div class="tiny" style="margin:0 0 8px 92px">${nextLine}${r.cap.pure ? ` · <span style="color:var(--bad)">${r.cap.pure} pure cell${r.cap.pure > 1 ? 's' : ''}</span> (a focus shock hits them hardest)` : ''}</div>
    <h2>Slots against the focus</h2>${slotBars}`;
  $('why').innerHTML = FACTORS.map(k => `<div style="--c:${FACTOR_COLOR[k]}" class="tiny">${filletWhy(C, k, r)}</div>`).join('');
  $('growth').textContent = `Growth ${(r.growth * 100).toFixed(1)} % an eon (science across the districts ${Math.round(r.cap.scienceShare * 100)} % → health). Effort: industry ${Math.round(t.industry * 100)} / research ${Math.round(t.research * 100)} / development ${Math.round(t.development * 100)}.`;
  $('eon').textContent = `eon ${C.eon} · ${n0(C.people)} M people`;
}
const LOG = [];
function renderLog() {
  for (const e of C.log || []) LOG.unshift(e.kind === 'slot' ? `<div><b>eon ${C.eon}</b> · a <b style="color:${FACTOR_COLOR[e.slot]}">${KIND_WORD[e.slot]}</b> slot in cell ${xy(C, e.cell).map(v => v + 1).join(',')}${C.cells[e.cell].slots.length === SLOT.per ? ' — the cell is full' : ''}</div>` : `<div><b>eon ${C.eon}</b> · cell ${xy(C, e.cell).map(v => v + 1).join(',')}: a <span style="color:${FACTOR_COLOR[e.slot]}">${KIND_WORD[e.slot]}</span> slot torn down — <b style="color:${FACTOR_COLOR[e.to]}">${KIND_WORD[e.to]}</b> goes up in its place</div>`);
  C.log = []; LOG.length = Math.min(LOG.length, 60); $('log').innerHTML = LOG.join('') || '<div class="tiny">Nothing built yet.</div>';
}
function render() { drawMap(); drawRect(); drawTri(); renderOut(); renderLog(); }

// ---- input
const cellAt = e => { const cv = $('map'), b = cv.getBoundingClientRect(), x = Math.floor((e.clientX - b.left - GAP) / (CELL + GAP)), y = Math.floor((e.clientY - b.top - GAP) / (CELL + GAP)); return x >= 0 && y >= 0 && x < C.w && y < C.h && (e.clientX - b.left - GAP) % (CELL + GAP) < CELL && (e.clientY - b.top - GAP) % (CELL + GAP) < CELL ? y * C.w + x : -1; };
$('map').addEventListener('click', e => {
  const i = cellAt(e); if (i < 0) return;
  if (e.shiftKey) { reset(i); return; }
  const cell = C.cells[i], at = PLAN_CYCLE.findIndex(p => JSON.stringify(p) === JSON.stringify(cell.plan)); cell.plan = PLAN_CYCLE[(at + 1) % PLAN_CYCLE.length]; render();
});
$('map').addEventListener('mousemove', e => {
  const i = cellAt(e); hoverCell = i; drawMap(); const tip = $('tip');
  if (i < 0) { tip.style.display = 'none'; return; }
  const cell = C.cells[i], out = C.last.perCell[i], [x, y] = xy(C, i);
  tip.innerHTML = `<b>cell ${x + 1},${y + 1}</b> · ${cell.trait === 'none' ? 'plain ground' : `${cell.trait} ground (${KIND_WORD[TRAITS[cell.trait]]} × ${TRAIT.boost})`}${cell.plan ? ` · planned: ${cell.plan.map(k => KIND_WORD[k]).join(' + ')}` : ''}<br>${cell.slots.length ? `slots: ${cell.slots.map(k => `<span style="color:${FACTOR_COLOR[k]}">${KIND_WORD[k]}</span>`).join(', ')}<br>yields: ${FACTORS.filter(k => out[k] > 0.5).map(k => `${KIND_WORD[k]} ${Math.round(out[k])} M`).join(' · ')}${out.staffed < 0.999 ? `<br><span style="color:var(--warn)">short of hands: no housing of its own (${Math.round(out.staffed * 100)} %)</span>` : ''}${out.purity > 0.99 ? '<br><span style="color:var(--bad)">pure: a focus shock hits it hardest</span>' : ''}` : 'empty'}`;
  tip.style.display = 'block'; tip.style.left = Math.min(window.innerWidth - 300, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
$('map').addEventListener('mouseleave', () => { hoverCell = -1; $('tip').style.display = 'none'; drawMap(); });
window.addEventListener('scroll', () => { $('tip').style.display = 'none'; }, { passive: true });
const drag = (cv, fn) => { let on = false; const at = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }; cv.addEventListener('pointerdown', e => { on = true; cv.setPointerCapture(e.pointerId); fn(...at(e)); render(); }); cv.addEventListener('pointermove', e => { if (on) { fn(...at(e)); render(); } }); cv.addEventListener('pointerup', () => { on = false; }); };
drag($('rect'), (px, py) => { const M = 24, S = $('rect').width - 2 * M; C.dot = { x: Math.max(0, Math.min(1, (px - M) / S)), y: Math.max(0, Math.min(1, (py - M) / S)) }; });
drag($('tri'), (px, py) => { C.tri = triFromPoint(px, py); });
document.querySelectorAll('[data-scen]').forEach(b => b.addEventListener('click', () => { const [x, y] = b.dataset.scen.split(',').map(Number); C.dot = { x, y }; render(); }));
$('reset').addEventListener('click', () => { run(false); LOG.length = 0; reset(); });
$('step').addEventListener('click', step);
$('run').addEventListener('click', () => run(!timer));
$('speed').addEventListener('change', () => { if (timer) run(true); });
$('size').addEventListener('change', () => { run(false); LOG.length = 0; reset(); });
$('kind').addEventListener('change', () => { run(false); LOG.length = 0; reset(); });
$('seed').addEventListener('change', () => { run(false); LOG.length = 0; reset(); });
const depth = () => { FILLET.maxR = +$('depth').value; $('depthV').textContent = `${FILLET.maxR} — a full corner capped near ${Math.round(100 * Math.pow(1 - (FILLET.maxR - FILLET.maxR / Math.SQRT2), 2))} %`; if (C) render(); };
$('depth').addEventListener('input', depth);
window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === ' ') { e.preventDefault(); run(!timer); } else if (e.key === 'ArrowRight') step(); });
depth(); reset();
window.sbsPlanet = { get C() { return C; }, step, reset, compute, weightsOf, counts };
