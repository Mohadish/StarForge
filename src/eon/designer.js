// THE SHIP EDITOR inside the Painter — the very same as the Fleet Generator's (his call, 2026-10-13: "the painter and the fleet
// generator should be identical"): the silhouette strip (the Painter's own, above the picture), the PRICE with its lock, and the
// CHIPS (chipeditor.js) — weapons, roles and traits dragged into the tray (or onto the ship), a stack opened for its details and
// dials, the character sheet under it. The reactor, the weapons computer and the star drive size themselves, and the shield always
// grows to cover the ship (more shields make it stronger). PRICE: 🔓 unlocked, the price follows the chips — add one, turn a dial,
// and the price and the bulk go up; 🔒 locked (drag the price, or press the lock), the ship is built TO that price and the chips
// are emphasis, as in a fleet. The ship travels as a SHIP CODE and goes into MY SHIPS (shipcode.js, library.js), which the Fleet
// Generator reads. The page gives the elements (ids below) and a few hooks.
import { KINDS } from './modules.js';
import { shipFromDesign, archetype, designFromChips, rng32 } from './battle.js';
import { shipRecord, shipCode, shipFromCode, designOf, chipsOfDesign } from './shipcode.js';
import { readShips, loadShips, saveShips } from './library.js';
import { saveFlow } from './hullui.js';
import { createChipEditor, CHIPS } from './chipeditor.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString('en');
const STORE = 'forge.painter.ship.v2';
const PMIN = 150, PMAX = 30000, toPos = p => Math.round(1000 * Math.log(Math.max(PMIN, Math.min(PMAX, p)) / PMIN) / Math.log(PMAX / PMIN)), toPrice = v => Math.round(PMIN * Math.pow(PMAX / PMIN, v / 1000) / 10) * 10;   // the price slider runs on a log scale: 150 … 30 000
const isWeapon = c => CHIPS.weapon.some(w => w[0] === c.kind);
const starter = () => ({ name: 'My ship', chips: [{ type: 'weapon', kind: 'weapon_energy', h: 1, role: null }, { type: 'trait', kind: 'armor', h: 1, role: null }], price: 600, locked: false, seed: 1 + Math.floor(Math.random() * 1e6), fixed: null });

