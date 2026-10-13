// THE SHIP DESIGNER inside the Painter (his ask, 2026-10-12: "add the module system, so you can throw in modules and change
// the size and see the actual outcome … the drag and drop component system with the armour and the shield and everything
// and the point defence, the whole shwang. The painter should be like the ship designer"). The 4X game's own modules
// (modules.js), dropped on the ship or tapped in, each with its count, its size and — a gun — its role and dials, built live
// by the battle's own rules (battle.js shipFromDesign): the painted ship, its hard points and its numbers ARE the ship that
// will fight. The design travels as a SHIP CODE and goes into MY SHIPS (shipcode.js, library.js), which the Fleet Generator
// reads. The page gives the elements (ids below) and a few hooks; this module owns the design.
import { KINDS, PRESETS, GUN, SHIELD, applyPreset, fitModule, armorBulk } from './modules.js';
import { shipFromDesign, archetype, systemsOf, classOf, B, BREAK, PIERCE, PEN, PD, droneRole } from './battle.js';
import { shipRecord, shipCode, shipFromCode, designOf } from './shipcode.js';
import { readShips, loadShips, saveShips } from './library.js';
import { saveFlow } from './hullui.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : n >= 100 ? Math.round(n).toLocaleString('en') : (+n).toFixed(n >= 10 ? 0 : 1);
const pct = x => Math.round(x * 100) + ' %';
const uid = p => p + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STORE = 'forge.painter.design.v1';
// the palette: the modules a warship is made of (the civilian ones — lab, habitat, gantry — belong to the 4X, not to a fight)
const GROUPS = [['Weapons', ['weapon_energy', 'weapon_kinetic', 'weapon_missile', 'hangar']], ['Defence', ['armor', 'shield']], ['Engines & works', ['thruster', 'works']]];
// the star drive, the reactor and the weapons computer SIZE THEMSELVES after every change (his call, 2026-10-12: "auto resolved
// constantly … otherwise it's this horrible cat and mouse thing you need to always chase"): no knobs, not in the palette
const AUTO = new Set(['stardrive', 'reactor', 'weapon_system']);
const LABEL = { weapon_energy: 'Beam', weapon_kinetic: 'Gun', weapon_missile: 'Missile', hangar: 'Drone hangar', armor: 'Armour', shield: 'Shield', thruster: 'Thrusters', stardrive: 'Star drive', reactor: 'Reactor', weapon_system: 'Weapons computer', works: 'Fabricator' };
const COLOR = { weapon_energy: '#5fe3d0', weapon_kinetic: '#ffb347', weapon_missile: '#ff8a6b', hangar: '#ffe08a' };
const colorOf = k => COLOR[k] || KINDS[k].color;
const DRONE_ROLES = ['standard', 'sniper', 'capital', 'antiarmor', 'antishield', 'pd'];
const starter = () => ({ id: uid('d'), name: 'My ship', hull: 'dart', modules: [
  { id: uid('m'), kind: 'stardrive', caps: [], n: 1, k: 1 }, { id: uid('m'), kind: 'reactor', caps: [], n: 1, k: 1 }, { id: uid('m'), kind: 'weapon_system', caps: [], n: 1, k: 1 },
  { id: uid('m'), kind: 'weapon_energy', caps: [], n: 2, preset: 'standard', dmg: 1, rof: 1, rng: 1, role: 'ship' }, { id: uid('m'), kind: 'armor', caps: [], n: 2 }] });
// AUTO-FIT, the designer's way, after EVERY change: a drive, a reactor and (with guns) a weapons computer are always there,
// each sized to what the rest needs — the shields are left as he set them (the 4X auto-fit also grows them until they cover the hull)
function fitSystems(S, d) {
  const has = k => d.modules.find(m => m.kind === k);
  if (!has('stardrive')) d.modules.unshift({ id: uid('m'), kind: 'stardrive', caps: [], n: 1, k: 1 });
  if (d.modules.some(m => KINDS[m.kind].mount) && !has('weapon_system')) d.modules.push({ id: uid('m'), kind: 'weapon_system', caps: [], n: 1, k: 1 });
  if (!has('reactor')) d.modules.push({ id: uid('m'), kind: 'reactor', caps: [], n: 1, k: 1 });
  for (let r = 0; r < 6; r++) { let moved = false; for (const k of ['stardrive', 'weapon_system', 'reactor']) { const m = has(k); if (m && fitModule(S, d, m.id)) moved = true; } if (!moved) break; }
}

