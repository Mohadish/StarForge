// Research: say what you want, drag the dot to choose what kind of engineering project it is,
// then queue it. Labs on the planet produce the research points.
import { $, clamp, fmt, esc, uid, toast } from '../util.js';
import { CATS, GROUPS } from '../data/categories.js';
import { S, bp, commit } from '../core/state.js';
import { evalBlueprint, stdWants, CENTER } from '../core/blueprint.js';
import { dims } from '../core/assembly.js';
import { CELL_T, CELL_U } from '../core/physics.js';
import { planetStats } from '../core/economy.js';
import { replaceable, usersOf } from '../core/refit.js';
import { bpLine, plural } from './common.js';
import { openRefit } from './refit.js';

let cur = 'weapon';
let DES = {};
const des = c => DES[c] || (DES[c] = { v: stdWants(c), w: [...CENTER] });
export const reset = () => { DES = {}; cur = 'weapon'; };
let root = null;

const TPL = `
<div class="page" style="grid-template-columns:330px 1fr 340px">
  <section>
    <h2>What kind of part</h2>
    <div id="rsCats"></div>
    <h2 style="margin-top:12px">What I want it to do</h2>
    <div id="rsWants"></div>
    <div class="tiny">Yellow line = what making that want 10% better adds.</div>
  </section>
  <section>
    <h2>What kind of engineering project — drag the dot</h2>
    <div style="display:grid;grid-template-columns:300px 1fr;gap:12px;align-items:start">
      <div>
        <svg id="rsTri" class="tri" width="300" height="236" viewBox="0 0 300 236" style="display:block">
          <polygon points="150,24 28,208 272,208" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.35)"/>
          <text x="150" y="15" text-anchor="middle" fill="#ffd26a" font-size="12" font-weight="700">SMALL</text>
          <text x="2" y="226" text-anchor="start" fill="#7ef3b0" font-size="12" font-weight="700">CHEAP TO BUILD</text>
          <text x="298" y="226" text-anchor="end" fill="#cf89ff" font-size="12" font-weight="700">QUICK TO RESEARCH</text>
          <circle class="marker" id="rsTriM" r="9" cx="150" cy="147"/>
        </svg>
        <div class="tiny">Toward a corner = you get THAT. The other two pay for it.</div>
      </div>
      <div>
        <div class="card res"><div class="row" style="border:0"><b style="color:var(--size)">SIZE → MASS</b><span class="big" id="rsMass"></span></div><div class="bar"><div class="fill" id="rsBMass" style="background:var(--size)"></div><div class="tick"></div></div><div class="tiny" id="rsTMass"></div></div>
        <div class="card res"><div class="row" style="border:0"><b style="color:var(--cost)">BUILD COST (each)</b><span class="big" id="rsCost"></span></div><div class="bar"><div class="fill" id="rsBCost" style="background:var(--cost)"></div><div class="tick"></div></div><div class="tiny" id="rsTCost"></div></div>
        <div class="card res"><div class="row" style="border:0"><b style="color:var(--time)">RESEARCH (once)</b><span class="big" id="rsTime"></span></div><div class="bar"><div class="fill" id="rsBTime" style="background:var(--time)"></div><div class="tick"></div></div><div class="tiny" id="rsTTime"></div></div>
        <div class="tiny">White tick on each bar = the Standard part of this kind.</div>
      </div>
    </div>
    <h2 style="margin-top:12px">What you get</h2>
    <div style="display:grid;grid-template-columns:1fr 300px;gap:12px">
      <div class="card" id="rsGets" style="margin:0"></div>
      <div><canvas id="rsPart" width="300" height="150"></canvas><div class="tiny">Solid = this part, to scale. Dashed = Standard part.</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
      <input type="text" id="rsName" style="width:220px">
      <button class="go" id="rsQueueBtn">Queue research ▸</button>
      <button id="rsStdBtn">Back to Standard</button>
    </div>
  </section>
  <section>
    <h2>Research queue</h2>
    <div id="rsQueue"></div>
    <h2 style="margin-top:12px">Researched parts</h2>
    <div class="tiny" style="margin-bottom:6px">Click a part to load its settings. "Upgrade to this" refits every ship and structure that uses an older part of the same kind.</div>
    <div id="rsLib"></div>
  </section>
</div>`;

