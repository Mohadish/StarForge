// RESEARCH PROJECTS — A CLICKABLE MOCK (his idea, 2026-10-22; nothing here changes the game yet): instead of a tech tree you say what
// you want — an energy weapon, an armour, a shield, a computer… — and how good you want it (the AIM: damage, range, rate…). The thing's
// RECIPE lights the fields it needs (an energy weapon: energy, optics, thermal); the research of each flows out of the field list on
// the left along its own channel into the project's node, and every channel has to fill. How good the result comes out — meeting,
// beating or missing the aim — is the strength of those fields: the places you study (the Veil for optics…), what you have found
// there, and the breakthroughs you plug in as BOOSTERS. The empire's FOCUS never changes what you get; it adds a side gift in its own
// direction. Then you give it a name and a look (the beam's colour; the turret later). Pure UI over the game's own figures (compute()).
import { XS, X_INFO, T } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const $ = id => document.getElementById(id);
export const FIELD_COL = { materials: '#c9a27a', fabrication: '#ffb347', energy: '#ffd84f', electrics: '#7fd8ff', optics: '#c79bff', thermal: '#ff7a59', motion: '#5fe0b4', life: '#8fd16a', information: '#4fa3ff' };
// THE FAMILIES and their RECIPES (his examples, 2026-10-22): the shares of research each field must carry
export const FAMILIES = {
  beam:     { name: 'Energy weapon',    icon: '⚡', recipe: { energy: 0.4, optics: 0.35, thermal: 0.25 }, aims: ['damage', 'range', 'rate of fire'], look: 'beam', base: 'Lance' },
  gun:      { name: 'Kinetic gun',      icon: '⦿', recipe: { materials: 0.35, fabrication: 0.35, motion: 0.3 }, aims: ['damage', 'range', 'rate of fire'], look: 'beam', base: 'Driver' },
  missile:  { name: 'Missile',          icon: '➹', recipe: { fabrication: 0.4, materials: 0.3, life: 0.3 }, aims: ['damage', 'range', 'salvo'], look: 'beam', base: 'Viper' },
  armor:    { name: 'Armour',           icon: '⛨', recipe: { materials: 0.45, fabrication: 0.35, thermal: 0.2 }, aims: ['toughness', 'lightness', 'price'], base: 'Plate' },
  shield:   { name: 'Shield',           icon: '◎', recipe: { motion: 0.4, energy: 0.25, electrics: 0.2, fabrication: 0.15 }, aims: ['strength', 'recovery', 'coverage'], look: 'field', base: 'Aegis' },
  computer: { name: 'Weapons computer', icon: '▣', recipe: { electrics: 0.4, information: 0.4, optics: 0.2 }, aims: ['accuracy', 'mounts', 'lightness'], base: 'Oracle' },
  drive:    { name: 'Star drive',       icon: '➶', recipe: { motion: 0.4, energy: 0.35, thermal: 0.25 }, aims: ['speed', 'reach', 'lightness'], base: 'Strider' },
  reactor:  { name: 'Reactor',          icon: '☢', recipe: { energy: 0.5, thermal: 0.3, materials: 0.2 }, aims: ['output', 'lightness', 'price'], base: 'Heart' },
};
const GIFT = { expand: 'cheaper to build', exploit: 'cheaper upkeep', explore: 'more reach and sight', exterminate: 'harder in battle' };
const MOCK = { needBase: 120, strength: { base: 0.55, potential: 0.6, perFind: 0.04, booster: 0.06 }, luck: 0.1, gift: 12, previewMs: 4500 };

// the mock's own state: one project being drawn up (kept per browser — it is not part of the game)
const KEY = 'forge.eon.projmock';
let PJ = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })() || {};
PJ = { family: FAMILIES[PJ.family] ? PJ.family : 'beam', name: PJ.name || '', aim: Array.isArray(PJ.aim) ? PJ.aim : [40, 20, 20], color: PJ.color || '#7fd8ff', boost: Array.isArray(PJ.boost) ? PJ.boost : [] };
let prog = null, raf = 0, ctx = null;                  // the preview: 0..1 while the flow plays, else null
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(PJ)); } catch (e) { /* private window: fine */ } };

