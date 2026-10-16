// THE SHIP EDITOR'S CHIPS — one component for the Fleet Generator and the Painter (his call, 2026-10-13: "the painter and the
// fleet generator should be identical"). A PALETTE of bubbles — weapons, roles, traits — dragged (or tapped) into the TRAY,
// where they pile into stacks; a role dropped on a weapon gives it that role. A stack OPENS (double-click it, or ▾) to its
// details: what its guns do — a shot, its rate, its reach, its aim, its damage a second to a shield, to armour and to the hull —
// and its dials; turn a dial and the reactor, the computer and the drive follow, and with them the price and the bulk. Under it
// the ship's CHARACTER SHEET. The page builds the ship (at its price, or from the chips as they are) and hands it back with
// showShip(ship); the editor never builds anything itself.
import { KINDS, PRESETS, GUN, SHIELD } from './modules.js';
import { B, BREAK, PIERCE, PEN, PD, droneRole, systemsOf, classOf } from './battle.js';

export const CHIPS = {
  weapon: [['weapon_energy', 'Beam'], ['weapon_kinetic', 'Gun'], ['weapon_missile', 'Missile'], ['hangar', 'Drones']],
  role: [['sniper', 'Sniper'], ['capital', 'Capital'], ['pd', 'Point defence'], ['antishield', 'Anti-shield'], ['antiarmor', 'Anti-armour']],
  trait: [['armor', 'Armoured'], ['shield', 'Shielded'], ['fast', 'Fast'], ['fab', 'Fabricator']],
};
export const CHIPC = { weapon_energy: '#5fe3d0', weapon_kinetic: '#ffb347', weapon_missile: '#ff8a6b', hangar: '#ffe08a', armor: '#c9d4e8', shield: '#cf89ff', fast: '#7ef3b0', fab: '#ffb347', lab: '#6db7ff', habitat: '#f5a3c7', gantry: '#e8c56b' };
// the GAME's civil chips (a page passes them as `extra`): a lab, a habitat, a dock
export const CIVIL = { trait: [['lab', 'Lab'], ['habitat', 'Habitat'], ['gantry', 'Dock']] };
const CSS = `
.chipb { display: inline-block; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--c); color: var(--c); font-size: 12px; font-weight: 700; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; background: rgba(255,255,255,.03) }
.chipb.role { border-style: dashed }
.chipb.ghost { position: fixed; transform: translate(-50%, -50%); pointer-events: none; z-index: 99; opacity: .9 }
.ce-prow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 6px }
.ce-prow .tiny { width: 58px }
.ce-prow.off { opacity: .4 }
.ce-grp { flex-basis: 100%; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted, #9eb3d8); margin: 4px 0 0 }
.ce-tray { min-height: 54px; margin-top: 6px; padding: 8px; border: 1px dashed var(--line, #1f2a44); border-radius: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
.ce-tray.over { border-color: var(--good, #7ef3b0); background: rgba(126,243,176,.06) }
.ce-tray .stack { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--c); background: rgba(255,255,255,.05); color: var(--c); font-size: 13px; cursor: pointer; user-select: none; -webkit-user-select: none }
.ce-tray .stack.sel { outline: 2px solid var(--warn, #ffd26a) }
.ce-tray .stack.auto { cursor: default; border-style: dotted; background: rgba(255,255,255,.03) }
.ce-tray .stack.auto small { color: var(--warn, #ffd26a) }
.ce-tray .stack small.stat { color: var(--warn, #ffd26a) }
.ce-tray .stack .btns { display: inline-flex; gap: 2px; margin-left: auto }
.ce-tray .stack .eye { font-size: 11px; opacity: .6 }
.ce-tray .stack.off { opacity: .5; border-style: dashed }
.ce-tray .stack.off b { text-decoration: line-through }
.ce-tray .stack.off .eye { opacity: 1; color: var(--bad, #ff7979) }
.ce-tray .stack.over { background: rgba(126,243,176,.18); border-color: var(--good, #7ef3b0) }
.ce-tray .stack .hh { font-style: normal; font-weight: 800; color: var(--warn, #ffd26a) }
.ce-tray .stack small { color: var(--fg, #e8f0ff); font-size: 11px }
.ce-tray .stack .x { padding: 0 6px; font-size: 12px; color: var(--muted, #9eb3d8) }
.ce-tray .stack .tuned { font-size: 10px; color: var(--warn, #ffd26a) }
.ce-info { margin-top: 8px; border: 1px solid var(--c, #1f2a44); border-left-width: 3px; border-radius: 10px; padding: 8px 10px; background: #0b1120; font-size: 12px; line-height: 1.55 }
.ce-info[hidden] { display: none }
.ce-info .top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 4px }
.ce-info .top b { color: var(--c) }
.ce-info .dials { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 4px 0 }
.ce-info .st { display: inline-flex; align-items: center; gap: 3px; color: var(--muted, #9eb3d8) }
.ce-info .st button { padding: 0 8px; font-size: 13px; line-height: 20px }
.ce-info .st i { font-style: normal; color: var(--fg, #e8f0ff); min-width: 32px; text-align: center; font-variant-numeric: tabular-nums }
.ce-info select { background: #04070f; color: var(--fg, #e8f0ff); border: 1px solid var(--line, #1f2a44); border-radius: 6px; padding: 2px 4px; font: 12px system-ui, sans-serif }
.ce-info .muted { color: var(--muted, #9eb3d8) }
.ce-sheet { margin-top: 10px; border: 1px solid var(--line, #1f2a44); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,.02); font-size: 12px; line-height: 1.5 }
.ce-sheet .head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap }
.ce-sheet .cost { font-size: 22px; font-weight: 800; color: var(--warn, #ffd26a) }
.ce-sheet .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 4px 18px; margin-top: 8px }
.ce-sheet .sec h4 { margin: 4px 0 2px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted, #9eb3d8) }
.ce-sheet .row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted rgba(31,42,68,.9); padding: 1px 0 }
.ce-sheet .row span { color: var(--muted, #9eb3d8) }
.ce-sheet .warn { color: var(--bad, #ff7979); margin-top: 4px }
.ce-sheet .sys { color: #6f83a8; font-size: 11px; margin-top: 6px }`;
let styled = false;
const ensure = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : n >= 100 ? Math.round(n).toLocaleString('en') : (+n).toFixed(n >= 10 ? 0 : 1);
const pct = x => Math.round(x * 100) + ' %';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LAYER = { shield: '#cf89ff', armor: '#c9d4e8', hull: '#7ef3b0' };
// what a hit of `d` does to each layer, a second at `perSec` hits, as the battle resolves it (battle.js strike): a shield shrugs
// SHIELD.hard off every hit (a capital shell ignores that and hits the field ×BREAK; a sniper's slug, a shell or a missile goes
// partly through it), armour shrugs off its deflection (3 on plain armour), the hull takes it all
export const vsLayers = (d, perSec, preset, kind) => {
  const pen = PIERCE[preset] ?? PEN[kind] ?? 0, soft = d * (1 - pen), brk = BREAK[preset] || 0;
  return { shield: perSec * (brk ? soft * brk : Math.max(0, soft - SHIELD.hard)), through: perSec * d * pen, armor: perSec * Math.max(0, d - KINDS.armor.base.deflect), hull: perSec * d };
};
const layerHtml = L => `<b style="color:${LAYER.shield}">shield ${fmt(L.shield)}</b>${L.through > 0.05 ? ` <span class="muted">(+${fmt(L.through)} through it)</span>` : ''} · <b style="color:${LAYER.armor}">armour ${fmt(L.armor)}</b> · <b style="color:${LAYER.hull}">hull ${fmt(L.hull)}</b> dmg/s`;
const chipName = (type, key) => (CHIPS[type] || []).find(c => c[0] === key)?.[1] || key;
const DRONE_ROLES = ['standard', 'sniper', 'capital', 'antiarmor', 'antishield', 'pd'];