export function mount(el) {
  root = el;
  el.innerHTML = TPL;
  el.addEventListener('click', onClick);
  $('rsQueueBtn').onclick = queueIt;
  $('rsStdBtn').onclick = () => { DES[cur] = { v: stdWants(cur), w: [...CENTER] }; renderWants(); };
  const off = bindTri();
  renderCats(); renderWants(); renderSide();
  return off;
}
export function refresh() { renderSide(); refreshReadouts(); }

const nextName = c => `${CATS[c].one} Mk ${S.blueprints.filter(b => b.cat === c).length + 1}`;

function onClick(e) {
  const t = e.target.closest('[data-cat],[data-load],[data-refit],[data-unq],[data-up]');
  if (!t) return;
  if (t.dataset.cat) { cur = t.dataset.cat; renderCats(); renderWants(); return; }
  if (t.dataset.refit) { e.stopPropagation(); openRefit(t.dataset.refit); return; }
  if (t.dataset.unq) {
    const id = t.dataset.unq;
    S.research.queue = S.research.queue.filter(x => x !== id);
    S.blueprints = S.blueprints.filter(b => b.id !== id);
    commit(); return;
  }
  if (t.dataset.up) { const q = S.research.queue, i = q.indexOf(t.dataset.up); if (i > 0) { [q[i - 1], q[i]] = [q[i], q[i - 1]]; commit(); } return; }
  if (t.dataset.load) { const b = bp(t.dataset.load); if (!b) return; cur = b.cat; DES[cur] = { v: { ...b.v }, w: [...b.w] }; renderCats(); renderWants(); }
}

function renderCats() {
  $('rsCats').innerHTML = GROUPS.map(g => `<div class="grp">${g.name}</div><div class="cats">`
    + Object.values(CATS).filter(c => c.group === g.id).map(c => `<button class="${c.id === cur ? 'on' : ''}" data-cat="${c.id}" style="border-left:4px solid ${c.color}">${c.name}</button>`).join('')
    + '</div>').join('');
}

function renderWants() {
  const c = CATS[cur], d = des(cur);
  $('rsWants').innerHTML = c.wants.map(q => `<div class="card want"><div class="top"><span>${q.label}</span><span><span class="val" id="rv_${q.k}"></span><span class="unit">${q.unit || ''}</span></span></div>
    <input type="range" data-want="${q.k}" min="${q.min}" max="${q.max}" step="${q.step}" value="${d.v[q.k]}">
    ${q.mult ? `<div class="tiny" id="rn_${q.k}"></div>` : ''}<div class="marginal" id="rx_${q.k}"></div></div>`).join('');
  for (const inp of root.querySelectorAll('[data-want]')) inp.oninput = e => { d.v[inp.dataset.want] = +e.target.value; refreshReadouts(); };
  placeMarker();
  $('rsName').value = nextName(cur);
  refreshReadouts();
}

const multTxt = x => x > 1.05 ? `<b class="up">${x.toFixed(1)}× Standard</b>` : x < 0.95 ? `<b class="down">${x.toFixed(2)}× Standard</b>` : 'same as Standard';
const logBar = (id, mult) => { $(id).style.width = clamp((Math.log2(Math.max(mult, 1e-4)) + 4) / 10 * 100, 2, 100) + '%'; };
const squares = (c, s) => { const d = dims(c.id, s.mass); return d.w * d.h; };
const sizeHint = (c, s) => c.perU ? 'multiplied by the outline of whatever it wraps'
  : c.group === 'military' ? 'on a ship, every tonne slows it down'
  : c.group === 'civilian' ? `takes ${squares(c, s)} squares of planet land`
  : `ships get slower · on a planet it takes ${squares(c, s)} squares of land`;