// THE NUMBERS: what it costs, how long each channel takes at your attention, how good it comes out
export function planOf(c, S, pj = PJ) {
  const F = FAMILIES[pj.family], byId = new Map(c.fields.map(f => [f.id, f])), A = pj.aim.reduce((a, v) => a + v, 0) / pj.aim.length / 100;
  const need = Math.round(MOCK.needBase * (1 + 2 * A + 3 * A * A)), boosts = S.breakthroughs.filter(b => pj.boost.includes(b.id) && F.recipe[b.field]);
  const ch = Object.entries(F.recipe).map(([id, w]) => {
    const f = byId.get(id), nb = boosts.filter(b => b.field === id).length, found = S.found[id] || 0, M = MOCK.strength;
    const strength = M.base + M.potential * (f ? f.potential : 0) + M.perFind * Math.min(10, found) + M.booster * nb;
    const flow = c.research * ((f ? f.points : 0) / T.attention), want = need * w, eons = flow > 1e-9 ? want / flow : Infinity;
    return { id, name: f ? f.name : id, w, f, strength, flow, want, eons, found, nb };
  });
  const quality = ch.reduce((a, x) => a + x.w * x.strength, 0), eons = Math.max(...ch.map(x => x.eons)), slow = ch.reduce((a, x) => x.eons > a.eons ? x : a, ch[0]);
  const gift = XS.map((x, i) => ({ x, v: MOCK.gift * (S.focus[i] || 0) })).sort((a, b) => b.v - a.v);
  return { F, ch, need, quality, lo: quality * (1 - MOCK.luck), hi: quality * (1 + MOCK.luck), eons, slow, gift, boosts };
}
const pct = v => Math.round(v * 100) + ' %';
const eonWord = e => !isFinite(e) ? 'never' : `${Math.max(1, Math.ceil(e - 1e-9))} eon${Math.ceil(e - 1e-9) === 1 ? '' : 's'}`;
const stars = s => { const n = Math.max(0, Math.min(5, Math.round((s - 0.5) * 5))); return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>'; };

// THE PANEL on the right: the family, the name, the aim, the look (rendered when the family changes), and the live part under it
function panelHtml(c, S) {
  const F = FAMILIES[PJ.family], nm = PJ.name || `${F.base} Mk I`;
  return `<div class="pjmock">MOCK — nothing here changes the game yet: how a research project would look and feel</div>
    <h2>A new project</h2>
    <div class="pjfams">${Object.entries(FAMILIES).map(([k, f]) => `<button class="${k === PJ.family ? 'on' : ''}" data-pjfam="${k}" title="${Object.keys(f.recipe).map(id => `${id} ${Math.round(f.recipe[id] * 100)} %`).join(' · ')}"><span>${f.icon}</span>${f.name}</button>`).join('')}</div>
    <label class="pjname">Name <input data-pjname value="${esc(nm)}" maxlength="28"></label>
    <div class="pjaims">${F.aims.map((a, i) => `<label><span>${a}</span><input type="range" min="0" max="100" step="5" value="${PJ.aim[i] ?? 0}" data-pjaim="${i}"><b data-pjaimv="${i}">+${PJ.aim[i] ?? 0} %</b></label>`).join('')}
      <div class="tiny">The aim: how much better than your best ${F.name.toLowerCase()} today. The higher the aim, the more research it takes.</div></div>
    <div id="pjOut">${outHtml(c, S)}</div>
    ${F.look ? `<h3>Its look</h3><div class="pjlook"><label class="tiny">${F.look === 'field' ? 'field colour' : 'beam colour'} <input type="color" data-pjcolor value="${esc(PJ.color)}"></label><canvas id="pjLook" width="300" height="70"></canvas></div><div class="tiny">The turret's shape comes with the designer, later.</div>` : ''}
    <div class="pjbtns"><button class="go" data-pjplay>▶ Preview the flow</button><button class="x" disabled title="the rules come once the mock feels right">Start the project — once the rules are in</button></div>`;
}
function outHtml(c, S) {
  const p = planOf(c, S), F = p.F, top = p.gift[0];
  const rows = p.ch.map(x => `<tr class="${x === p.slow && isFinite(p.eons) && p.ch.length > 1 ? 'slow' : ''}"><td><i class="dot" style="background:${FIELD_COL[x.id]}"></i>${esc(x.name)}</td><td>${Math.round(x.w * 100)} %</td><td title="strength ${x.strength.toFixed(2)}: the places you study ${x.f ? pct(x.f.potential) : '—'}, ${x.found} found${x.nb ? `, ${x.nb} booster${x.nb > 1 ? 's' : ''}` : ''}">${stars(x.strength)}</td><td>${x.flow > 0 ? x.flow.toFixed(1) : '<b class="up">0</b>'}</td><td>${x.flow > 0 ? eonWord(x.eons) : '<b class="up">never</b>'}</td></tr>`).join('');
  const zero = p.ch.filter(x => !(x.flow > 0));
  const boosters = S.breakthroughs.filter(b => F.recipe[b.field]);
  return `<h3>Recipe — the channels</h3>
    <table class="pjrec"><tr><th>field</th><th>share</th><th>strength</th><th>flow / eon</th><th>fills in</th></tr>${rows}</table>
    ${zero.length ? `<div class="tiny up">No attention on ${zero.map(x => x.name).join(', ')}: that channel never fills — give it a point on the left.</div>` : `<div class="tiny">The slowest channel sets the pace: <b>${esc(p.slow.name)}</b>. More attention there, or less on the others.</div>`}
    <h3>Forecast</h3>
    <div class="pjfc"><div><span>research</span><b>${p.need}</b></div><div><span>done in</span><b>${eonWord(p.eons)}</b></div><div><span>likely</span><b class="${p.quality >= 1 ? 'down' : p.quality < 0.85 ? 'up' : ''}">${Math.round(p.lo * 100)}–${Math.round(p.hi * 100)} %</b><small>of the aim</small></div></div>
    <div class="tiny">${F.aims.map((a, i) => `${a} <b>+${Math.round((PJ.aim[i] || 0) * p.quality)} %</b> <span style="opacity:.6">(aim +${PJ.aim[i] || 0})</span>`).join(' · ')}</div>
    <div class="tiny" style="margin-top:4px">Your focus adds a gift on the side: ${p.gift.filter(g => g.v >= 0.5).map(g => `<b style="color:${X_INFO[g.x].color}">${GIFT[g.x]} +${g.v.toFixed(0)} %</b>`).join(' · ') || 'none'} — it never changes what you get, only what comes with it${top ? ` (mostly ${X_INFO[top.x].name})` : ''}.</div>
    <h3>Boosters — breakthroughs in these fields</h3>
    ${boosters.length ? `<div class="pjboost">${boosters.slice(0, 12).map(b => `<button class="${PJ.boost.includes(b.id) ? 'on' : ''}" data-pjboost="${b.id}" title="plug it in: +${Math.round(MOCK.strength.booster * 100)} % strength in ${esc(b.fieldName)}"><i class="dot" style="background:${FIELD_COL[b.field]}"></i>${esc(b.name)}</button>`).join('')}</div>` : '<div class="tiny">None yet in these fields — a breakthrough found along a channel would show up here.</div>'}`;
}
// THE NODE on the board: the project as it fills
function nodeHtml(c, S) {
  const p = planOf(c, S), F = p.F, nm = PJ.name || `${F.base} Mk I`, t = prog ?? 0, done = prog != null && prog >= 1;
  return `<div class="pjicon">${F.icon}</div><b>${esc(nm)}</b><div class="tiny">${F.name}</div>
    <div class="pjbar"><i style="width:${Math.round(t * 100)}%"></i></div>
    <div class="tiny">${!isFinite(p.eons) ? `<b class="up">a channel gets no research — it never finishes</b>` : done ? `<b class="down">ready — about ${Math.round(p.quality * 100)} % of the aim</b>` : prog != null ? `eon ${Math.min(Math.ceil(t * (isFinite(p.eons) ? p.eons : 0)), Math.ceil(p.eons))} of ${eonWord(p.eons)}` : `${p.need} research · ${eonWord(p.eons)}`}</div>`;
}
// THE BOARD: a channel from every recipe field's row on the left into the node; the others a faint stub. The track is as wide as the
// field's share; the fill runs along it as the channel fills; dashes stream while research flows
function drawFlow() {
  const board = $('rBoard'), svg = $('rFlow'), node = $('rNode'); if (!board || !svg || !node || !ctx || board.offsetParent === null) return;
  const B = board.getBoundingClientRect(), W = B.width, H = B.height, N = node.getBoundingClientRect(), nx = N.left - B.left, ny = N.top - B.top, nh = N.height;
  const sec = $('rFieldsSec').getBoundingClientRect(), p = planOf(ctx.c, ctx.S), ids = Object.keys(p.F.recipe), maxE = isFinite(p.eons) ? p.eons : 1;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); let out = '';
  const rows = [...document.querySelectorAll('#eFields .frow[data-field]')].map(row => { const r = row.getBoundingClientRect(); return { id: row.dataset.field, y: Math.max(8, Math.min(H - 8, r.top + r.height / 2 - B.top)), off: r.bottom < sec.top + 30 || r.top > sec.bottom - 10 }; });
  const port = new Map(rows.filter(r => ids.includes(r.id)).sort((a, b) => a.y - b.y).map((r, i) => [r.id, i]));   // the node's inputs in the rows' order: no channel crosses another
  for (const { id, y, off } of rows) {
    const k = ids.indexOf(id);
    if (k < 0) { out += `<path d="M0 ${y} L26 ${y}" stroke="#5b6a8a" stroke-width="2" opacity="${off ? 0.1 : 0.35}" stroke-linecap="round"/>`; continue; }
    const x = p.ch[k], py = ny + (port.get(id) + 1) * nh / (ids.length + 1), d = `M0 ${y} C${W * 0.42} ${y} ${nx - W * 0.28} ${py} ${nx} ${py}`, col = FIELD_COL[id], wd = 4 + 18 * x.w;
    const fill = prog == null ? 0 : x.eons === Infinity ? 0 : Math.min(1, prog * maxE / x.eons);
    out += `<path d="${d}" stroke="${col}" stroke-width="${wd}" opacity="${off ? 0.08 : 0.2}" fill="none" stroke-linecap="round"/>`;
    if (fill > 0) out += `<path d="${d}" pathLength="1" stroke="${col}" stroke-width="${wd}" stroke-dasharray="${fill} 1" opacity="0.85" fill="none" stroke-linecap="round"/>`;
    if (x.flow > 0) out += `<path class="pjflow" d="${d}" pathLength="1" stroke="#fff" stroke-width="2" stroke-dasharray="0.015 0.035" opacity="0.55" fill="none"/>`;
    else out += `<path d="${d}" stroke="#ff7979" stroke-width="2" stroke-dasharray="4 6" opacity="0.8" fill="none"/>`;
    out += `<circle cx="4" cy="${y}" r="4" fill="${col}"/><circle cx="${nx}" cy="${py}" r="5" fill="${col}"/><text x="${nx - 8}" y="${py - 8}" text-anchor="end" fill="${col}" font-size="10" font-weight="700">${Math.round(x.w * 100)} %</text>`;
  }
  svg.innerHTML = out;
}
function drawLook() {
  const cv = $('pjLook'); if (!cv) return; const g = cv.getContext('2d'), F = FAMILIES[PJ.family], col = PJ.color; g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height);
  if (F.look === 'field') { const gr = g.createRadialGradient(150, 35, 4, 150, 35, 60); gr.addColorStop(0, col + '00'); gr.addColorStop(0.75, col + '55'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.beginPath(); g.ellipse(150, 35, 120, 30, 0, 0, 7); g.fill(); g.strokeStyle = col; g.globalAlpha = 0.7; g.beginPath(); g.ellipse(150, 35, 110, 26, 0, 0, 7); g.stroke(); g.globalAlpha = 1; return; }
  g.fillStyle = '#556079'; g.beginPath(); g.arc(34, 35, 14, 0, 7); g.fill(); g.fillStyle = '#8b97b3'; g.fillRect(34, 31, 26, 8);   // a stand-in turret
  g.save(); g.shadowColor = col; g.shadowBlur = 16; g.strokeStyle = col; g.lineWidth = 6; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(62, 35); g.lineTo(290, 35); g.stroke(); g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(62, 35); g.lineTo(290, 35); g.stroke(); g.restore();
}
function refreshLive() { if (!ctx) return; const o = $('pjOut'); if (o) o.innerHTML = outHtml(ctx.c, ctx.S); const n = $('rNode'); if (n) n.innerHTML = nodeHtml(ctx.c, ctx.S); decorate(); drawFlow(); keep(); }
// the field list on the left: the recipe's fields light up with their share
function decorate() {
  if (!ctx) return; const F = FAMILIES[PJ.family];
  for (const row of document.querySelectorAll('#eFields .frow[data-field]')) {
    const id = row.dataset.field, w = F.recipe[id]; row.classList.toggle('rec', !!w); row.style.setProperty('--rc', FIELD_COL[id] || '#888');
    let tag = row.querySelector('.rtag2'); if (w && !tag) { tag = document.createElement('span'); tag.className = 'rtag2'; row.querySelector('.top .name')?.after(tag); }
    if (tag) { if (w) tag.textContent = `→ ${F.name.toLowerCase()} ${Math.round(w * 100)} %`; else tag.remove(); }
  }
}
// the tab draws it: the game's figures (c), the state (S)
export function renderProjects(c, S) {
  ctx = { c, S }; const side = $('rProj'), node = $('rNode'); if (!side || !node) return;
  const fam = side.dataset.fam; if (fam !== PJ.family || !side.innerHTML) { side.innerHTML = panelHtml(c, S); side.dataset.fam = PJ.family; } else { const o = $('pjOut'); if (o) o.innerHTML = outHtml(c, S); }
  node.innerHTML = nodeHtml(c, S); decorate(); drawLook(); requestAnimationFrame(drawFlow);
}
function play() {
  cancelAnimationFrame(raf); const t0 = performance.now();
  const tick = () => { prog = Math.min(1, (performance.now() - t0) / MOCK.previewMs); const n = $('rNode'); if (n && ctx) n.innerHTML = nodeHtml(ctx.c, ctx.S); drawFlow(); if (prog < 1) raf = requestAnimationFrame(tick); else setTimeout(() => { prog = null; refreshLive(); }, 2500); };
  raf = requestAnimationFrame(tick);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pjfam], [data-pjboost], [data-pjplay]'); if (!t || !ctx) return;
  if (t.dataset.pjfam) { if (PJ.family !== t.dataset.pjfam) { PJ.family = t.dataset.pjfam; PJ.name = ''; PJ.boost = []; prog = null; keep(); renderProjects(ctx.c, ctx.S); } return; }
  if (t.dataset.pjboost) { const id = t.dataset.pjboost; PJ.boost = PJ.boost.includes(id) ? PJ.boost.filter(x => x !== id) : [...PJ.boost, id]; return refreshLive(); }
  if (t.hasAttribute('data-pjplay')) return play();
});
document.addEventListener('input', e => {
  const t = e.target; if (!ctx) return;
  if (t.dataset.pjaim != null) { PJ.aim[+t.dataset.pjaim] = +t.value; const v = document.querySelector(`[data-pjaimv="${t.dataset.pjaim}"]`); if (v) v.textContent = `+${t.value} %`; return refreshLive(); }
  if (t.hasAttribute('data-pjname')) { PJ.name = t.value; const n = $('rNode'); if (n) n.innerHTML = nodeHtml(ctx.c, ctx.S); return keep(); }
  if (t.hasAttribute('data-pjcolor')) { PJ.color = t.value; drawLook(); return keep(); }
});
document.addEventListener('scroll', e => { if (e.target && e.target.id === 'rFieldsSec') drawFlow(); }, true);
window.addEventListener('resize', () => drawFlow());