export function createDesigner({ $, S = { breakthroughs: [] }, hdlg, getHull, setHull, coat, setCoat, onChange }) {
  let D = null, ship = null, SHIPS = readShips();
  try { const x = JSON.parse(localStorage.getItem(STORE) || 'null'); if (x && Array.isArray(x.chips)) D = x; } catch (e) { /* a fresh one */ }
  if (!D) D = starter();
  loadShips().then(r => { if (r.durable) SHIPS = r.list; });
  const note = html => { $('dNote').innerHTML = html; };
  const stacksOut = () => chipEd.stacks.map(c => ({ id: c.id, type: c.type, kind: c.kind, h: c.h, role: c.role, ...(c.dials ? { dials: { ...c.dials } } : {}) }));
  const keep = () => { D.chips = stacksOut(); D.hull = getHull() || D.hull; try { localStorage.setItem(STORE, JSON.stringify(D)); } catch (e) { /* fine */ } };
  const chipEd = createChipEditor({ palette: $('dPalette'), tray: $('dTray'), info: $('dInfo'), sheet: $('dSheet'), dropZones: ['#out', '.stage'] }, { onChange: () => { D.fixed = null; changed(); } });

  function build() {
    const hull = getHull();
    if (D.fixed) { const d = designOf(D.fixed); if (hull) d.hull = hull; ship = shipFromDesign(S, d); ship.arch = archetype(ship); return; }   // a pasted code, exactly as it was built
    const stacks = stacksOut(); if (!stacks.some(isWeapon)) { ship = null; return; }
    const d = designFromChips(S, stacks, D.locked ? D.price : null, rng32(D.seed)); if (!d) { ship = null; return; }
    if (hull) d.hull = hull;
    ship = shipFromDesign(S, d); ship.arch = archetype(ship);
    if (!D.locked) D.price = Math.round(ship.cost);
  }
  function syncPrice() {
    $('dCost').value = toPos(D.price); if (document.activeElement !== $('dCostN')) $('dCostN').value = Math.round(D.price);
    $('dLock').textContent = D.fixed ? '📌' : D.locked ? '🔒' : '🔓';
    $('dLockNote').textContent = D.fixed ? 'a fixed design, exactly as its code built it — change a chip to make it yours' : D.locked ? 'locked: the ship is built to this price, the chips are emphasis' : 'unlocked: the price follows the chips — add one or turn a dial and it goes up';
  }
  function changed() {
    build(); keep(); syncPrice(); renderCode();
    const warn = []; if (ship && D.locked && Math.abs(ship.cost - D.price) / D.price > 0.08) warn.push(`Not quite at the price: it comes to ${fmt(ship.cost)} for ${fmt(D.price)}.`);
    if (!ship && chipEd.stacks.length && !D.fixed) warn.push('Add a weapon — a ship needs one.');
    chipEd.showShip(ship, warn); if (onChange) onChange();
  }

  // ---------------- the price, and its lock ----------------
  const setPrice = p => { D.price = Math.max(PMIN, Math.min(PMAX, Math.round(p))); D.locked = true; D.fixed = null; changed(); };
  $('dCost').addEventListener('input', () => { D.price = toPrice(+$('dCost').value); $('dCostN').value = D.price; });
  $('dCost').addEventListener('change', () => setPrice(toPrice(+$('dCost').value)));
  $('dCostN').addEventListener('change', () => setPrice(+$('dCostN').value || D.price));
  $('dLock').onclick = () => { if (D.fixed) { note('📌 A fixed design keeps its own price — change a chip and it becomes yours, with a price you can lock or let follow the chips.'); return; } D.locked = !D.locked; changed(); };

  // ---------------- the ship as a code; my ships ----------------
  const record = () => ({ ...shipRecord(ship.design, { name: D.name, ...coat() }), chips: D.fixed ? undefined : stacksOut(), price: D.price, locked: D.locked, seed: D.seed });
  function renderCode() { if (document.activeElement !== $('dCode')) $('dCode').value = ship ? shipCode(record()) : ''; }
  // open a ship record: one made here comes back as its chips, its price and its lock; any other (a fleet's ship, an old code) as
  // the exact design (📌), its chips shown as near as chips can say it
  function open(rec, from = 'code') {
    D = { name: rec.name || 'Ship', chips: [], price: rec.price || rec.cost || 600, locked: !!rec.locked, seed: rec.seed || 1, fixed: null, ...(rec.id && from === 'mine' ? { libId: rec.id } : {}) };
    if (Array.isArray(rec.chips) && rec.chips.length) chipEd.set(rec.chips);
    else { D.fixed = { name: rec.name, hull: rec.hull, modules: rec.modules }; chipEd.set(chipsOfDesign(designOf(rec))); }
    $('dName').value = D.name;
    if (setHull) setHull(rec); if (rec.style && setCoat) setCoat(rec);
    changed(); note(`<b>${esc(D.name)}</b> is open — ${from === 'mine' ? 'from your ships' : 'from the code'}${D.fixed ? ', exactly as it was built (📌)' : ''}.`);
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
  $('dNew').onclick = () => { D = starter(); chipEd.set(D.chips); $('dName').value = D.name; changed(); note('A fresh ship: a pair of beams and some armour, the price following the chips.'); };
  $('dName').value = D.name; chipEd.set(D.chips);

  return {
    // the guns to paint, as the painter wants them: kind, how many, size (the gun's bulk against a plain one, as the game sizes its hard points)
    paintGuns() {
      if (!ship) return []; const out = new Map();
      for (const m of ship.ds.mods) if (m.K.mount && !m.K.orbital) { const size = m.volume / m.K.volume, key = m.kind + '|' + size.toFixed(2), e = out.get(key) || { kind: m.kind, n: 0, size }; e.n += m.n; out.set(key, e); }
      return [...out.values()];
    },
    volume: () => ship ? ship.t.volume : null,
    ship: () => ship,
    start() { changed(); },
    refresh() { build(); syncPrice(); renderCode(); chipEd.showShip(ship); },     // the silhouette changed: hard points, squares follow (no repaint asked)
    codeChanged: renderCode,                                                         // the coat changed: the code carries it
  };
}