function refreshReadouts() {
  if (!root || !$('rsMass')) return;
  const c = CATS[cur], d = des(cur), s = evalBlueprint(cur, d.v, d.w), s0 = evalBlueprint(cur, stdWants(cur), CENTER);
  const rate = planetStats(S).rpOut;
  for (const q of c.wants) {
    const x = d.v[q.k];
    if (q.mult) {
      const nat = q.mult === 'power' ? s.natPower : s.natWorkers;
      $('rv_' + q.k).textContent = fmt(nat * x);
      $('rn_' + q.k).textContent = `×${x.toFixed(2)} of the natural ${fmt(nat)} ${q.unit} — lower is harder to make`;
    } else $('rv_' + q.k).textContent = q.dec ? x.toFixed(q.dec) : fmt(x);
    const better = (q.mult || q.less) ? -1 : 1;
    const v2 = { ...d.v }; v2[q.k] = clamp(x > 0 ? x * (1 + 0.1 * better) : q.std * 0.1, q.min, q.max);
    const s2 = evalBlueprint(cur, v2, d.w), u = c.perU ? ' t/u' : ' t';
    $('rx_' + q.k).textContent = `10% better → +${fmt(Math.max(0, s2.mass - s.mass))}${u} · +${fmt(Math.max(0, s2.cost - s.cost))} cr · +${fmt(Math.max(0, s2.rp - s.rp))} RP`;
  }
  const u = c.perU ? ' / u' : '';
  $('rsMass').textContent = fmt(s.mass) + ' t' + u;
  $('rsCost').textContent = fmt(s.cost) + ' cr' + u;
  $('rsTime').textContent = fmt(s.rp) + ' RP';
  logBar('rsBMass', s.mass / s0.mass); logBar('rsBCost', s.cost / s0.cost); logBar('rsBTime', s.rp / s0.rp);
  $('rsTMass').innerHTML = multTxt(s.mass / s0.mass) + ' — ' + sizeHint(c, s);
  $('rsTCost').innerHTML = multTxt(s.cost / s0.cost) + ' — paid again for every copy you build';
  $('rsTTime').innerHTML = multTxt(s.rp / s0.rp) + ' — ' + (rate > 0 ? `${fmt(s.rp / rate)} turns at your ${fmt(rate)} RP per turn` : 'your labs make no research right now');
  $('rsGets').innerHTML = c.gets(d.v, s).map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('');
  drawPart(c, s, s0);
}

function drawPart(c, s, s0) {
  const cv = $('rsPart'), g = cv.getContext('2d');
  g.clearRect(0, 0, 300, 150);
  if (c.perU) {
    const th = clamp(s.mass * 6, 1, 40), th0 = s0.mass * 6;
    g.fillStyle = '#9eb3d8'; g.font = '11px sans-serif'; g.fillText('plate thickness (mass per u of outline)', 10, 16);
    g.fillStyle = c.color; g.fillRect(20, 40, 260, th);
    g.setLineDash([5, 4]); g.strokeStyle = '#fff8'; g.strokeRect(20, 40, 260, th0); g.setLineDash([]);
    return;
  }
  const a = dims(c.id, s.mass), b = dims(c.id, s0.mass), px = Math.min(12, 280 / Math.max(a.w, b.w), 130 / Math.max(a.h, b.h));
  g.fillStyle = c.color; g.globalAlpha = 0.85; g.fillRect(10, 140 - a.h * px, a.w * px, a.h * px); g.globalAlpha = 1;
  g.setLineDash([5, 4]); g.strokeStyle = '#fff'; g.strokeRect(10.5, 140.5 - b.h * px, b.w * px, b.h * px); g.setLineDash([]);
  g.fillStyle = '#e8f0ff'; g.font = 'bold 12px sans-serif';
  g.fillText(`${a.w * CELL_U} × ${a.h * CELL_U} u`, 14, 134 - a.h * px > 12 ? 134 - a.h * px : 14);
}