// el: { palette, tray, info, sheet } (elements) · dropZones: selectors that also take a dropped chip (the Painter's ship) ·
// onChange(stacks) after every change the player makes
// extra: more chips for this page ({ trait: [[key, label]…] } — the game's CIVIL ones) · infoExtra(stack, mods) → html added to a stack's
// details (the game's breakthrough capsules) · onInfoClick(e, stack) → true when it handled a click there (the editor then rebuilds)
// labels: the palette rows' names ({ weapon, role, trait }) · groupBy(stack) → a group's name, groupOrder [names]: the tray in groups under headers (the game)
// openOnClick: a click on a stack opens its details (no ▾ needed) · onRender(openId): after every render (the game places the details panel)
// autoChips(group) → [{ label, sub, color, title }]: chips shown first in that group that are not stacks (the game's reactor, drive, weapons computer)
// stackSub(stack, mods, ship) → text under a stack's name: what it gives the ship (the game: HP, dmg/s, capacity …)
// gunsPerChip: how many guns a weapon chip stands for in the details' wording (2 here and in the Fleet Generator; the game says 1)
export function createChipEditor({ palette, tray, info, sheet, dropZones = [] }, { onChange, extra = null, infoExtra = null, onInfoClick = null, labels = null, groupBy = null, groupOrder = [], openOnClick = false, onRender = null, autoChips = null, gunsPerChip = 2, stackSub = null } = {}) {
  ensure(); tray.classList.add('ce-tray'); info.classList.add('ce-info'); sheet.classList.add('ce-sheet'); info.hidden = true;
  let stacks = [], sel = null, open = null, nextId = 1, ship = null;
  const LIST = { weapon: CHIPS.weapon, role: CHIPS.role, trait: [...CHIPS.trait, ...((extra && extra.trait) || [])] }, nameOf = (type, key) => (LIST[type] || []).find(c => c[0] === key)?.[1] || key;
  if (extra && extra.names) for (const t in LIST) LIST[t] = LIST[t].map(([k, l]) => [k, extra.names[k] || l]);   // a page's own names for some chips (the game calls "Fast" Thrusters)
  const emit = () => { render(); if (onChange) onChange(stacks); };
  palette.innerHTML = ['weapon', 'role', 'trait'].map(type => `<div class="ce-prow" data-prow="${type}"><span class="tiny">${(labels && labels[type]) || { weapon: 'Weapons', role: 'Roles', trait: 'Traits' }[type]}</span>${LIST[type].map(([k, l]) => `<span class="chipb ${type}" data-chip="${type}:${k}" style="--c:${CHIPC[k] || '#ffd26a'}" title="drag it into the tray (or onto a stack), or tap it">${l}</span>`).join('')}</div>`).join('');
  const label = s => nameOf(s.type || (CHIPS.weapon.some(c => c[0] === s.kind) ? 'weapon' : 'trait'), s.kind);
  const isWeapon = s => CHIPS.weapon.some(c => c[0] === s.kind);
  function render() {
    const subOf = s => { if (s.off) return '<small class="stat">hidden — left out of the ship</small>'; if (!stackSub) return ''; const t = stackSub(s, ship ? ship.ds.mods.filter(x => x.mod.src === s.id) : [], ship); return t ? `<small class="stat">${t}</small>` : ''; };
    // 👁 HIDES a stack (his ask, 2026-10-16): it stays here, dimmed, but is left out of the ship — to try setups without losing the chips
    const chip = s => `<span class="stack ${s.id === sel ? 'sel' : ''}${s.off ? ' off' : ''}" data-stack="${s.id}" style="--c:${CHIPC[s.kind]}" title="double-click: its details and dials"><b>${label(s)}</b>${s.h > 1 ? `<i class="hh">×${s.h}</i>` : ''}${s.role ? `<small>${nameOf('role', s.role)}</small>` : ''}${subOf(s)}${s.caps && s.caps.length ? `<span class="tuned" title="breakthrough capsules on it">✦${s.caps.length}</span>` : ''}${s.dials && Object.keys(s.dials).length ? '<span class="tuned" title="its dials are turned">⚙</span>' : ''}<span class="btns"><button class="x" data-sopen="${s.id}" title="its details and dials">${open === s.id ? '▴' : '▾'}</button><button class="x" data-stackup="${s.id}" title="one more">+</button><button class="x" data-unstack="${s.id}" title="one off">−</button><button class="x eye" data-shide="${s.id}" title="${s.off ? 'show it: build it into the ship again' : 'hide it: keep it here, leave it out of the ship'}">👁</button></span></span>`;
    let html;
    if (groupBy) {                                     // in groups, each under its header, the groups in the order given; a group's AUTO chips (the ship's own systems, not added by hand) come first in it
      const by = new Map(); for (const s of stacks) { const g = groupBy(s); (by.get(g) || by.set(g, []).get(g)).push(s); }
      const names = [...groupOrder, ...[...by.keys()].filter(g => !groupOrder.includes(g))];
      html = names.map(g => {
        const autos = (autoChips && autoChips(g)) || [], list = by.get(g) || []; if (!autos.length && !list.length) return '';
        return `<div class="ce-grp">${esc(g)}</div>` + autos.map(a => `<span class="stack auto" style="--c:${a.color || '#9eb3d8'}" title="${esc(a.title || '')}"><b>${esc(a.label)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>`).join('') + list.map(chip).join('');
      }).join('');
    } else html = stacks.map(chip).join('');
    tray.innerHTML = html || '<span class="tiny">Empty. Tap or drag chips from above; drop a chip on a stack to pile it up; drop a role on a weapon to give it that role. Double-click a stack for its details.</span>';
    palette.querySelector('[data-prow="role"]')?.classList.toggle('off', !stacks.some(isWeapon));   // a role wants a weapon to sit on
    renderInfo();
    if (onRender) onRender(open);
  }
  function drop(type, key, onStack) {
    const s = onStack != null ? stacks.find(x => x.id === onStack) : null;
    if (type === 'role') { const w = s && isWeapon(s) ? s : stacks.find(x => x.id === sel && isWeapon(x)) || stacks.filter(isWeapon).at(-1); if (w) { w.role = w.role === key ? null : key; sel = w.id; } }
    else if (s && s.kind === key) { s.h++; sel = s.id; }
    else if (type === 'trait' && stacks.some(x => x.kind === key) && !s) { const x = stacks.find(x => x.kind === key); x.h++; sel = x.id; }
    else { const n = { id: nextId++, type, kind: key, h: 1, role: null }; stacks.push(n); sel = n.id; }
    emit();
  }
  { // drag a chip (or tap it)
    let drag = null, ghost = null;
    const under = (x, y) => { if (ghost) ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return el; };
    const inZone = el => !!el && (tray.contains(el) || dropZones.some(z => el.closest && el.closest(z)));
    palette.addEventListener('pointerdown', e => { const c = e.target.closest('[data-chip]'); if (!c || e.button) return; const [type, key] = c.dataset.chip.split(':'); drag = { type, key, x: e.clientX, y: e.clientY, moved: false, el: c }; e.preventDefault(); });
    document.addEventListener('pointermove', e => {
      if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      if (!drag.moved) { drag.moved = true; ghost = drag.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); }
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]'); for (const s of tray.querySelectorAll('[data-stack]')) s.classList.toggle('over', s === st); tray.classList.toggle('over', inZone(el) && !st);
    });
    const end = e => {
      if (!drag) return; const d = drag; drag = null; for (const s of tray.querySelectorAll('[data-stack]')) s.classList.remove('over'); tray.classList.remove('over'); if (ghost) { ghost.remove(); ghost = null; }
      if (e.type === 'pointercancel') return; if (!d.moved) return drop(d.type, d.key, null);
      const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]'); if (st && tray.contains(st)) return drop(d.type, d.key, +st.dataset.stack); if (inZone(el)) return drop(d.type, d.key, null);
    };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  }
  tray.addEventListener('click', e => {
    const up = e.target.closest('[data-stackup]'); if (up) { const s = stacks.find(x => x.id === +up.dataset.stackup); if (s) { s.h++; sel = s.id; } return emit(); }
    const hide = e.target.closest('[data-shide]'); if (hide) { const s = stacks.find(x => x.id === +hide.dataset.shide); if (s) { s.off = !s.off; if (!s.off) delete s.off; sel = s.id; } return emit(); }
    const u = e.target.closest('[data-unstack]'); if (u) { const s = stacks.find(x => x.id === +u.dataset.unstack); if (s) { s.h--; if (s.h <= 0) { stacks = stacks.filter(x => x !== s); if (open === s.id) open = null; } } return emit(); }
    const o = e.target.closest('[data-sopen]'); if (o) { const id = +o.dataset.sopen; open = open === id ? null : id; sel = id; return render(); }
    const st = e.target.closest('[data-stack]'); if (st) { sel = +st.dataset.stack; if (openOnClick || open !== null) open = sel; render(); }
  });
  tray.addEventListener('dblclick', e => { const st = e.target.closest('[data-stack]'); if (!st) return; const id = +st.dataset.stack; open = open === id ? null : id; sel = id; render(); });

  // ---------------- a stack's DETAILS, and its dials ----------------
  const step = (k, val, title) => `<span class="st" title="${esc(title)}">${k.label} <button data-dial="${k.key}:-1">−</button><i>${val}</i><button data-dial="${k.key}:1">+</button></span>`;
  function renderInfo() {
    const s = stacks.find(x => x.id === open); if (!s) { info.hidden = true; info.innerHTML = ''; return; }
    info.hidden = false; info.style.setProperty('--c', CHIPC[s.kind]);
    const mods = ship ? ship.ds.mods.filter(x => x.mod.src === s.id) : [], t = ship && ship.t, dl = s.dials || {};
    let html = `<div class="top"><b>${label(s)}${s.h > 1 ? ' ×' + s.h : ''}</b>`;
    if (KINDS[s.kind]?.mount && s.kind !== 'hangar') {
      const p = PRESETS[s.role] || PRESETS.standard, base = { dmg: p.dmg, rof: p.rof, rng: p.rng, chg: 1 };
      html += `<span class="muted">${gunsPerChip * s.h} gun${gunsPerChip * s.h === 1 ? '' : 's'} · role</span><select data-srole>${['standard', ...CHIPS.role.map(c => c[0])].map(id => `<option value="${id}" ${(s.role || 'standard') === id ? 'selected' : ''}>${PRESETS[id].name}</option>`).join('')}</select><span class="muted">${esc(p.what)}</span><button class="x" data-sclose>✕</button></div>`;
      html += `<div class="dials">${step({ key: 'dmg', label: 'damage' }, '×' + (dl.dmg || base.dmg), 'damage dial: bigger shots — bulkier, dearer, harder to aim')}${step({ key: 'rof', label: 'rate' }, '×' + (dl.rof || base.rof), 'rate of fire dial')}${step({ key: 'rng', label: 'reach' }, '×' + (dl.rng || base.rng), 'range dial')}${s.kind === 'weapon_missile' ? step({ key: 'chg', label: 'load' }, '×' + (dl.chg || 1), 'missiles carried') : ''}${Object.keys(dl).length ? '<button class="x" data-sreset>back to the role</button>' : ''}</div>`;
      for (const x of mods) {
        const v = x.v, d = v.damage * t.powerFactor * t.fireFactor, aim = Math.min(98, v.accuracy + t.bonus), pd = (x.mod.role || PRESETS[x.mod.preset]?.role) === 'pd';
        html += `<div>each gun: <b>${fmt(v.damage)}</b> a shot, <b>${v.rate.toFixed(2)}</b>/s, <b>${Math.round(aim)} %</b> to hit, reach <b>${fmt(v.range)}</b>${x.K.charges ? `, ${Math.round(v.charges)} missiles` : ''} · takes ${(x.load * x.n).toFixed(1)} mounts · cost ${fmt(x.cost * x.n)} · bulk ${fmt(x.volume * x.n)}</div>`;
        html += `<div>all ${x.n}: ${layerHtml(vsLayers(d, v.rate * aim / 100 * x.n, x.mod.preset, x.kind))}</div>`;
        if (pd) html += `<div class="muted">point defence: missiles and drones first; on a hull over ${PD.smallTop} only ×${PD.vsShip} of this</div>`;
      }
    } else if (s.kind === 'hangar') {
      html += `<span class="muted">${4 * s.h} drones · role</span><select data-srole>${DRONE_ROLES.map(id => `<option value="${id}" ${(s.role || 'standard') === id ? 'selected' : ''}>${id === 'pd' ? 'Escort (point defence)' : PRESETS[id].name}</option>`).join('')}</select><button class="x" data-sclose>✕</button></div>`;
      html += `<div class="dials">${step({ key: 'sz', label: 'drone size' }, '×' + (dl.sz || 1), 'bigger drones: more hull and damage, slower, bulkier')}${Object.keys(dl).length ? '<button class="x" data-sreset>back to the role</button>' : ''}</div>`;
      for (const x of mods) {
        const R = droneRole(x.mod.preset || 'standard'), D = B.drone, sz = x.v.size, d = D.dmg * sz * R.dmg;
        html += `<div>${Math.round(x.v.craft) * x.n} drones, size ×${sz.toFixed(1)}: each ${fmt(D.hp * sz * (R.hp || 1))} HP, <b>${fmt(d)}</b> a shot, reach ${fmt(D.range * R.range)} · cost ${fmt(x.cost * x.n)} · bulk ${fmt(x.volume * x.n)}</div>`;
        html += `<div>each drone in the air: ${layerHtml(vsLayers(d, D.rate * R.rate * D.acc / 100, null, 'weapon_energy'))}</div><div class="muted">${t.airCap} of ${t.drones} fly at once${R.escort ? ' · escorts circle the carrier and shoot missiles and drones' : ''}</div>`;
      }
    } else {
      html += `<button class="x" data-sclose>✕</button></div>`;
      for (const x of mods) {
        const v = x.v, n = x.n;
        if (x.kind === 'armor') html += `<div>${n} layers: <b>${fmt(v.hp * n)} HP</b>, shrugs ${v.deflect.toFixed(1)} off every hit · cost ${fmt(x.cost * n)}</div><div class="muted">the shell outside the hull: layers ring outward, each bulkier than the last; a fabricator mends it from its stock</div>`;
        if (x.kind === 'shield') html += `<div>${n} shield${n > 1 ? 's' : ''} of size ×${x.k}: <b>${fmt(v.capacity * n)}</b> capacity, +${fmt(v.recovery * n)}/s · cover ${pct(t.cover)} · cost ${fmt(x.cost * n)} · bulk ${fmt(x.volume * n)}</div><div class="muted">a generator is dialled up until its field covers the whole ship — a bigger ship, a bigger and dearer shield; a second one is a second full field, twice the capacity — every hit loses ${SHIELD.hard} on it, and it pauses ${SHIELD.delay} s after a hit</div>`;
        if (x.kind === 'thruster') html += `<div>${n} thrusters: +${fmt(v.thrust * n)} thrust, +${fmt(v.evasion * n)} agility · cost ${fmt(x.cost * n)}</div><div class="muted">speed, turning and evasion — a big ship needs many to dance</div>`;
        if (x.kind === 'works') html += `<div>${n} fabricator${n > 1 ? 's' : ''}: ${fmt(v.industry * n)} industry, stock ${fmt(x.volume * n * 4)} · cost ${fmt(x.cost * n)}</div><div class="muted">reloads missiles, rebuilds drones and mends hull and armour — all paid from its stock</div>`;
        if (x.kind === 'lab') html += `<div>${n} lab${n > 1 ? 's' : ''}: research ${fmt(v.research * n)} · cost ${fmt(x.cost * n)}</div><div class="muted">parked in orbit, it studies that place (and every lab in a system studies its star)</div>`;
        if (x.kind === 'habitat') html += `<div>${n} habitat${n > 1 ? 's' : ''}: room for ${fmt(v.housing * n)} · cost ${fmt(x.cost * n)}</div><div class="muted">on a ship it carries a thousandth of that — settlers, who found a colony where they land</div>`;
        if (x.kind === 'gantry') html += `<div>${n} gantr${n > 1 ? 'ies' : 'y'} ${x.rect ? x.rect.join(' × ') : '4 × 2'} · cost ${fmt(x.cost * n)}</div><div class="muted">a space dock: ships that fit inside it are built whole wherever it is parked</div>`;
      }
    }
    if (!mods.length) html += `<div class="muted">${s.off ? 'hidden: it is left out of the ship — press 👁 on it to build it in again' : ship ? 'nothing of it made it into the ship at this price' : 'build the ship to see what it does'}</div>`;
    if (infoExtra) html += infoExtra(s, mods) || '';
    info.innerHTML = html;
  }
  info.addEventListener('click', e => {
    const s = stacks.find(x => x.id === open); if (!s) return;
    if (onInfoClick && onInfoClick(e, s)) return emit();
    if (e.target.closest('[data-sclose]')) { open = null; return render(); }
    if (e.target.closest('[data-sreset]')) { delete s.dials; return emit(); }
    const b = e.target.closest('[data-dial]'); if (!b) return;
    const [k, d] = b.dataset.dial.split(':'), dir = +d, p = PRESETS[s.role] || PRESETS.standard, base = { dmg: p.dmg, rof: p.rof, rng: p.rng, chg: 1, sz: 1 };
    s.dials = s.dials || {};
    if (k === 'sz') s.dials.sz = clamp((s.dials.sz || 1) + dir * 0.5, 0.5, 3);
    else s.dials[k] = clamp((s.dials[k] || base[k]) + dir * GUN.step, GUN.min, GUN.max);
    emit();
  });
  info.addEventListener('change', e => { const r = e.target.closest('[data-srole]'); if (!r) return; const s = stacks.find(x => x.id === open); if (!s) return; s.role = r.value === 'standard' ? null : r.value; delete s.dials; emit(); });

  // ---------------- the CHARACTER SHEET ----------------
  function renderSheet(warnExtra = []) {
    if (!ship) { sheet.innerHTML = '<div class="tiny">Add a weapon at least — the ship is built here.</div>'; return; }
    const t = ship.t, row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`, sec = (h, rows) => `<div class="sec"><h4>${h}</h4>${rows}</div>`;
    let L = { shield: 0, through: 0, armor: 0, hull: 0 };
    for (const x of ship.ds.mods) if (x.K.mount && !x.K.hangar && !x.K.orbital) { const v = x.v, aim = Math.min(98, v.accuracy + t.bonus), l = vsLayers(v.damage * t.powerFactor * t.fireFactor, v.rate * aim / 100 * x.n, x.mod.preset, x.kind); for (const k in L) L[k] += l[k]; }
    const w = [...warnExtra];
    if (t.powerFactor < 0.999) w.push(`Not enough power: everything runs at ${pct(t.powerFactor)}.`);
    if (t.fireFactor < 0.999) w.push(`The weapons computer is short: the guns fire at ${pct(t.fireFactor)}.`);
    if (t.shieldRaw && t.cover < 0.99) w.push(`The shield covers ${pct(t.cover)} of the hull.`);
    if (t.drones && !t.airCap) w.push('No drone can fly: the computer has no mounts left over for them.');
    sheet.innerHTML = `<div class="head"><span class="cost">${fmt(t.cost)}</span><b>${classOf(t.cost)}</b><span class="tiny">${esc(ship.arch ? ship.arch.label : '')}</span></div>
      <div class="cols">${sec('Body', row('Volume (mass)', `${fmt(t.volume)} · ${t.squares} squares`) + row('Hull', `${fmt(t.hp)} HP`) + row('Armour', t.armor ? `${fmt(t.armor)} HP · shrugs ${t.deflect.toFixed(1)}/hit` : 'none') + row('Shield', t.shieldRaw ? `${fmt(t.shieldRaw)} · +${fmt(t.shieldRec)}/s · ${pct(t.cover)} cover` : 'none') + (t.hullRepair ? row('Repairs', `${t.hullRepair.toFixed(1)} hull/s from stock`) : ''))}
        ${sec('Firepower', row('Damage', `${fmt(t.dps)} dmg/s`) + row('vs shield', `<span style="color:${LAYER.shield}">${fmt(L.shield)}</span>${L.through > 0.05 ? ` (+${fmt(L.through)} through)` : ''}`) + row('vs armour', `<span style="color:${LAYER.armor}">${fmt(L.armor)}</span>`) + row('vs hull', `<span style="color:${LAYER.hull}">${fmt(L.hull)}</span>`) + row('Stands off at', `${ship.pref} u`) + (ship.pd ? row('Point defence', `${ship.pd} guns`) : '') + (t.missiles ? row('Missiles', t.missiles) : '') + (t.drones ? row('Drones', `${t.drones}, ${t.airCap} in the air`) : ''))}
        ${sec('Handling', row('Speed', fmt(t.speed)) + row('Turn speed', `${Math.round(t.turn)}°/s`) + row('Evasion', `${Math.round(t.evasion)} %`) + row('Aim (best)', `${Math.round(t.targeting || 0)} %`))}
        ${sec('Systems', row('Power', `${fmt(t.powerOut)} MW made, ${fmt(t.powerUse)} used`) + row('Computer', `${t.mounts.toFixed(1)} mounts, ${t.mountsUsed.toFixed(1)} used`) + (t.fabStock ? row('Fabricator stock', fmt(t.fabStock)) : '') + (t.heatCap ? row('Heat', `holds ${fmt(t.heatCap)}, sheds ${fmt(t.cool)}/s`) : ''))}</div>
      ${w.map(x => `<div class="warn">⚠ ${x}</div>`).join('')}<div class="sys">${esc(systemsOf(ship))}</div>`;
  }
  render(); renderSheet();
  return {
    get stacks() { return stacks; },
    set(list) { stacks = (list || []).map(s => ({ ...s, id: nextId++, ...(s.dials ? { dials: { ...s.dials } } : {}), ...(s.caps ? { caps: s.caps.slice() } : {}) })); sel = stacks.length ? stacks[0].id : null; open = null; render(); },
    get openId() { return open; },
    reopen(i) { const s = stacks[i]; if (s) { open = s.id; sel = s.id; render(); } },
    showShip(s, warn = []) { ship = s; if (autoChips) render(); else renderInfo(); renderSheet(warn); },   // the auto chips follow the ship: the tray is redrawn with it
    close() { if (open === null) return; open = null; render(); },
    clear() { stacks = []; sel = null; open = null; render(); },
  };
}
