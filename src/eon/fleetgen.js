// THE FLEET GENERATOR — a page of its own (fleet.html). At the top, the fight: Fleet 1 and Fleet 2 as codes (click a
// box for your saved fleets, or paste), a picture of each fleet, ⚔ Fight — and the battle plays right there, in a
// frame of the lab in arena mode (lab.html#arena). Below it the composer: price, ships, a plating style and two
// picked colours (a sample ship wears them live), grand tactics with shares → Compose → every ship with its price
// slider, lock, words and its painted picture; Edit opens a ship: chips, its silhouette (double-tap the picture to
// reshape the outline — the painter's editor), its price. Everything is one FLEET2 code.
import { designFromWords, designFromChips, shipFromDesign, archetype, rng32, systemsOf } from './battle.js';
import { KINDS, PRESETS } from './modules.js';
import { TEMPLATES, hullDef, setUserHulls, areaOf, bboxOf, HULL_VOLUME } from './hull.js';
import { lookFromColors, styleChoices, spriteOf, thumbOf } from './skins.js';
import { STYLES, loadStyle } from './styles.js';
import { paintHull, recipeFor } from './paint.js';
import { TACTICS, TACTIC_IDS, composePlan, setCost, buildPlan, shipLabel, wordsToChips, chipsToWords, planStrip, planCode, planFromCode, exportAllText } from './fleetplan.js';
import { createShapeEditor, GW, GH } from './shapeedit.js';
import { readLocal, loadLibrary, saveLibrary, readFleets, loadFleets, saveFleets } from './library.js';
import { renderStrip, createDialog, createMenu, saveFlow } from './hullui.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();
const S = { breakthroughs: [] };
let HULLS = readLocal();                                                        // the painter's library (library.js): the browser's copy at once…
let PLAN = null, editing = null, lock = null;
const registerHulls = () => setUserHulls([...HULLS, ...Object.values(PLAN && PLAN.hulls || {})]);
// …and the page's own store (a published page) a moment later: its list takes over and the hull choices refresh
loadLibrary().then(r => { if (r.durable) { HULLS = r.list; registerHulls(); if (editing !== null) refreshEditor(); } });
// the SAVED FLEETS, kept the same way (library.js): the browser's copy at once, the page's store a moment later
const withId = p => p.id ? p : { ...p, id: 'f' + Math.random().toString(36).slice(2, 9) };
let PLANS = readFleets().map(withId);
const savePlans = list => { PLANS = list; saveFleets(list); };
loadFleets().then(r => { if (r.durable) { PLANS = r.list.map(withId); renderFleetStrip(); } });
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
  shares(); drawSample(); showSide('A'); showSide('B'); renderFleetStrip();
}
const mix = () => TACTIC_IDS.filter(id => $('tactics').querySelector(`[data-on="${id}"]`).checked).map(id => ({ id, share: +$('tactics').querySelector(`[data-share="${id}"]`).value }));
function shares() {
  const m = mix(), tot = m.reduce((a, x) => a + x.share, 0) || 1;
  for (const id of TACTIC_IDS) { const on = m.find(x => x.id === id); $('tactics').querySelector(`[data-share="${id}"]`).disabled = !on; $('tactics').querySelector(`[data-pct="${id}"]`).textContent = on ? Math.round(100 * on.share / tot) + '%' : '—'; }
}
const note = (html, where = 'note') => { $(where).innerHTML = html; };
function compose() {
  const m = mix(); if (!m.length) { note('Tick at least one tactic.', 'note1'); return; }
  const budget = Math.min(60000, Math.max(150, +$('budget').value || 6000)), n = Math.max(1, Math.min(25, Math.floor(budget / 150), Math.round(+$('n').value || 8)));
  $('n').value = n;
  PLAN = composePlan({ budget, n, mix: m, seed: Math.floor(Math.random() * 1e6), name: $('name').value.trim() || 'My fleet', style: $('style').value });
  PLAN.colA = $('colA').value; PLAN.colB = $('colB').value; PLAN.hulls = {};
  closeEditor(); rebuild(); $('fleet').hidden = false; $('codeCard').hidden = false; $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      <div class="tiny">${b ? `${esc((hullDef(b.design.hull) || {}).name || b.design.hull)} · hull ${fmt(b.hpMax)}${b.arMax ? ` · armour ${fmt(b.arMax)}` : ''} · shield ${fmt(b.shMax)} · ${fmt(b.dps)} dmg/s · reach ${b.pref} · speed ${fmt(b.speed)} · turns ${Math.round(b.turn || 0)}°/s · evasion ${Math.round(b.evade * 100)}%<br>${esc(systemsOf(b))}` : '<span style="color:var(--bad)">could not build this one at this price</span>'}</div></div>
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
// the silhouettes to choose from (the painter's strip, hullui.js): the built-in shapes (the shipped pack among them, unless his
// library holds that very shape), then his library, then what came with this fleet's code
const hullItems = () => {
  const mine = HULLS.filter(h => (h.klass || 'starship') === 'starship'), mineIds = new Set(mine.map(h => h.id));
  return [...Object.values(TEMPLATES).filter(t => t.klass === 'starship' && !mineIds.has(t.id)).map(h => ({ h, group: 'built' })), ...mine.map(h => ({ h, group: 'mine' })),
    ...Object.values(PLAN && PLAN.hulls || {}).filter(h => !mineIds.has(h.id)).map(h => ({ h, group: 'fleet' }))];
};
const curHull = () => { const s = PLAN.ships[editing]; return s.hull || (s.built ? s.built.design.hull : 'dart'); };
const hdlg = createDialog(), hmenu = createMenu();
function renderHullStrip() {
  const s = PLAN.ships[editing]; if (!s) return;
  renderStrip($('edHullStrip'), hullItems(), ed.editing ? ed.state().id || curHull() : curHull(), {
    onPick: h => {                                                              // while the outline is open the editor takes the new shape; otherwise the ship wears it
      if (ed.editing) { ed.load(h); lock = currentLock(); syncOutBar(); drawOutline(); renderHullStrip(); return; }
      s.hull = h.id; rebuild(); if (editing != null) renderHullStrip();
    },
    onMenu: (x, y, h) => hmenu.open(x, y, [
      { label: 'Rename…', run: async () => { const name = await hdlg.rename(h); if (!name) return; h.name = name; saveLibrary(HULLS); registerHulls(); renderHullStrip(); if (ed.editing) syncOutBar(); } },
      { label: 'Delete', run: async () => { if (!(await hdlg.confirmDelete(h))) return; HULLS = HULLS.filter(x => x.id !== h.id); saveLibrary(HULLS); registerHulls(); for (const o of PLAN.ships) if (o.hull === h.id && !(PLAN.hulls && PLAN.hulls[h.id])) o.hull = null; if (ed.editing && ed.state().id === h.id) ed.editing = false; rebuild(); renderHullStrip(); } },
    ]),
  });
}
const mineOf = id => HULLS.find(h => h.id === id) || null;
function syncOutBar() { const st = ed.state(), mine = mineOf(st.id); $('outWho').textContent = mine ? `Editing ${mine.name} (yours)` : `From ${(st.name || '').replace(/ II$/, '')} — Save makes a new one`; $('outSym').value = st.sym || ''; $('outDelete').hidden = !mine; }
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
  renderHullStrip();
  if (!ed.editing) { lock = null; drawShip($('edPic'), b, look()); }
}
function previewShip() {                                                          // the chips, built live at the ship's price
  if (editing == null) return; const s = PLAN.ships[editing];
  const d = tray.length ? designFromChips(S, tray.map(c => ({ kind: c.kind, h: c.h, role: c.role })), s.cost, rng32(s.seed)) : null;
  if (!d) { $('trayNote').textContent = tray.length ? 'Add at least one weapon.' : 'The ship as it is. Change the chips and Build it.'; preview = null; return; }
  const hull = curHull(); if (hull && hullDef(hull)) d.hull = hull;
  preview = shipFromDesign(S, d); preview.arch = archetype(preview);
  const t = preview.t; $('trayNote').innerHTML = `<b>${esc(chipsToWords(tray))}</b> → cost ${fmt(t.cost)} · hull ${fmt(t.hp)}${t.armor ? ` · armour ${fmt(t.armor)}` : ''} · shield ${fmt(t.shieldRaw)} · ${fmt(t.dps)} dmg/s · speed ${fmt(t.speed)} · turns ${Math.round(t.turn)}°/s · evasion ${Math.round(t.evasion)}%${Math.abs(t.cost - s.cost) / s.cost > 0.08 ? ' <span style="color:var(--warn)">(not quite at the price)</span>' : ''} — <b>Build it</b> puts it in the fleet.<br><span class="tiny">${esc(systemsOf(preview))}</span>`;
  if (!ed.editing) drawShip($('edPic'), preview, look());
}
function applyChips() {
  if (editing == null || !tray.length) return; const s = PLAN.ships[editing];
  s.chips = tray.map(c => ({ kind: c.kind, h: c.h, role: c.role })); s.words = chipsToWords(s.chips); s.custom = true;
  rebuild(); $('trayNote').innerHTML = `Built into the fleet at ${fmt(s.cost)}.`;
}
$('edApply').onclick = applyChips;
$('edDone').onclick = () => { closeEditor(); $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('edCost').addEventListener('input', () => { $('edCostShow').textContent = fmt(+$('edCost').value); });
$('edCost').addEventListener('change', () => { setCost(PLAN, editing, +$('edCost').value); rebuild(); });
$('edLock').onclick = () => { const s = PLAN.ships[editing]; s.locked = !s.locked; renderFleet(); };

// the outline editor on the big picture (the painter's): the ship is held still while its points are dragged
const scaleInfo = (poly, volume) => { const a0 = areaOf(poly) || 1, b = bboxOf(poly); return { s: Math.sqrt(Math.max(volume / HULL_VOLUME, 0.5) / a0), cx: (b.minx + b.maxx) / 2, cy: (b.miny + b.maxy) / 2 }; };
function currentLock() {
  const s = PLAN.ships[editing], ship = preview || s.built, vol = ship ? ship.t.volume : 300, f = ed.fullPoly(), raw = f.length >= 3 && ed.valid() ? f : (hullDef(s.hull || ship.design.hull) || TEMPLATES.dart).poly;
  const { s: sc, cx, cy } = scaleInfo(raw, vol), cv = $('edPic'), b = bboxOf(raw), W = cv.width, H = cv.height, margin = 0.14;
  return { s: sc, cx, cy, S: Math.min(W * (1 - 2 * margin) / ((b.maxx - b.minx) * sc || 1), H * (1 - 2 * margin) / ((b.maxy - b.miny) * sc || 1)) };
}
let outDirty = false;                                                             // the outline was changed since it was opened
const ed = createShapeEditor($('edPic'), {
  frame() { const L = lock || currentLock(), cv = $('edPic'); return { toPx: ([gx, gy]) => [cv.width / 2 + (gx - GW / 2 - L.cx) * L.s * L.S, cv.height / 2 + (gy - GH / 2 - L.cy) * L.s * L.S], fromPx: ([px, py]) => [(px - cv.width / 2) / (L.s * L.S) + L.cx + GW / 2, (py - cv.height / 2) / (L.s * L.S) + L.cy + GH / 2] }; },
  changed(what) {
    if (editing == null) return;
    if (what === 'start') { const s = PLAN.ships[editing], h = (PLAN.hulls && PLAN.hulls[s.hull]) || hullDef(s.hull || (s.built ? s.built.design.hull : 'dart')); if (h) ed.load(h); lock = currentLock(); outDirty = false; $('outBar').hidden = false; syncOutBar(); renderHullStrip(); }
    if (what === 'end') {
      lock = null; $('outBar').hidden = true;
      if (outDirty && ed.valid()) {                                                 // Done keeps what was drawn: the ship wears it at once (a copy of this fleet's own; Save… puts it in the library under a name)
        const s = PLAN.ships[editing], st = ed.state(), local = !!(PLAN.hulls && PLAN.hulls[st.id] && !mineOf(st.id));
        const h = ed.build(st.name || 'outline'); if (!local) { h.id = 'u' + Math.random().toString(36).slice(2, 9); h.name = (st.name || 'outline').replace(/ II$/, '') + ' (edited)'; } h.klass = 'starship';
        PLAN.hulls = PLAN.hulls || {}; PLAN.hulls[h.id] = h; s.hull = h.id; st.id = h.id; st.name = h.name; outDirty = false; registerHulls(); rebuild();
      }
      refreshEditor(); return;
    }
    if (what === 'dragstart') lock = lock || currentLock();
    if (what === 'edit' || what === 'dragend') { lock = currentLock(); outDirty = true; }
    drawOutline();
  },
});
// the sheets of a style, for painting the ship under the outline live (skins.js keeps its own for the sprites)
const SHEETS = new Map();
function sheetsFor(styleId, onReady) {
  const st = STYLES[styleId] && STYLES[styleId].ribbon ? STYLES[styleId] : STYLES.greeble1, k = st.id, had = SHEETS.get(k); if (had) return had === 'loading' ? null : had;
  SHEETS.set(k, 'loading');
  Promise.all([loadStyle(st), st.deco ? Promise.all(st.deco.sheets.map(s => loadStyle({ sheet: s }).catch(() => null))) : null]).then(([img, deco]) => { SHEETS.set(k, { st, img, deco }); if (onReady) onReady(); }).catch(() => SHEETS.set(k, { st, img: null, deco: null }));
  return null;
}
const gunsOf = ship => { const m = new Map(); for (const g of ship.guns || []) { const k = g.kind + '|' + (g.size || 1), e = m.get(k) || { kind: g.kind, n: 0, size: g.size || 1 }; e.n++; m.set(k, e); } return [...m.values()]; };
// the ship PAINTED with the outline as it is being drawn, the outline over it — as in the painter (the plate until the sheets are in)
function drawOutline() {
  const cv = $('edPic'), g = cv.getContext('2d'), L = lock || currentLock(), f = ed.fullPoly(), s = PLAN.ships[editing], ship = preview || (s && s.built);
  const ok = f.length >= 3 && ed.valid(), sheets = ship ? sheetsFor($('style').value, () => { if (ed.editing) drawOutline(); }) : null, lk = look();
  if (ok && sheets && sheets.img) {
    const poly = f.map(([x, y]) => [(x - L.cx) * L.s, (y - L.cy) * L.s]);
    paintHull(cv, poly, sheets.img, sheets.st, { ...recipeFor(ship.t.volume), px: L.S, center: [0, 0], guns: gunsOf(ship), wash: 0.6, washA: lk.washA, washB: lk.washB, lights: 0.5, lightColor: lk.lightColor, background: '#04070f' }, sheets.deco);
  } else {
    g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height);
    if (f.length >= 3) { g.beginPath(); f.forEach(([x, y], i) => { const X = cv.width / 2 + (x - L.cx) * L.s * L.S, Y = cv.height / 2 + (y - L.cy) * L.s * L.S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.fillStyle = lk.washA; g.globalAlpha = 0.35; g.fill('evenodd'); g.globalAlpha = 1; }
  }
  ed.draw(g);
}
// SAVE, the painter's way (hullui.js saveFlow): one of yours → overwrite or a new one, named; a built-in's child → named.
// The shape goes into the LIBRARY (the page's store, shared with the painter) AND into this fleet's code, and the ship wears it.
$('outSave').onclick = async () => {
  if (!ed.valid()) { $('outNote').textContent = 'Not a shape yet — three points and some area.'; return; }
  const s = PLAN.ships[editing], st = ed.state();
  const h = await saveFlow(hdlg, { mine: mineOf(st.id), defaultName: st.name || 'My silhouette', taken: n => HULLS.some(x => x.name.toLowerCase() === n.toLowerCase() && x.id !== st.id), commit: (id, name) => {
    const h = ed.build(name); h.id = id || 'u' + Math.random().toString(36).slice(2, 9); h.name = name; h.klass = 'starship';
    const i = HULLS.findIndex(x => x.id === h.id); if (i >= 0) HULLS[i] = h; else HULLS.push(h); saveLibrary(HULLS);
    PLAN.hulls = PLAN.hulls || {}; PLAN.hulls[h.id] = h; s.hull = h.id; st.id = h.id; st.name = h.name; return h;
  } });
  if (!h) return;
  ed.editing = false; registerHulls(); rebuild(); $('outNote').textContent = `“${h.name}” is this ship's silhouette now — kept in your library, and it travels inside the fleet code.`;
};
$('outDelete').onclick = async () => { const h = mineOf(ed.state().id); if (!h || !(await hdlg.confirmDelete(h))) return; HULLS = HULLS.filter(x => x.id !== h.id); saveLibrary(HULLS); registerHulls(); for (const o of PLAN.ships) if (o.hull === h.id && !(PLAN.hulls && PLAN.hulls[h.id])) o.hull = null; ed.editing = false; rebuild(); };
$('outCancel').onclick = () => { ed.editing = false; };
$('outSym').onchange = () => ed.setSym($('outSym').value);
$('outUndo').onclick = () => ed.undo();

// ---------------- the code, saving, into the fight ----------------
$('compose').onclick = compose;
$('recompose').onclick = () => { $('fleet').hidden = true; $('codeCard').hidden = true; closeEditor(); $('step1').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('copy').onclick = async () => { const c = $('code'); c.select(); try { await navigator.clipboard.writeText(c.value); $('codeNote').textContent = 'Copied — send it to a friend; they paste it into a Fleet box at the top of their generator.'; } catch (e) { document.execCommand && document.execCommand('copy'); $('codeNote').textContent = 'Selected — copy it.'; } };
// a fleet overwritten while it sits in the Fleet 1 / Fleet 2 box at the top: the box takes the new version at once
const syncSlots = rec => { for (const k of ['A', 'B']) { const box = $('code' + k), q = box.value.trim() ? planFromCode(box.value) : null; if (q && q.id === rec.id) { box.value = planCode(rec); showSide(k); } } };
// SAVE, the silhouette editor's way (hullui.js saveFlow): a fleet opened from the ribbon → overwrite it, or keep this one as a
// new fleet (named); a fresh composition → a new fleet, named. Kept with the page (library.js) and shown in the ribbon.
$('save').onclick = async () => {
  if (!PLAN) return;
  const mine = PLANS.find(x => x.id === PLAN.savedId) || null;
  const p = await saveFlow(hdlg, { what: 'fleet', mine, defaultName: PLAN.name || $('name').value.trim() || 'My fleet', taken: n => PLANS.some(x => x.name.toLowerCase() === n.toLowerCase() && x.id !== PLAN.savedId), commit: (id, name) => {
    PLAN.name = name; $('name').value = name;
    const rec = withId({ ...planStrip({ ...PLAN, name, style: $('style').value, colA: $('colA').value, colB: $('colB').value }), id: id || undefined }); delete rec.savedId;
    const list = PLANS.slice(), i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.unshift(rec); savePlans(list); PLAN.savedId = rec.id; return rec;
  } });
  if (!p) return;
  renderFleet(); renderFleetStrip(); syncSlots(p); $('codeNote').innerHTML = `Saved <b>${esc(p.name)}</b> — it is in the ribbon above; drag it onto Fleet 1 or Fleet 2 at the top, or click a Fleet box and pick it.`;
};
const exportAll = () => { const list = PLANS; if (!list.length) { $('fightNote').textContent = 'Nothing saved yet.'; return; } try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportAllText(list)], { type: 'text/plain' })); a.download = 'starforge-fleets.txt'; document.body.appendChild(a); a.click(); a.remove(); $('fightNote').textContent = 'Saved starforge-fleets.txt — every fleet, a line about it and its code.'; } catch (e) { $('codeA').value = exportAllText(list).slice(0, 4000); $('fightNote').textContent = 'Could not save a file here — the text is in the Fleet 1 box; copy it.'; } };
$('toLabTop').onclick = () => { location.href = 'lab.html'; };
function loadPlan(p) {
  if (!p) return; PLAN = { ...p, ships: p.ships.map(s => ({ ...s })), hulls: p.hulls || {} }; PLAN.savedId = p.id || null;   // opened from the ribbon: Save… can overwrite it
  $('budget').value = p.budget; $('n').value = p.ships.length; $('name').value = p.name || 'My fleet'; if (p.style) $('style').value = p.style; if (p.colA) $('colA').value = p.colA; if (p.colB) $('colB').value = p.colB;
  for (const id of TACTIC_IDS) { const m = (p.mix || []).find(x => x.id === id); $('tactics').querySelector(`[data-on="${id}"]`).checked = !!m; if (m) $('tactics').querySelector(`[data-share="${id}"]`).value = Math.round(m.share * 100); }
  shares(); drawSample(); closeEditor(); rebuild(); $('fleet').hidden = false; $('codeCard').hidden = false;
}
$('codeIn').onclick = () => { const p = planFromCode($('code').value); if (!p) { $('codeNote').textContent = 'That is not a fleet code.'; return; } loadPlan(p); $('codeNote').textContent = 'Taken in.'; };

