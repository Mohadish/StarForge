// THE FLEET GENERATOR — a page of its own (fleet.html). Price, ships, a plating style and two picked colours
// (a sample ship wears them live), then grand tactics with shares → Compose → every ship with its price slider,
// lock, words and its painted picture; Edit opens a ship: chips, its silhouette (double-tap the picture to
// reshape the outline — the painter's editor), its price. Everything is one FLEET2 code to copy into the lab.
import { designFromWords, designFromChips, shipFromDesign, archetype, rng32 } from './battle.js';
import { KINDS, PRESETS } from './modules.js';
import { TEMPLATES, hullDef, setUserHulls, areaOf, bboxOf, HULL_VOLUME } from './hull.js';
import { lookFromColors, styleChoices, spriteOf } from './skins.js';
import { TACTICS, TACTIC_IDS, composePlan, setCost, buildPlan, shipLabel, wordsToChips, chipsToWords, plansLoad, plansSave, planStrip, planCode, planFromCode } from './fleetplan.js';
import { createShapeEditor, GW, GH } from './shapeedit.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();
const S = { breakthroughs: [] };
const HULL_KEY = 'forge.eon.hulls.v1';
let HULLS = []; try { HULLS = JSON.parse(localStorage.getItem(HULL_KEY) || '[]') || []; } catch (e) { HULLS = []; }
let PLAN = null, editing = null, lock = null;
const registerHulls = () => setUserHulls([...HULLS, ...Object.values(PLAN && PLAN.hulls || {})]);
const look = () => lookFromColors($('style').value, $('colA').value, $('colB').value);