const TV = [{ x: 150, y: 24 }, { x: 28, y: 208 }, { x: 272, y: 208 }];
function placeMarker() {
  const w = des(cur).w;
  $('rsTriM').setAttribute('cx', w[0] * TV[0].x + w[1] * TV[1].x + w[2] * TV[2].x);
  $('rsTriM').setAttribute('cy', w[0] * TV[0].y + w[1] * TV[1].y + w[2] * TV[2].y);
}
function bindTri() {
  const svg = $('rsTri');
  let drag = false;
  const mv = (cx, cy) => {
    const r = svg.getBoundingClientRect(), x = (cx - r.left) * 300 / r.width, y = (cy - r.top) * 236 / r.height;
    const [a, b, c] = TV, det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    let l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det, l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det, l3 = 1 - l1 - l2;
    l1 = clamp(l1, 0, 1); l2 = clamp(l2, 0, 1); l3 = clamp(l3, 0, 1);
    const t = l1 + l2 + l3 || 1;
    des(cur).w = [l1 / t, l2 / t, l3 / t];
    placeMarker(); refreshReadouts();
  };
  svg.addEventListener('mousedown', e => { drag = true; mv(e.clientX, e.clientY); e.preventDefault(); });
  const onMove = e => { if (drag) mv(e.clientX, e.clientY); }, onUp = () => { drag = false; };
  addEventListener('mousemove', onMove); addEventListener('mouseup', onUp);
  return () => { removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp); };
}

function queueIt() {
  const d = des(cur), name = ($('rsName').value || '').trim() || nextName(cur);
  const b = { id: uid('bp'), cat: cur, name, v: { ...d.v }, w: [...d.w], researched: false, progress: 0 };
  b.s = evalBlueprint(b.cat, b.v, b.w);
  S.blueprints.push(b);
  S.research.queue.push(b.id);
  commit();
  toast(`${esc(name)} queued for research.`);
  $('rsName').value = nextName(cur);
}

function renderSide() {
  if (!root || !$('rsQueue')) return;
  const rate = planetStats(S).rpOut;
  let ahead = 0;
  const q = S.research.queue.map(id => bp(id)).filter(Boolean);
  $('rsQueue').innerHTML = q.length ? q.map((b, i) => {
    ahead += b.s.rp - b.progress;
    const eta = rate > 0 ? Math.ceil(ahead / rate - 1e-9) : Infinity;
    return `<div class="bp" style="border-left-color:${CATS[b.cat].color}"><div class="n"><span>${esc(b.name)}</span><span>${i ? `<button class="x" data-up="${b.id}" title="move up">▲</button>` : ''}<button class="x" data-unq="${b.id}" title="remove">✕</button></span></div>${bpLine(b)}
      <div class="prog"><div style="width:${100 * b.progress / b.s.rp}%;background:var(--time)"></div></div>
      <div class="tiny">${fmt(b.progress)} / ${fmt(b.s.rp)} RP · ${Number.isFinite(eta) ? 'done in ' + plural(eta, 'turn') : 'never — no research output'}</div></div>`;
  }).join('') : `<div class="tiny">Empty.${rate > 0 ? ` Your labs make ${fmt(rate)} RP per turn — right now it is wasted.` : ''}</div>`;

  $('rsLib').innerHTML = Object.values(CATS).map(c => {
    const bs = S.blueprints.filter(b => b.cat === c.id && b.researched);
    if (!bs.length) return '';
    return `<div class="grp" style="color:${c.color}">${c.name}</div>` + bs.map(b => {
      const u = usersOf(S, b.id), canUp = replaceable(S, b.id).length > 0;
      return `<div class="bp" data-load="${b.id}" style="border-left-color:${c.color}"><div class="n"><span>${esc(b.name)}</span>${canUp ? `<button class="x go" data-refit="${b.id}">Upgrade to this ▸</button>` : ''}</div>${bpLine(b)}
        <div class="tiny">in ${plural(u.designs.length, 'design')} · ${u.instances.length} built</div></div>`;
    }).join('');
  }).join('');
}
