// Design editors. The same editor serves two screens:
//   Shipyard         — ship designs only (building ships will need a shipyard — not designed yet)
//   Building design  — building designs only; they are built by dragging them onto the colony map.
// A ship or building IS its parts: place parts on the grid, wrap them in armor, save the design.
import { $, fmt, esc, uid, toast } from '../util.js';
import { CATS, GROUPS } from '../data/categories.js';
import { S, bp, design, commit } from '../core/state.js';
import { dims, occupancy, canPlace, outline, assemblyStats } from '../core/assembly.js';
import { GW, GH } from '../core/physics.js';
import { planetStats } from '../core/economy.js';
import { bbox } from '../core/colonymap.js';
import { bpLine, row, card, warn, ok } from './common.js';
import { focusDesign } from './colony.js';
import { go } from './nav.js';

const CPX = 14;
const L = id => bp(id);

export function createDesigner(kind) {
  const isShip = kind === 'ship';
  let W = null, hand = null, hover = null;
  const blank = () => ({ id: null, name: isShip ? 'New ship' : 'New building', kind, parts: [], armor: null });
  const clone = d => ({ id: d.id, name: d.name, kind: d.kind, parts: d.parts.map(p => ({ ...p })), armor: d.armor });
  const sig = d => JSON.stringify([d.name, d.parts, d.armor]);
  const isDirty = () => { const d = W.id && design(W.id); return !d || sig(d) !== sig(W); };
  const mine = () => S.designs.filter(d => d.kind === kind);

  const TPL = `
<div class="page" style="grid-template-columns:270px 1fr 330px">
  <section>
    <h2>Parts — click one, then click in the grid</h2>
    <div id="ydPal"></div>
    <h2 style="margin-top:12px">Armor — wraps the outline</h2>
    <select id="ydArmor" style="width:100%"></select>
    <div class="tiny" id="ydArmorInfo" style="margin-top:6px"></div>
  </section>
  <section>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <b style="color:var(--accent)">${isShip ? 'SHIP' : 'BUILDING'}</b>
      <input type="text" id="ydName" style="width:190px">
      <span class="tiny" id="ydDirty"></span>
      <span style="margin-left:auto"></span>
      <button id="ydNew">New ${isShip ? 'ship' : 'building'}</button>
      <button id="ydSave">Save design</button><button id="ydCopy">Save as copy</button>
      ${isShip ? '' : '<button class="go" id="ydPlace">Save &amp; place on the map ▸</button>'}
    </div>
    <canvas id="ydCv" width="${GW * CPX}" height="${GH * CPX}"></canvas>
    <div class="tiny" style="margin-top:6px" id="ydHelp"></div>
    ${isShip ? '<div class="note" style="margin-top:8px">Ships can be designed and tested in battle, but not built yet — building ships will need a shipyard, which is not designed yet.</div>' : ''}
  </section>
  <section>
    <h2>Final spec</h2>
    <div id="ydSpec"></div>
    <h2 style="margin-top:12px">Saved ${isShip ? 'ship' : 'building'} designs</h2>
    <div id="ydDesigns"></div>
    ${isShip ? '<h2 style="margin-top:12px">Fleet</h2><div id="ydFleet"></div>' : ''}
  </section>
</div>`;

  function mount(el) {
    el.innerHTML = TPL;
    if (!W || (W.id && !design(W.id) && !W.parts.length)) W = mine()[0] ? clone(mine()[0]) : blank();
    W.parts = W.parts.filter(p => bp(p.bp));
    if (W.armor && !bp(W.armor)) W.armor = null;
    el.addEventListener('click', onClick);
    $('ydName').oninput = e => { W.name = e.target.value; renderHeader(); };
    $('ydArmor').onchange = e => { W.armor = e.target.value || null; changed(); };
    $('ydNew').onclick = startNew;
    $('ydSave').onclick = () => saveDesign(false);
    $('ydCopy').onclick = () => saveDesign(true);
    if (!isShip) $('ydPlace').onclick = () => { const d = saveDesign(false); if (d) { focusDesign(d.id); go('colony'); } };
    const off = bindCanvas();
    renderAll();
    return off;
  }
  function refresh() { if ($('ydCv')) renderAll(); }
  function reset() { W = null; hand = null; hover = null; }

  function renderAll() { renderHeader(); renderPalette(); drawYard(); renderSpec(); renderDesigns(); if (isShip) renderFleet(); }
  function changed() { renderHeader(); drawYard(); renderSpec(); }

  function onClick(e) {
    const t = e.target.closest('[data-pick],[data-open],[data-del]');
    if (!t) return;
    if (t.dataset.pick) { hand = hand === t.dataset.pick ? null : t.dataset.pick; renderPalette(); drawYard(); return; }
    if (t.dataset.del) { e.stopPropagation(); delDesign(t.dataset.del); return; }
    if (t.dataset.open) {
      if (W.parts.length && isDirty() && !confirm('Discard unsaved changes?')) return;
      W = clone(design(t.dataset.open)); hand = null; renderAll();
    }
  }
  function startNew() {
    if (W.parts.length && isDirty() && !confirm('Discard unsaved changes?')) return;
    W = blank(); hand = null; renderAll();
  }
  function saveDesign(asCopy) {
    if (!W.parts.length) { toast('Nothing to save — the grid is empty.'); return null; }
    const exists = W.id && design(W.id);
    if (asCopy || !exists) {
      if (asCopy && exists) W.name += ' copy';
      W.id = uid('d');
      S.designs.push(clone(W));
    } else Object.assign(design(W.id), clone(W));
    commit();
    toast(`Saved design: ${esc(W.name)}.` + (!isShip && exists && !asCopy ? '<br>Buildings already placed keep the layout they were placed with.' : ''));
    return design(W.id);
  }
  function delDesign(id) {
    const d = design(id);
    if (!d || !confirm(`Delete design "${d.name}"? Anything already built or placed stays.`)) return;
    S.designs = S.designs.filter(x => x.id !== id);
    if (W.id === id) W.id = null;
    commit();
  }

  function renderHeader() {
    if ($('ydName') !== document.activeElement) $('ydName').value = W.name;
    $('ydDirty').textContent = !isDirty() ? 'saved' : (W.id && design(W.id) ? '● unsaved changes' : '● not saved yet');
    $('ydHelp').textContent = isShip
      ? 'Nose points right →  ·  click = place  ·  click a placed part = pick it up  ·  right-click = remove  ·  Esc = drop  ·  one square = 2 × 2 u = 4 t'
      : 'One square here = one square of colony land = 4 t  ·  the shape you draw is the shape on the map  ·  click = place  ·  right-click = remove  ·  Esc = drop';
  }

  function renderPalette() {
    const res = S.blueprints.filter(b => b.researched);
    const order = isShip ? GROUPS : [...GROUPS].reverse();   // buildings: civilian first
    $('ydPal').innerHTML = order.map(g => {
      const cards = Object.values(CATS).filter(c => c.group === g.id && !c.perU)
        .map(c => res.filter(b => b.cat === c.id).map(b => `<div class="bp ${hand === b.id ? 'sel' : ''}" data-pick="${b.id}" style="border-left-color:${c.color}"><div class="n"><span>${esc(b.name)}</span></div>${bpLine(b)}</div>`).join('')).join('');
      return cards ? `<div class="grp">${g.name}</div>${cards}` : '';
    }).join('');
    const arm = res.filter(b => CATS[b.cat].perU);
    $('ydArmor').innerHTML = '<option value="">— no armor —</option>'
      + arm.map(b => `<option value="${b.id}" ${W.armor === b.id ? 'selected' : ''}>${esc(b.name)} · ${b.v.hp} HP/u · ${fmt(b.s.mass)} t/u</option>`).join('');
  }

  function bindCanvas() {
    const cv = $('ydCv');
    const cellAt = e => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) * cv.width / r.width / CPX), y: Math.floor((e.clientY - r.top) * cv.height / r.height / CPX) }; };
    cv.onmousemove = e => {
      const p = cellAt(e), b = hand && bp(hand);
      if (b) { const d = dims(b.cat, b.s.mass); hover = { x: p.x - Math.floor(d.w / 2), y: p.y - Math.floor(d.h / 2) }; } else hover = null;
      drawYard();
    };
    cv.onmouseleave = () => { hover = null; drawYard(); };
    cv.onclick = e => {
      const p = cellAt(e);
      if (hand && hover) { if (canPlace(W.parts, L, hand, hover.x, hover.y)) { W.parts.push({ bp: hand, x: hover.x, y: hover.y }); changed(); } return; }
      const i = occupancy(W.parts, L).get(p.x + ',' + p.y);
      if (i !== undefined) { hand = W.parts[i].bp; W.parts.splice(i, 1); renderPalette(); changed(); cv.onmousemove(e); }
    };
    cv.oncontextmenu = e => {
      e.preventDefault();
      const p = cellAt(e), i = occupancy(W.parts, L).get(p.x + ',' + p.y);
      if (i !== undefined) { W.parts.splice(i, 1); changed(); }
    };
    const onKey = e => { if (e.key === 'Escape') { hand = null; hover = null; renderPalette(); drawYard(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }

  function drawYard() {
    const cv = $('ydCv'); if (!cv) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(130,180,230,.08)';
    for (let x = 0; x <= GW; x++) { g.beginPath(); g.moveTo(x * CPX + 0.5, 0); g.lineTo(x * CPX + 0.5, GH * CPX); g.stroke(); }
    for (let y = 0; y <= GH; y++) { g.beginPath(); g.moveTo(0, y * CPX + 0.5); g.lineTo(GW * CPX, y * CPX + 0.5); g.stroke(); }
    const ab = W.armor && bp(W.armor);
    if (ab && W.parts.length) {
      const th = Math.max(2, Math.min(12, ab.s.mass * 5));
      g.strokeStyle = CATS.armor.color; g.lineWidth = th; g.lineCap = 'square';
      for (const [x1, y1, x2, y2, nx, ny] of outline(W.parts, L).edges) { g.beginPath(); g.moveTo(x1 * CPX + nx * th / 2, y1 * CPX + ny * th / 2); g.lineTo(x2 * CPX + nx * th / 2, y2 * CPX + ny * th / 2); g.stroke(); }
      g.lineWidth = 1;
    }
    for (const p of W.parts) drawPart(g, p.bp, p.x, p.y, 1);
    if (hand && hover) drawPart(g, hand, hover.x, hover.y, 0.45, canPlace(W.parts, L, hand, hover.x, hover.y) ? '#7ef3b0' : '#ff7979');
    if (isShip) { g.fillStyle = '#9eb3d855'; g.font = 'bold 14px sans-serif'; g.fillText('NOSE →', cv.width - 70, 20); }
  }
  function drawPart(g, bpId, x, y, alpha, stroke) {
    const b = bp(bpId); if (!b) return;
    const d = dims(b.cat, b.s.mass);
    g.globalAlpha = alpha; g.fillStyle = CATS[b.cat].color; g.fillRect(x * CPX + 1, y * CPX + 1, d.w * CPX - 2, d.h * CPX - 2); g.globalAlpha = 1;
    g.strokeStyle = stroke || '#0008'; g.lineWidth = stroke ? 2 : 1; g.strokeRect(x * CPX + 1, y * CPX + 1, d.w * CPX - 2, d.h * CPX - 2); g.lineWidth = 1;
    if (d.w * CPX > 44) {
      g.fillStyle = '#04070f'; g.font = 'bold 10px sans-serif'; g.fillText(b.name.slice(0, Math.floor(d.w * CPX / 6)), x * CPX + 4, y * CPX + 12);
      if (d.h > 1) { g.font = '10px sans-serif'; g.fillText(fmt(b.s.mass) + ' t', x * CPX + 4, y * CPX + 24); }
    }
  }

  function renderSpec() {
    const t = assemblyStats(W, L);
    let h = '';
    if (!t.parts) { $('ydSpec').innerHTML = '<div class="tiny">Empty. Pick a part on the left and click in the grid.</div>'; $('ydArmorInfo').textContent = ''; return; }
    if (!t.connected) h += warn('Parts are not all touching — these are two separate things.');
    if (isShip) {
      if (!t.thrust) h += warn('No engine — it cannot move or turn.');
      if (!t.powerOut) h += warn('No reactor — nothing on it has power.');
      if (!t.weapons.length) h += warn('No weapon.');
      if (t.civParts) h += warn(`${t.civParts} civilian part${t.civParts > 1 ? 's' : ''} — on a ship they produce nothing yet, they only add weight and power draw.`);
      if (t.powerOut && t.power < 1) h += warn(`Power: reactor ${fmt(t.powerOut)} MW, everything at once needs ${fmt(t.load)} MW → all systems at ${Math.round(t.power * 100)}% (the buffer hides it for ${fmt(t.buffer / Math.max(1, t.load - t.powerOut))} s).`);
      else if (t.powerOut) h += ok(`Power: ${fmt(t.powerOut)} MW covers the ${fmt(t.load)} MW full load.`);
      h += card(row('Total mass', fmt(t.mass) + ' t') + row('…of which armor', `${fmt(t.armorMass)} t (${t.mass ? Math.round(100 * t.armorMass / t.mass) : 0}%)`) + row('Outline', t.perimU + ' u')
        + row('Build cost', fmt(t.cost) + ' cr') + row('Research behind it', fmt(t.rp) + ' RP'));
      h += card(row('Acceleration', fmt(t.accel) + ' u/s²') + row('Top speed', fmt(t.top) + ' u/s') + row('Turn rate', fmt(t.turnRate) + ' °/s') + row('90° turn', t.turnRate ? fmt(90 / t.turnRate) + ' s' : 'never'));
      h += card(row('Weapons', `${t.weapons.length} · ${fmt(t.dps)} HP/s on paper`) + row('…with this reactor', fmt(t.dps * Math.min(1, t.power)) + ' HP/s sustained', t.power < 1 ? 'up' : '') + row('Longest reach', t.maxRange + ' u'));
      h += card(row('Shield', `${fmt(t.shield.cap)} HP · +${fmt(t.shield.regen)}/s`) + row('Armor', `${fmt(t.armorHP)} HP · shrugs ${t.dr}/hit`) + row('Structure', fmt(t.structHP) + ' HP') + row('Total to chew through', fmt(t.totalHP) + ' HP'));
    } else {
      const p = planetStats(S), b = bbox(W.parts, L);
      if (t.byCat.engine) h += warn('Engines do nothing on a building — dead weight.');
      const net = t.powerOut - t.civDraw - t.shield.draw * 0.1, spare = p.powerOut - p.powerDraw;
      h += card(row('Total mass', fmt(t.mass) + ' t') + row('Footprint on the map', `${b.w} × ${b.h} · ${t.cells} squares (free now: ${p.landFree})`, t.cells > p.landFree ? 'up' : '')
        + row('Build cost', fmt(t.cost) + ' cr') + row('Build time', p.prodOut > 0 ? `≈ ${Math.ceil(t.cost / p.prodOut)} turns at ${fmt(p.prodOut)} cr/turn` : 'no factories')
        + row('Research behind it', fmt(t.rp) + ' RP'));
      const out = [['Houses', t.housing, ' M people'], ['Food', t.food, ' M fed / turn'], ['Income', t.credits, ' cr / turn'], ['Build capacity', t.production, ' cr / turn'], ['Research', t.research, ' RP / turn']].filter(x => x[1] > 0);
      h += card((out.length ? out.map(([a, v, u]) => row(a, '+' + fmt(v) + u)).join('') : '<div class="tiny">Produces nothing.</div>')
        + (t.jobs ? row('Needs workers', `${fmt(t.jobs)} M (idle now: ${fmt(p.idle)} M)`, t.jobs > p.idle ? 'up' : '') : '')
        + row('Power', net >= 0 ? `+${fmt(net)} MW to the grid` : `takes ${fmt(-net)} MW (spare on the grid now: ${fmt(spare)} MW)`, net < 0 && -net > spare ? 'up' : ''));
    }
    $('ydSpec').innerHTML = h;
    const ab = W.armor && bp(W.armor);
    $('ydArmorInfo').innerHTML = ab ? `${t.perimU} u of outline × ${fmt(ab.s.mass)} t/u = <b>${fmt(t.armorMass)} t</b> and <b>${fmt(t.armorCost)} cr</b>. A more compact shape needs less.` : 'No armor: once the shield is down, hits go straight into the parts.';
  }

  function renderDesigns() {
    const ds = mine();
    $('ydDesigns').innerHTML = ds.map(d => {
      const t = assemblyStats(d, L), built = S.instances.filter(i => i.designId === d.id).length;
      return `<div class="bp ${W.id === d.id ? 'sel' : ''}" data-open="${d.id}"><div class="n"><span>${esc(d.name)}</span><button class="x" data-del="${d.id}" title="delete design">✕</button></div>
        <div class="tiny">${fmt(t.mass)} t · ${fmt(t.cost)} cr · ${isShip ? 'top ' + fmt(t.top) + ' u/s' : t.cells + ' squares'} · ${built} built</div></div>`;
    }).join('') || '<div class="tiny">None yet.</div>';
  }

  function renderFleet() {
    const ships = S.instances.filter(i => i.kind === 'ship');
    $('ydFleet').innerHTML = ships.map(i => {
      const a = assemblyStats(i, L);
      return `<div class="bp" style="cursor:default"><div class="n"><span>${esc(i.name)}</span><span class="tiny">${fmt(a.mass)} t</span></div>
        <div class="tiny">top ${fmt(a.top)} u/s · turn ${fmt(a.turnRate)} °/s · ${fmt(a.dps)} HP/s · ${fmt(a.totalHP)} HP</div></div>`;
    }).join('') || '<div class="tiny">No ships.</div>';
  }

  return { mount, refresh, reset };
}

export const shipyard = createDesigner('ship');
export const buildingDesigner = createDesigner('structure');