// ---------------- the fight at the top ----------------
// a code box: click it → your saved fleets (→ 1, → 2, ✎ open to edit, ⧉ copy, ⤓ export all); paste or type → the picture under it redraws
// ---------------- the saved fleets: a RIBBON of thumbnails between the fight and the composer (his ask) ----------------
// Each saved fleet as its biggest ship, painted large, with its name, ships, price and tactics; hover (or a tap) shows the
// whole story; right-click or a long press: edit / fight as 1 or 2 / copy the code / rename / delete; drag one onto the
// Fleet 1 or Fleet 2 picture at the top and it is that fleet.
const thumbs = new Map();                                                          // fleet id + its code → the picture, once painted
const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const fleetInfo = p => { const n = p.ships.length, tac = (p.mix || []).map(m => `${TACTICS[m.id] ? TACTICS[m.id].name : m.id} ${Math.round(m.share * 100)}%`).join(', ') || 'custom'; return { short: `${n} ship${n > 1 ? 's' : ''} · ${fmt(p.budget)}`, tac, long: `${p.name} — ${n} ship${n > 1 ? 's' : ''}, ${fmt(p.budget)} · ${tac} · ${(styleChoices().find(s => s.id === p.style) || {}).name || p.style || 'default style'} · ships: ${p.ships.map(s => s.words).join(' / ')}` }; };
function renderFleetStrip() {
  const el = $('fleetStrip'); if (!el) return; el.innerHTML = ''; hideTip();
  if (!PLANS.length) { el.innerHTML = '<div class="tiny" style="padding:8px">No saved fleets yet — compose one below and press Save…</div>'; return; }
  for (const p of PLANS) {
    const t = document.createElement('div'); t.className = 'fthumb'; t.dataset.id = p.id; const info = fleetInfo(p);
    const cv = document.createElement('canvas'); cv.width = 150; cv.height = 100; t.appendChild(cv);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = p.name; t.appendChild(nm);
    const sm = document.createElement('div'); sm.className = 'sm'; sm.textContent = info.short + ' · ' + info.tac; t.appendChild(sm);
    drawFleetThumb(cv, p);
    t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(t, info.long); }); t.addEventListener('pointerleave', hideTip);
    t.onclick = () => { if (t._dragged) return; const tip = $('fleetTip'); if (!tip.hidden && tip._for === t) hideTip(); else showTip(t, info.long); };
    t.oncontextmenu = e => { e.preventDefault(); fleetMenu(e.clientX, e.clientY, p); };
    let hold = 0; t.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; clearTimeout(hold); hold = setTimeout(() => fleetMenu(e.clientX, e.clientY, p), 550); });
    for (const ev of ['pointerup', 'pointermove', 'pointercancel']) t.addEventListener(ev, () => clearTimeout(hold));
    el.appendChild(t);
  }
}
// the picture: the fleet's biggest ship, painted in the fleet's coat (its plate until the sheets are in)
function drawFleetThumb(cv, p) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H);
  const key = p.id + '|' + hashOf(planCode(p)), had = thumbs.get(key);                // the code itself in the key: an overwritten fleet gets a fresh picture at once
  if (had) { g.drawImage(had, 0, (H - W) / 2, W, W); return; }
  const x = fleetOfCode(planCode(p)); if (!x) return;
  const big = x.f.ships.slice().sort((a, b) => b.cost - a.cost)[0], hull = big.ds.hull, k = Math.min((W - 20) / hull.bw, (H - 16) / hull.bh), midx = (hull.box.minx + hull.box.maxx) / 2;
  g.beginPath(); hull.poly.forEach(([px, py], i) => { const X = W / 2 + (px - midx) * k, Y = H / 2 + py * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
  g.fillStyle = x.lk.washA; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#e8f0ff'; g.lineWidth = 1; g.stroke();
  thumbOf(big, x.lk, W).then(c => { if (!c) return; thumbs.set(key, c); if (cv.isConnected) { g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H); g.drawImage(c, 0, (H - W) / 2, W, W); } });
}
function showTip(t, text) { const tip = $('fleetTip'); tip.textContent = text; tip.hidden = false; tip._for = t; const r = t.getBoundingClientRect(); tip.style.left = Math.max(4, Math.min(r.left, innerWidth - 330)) + 'px'; tip.style.top = (r.bottom + 4) + 'px'; }
function hideTip() { const tip = $('fleetTip'); if (tip) { tip.hidden = true; tip._for = null; } }
const putInFight = (k, p) => { $(k === 'A' ? 'codeA' : 'codeB').value = planCode(p); showSide(k); $('fightNote').innerHTML = `<b>${esc(p.name)}</b> is Fleet ${k === 'A' ? 1 : 2}.`; };
const copyCode = p => (navigator.clipboard ? navigator.clipboard.writeText(planCode(p)) : Promise.reject()).then(() => { $('fightNote').innerHTML = `Copied the code of <b>${esc(p.name)}</b>.`; }).catch(() => { $('codeA').value = planCode(p); $('codeA').select(); showSide('A'); $('fightNote').textContent = 'Put in Fleet 1 and selected — copy it from there.'; });
function fleetMenu(x, y, p) {
  hideTip();
  hmenu.open(x, y, [
    { label: '✎ Edit it', run: () => { loadPlan(p); $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    { label: '→ Fight it as Fleet 1', run: () => putInFight('A', p) },
    { label: '→ Fight it as Fleet 2', run: () => putInFight('B', p) },
    { label: '⧉ Copy its code', run: () => copyCode(p) },
    { label: 'Rename…', run: async () => { const name = await hdlg.rename(p); if (!name) return; p.name = name; savePlans(PLANS.slice()); renderFleetStrip(); if (PLAN && PLAN.savedId === p.id) { PLAN.name = name; $('name').value = name; renderFleet(); } } },
    { label: 'Delete', run: async () => { if (!(await hdlg.confirmDelete(p, 'It goes for good.'))) return; savePlans(PLANS.filter(x => x.id !== p.id)); if (PLAN && PLAN.savedId === p.id) PLAN.savedId = null; renderFleetStrip(); } },
  ]);
}
{ // drag a saved fleet onto the Fleet 1 / Fleet 2 picture at the top
  let drag = null, ghost = null;
  const targetAt = (x, y) => { if (ghost) ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return el && (el.closest('#sideA, #codeA') ? 'A' : el.closest('#sideB, #codeB') ? 'B' : null); };
  $('fleetStrip').addEventListener('pointerdown', e => { const t = e.target.closest('.fthumb'); if (!t || e.button) return; drag = { t, id: t.dataset.id, x: e.clientX, y: e.clientY, moved: false }; });
  document.addEventListener('pointermove', e => {
    if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (!drag.moved) { drag.moved = true; drag.t._dragged = true; hideTip(); ghost = drag.t.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; const k = targetAt(e.clientX, e.clientY); $('sideA').classList.toggle('over', k === 'A'); $('sideB').classList.toggle('over', k === 'B');
  });
  const end = e => { if (!drag) return; const d = drag; drag = null; $('sideA').classList.remove('over'); $('sideB').classList.remove('over'); if (ghost) { ghost.remove(); ghost = null; } if (!d.moved) return; const k = targetAt(e.clientX, e.clientY), p = PLANS.find(x => x.id === d.id); if (k && p) { putInFight(k, p); $('fight').scrollIntoView({ behavior: 'smooth', block: 'start' }); } setTimeout(() => { d.t._dragged = false; }, 0); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
}
function showFleetPick(anchor) {
  const box = $('fleetPick'), list = PLANS, r = anchor.getBoundingClientRect();
  box.innerHTML = (list.length ? list.map((p, i) => `<div class="frow"><b title="${esc(p.name)}">${esc(p.name)}</b><small>${p.ships.length} ships · ${fmt(p.budget)}</small><button data-fpk="A:${i}" title="into Fleet 1">→ 1</button><button data-fpk="B:${i}" title="into Fleet 2">→ 2</button><button data-fpk="E:${i}" title="open it below, to edit">✎</button><button data-fpk="C:${i}" title="copy its code">⧉</button></div>`).join('')
    : '<div class="tiny" style="padding:6px">No saved fleets yet — compose one below and press Save.</div>')
    + `<div class="frow" style="border:0"><button data-fpk="X" class="x" title="every saved fleet, a line about it and its code, as one text file">⤓ Export all as text</button><span class="tiny" style="margin-left:auto">${list.length} saved</span></div>`;
  box.hidden = false; box._list = list;
  box.style.left = Math.max(4, Math.min(r.left, innerWidth - 300)) + 'px'; box.style.top = Math.min(r.bottom + 4, innerHeight - 120) + 'px';
}
document.addEventListener('click', e => {
  const k = e.target.closest('[data-fpk]');
  if (k) {
    const [what, i] = k.dataset.fpk.split(':'), list = $('fleetPick')._list || [];
    $('fleetPick').hidden = true;
    if (what === 'X') return exportAll();
    const p = list[+i]; if (!p) return; const code = planCode(p);
    if (what === 'A' || what === 'B') { $(what === 'A' ? 'codeA' : 'codeB').value = code; showSide(what); $('fightNote').innerHTML = `<b>${esc(p.name)}</b> is Fleet ${what === 'A' ? 1 : 2}.`; }
    else if (what === 'E') { loadPlan(p); $('fleet').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { $('fightNote').innerHTML = `Copied the code of <b>${esc(p.name)}</b>.`; }).catch(() => { $('codeA').value = code; $('codeA').select(); showSide('A'); $('fightNote').textContent = 'Put in Fleet 1 and selected — copy it from there.'; });
    return;
  }
  if (!e.target.closest('#fleetPick') && !e.target.closest('#codeA') && !e.target.closest('#codeB')) $('fleetPick').hidden = true;
});
for (const k of ['A', 'B']) { const box = $('code' + k); box.addEventListener('focus', () => { if (PLANS.length) showFleetPick(box); }); box.addEventListener('input', () => showSide(k)); }
// the fleet a code box holds, built: its plan, its ships (as the lab builds them) and its coat
function fleetOfCode(code) {
  const p = planFromCode(code); if (!p) return null;
  setUserHulls([...HULLS, ...Object.values(PLAN && PLAN.hulls || {}), ...Object.values(p.hulls || {})]);
  const f = buildPlan(S, p); return f.ships.length ? { p, f, lk: lookFromColors(p.style, p.colA, p.colB) } : null;
}
// under each box: a line about the fleet and the fleet itself, drawn in a wedge
function showSide(k) {
  const box = $('side' + k), cv = box.querySelector('canvas'), sum = box.querySelector('.sum'), code = $('code' + k).value.trim(), tok = cv._tok = {};
  const g = cv.getContext('2d'); g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height);
  if (!code) { sum.innerHTML = `<b>Fleet ${k === 'A' ? 1 : 2}</b>: click the box and pick a saved fleet, or paste a code.`; return; }
  const x = fleetOfCode(code); if (!x) { sum.innerHTML = '<span style="color:var(--bad)">That is not a fleet code.</span>'; return; }
  const { p, f, lk } = x, style = (styleChoices().find(s => s.id === p.style) || {}).name || p.style || 'default';
  sum.innerHTML = `<b>${esc(p.name || 'Fleet')}</b> · ${f.n} ship${f.n > 1 ? 's' : ''} · ${fmt(f.cost)} · ${(p.mix || []).map(m => `${TACTICS[m.id] ? TACTICS[m.id].name : m.id} ${Math.round(m.share * 100)}%`).join(', ') || 'custom'}<br>${esc(f.arch.label)} · ${esc(style)} <span style="color:${esc(p.colA || '#7fb3ff')}">●</span><span style="color:${esc(p.colB || '#ffb347')}">●</span>`;
  drawFormation(cv, f.ships, lk, tok);
}
// the fleet in a wedge: the biggest ship at the point, the rest fanning back in pairs, all to one scale; the painted
// sprites arrive as their sheets load (each one redraws the picture), the plain plate stands in until then
function drawFormation(cv, ships, lk, tok) {
  if (cv._tok !== tok || !ships.length) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H);
  const list = ships.slice().sort((a, b) => b.cost - a.cost), gx = Math.max(...list.map(s => s.ds.hull.bw)) * 1.15 + 1, gy = list[0].ds.hull.bh * 0.55 + 1;
  const pos = list.map((s, i) => { const row = Math.ceil(i / 2), side = i % 2 ? -1 : 1; return [side * row * gx, row * gy]; });
  const xs = pos.flatMap(([x], i) => [x - list[i].ds.hull.bw / 2, x + list[i].ds.hull.bw / 2]), ys = pos.flatMap(([, y], i) => [y - list[i].ds.hull.bh / 2, y + list[i].ds.hull.bh / 2]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const q = Math.min((W - 24) / Math.max(1, maxx - minx), (H - 24) / Math.max(1, maxy - miny), 16), ox = W / 2 - (minx + maxx) / 2 * q, oy = H / 2 - (miny + maxy) / 2 * q;
  list.forEach((s, i) => {
    const [x, y] = pos[i], cx = ox + x * q, cy = oy + y * q, sp = spriteOf(s, lk, () => { if (cv.isConnected) drawFormation(cv, ships, lk, tok); });
    if (sp) { const k = q / sp.S; g.drawImage(sp.cv, cx - sp.w * k / 2, cy - sp.h * k / 2, sp.w * k, sp.h * k); }
    else {
      const hull = s.ds.hull, midx = (hull.box.minx + hull.box.maxx) / 2, midy = (hull.box.miny + hull.box.maxy) / 2;
      g.beginPath(); hull.poly.forEach(([px, py], j) => { const X = cx + (px - midx) * q, Y = cy + (py - midy) * q; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
      g.fillStyle = lk.washA; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#e8f0ff'; g.lineWidth = 1; g.stroke();
    }
  });
}
// ⚔ Fight: the two codes go to the lab in arena mode, framed right here; it answers with the result line
let frameReady = false, pending = null, lastFight = null, frameTimer = 0;
function sendFight() {
  const a = $('codeA').value.trim(), b = $('codeB').value.trim(), pa = planFromCode(a), pb = planFromCode(b);
  if (!pa || !pb) { $('fightNote').textContent = `${pa ? 'Fleet 2' : 'Fleet 1'} is not a fleet code — click the box and pick a saved fleet, or paste a code.`; return; }
  lastFight = { type: 'fight', a, b }; $('fightNote').textContent = ''; $('arenaWrap').hidden = false; $('arenaNote').textContent = `${pa.name || 'Fleet 1'} vs ${pb.name || 'Fleet 2'} — fighting…`;
  const fr = $('arenaFrame'); if (!fr.getAttribute('src')) fr.src = 'lab.html#arena';
  if (frameReady) fr.contentWindow.postMessage(lastFight, '*'); else pending = lastFight;
  $('arenaWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  clearTimeout(frameTimer); frameTimer = setTimeout(() => { if (!frameReady) $('arenaNote').innerHTML = `The arena did not load here — <a href="${labLink()}" style="color:var(--accent)">open the fight in the Battle Lab</a>.`; }, 8000);
}
const labLink = () => lastFight ? `lab.html#fleetA=${encodeURIComponent(lastFight.a)}&fleetB=${encodeURIComponent(lastFight.b)}` : 'lab.html';
window.addEventListener('message', e => {
  const d = e.data, fr = $('arenaFrame'); if (!d || !fr.contentWindow || e.source !== fr.contentWindow) return;
  if (d.type === 'ready') { frameReady = true; if (pending) { e.source.postMessage(pending, '*'); pending = null; } }
  else if (d.type === 'result') $('arenaNote').innerHTML = d.html + ' <span style="color:var(--muted)">Tap a ship to ride it; ⚑ Command this fight to give Fleet 1 its orders.</span>';
  else if (d.type === 'error') $('arenaNote').textContent = d.text;
});
$('fightCodes').onclick = sendFight; $('fightAgain').onclick = sendFight;
$('arenaLab').onclick = () => { location.href = labLink(); };
// full screen: the frame fills the screen, the lab's own bar (play, speed, orders) stays at its bottom
const wrap = $('arenaWrap');
function setBig(on) { wrap.classList.toggle('big', on); $('arenaBig').textContent = on ? '✕ Leave full screen' : '⛶ Full screen'; document.body.style.overflow = on ? 'hidden' : ''; }
$('arenaBig').onclick = () => {
  const on = !wrap.classList.contains('big'); setBig(on);
  try { if (on && wrap.requestFullscreen) wrap.requestFullscreen().catch(() => { /* the fixed layout alone, then */ }); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* same */ }
};
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && wrap.classList.contains('big')) setBig(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('big') && !document.fullscreenElement) setBig(false); });
init();