// ---------------- painting a ship into a canvas ----------------
function drawShip(cv, ship, lk, after) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H);
  if (!ship) return;
  const sp = spriteOf(ship, lk, () => { if (cv.isConnected) drawShip(cv, ship, lk, after); });
  if (sp) { const q = Math.min((W - 16) / sp.w, (H - 16) / sp.h); g.drawImage(sp.cv, W / 2 - sp.w * q / 2, H / 2 - sp.h * q / 2, sp.w * q, sp.h * q); cv._k = sp.S * q; }
  else {                                                                           // the plate until the sheets are in
    const hull = ship.ds.hull, k = Math.min((W - 24) / hull.bw, (H - 24) / hull.bh), midx = (hull.box.minx + hull.box.maxx) / 2;
    g.beginPath(); hull.poly.forEach(([x, y], i) => { const X = W / 2 + (x - midx) * k, Y = H / 2 + y * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
    g.fillStyle = lk.washA; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#e8f0ff'; g.lineWidth = 1.5; g.stroke(); cv._k = k;
  }
  if (after) after(g);
}
// the sample: a standard dart of about 1200, in the chosen coat
let sample = null;
function drawSample() {
  if (!sample) { const d = designFromWords(S, '4 beams + armoured + shielded', 1200, rng32(5)); d.hull = 'dart'; sample = shipFromDesign(S, d); }
  drawShip($('sample'), sample, look());
}

// ---------------- step 1: price, ships, coat, tactics ----------------
function init() {
  $('style').innerHTML = styleChoices().map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('tactics').innerHTML = TACTIC_IDS.map(id => `<div class="trow"><label class="chk"><input type="checkbox" data-on="${id}"> <b>${TACTICS[id].name}</b></label><input type="range" data-share="${id}" min="0" max="100" value="50" disabled><span data-pct="${id}" class="pct">—</span><span class="tiny what">${TACTICS[id].what}</span></div>`).join('');
  for (const id of ['style', 'colA', 'colB']) $(id).addEventListener('input', () => { drawSample(); if (PLAN) { PLAN.style = $('style').value; PLAN.colA = $('colA').value; PLAN.colB = $('colB').value; renderFleet(); } });
  $('tactics').addEventListener('change', e => { if (e.target.matches('[data-on]') && mix().length > 3) { e.target.checked = false; note('Three tactics at most — untick one first.'); } shares(); });
  $('tactics').addEventListener('input', e => { if (e.target.matches('[data-share]')) shares(); });
  refreshSaved(); shares(); drawSample();
}
const mix = () => TACTIC_IDS.filter(id => $('tactics').querySelector(`[data-on="${id}"]`).checked).map(id => ({ id, share: +$('tactics').querySelector(`[data-share="${id}"]`).value }));
function shares() {
  const m = mix(), tot = m.reduce((a, x) => a + x.share, 0) || 1;
  for (const id of TACTIC_IDS) { const on = m.find(x => x.id === id); $('tactics').querySelector(`[data-share="${id}"]`).disabled = !on; $('tactics').querySelector(`[data-pct="${id}"]`).textContent = on ? Math.round(100 * on.share / tot) + '%' : '—'; }
}
const note = (html, where = 'note') => { $(where).innerHTML = html; };
function compose() {
  const m = mix(); if (!m.length) { note('Tick at least one tactic.', 'note1'); return; }
  const budget = Math.min(20000, Math.max(150, +$('budget').value || 6000)), n = Math.max(1, Math.min(25, Math.floor(budget / 150), Math.round(+$('n').value || 8)));
  $('n').value = n;
  PLAN = composePlan({ budget, n, mix: m, seed: Math.floor(Math.random() * 1e6), name: $('name').value.trim() || 'My fleet', style: $('style').value });
  PLAN.colA = $('colA').value; PLAN.colB = $('colB').value; PLAN.hulls = {};
  closeEditor(); rebuild(); $('fleet').hidden = false; $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function rebuild() { if (!PLAN) return; registerHulls(); buildPlan(S, PLAN); renderFleet(); }

// ---------------- step 2: the ships ----------------
function renderFleet() {
  const p = PLAN, lk = look(), built = p.ships.filter(s => s.built), total = built.reduce((a, s) => a + s.built.cost, 0);
  note(`<b>${esc(p.name)}</b>: ${p.ships.length} ships · ${p.mix.map(m => `${TACTICS[m.id].name} ${Math.round(m.share * 100)}%`).join(', ')} · planned ${fmt(p.budget)}, built ${fmt(total)}${Math.abs(total - p.budget) / p.budget > 0.08 ? ' <span style="color:var(--warn)">(some ships could not be brought to their price exactly — see "built")</span>' : ''}. Drag a price and the unlocked others pay for it. <b>Edit</b> opens a ship.`);
  $('ships').innerHTML = p.ships.map((s, i) => {
    const b = s.built, max = p.budget - p.ships.filter((o, j) => j !== i && o.locked).reduce((a, o) => a + o.cost, 0) - p.ships.filter((o, j) => j !== i && !o.locked).length * 150;
    return `<div class="ship"><div class="left"><div class="n"><button class="x" data-lock="${i}" title="${s.locked ? 'locked: its price stays put' : 'lock its price'}">${s.locked ? '🔒' : '🔓'}</button><b>${b ? esc(b.name) : i + 1}</b><span class="arch">${esc(shipLabel(s))}${b ? ' · ' + esc(b.arch.label) : ''}</span><button class="x" data-edit="${i}">Edit</button><span class="rec"><span data-show="${i}">${fmt(s.cost)}</span>${b && Math.abs(b.cost - s.cost) / s.cost > 0.08 ? ` <small>built ${fmt(b.cost)}</small>` : ''}</span></div>
      <input type="range" data-cost="${i}" min="150" max="${Math.max(150, Math.round(max))}" value="${Math.round(s.cost)}" ${s.locked ? 'disabled' : ''}>
      <input type="text" data-words="${i}" value="${esc(s.words)}" title="the ship in words — edit and press Enter">
      <div class="tiny">${b ? `${esc((hullDef(b.design.hull) || {}).name || b.design.hull)} · hull ${fmt(b.hpMax)}${b.arMax ? ` · armour ${fmt(b.arMax)}` : ''} · shield ${fmt(b.shMax)} · ${fmt(b.dps)} dmg/s · reach ${b.pref} · speed ${fmt(b.speed)} · turns ${Math.round(b.turn || 0)}°/s · evasion ${Math.round(b.evade * 100)}%` : '<span style="color:var(--bad)">could not build this one at this price</span>'}</div></div>
      <canvas class="pic" data-pic="${i}" width="220" height="124" title="Edit to open it"></canvas></div>`; }).join('');
  for (const cv of $('ships').querySelectorAll('[data-pic]')) { const s = p.ships[+cv.dataset.pic]; drawShip(cv, s.built, lk); }
  $('code').value = planCode({ ...p, style: $('style').value, colA: $('colA').value, colB: $('colB').value });
  if (editing != null) refreshEditor();
}
$('ships').addEventListener('input', e => { const c = e.target.closest('[data-cost]'); if (c) { const show = $('ships').querySelector(`[data-show="${c.dataset.cost}"]`); if (show) show.textContent = fmt(+c.value); } });
$('ships').addEventListener('change', e => {
  const c = e.target.closest('[data-cost]'); if (c && PLAN) { setCost(PLAN, +c.dataset.cost, +c.value); rebuild(); return; }
  const w = e.target.closest('[data-words]'); if (w && PLAN) { const s = PLAN.ships[+w.dataset.words]; s.words = w.value.trim() || s.words; s.custom = true; s.chips = null; rebuild(); }
});
$('ships').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-words]')) e.target.blur(); });
$('ships').addEventListener('click', e => {
  const l = e.target.closest('[data-lock]'); if (l) { const s = PLAN.ships[+l.dataset.lock]; s.locked = !s.locked; renderFleet(); return; }
  const ed = e.target.closest('[data-edit]') || e.target.closest('[data-pic]'); if (ed) openEditor(+(ed.dataset.edit ?? ed.dataset.pic));
});

// ---------------- the ship editor: chips, silhouette, price; double-tap the picture to reshape the outline ----------------
const CHIPS = { weapon: [['weapon_energy', 'Beam'], ['weapon_kinetic', 'Gun'], ['weapon_missile', 'Missile'], ['hangar', 'Drones']],
  role: [['sniper', 'Sniper'], ['capital', 'Capital'], ['pd', 'Point defence'], ['antishield', 'Anti-shield'], ['antiarmor', 'Anti-armour']],
  trait: [['armor', 'Armoured'], ['shield', 'Shielded'], ['fast', 'Fast'], ['fab', 'Fabricator']] };
const CHIPC = { weapon_energy: '#5fe3d0', weapon_kinetic: '#ffb347', weapon_missile: '#ff8a6b', hangar: '#ffe08a', armor: '#c9d4e8', shield: '#cf89ff', fast: '#7ef3b0', fab: '#ffb347' };
let tray = [], traySel = null, chipId = 1, preview = null;
const chipHtml = (type, key, label) => `<span class="chipb ${type}" data-chip="${type}:${key}" style="--c:${CHIPC[key] || '#ffd26a'}">${label}</span>`;
function renderTray() {
  $('palette').innerHTML = `<div class="prow"><span class="tiny">Weapons</span>${CHIPS.weapon.map(([k, l]) => chipHtml('weapon', k, l)).join('')}</div><div class="prow"><span class="tiny">Roles</span>${CHIPS.role.map(([k, l]) => chipHtml('role', k, l)).join('')}</div><div class="prow"><span class="tiny">Traits</span>${CHIPS.trait.map(([k, l]) => chipHtml('trait', k, l)).join('')}</div>`;
  const label = s => s.type === 'weapon' ? CHIPS.weapon.find(c => c[0] === s.kind)[1] : CHIPS.trait.find(c => c[0] === s.kind)[1];
  $('tray').innerHTML = tray.map(s => `<span class="stack ${s.id === traySel ? 'sel' : ''}" data-stack="${s.id}" style="--c:${CHIPC[s.kind]}"><b>${label(s)}</b>${s.h > 1 ? `<i class="hh">×${s.h}</i>` : ''}${s.role ? `<small>${CHIPS.role.find(c => c[0] === s.role)[1]}</small>` : ''}<button class="x" data-unstack="${s.id}" title="one off">−</button></span>`).join('') || '<span class="tiny">Empty. Tap or drag chips from above; drop a chip on a stack to pile it up; drop a role on a weapon to give it that role.</span>';
  previewShip();
}
function dropChip(type, key, onStack) {
  const s = onStack != null ? tray.find(x => x.id === onStack) : null;
  if (type === 'role') { const w = s && s.type === 'weapon' ? s : tray.find(x => x.id === traySel && x.type === 'weapon') || tray.filter(x => x.type === 'weapon').at(-1); if (w) { w.role = w.role === key ? null : key; traySel = w.id; } }
  else if (s && s.kind === key) { s.h++; traySel = s.id; }
  else if (type === 'trait' && tray.some(x => x.kind === key) && !s) { const x = tray.find(x => x.kind === key); x.h++; traySel = x.id; }
  else { const n = { id: chipId++, type, kind: key, h: 1, role: null }; tray.push(n); traySel = n.id; }
  renderTray();
}
{ // drag a chip (or tap it)
  let drag = null, ghost = null;
  const under = (x, y) => { if (ghost) ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return el; };
  document.addEventListener('pointerdown', e => { const c = e.target.closest('[data-chip]'); if (!c) return; const [type, key] = c.dataset.chip.split(':'); drag = { type, key, x: e.clientX, y: e.clientY, moved: false, el: c }; try { c.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } e.preventDefault(); });
  document.addEventListener('pointermove', e => { if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return; if (!drag.moved) { drag.moved = true; ghost = drag.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); } ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]'); for (const s of document.querySelectorAll('[data-stack]')) s.classList.toggle('over', s === st); });
  const end = e => { if (!drag) return; const d = drag; drag = null; for (const s of document.querySelectorAll('[data-stack]')) s.classList.remove('over'); if (ghost) { ghost.remove(); ghost = null; } if (!d.moved) return dropChip(d.type, d.key, null); const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]'); if (st) return dropChip(d.type, d.key, +st.dataset.stack); if (el?.closest?.('#tray') || el?.closest?.('#editor')) return dropChip(d.type, d.key, null); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => { const u = e.target.closest('[data-unstack]'); if (u) { const s = tray.find(x => x.id === +u.dataset.unstack); if (s) { s.h--; if (s.h <= 0) tray = tray.filter(x => x !== s); } return renderTray(); } const st = e.target.closest('[data-stack]'); if (st) { traySel = +st.dataset.stack; return renderTray(); } });
}
const hullChoices = () => [...Object.values(TEMPLATES).filter(t => t.klass === 'starship'), ...HULLS.filter(h => (h.klass || 'starship') === 'starship'), ...Object.values(PLAN && PLAN.hulls || {})];
function openEditor(i) {
  editing = i; const s = PLAN.ships[i]; if (!s) return;
  tray = (s.chips ? s.chips.map(c => ({ ...c })) : wordsToChips(s.words)).map(c => ({ ...c, id: chipId++ })); traySel = tray.length ? tray[0].id : null;
  $('editor').hidden = false; refreshEditor(); renderTray(); $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeEditor() { editing = null; $('editor').hidden = true; if (ed.editing) ed.editing = false; }
function refreshEditor() {
  const s = PLAN.ships[editing]; if (!s) return closeEditor();
  const b = s.built, p = PLAN, max = p.budget - p.ships.filter((o, j) => j !== editing && o.locked).reduce((a, o) => a + o.cost, 0) - p.ships.filter((o, j) => j !== editing && !o.locked).length * 150;
  $('edTitle').innerHTML = `<b>${b ? esc(b.name) : editing + 1}</b> of ${esc(p.name)} <span class="arch">${esc(shipLabel(s))}</span>`;
  $('edCost').min = 150; $('edCost').max = Math.max(150, Math.round(max)); $('edCost').value = Math.round(s.cost); $('edCost').disabled = !!s.locked; $('edCostShow').textContent = fmt(s.cost) + (s.locked ? ' 🔒' : '');
  const cur = s.hull || (b ? b.design.hull : 'dart');
  $('edHull').innerHTML = hullChoices().map(h => `<option value="${esc(h.id)}" ${h.id === cur ? 'selected' : ''}>${esc(h.name)}${h.user || (PLAN.hulls && PLAN.hulls[h.id]) ? ' · yours' : ''}</option>`).join('');
  if (!ed.editing) { lock = null; drawShip($('edPic'), b, look()); }
}
function previewShip() {                                                          // the chips, built live at the ship's price
  if (editing == null) return; const s = PLAN.ships[editing];
  const d = tray.length ? designFromChips(S, tray.map(c => ({ kind: c.kind, h: c.h, role: c.role })), s.cost, rng32(s.seed)) : null;
  if (!d) { $('trayNote').textContent = tray.length ? 'Add at least one weapon.' : 'The ship as it is. Change the chips and Build it.'; preview = null; return; }
  const hull = $('edHull').value; if (hull && hullDef(hull)) d.hull = hull;
  preview = shipFromDesign(S, d); preview.arch = archetype(preview);
  const t = preview.t; $('trayNote').innerHTML = `<b>${esc(chipsToWords(tray))}</b> → cost ${fmt(t.cost)} · hull ${fmt(t.hp)}${t.armor ? ` · armour ${fmt(t.armor)}` : ''} · shield ${fmt(t.shieldRaw)} · ${fmt(t.dps)} dmg/s · speed ${fmt(t.speed)} · turns ${Math.round(t.turn)}°/s · evasion ${Math.round(t.evasion)}%${Math.abs(t.cost - s.cost) / s.cost > 0.08 ? ' <span style="color:var(--warn)">(not quite at the price)</span>' : ''} — <b>Build it</b> puts it in the fleet.`;
  if (!ed.editing) drawShip($('edPic'), preview, look());
}
function applyChips() {
  if (editing == null || !tray.length) return; const s = PLAN.ships[editing];
  s.chips = tray.map(c => ({ kind: c.kind, h: c.h, role: c.role })); s.words = chipsToWords(s.chips); s.custom = true; s.hull = $('edHull').value || s.hull;
  rebuild(); $('trayNote').innerHTML = `Built into the fleet at ${fmt(s.cost)}.`;
}
$('edApply').onclick = applyChips;
$('edDone').onclick = () => { closeEditor(); $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('edCost').addEventListener('input', () => { $('edCostShow').textContent = fmt(+$('edCost').value); });
$('edCost').addEventListener('change', () => { setCost(PLAN, editing, +$('edCost').value); rebuild(); });
$('edHull').addEventListener('change', () => { const s = PLAN.ships[editing]; s.hull = $('edHull').value; rebuild(); });
$('edLock').onclick = () => { const s = PLAN.ships[editing]; s.locked = !s.locked; renderFleet(); };

// the outline editor on the big picture (the painter's): the ship is held still while its points are dragged
const scaleInfo = (poly, volume) => { const a0 = areaOf(poly) || 1, b = bboxOf(poly); return { s: Math.sqrt(Math.max(volume / HULL_VOLUME, 0.5) / a0), cx: (b.minx + b.maxx) / 2, cy: (b.miny + b.maxy) / 2 }; };
function currentLock() {
  const s = PLAN.ships[editing], ship = preview || s.built, vol = ship ? ship.t.volume : 300, f = ed.fullPoly(), raw = f.length >= 3 && ed.valid() ? f : (hullDef(s.hull || ship.design.hull) || TEMPLATES.dart).poly;
  const { s: sc, cx, cy } = scaleInfo(raw, vol), cv = $('edPic'), b = bboxOf(raw), W = cv.width, H = cv.height, margin = 0.14;
  return { s: sc, cx, cy, S: Math.min(W * (1 - 2 * margin) / ((b.maxx - b.minx) * sc || 1), H * (1 - 2 * margin) / ((b.maxy - b.miny) * sc || 1)) };
}
const ed = createShapeEditor($('edPic'), {
  frame() { const L = lock || currentLock(), cv = $('edPic'); return { toPx: ([gx, gy]) => [cv.width / 2 + (gx - GW / 2 - L.cx) * L.s * L.S, cv.height / 2 + (gy - GH / 2 - L.cy) * L.s * L.S], fromPx: ([px, py]) => [(px - cv.width / 2) / (L.s * L.S) + L.cx + GW / 2, (py - cv.height / 2) / (L.s * L.S) + L.cy + GH / 2] }; },
  changed(what) {
    if (editing == null) return;
    if (what === 'start') { const s = PLAN.ships[editing], h = (PLAN.hulls && PLAN.hulls[s.hull]) || hullDef(s.hull || (s.built ? s.built.design.hull : 'dart')); if (h) ed.load(h); lock = currentLock(); $('outBar').hidden = false; $('outName').value = ed.state().name || ''; $('outSym').value = ed.state().sym || ''; }
    if (what === 'end') { lock = null; $('outBar').hidden = true; refreshEditor(); return; }
    if (what === 'dragstart') lock = lock || currentLock();
    if (what === 'edit' || what === 'dragend') lock = currentLock();
    drawOutline();
  },
});
function drawOutline() {                                                          // the outline over the plate of the shape being drawn
  const cv = $('edPic'), g = cv.getContext('2d'), L = lock || currentLock(), f = ed.fullPoly();
  g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height);
  if (f.length >= 3) { g.beginPath(); f.forEach(([x, y], i) => { const X = cv.width / 2 + (x - L.cx) * L.s * L.S, Y = cv.height / 2 + (y - L.cy) * L.s * L.S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.fillStyle = look().washA; g.globalAlpha = 0.35; g.fill('evenodd'); g.globalAlpha = 1; }
  ed.draw(g);
}
$('outSave').onclick = () => {
  if (!ed.valid()) { $('outNote').textContent = 'Not a shape yet — three points and some area.'; return; }
  const s = PLAN.ships[editing], name = $('outName').value.trim() || ed.state().name || 'My silhouette', h = ed.build(name); h.name = name; h.klass = 'starship';
  PLAN.hulls = PLAN.hulls || {}; PLAN.hulls[h.id] = h; s.hull = h.id; ed.state().id = h.id;
  ed.editing = false; registerHulls(); rebuild(); $('outNote').textContent = `"${name}" is this ship's silhouette now (it travels inside the fleet code).`;
};
$('outCancel').onclick = () => { ed.editing = false; };
$('outSym').onchange = () => ed.setSym($('outSym').value);
$('outUndo').onclick = () => ed.undo();

// ---------------- the code, the lab, saving ----------------
$('compose').onclick = compose;
$('recompose').onclick = () => { $('fleet').hidden = true; closeEditor(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
$('copy').onclick = async () => { const c = $('code'); c.select(); try { await navigator.clipboard.writeText(c.value); $('codeNote').textContent = 'Copied — paste it into the lab as Fleet 1 or Fleet 2.'; } catch (e) { document.execCommand && document.execCommand('copy'); $('codeNote').textContent = 'Selected — copy it.'; } };
$('toLab').onclick = () => { if (!PLAN) return; location.href = 'lab.html#fleetA=' + encodeURIComponent($('code').value); };
function refreshSaved() { const list = plansLoad(); $('saved').innerHTML = '<option value="">saved fleets…</option>' + list.map((p, i) => `<option value="${i}">${esc(p.name)} · ${p.ships.length} ships · ${fmt(p.budget)}</option>`).join(''); }
$('save').onclick = () => { if (!PLAN) return; const list = plansLoad().filter(p => p.name !== PLAN.name); list.unshift(planStrip({ ...PLAN, style: $('style').value, colA: $('colA').value, colB: $('colB').value })); plansSave(list); refreshSaved(); $('saved').value = '0'; $('codeNote').textContent = `Saved "${PLAN.name}" in this browser.`; };
function loadPlan(p) {
  if (!p) return; PLAN = { ...p, ships: p.ships.map(s => ({ ...s })), hulls: p.hulls || {} };
  $('budget').value = p.budget; $('n').value = p.ships.length; $('name').value = p.name || 'My fleet'; if (p.style) $('style').value = p.style; if (p.colA) $('colA').value = p.colA; if (p.colB) $('colB').value = p.colB;
  for (const id of TACTIC_IDS) { const m = (p.mix || []).find(x => x.id === id); $('tactics').querySelector(`[data-on="${id}"]`).checked = !!m; if (m) $('tactics').querySelector(`[data-share="${id}"]`).value = Math.round(m.share * 100); }
  shares(); drawSample(); closeEditor(); rebuild(); $('fleet').hidden = false;
}
$('load').onclick = () => { const i = $('saved').value; if (i !== '') loadPlan(plansLoad()[+i]); };
$('codeIn').onclick = () => { const p = planFromCode($('code').value); if (!p) { $('codeNote').textContent = 'That is not a fleet code.'; return; } loadPlan(p); $('codeNote').textContent = 'Taken in.'; };
init();