export function createDesigner({ $, S = { breakthroughs: [] }, hdlg, getHull, setHull, coat, setCoat, onChange }) {
  let D = null, ship = null, SHIPS = readShips();
  try { const x = JSON.parse(localStorage.getItem(STORE) || 'null'); if (x && Array.isArray(x.modules) && x.modules.every(m => KINDS[m.kind])) D = x; } catch (e) { /* a fresh one */ }
  if (!D) D = starter();
  loadShips().then(r => { if (r.durable) SHIPS = r.list; });
  const note = html => { $('dNote').innerHTML = html; };
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(D)); } catch (e) { /* fine */ } };
  function build() {
    D.hull = getHull() || D.hull;
    if (!D.modules.length) { ship = null; return; }
    try { ship = shipFromDesign(S, D); ship.arch = archetype(ship); } catch (e) { console.warn('designer: could not build', e); ship = null; }
  }
  function changed() { fitSystems(S, D); build(); keep(); renderList(); renderStats(); renderCode(); if (onChange) onChange(); }

  // ---------------- the palette: drag a module onto the ship (or the list), or tap it ----------------
  $('mPalette').innerHTML = GROUPS.map(([g, ks]) => `<div class="pg"><span>${g}</span>${ks.map(k => `<span class="mchip" data-addk="${k}" style="--c:${colorOf(k)}" title="${esc(KINDS[k].name)} — drag it onto the ship, or tap">＋ ${LABEL[k]}</span>`).join('')}</div>`).join('');
  function add(kind) {
    const K = KINDS[kind];
    if (K.mount) {                                                               // a gun goes in as a mirrored pair, a hangar as one bay; more of the plain one stacks up
      const same = D.modules.find(m => m.kind === kind && (m.preset || 'standard') === 'standard');
      if (same) same.n = (same.n || 1) + (K.hangar ? 1 : 2);
      else { const m = { id: uid('m'), kind, caps: [], n: K.hangar ? 1 : 2 }; if (K.hangar) { m.cnt = 1; m.sz = 1; } else applyPreset(m, 'standard'); D.modules.push(m); }
    } else { const m = D.modules.find(x => x.kind === kind); if (m) m.n = (m.n || 1) + 1; else D.modules.push({ id: uid('m'), kind, caps: [], n: 1, ...(K.scale ? { k: 1 } : {}) }); }
    changed(); note(`＋ ${LABEL[kind]}`);
  }
  {
    let drag = null, ghost = null;
    const over = (x, y) => { if (ghost) ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return !!(el && el.closest('#out, #designer, .stage')); };
    $('mPalette').addEventListener('pointerdown', e => { const c = e.target.closest('[data-addk]'); if (!c || e.button) return; drag = { kind: c.dataset.addk, el: c, x: e.clientX, y: e.clientY, moved: false }; e.preventDefault(); });
    document.addEventListener('pointermove', e => {
      if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      if (!drag.moved) { drag.moved = true; ghost = drag.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); }
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; $('designer').classList.toggle('over', over(e.clientX, e.clientY));
    });
    const end = e => { if (!drag) return; const d = drag; drag = null; $('designer').classList.remove('over'); if (ghost) { ghost.remove(); ghost = null; } if (e.type === 'pointercancel') return; if (!d.moved || over(e.clientX, e.clientY)) add(d.kind); };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  }

  // ---------------- the modules: a card each, with its steppers ----------------
  const step = (act, i, val, title) => `<span class="st" title="${esc(title)}"><button data-ma="${act}:-1:${i}">−</button><i>${val}</i><button data-ma="${act}:1:${i}">+</button></span>`;
  // damage against each layer, as the battle resolves a hit (battle.js strike): a shield shrugs SHIELD.hard off every hit (a
  // capital shell ignores that and hits the field ×BREAK; a sniper's slug, a shell or a missile goes partly through it), armour
  // shrugs off its deflection (3 on plain armour), the hull takes it all
  const LAYER = { shield: '#cf89ff', armor: '#c9d4e8', hull: '#7ef3b0' }, DEFLECT = KINDS.armor.base.deflect;
  const vsLayers = (d, perSec, preset, kind) => {
    const pen = PIERCE[preset] ?? PEN[kind] ?? 0, soft = d * (1 - pen), brk = BREAK[preset] || 0;
    return { shield: perSec * (brk ? soft * brk : Math.max(0, soft - SHIELD.hard)), through: perSec * d * pen, armor: perSec * Math.max(0, d - DEFLECT), hull: perSec * d };
  };
  const layerLine = (L, what) => '<div style="margin-top:2px">' + what + ': <b style="color:' + LAYER.shield + '">shield ' + fmt(L.shield) + '</b>' + (L.through > 0.05 ? ' (+' + fmt(L.through) + ' through it)' : '') + ' · <b style="color:' + LAYER.armor + '">armour ' + fmt(L.armor) + '</b> · <b style="color:' + LAYER.hull + '">hull ' + fmt(L.hull) + '</b> dmg/s</div>';
  function layersOf(m, x) {
    const v = x.v, t = ship.t, n = x.n;
    if (x.K.hangar) {                                                              // a drone: the battle's own drone numbers × its size × its role
      const R = droneRole(m.preset || 'standard'), Dr = B.drone, d = Dr.dmg * v.size * R.dmg, perSec = Dr.rate * R.rate * Dr.acc / 100;
      return layerLine(vsLayers(d, perSec, null, 'weapon_energy'), 'each drone in the air' + (R.escort ? ' (an escort: it shoots missiles and drones)' : '')) + '<div>' + t.airCap + ' of ' + t.drones + ' fly at once</div>';
    }
    const d = v.damage * t.powerFactor * t.fireFactor, perSec = v.rate * Math.min(98, v.accuracy + t.bonus) / 100 * n, pd = (m.role || (PRESETS[m.preset] && PRESETS[m.preset].role)) === 'pd';
    return layerLine(vsLayers(d, perSec, m.preset, m.kind), 'all ' + n) + (pd ? '<div>point defence: missiles and drones first; on a hull over ' + PD.smallTop + ' only ×' + PD.vsShip + ' of this</div>' : '');
  }
  function lineOf(m, x) {
    if (!x) return ''; const v = x.v, n = x.n, bulk = m.kind === 'armor' ? armorBulk(n) : n, t = ship.t, money = `cost ${fmt(x.cost * n)} · bulk ${fmt(x.volume * bulk)}`;
    if (x.K.hangar) return `${Math.round(v.craft) * n} drones, size ×${v.size.toFixed(1)} · ${money}` + layersOf(m, x);
    if (x.K.mount) return `each ${fmt(v.damage)} a shot, ${v.rate.toFixed(2)}/s, ${Math.round(Math.min(98, v.accuracy + t.bonus))} % to hit · reach ${fmt(v.range)}${x.K.charges ? ` · ${Math.round(v.charges)} missiles each` : ''} · takes ${(x.load * n).toFixed(1)} mounts · ${money}` + layersOf(m, x);
    if (m.kind === 'armor') return `${fmt(v.hp * n)} HP in ${n} layer${n > 1 ? 's' : ''}, shrugs ${v.deflect.toFixed(1)} off every hit · ${money}`;
    if (m.kind === 'shield') return `${fmt(v.capacity * n)} capacity, +${fmt(v.recovery * n)}/s · covers ${pct(t.cover)} of the hull · ${money}`;
    if (m.kind === 'thruster') return `+${fmt(v.thrust * n)} thrust, +${fmt(v.evasion * n)} agility · ${money}`;
    if (m.kind === 'stardrive') return `moves ${fmt(v.lift * n)} of ${fmt(t.volume)} volume${t.underDriven ? ' — too little to leave its system' : ''} · thrust ${fmt(v.thrust * n)} · ${money}`;
    if (m.kind === 'reactor') return `${fmt(v.output * n)} MW for ${fmt(t.powerUse)} used${t.powerFactor < 0.999 ? ` — short: everything at ${pct(t.powerFactor)}` : ''} · ${money}`;
    if (m.kind === 'weapon_system') return `${(v.mounts * n).toFixed(1)} mounts for ${t.mountsUsed.toFixed(1)} used${t.drones ? ` · ${t.airCap} drones in the air` : ''}${t.fireFactor < 0.999 ? ` — short: guns at ${pct(t.fireFactor)}` : ''} · ${money}`;
    if (m.kind === 'works') return `${fmt(v.industry * n)} industry · stock ${fmt(x.volume * n * 4)} — reloads missiles, rebuilds drones, mends the hull · ${money}`;
    return money;
  }
  function renderList() {
    const mods = ship ? ship.ds.mods : [];
    $('mList').innerHTML = D.modules.map((m, i) => {
      const K = KINDS[m.kind], x = mods[i] || null, n = m.n || 1;
      if (AUTO.has(m.kind)) return `<div class="mcard" style="--c:${colorOf(m.kind)}"><div class="top"><b>${LABEL[m.kind] || K.name}</b><span class="tiny" title="it sizes itself to what the rest of the ship needs, after every change">auto · ${n > 1 ? n + ' × ' : ''}size ×${m.k || 1}</span></div><div class="line">${lineOf(m, x)}</div></div>`;
      let ctl = `<span class="tiny">${m.kind === 'armor' ? 'layers' : 'count'}</span>` + step('n', i, '×' + n, 'how many');
      if (K.scale) ctl += `<span class="tiny">size</span>` + step('k', i, '×' + (m.k || 1), `its size, ×${K.scale.min} to ×${K.scale.max}`);
      if (K.mount && !K.hangar) ctl += `<select data-mrole="${i}" title="its role: the dials it starts from">${Object.entries(PRESETS).map(([id, p]) => `<option value="${id}" ${(m.preset || 'standard') === id ? 'selected' : ''}>${p.name}</option>`).join('')}<option value="custom" ${m.preset === 'custom' ? 'selected' : ''}>Custom</option></select>`
        + `<span class="tiny">dmg</span>${step('dmg', i, '×' + (m.dmg || 1), 'damage dial')}<span class="tiny">rate</span>${step('rof', i, '×' + (m.rof || 1), 'rate of fire dial')}<span class="tiny">reach</span>${step('rng', i, '×' + (m.rng || 1), 'range dial')}${K.charges ? `<span class="tiny">load</span>${step('chg', i, '×' + (m.chg || 1), 'missiles carried dial')}` : ''}`;
      if (K.hangar) ctl += `<select data-mrole="${i}" title="what its drones do">${DRONE_ROLES.map(id => `<option value="${id}" ${(m.preset || 'standard') === id ? 'selected' : ''}>${id === 'pd' ? 'Escort (point defence)' : PRESETS[id].name}</option>`).join('')}</select><span class="tiny">drones</span>${step('cnt', i, '×' + (m.cnt || 1), 'drones carried dial (×1 = 4 a bay)')}<span class="tiny">size</span>${step('sz', i, '×' + (m.sz || 1), 'drone size dial')}`;
      return `<div class="mcard" style="--c:${colorOf(m.kind)}"><div class="top"><b>${LABEL[m.kind] || K.name}</b>${ctl}<button class="x del" data-ma="del:0:${i}" title="take it out">✕</button></div><div class="line">${lineOf(m, x)}</div></div>`;
    }).join('') || '<div class="tiny">No modules. Drag some from above onto the ship, or tap them.</div>';
  }
  $('mList').addEventListener('click', e => {
    const b = e.target.closest('[data-ma]'); if (!b) return;
    const [act, d, si] = b.dataset.ma.split(':'), i = +si, m = D.modules[i], dir = +d; if (!m) return;
    const K = KINDS[m.kind];
    if (act === 'del') D.modules.splice(i, 1);
    else if (act === 'n') { m.n = (m.n || 1) + dir; if (m.n < 1) D.modules.splice(i, 1); else m.n = Math.min(60, m.n); }
    else if (act === 'k' && K.scale) m.k = clamp(Math.round(((m.k || 1) + dir * K.scale.step) / K.scale.step) * K.scale.step, K.scale.min, K.scale.max);
    else if (['dmg', 'rof', 'rng', 'chg'].includes(act)) { m[act] = clamp((m[act] || 1) + dir * GUN.step, GUN.min, GUN.max); m.preset = 'custom'; }
    else if (act === 'cnt') m.cnt = clamp((m.cnt || 1) + dir * 0.5, GUN.min, GUN.max);
    else if (act === 'sz') m.sz = clamp((m.sz || 1) + dir * 0.5, 0.5, 3);
    changed();
  });
  $('mList').addEventListener('change', e => {
    const s = e.target.closest('[data-mrole]'); if (!s) return; const m = D.modules[+s.dataset.mrole]; if (!m) return;
    if (KINDS[m.kind].hangar) { if (s.value === 'standard') delete m.preset; else m.preset = s.value; }
    else if (s.value === 'custom') m.preset = 'custom'; else applyPreset(m, s.value);
    changed();
  });

  // ---------------- what it adds up to ----------------
  function renderStats() {
    if (!ship) { $('dStats').innerHTML = '<div class="tiny">Add modules — a weapon at least — and the ship is built here.</div>'; return; }
    const t = ship.t, w = [], row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    if (!ship.guns.length && !ship.hangars.length) w.push('No weapons: it cannot fight.');
    if (t.powerFactor < 0.999) w.push(`Not enough power: everything runs at ${pct(t.powerFactor)} — a bigger reactor, or tick auto-fit.`);
    if (t.fireFactor < 0.999) w.push(`The weapons computer is short: the guns fire at ${pct(t.fireFactor)} — a bigger computer, or tick auto-fit.`);
    if (t.shieldRaw && t.cover < 0.99) w.push(`The shields cover ${pct(t.cover)} of the hull: the rest takes hits bare — add a shield.`);
    if (t.drones && !t.airCap) w.push('No drone can fly: the weapons computer has no mounts left over for them.');
    $('dStats').innerHTML = `<div><span class="cost">${fmt(t.cost)}</span> <span class="tiny">${classOf(t.cost)} · ${esc(ship.arch.label)}</span></div>
      <div class="grid">${row('Size', `${fmt(t.volume)} volume · ${t.squares} squares`)}${row('Hull', `${fmt(t.hp)} HP`)}${t.armor ? row('Armour', `${fmt(t.armor)} HP · shrugs ${t.deflect.toFixed(1)}/hit`) : ''}${t.shieldRaw ? row('Shield', `${fmt(t.shieldRaw)} · +${fmt(t.shieldRec)}/s · ${pct(t.cover)} cover`) : ''}
      ${row('Damage', `${fmt(t.dps)} dmg/s${ship.pd ? ` · ${ship.pd} point defence` : ''}`)}${row('Stands off', `${ship.pref} u`)}${row('Speed', `${fmt(t.speed)} · turns ${Math.round(t.turn)}°/s · evasion ${Math.round(t.evasion)} %`)}
      ${row('Power', `${fmt(t.powerOut)} MW made, ${fmt(t.powerUse)} used`)}${row('Computer', `${t.mounts.toFixed(1)} mounts, ${t.mountsUsed.toFixed(1)} used`)}${t.missiles ? row('Missiles', `${t.missiles}`) : ''}${t.drones ? row('Drones', `${t.drones}, ${t.airCap} in the air at once`) : ''}${t.fabStock ? row('Fabricator', `stock ${fmt(t.fabStock)}`) : ''}${t.heatCap ? row('Heat', `holds ${fmt(t.heatCap)}, sheds ${fmt(t.cool)}/s`) : ''}</div>
      ${w.map(x => `<div class="warn">⚠ ${x}</div>`).join('')}<div class="tiny" style="margin-top:6px">${esc(systemsOf(ship))}</div>`;
  }

  // ---------------- the ship as a code; my ships ----------------
  const record = () => shipRecord({ ...D, hull: getHull() || D.hull }, { name: D.name, ...coat() });
  function renderCode() { if (document.activeElement !== $('dCode')) $('dCode').value = ship ? shipCode(record()) : ''; }
  function open(rec, from = 'code') {
    D = designOf(rec); D.name = rec.name || 'Ship'; if (rec.id && from === 'mine') D.libId = rec.id; $('dName').value = D.name;
    if (setHull) setHull(rec); if (rec.style && setCoat) setCoat(rec);
    changed(); note(`<b>${esc(D.name)}</b> is open — ${from === 'mine' ? 'from your ships' : 'from the code'}, exactly as it was built.`);
  }
  $('dCode').addEventListener('input', () => {
    const text = $('dCode').value.trim(); if (!text) return; const rec = shipFromCode(text);
    if (!rec) { note('That is not a ship code (yet) — paste the whole line, it starts with SHIP1:'); return; }
    if (ship && text === shipCode(record())) return;
    $('dCode').blur(); open(rec);
  });
  $('dCode').addEventListener('blur', renderCode);
  $('dCopy').onclick = async () => { const c = $('dCode'); if (!c.value) return; c.select(); try { await navigator.clipboard.writeText(c.value); note('Copied — paste it into a ship of a fleet (Fleet Generator → Edit), or send it to a friend.'); } catch (e) { document.execCommand && document.execCommand('copy'); note('Selected — copy it.'); } };
  $('dSave').onclick = async () => {
    if (!ship) return;
    const mine = D.libId ? SHIPS.find(x => x.id === D.libId) || null : null;
    const r = await saveFlow(hdlg, { what: 'ship', mine, defaultName: D.name, taken: n => SHIPS.some(x => x.name.toLowerCase() === n.toLowerCase() && (!mine || x.id !== mine.id)), commit: (id, name) => {
      D.name = name; $('dName').value = name;
      const rec = { ...record(), id: id || 's' + Math.random().toString(36).slice(2, 9), cost: Math.round(ship.cost), label: ship.arch.label, at: new Date().toISOString() };
      const list = SHIPS.slice(), k = list.findIndex(x => x.id === rec.id); if (k >= 0) list[k] = rec; else list.unshift(rec); SHIPS = list; saveShips(list); D.libId = rec.id; keep(); return rec;
    } });
    if (r) { renderCode(); note(`Saved <b>${esc(r.name)}</b> to your ships — in the Fleet Generator, Edit a ship → ▤ My ships puts it into a fleet.`); }
  };
  function showPick(anchor) {
    const box = $('dPick'), r = anchor.getBoundingClientRect();
    box.innerHTML = SHIPS.length ? SHIPS.map((x, i) => `<div class="frow"><b title="${esc(x.name)}">${esc(x.name)}</b><small>${fmt(x.cost || 0)}${x.label ? ' · ' + esc(x.label) : ''}</small><button data-dpk="O:${i}" title="open it here">open</button><button data-dpk="C:${i}" title="copy its code">⧉</button><button data-dpk="D:${i}" title="delete it from your ships">✕</button></div>`).join('')
      : '<div class="tiny" style="padding:6px">No saved ships yet — ☆ Save to my ships…</div>';
    box.hidden = false; box.style.left = Math.max(4, Math.min(r.left, innerWidth - 300)) + 'px'; box.style.top = Math.max(4, Math.min(r.bottom + 4, innerHeight - 160)) + 'px';
  }
  $('dMine').onclick = e => { e.stopPropagation(); if (!$('dPick').hidden) { $('dPick').hidden = true; return; } showPick(e.currentTarget); };
  document.addEventListener('click', async e => {
    const k = e.target.closest('[data-dpk]');
    if (!k) { if (!e.target.closest('#dPick')) $('dPick').hidden = true; return; }
    const [what, i] = k.dataset.dpk.split(':'), x = SHIPS[+i]; $('dPick').hidden = true; if (!x) return;
    if (what === 'O') open(x, 'mine');
    else if (what === 'C') { try { await navigator.clipboard.writeText(shipCode(x)); note(`Copied the code of <b>${esc(x.name)}</b>.`); } catch (er) { $('dCode').value = shipCode(x); $('dCode').select(); note('In the box and selected — copy it.'); } }
    else if (what === 'D') { if (!(await hdlg.confirmDelete(x, 'It goes from your ships; fleets that carry it keep their copy.'))) return; SHIPS = SHIPS.filter(y => y.id !== x.id); saveShips(SHIPS); if (D.libId === x.id) delete D.libId; note(`Deleted <b>${esc(x.name)}</b> from your ships.`); }
  });
  $('dName').addEventListener('input', () => { D.name = $('dName').value.trim() || 'My ship'; keep(); renderCode(); });
  $('dNew').onclick = () => { D = starter(); $('dName').value = D.name; changed(); note('A fresh ship: a drive, a reactor, a computer, two beams and some armour.'); };
  $('dName').value = D.name;

  return {
    // the guns to paint, as the painter wants them: kind, how many, size (the gun's bulk against a plain one, as the game sizes its hard points)
    paintGuns() {
      if (!ship) return []; const out = new Map();
      for (const m of ship.ds.mods) if (m.K.mount && !m.K.orbital) { const size = m.volume / m.K.volume, key = m.kind + '|' + size.toFixed(2), e = out.get(key) || { kind: m.kind, n: 0, size }; e.n += m.n; out.set(key, e); }
      return [...out.values()];
    },
    volume: () => ship ? ship.t.volume : null,
    ship: () => ship,
    start() { changed(); },                                                       // the systems size themselves on the way in too
    refresh() { build(); renderList(); renderStats(); renderCode(); },            // the silhouette changed: hard points, shield cover and squares follow (no repaint asked)
    codeChanged: renderCode,                                                         // the coat changed: the code carries it
  };
}
