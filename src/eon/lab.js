// THE BATTLE LAB — random ships at one price fight each other; watch any fight replayed, pick two
// ships and make them fight, or describe a ship in words and throw it into the ring.
// Runs in a plain browser page (lab.html) and as a published page; nothing here touches the game's save.
import { runLabAsync, evolve, simulate, createBattle, shipFromDesign, archetype, designFromWords, designFromChips, bestShipOfAsync, challengeAsync, fleetOf, volleysFrom, rng32, B, MAINS } from './battle.js';
const breathe = () => new Promise(r => setTimeout(r, 0));   // handed back from progress callbacks so the page paints between steps
import { KINDS, PRESETS, traverseOf } from './modules.js';
import { drawHull } from './hullview.js';
import { setUserHulls, hullDef } from './hull.js';
import { lookOf, spriteOf, lookFromColors } from './skins.js';
import { buildPlan, planFromCode, planCode, plansLoad, exportAllText } from './fleetplan.js';
const TCELL = { weapon_energy: 0, weapon_kinetic: 1, weapon_missile: 2 };   // a style's turret cells: beam, gun, missile
const skinsOn = () => !!($('skins') && $('skins').checked);

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 0 : 1);
const num = (v, d) => (+v).toFixed(d);
const S = { breakthroughs: [] };
const COLOR = { e: '#5fe3d0', k: '#ffb347', m: '#ff8a6b', d: '#ffe08a' }, SIDE = ['#5fe3d0', '#ff8a6b'], MAINC = { Beam: COLOR.e, Gun: COLOR.k, Missile: COLOR.m, Drone: COLOR.d };
let LAB = null, cur = null, playing = false, speed = 1, clock = 0, last = 0, raf = 0, cam = null;
const PACE = 0.5;                                  // seconds of battle per real second at ×1
let order = 'number', picked = [], ffilter = 'all', arenaH = 360;
let EVO = null, viewGen = 0;                       // the generations run, and which generation the page shows
let liveAcc = 0, armed = null;                     // command mode: sim time owed to the live battle; which order is waiting for a tap on the field
let camUser = null, suppressTap = false, retreatArm = 0;   // the viewer's own camera {cx, cy, sc}; a drag just ended (not a tap); when Retreat was first pressed
try { arenaH = +localStorage.getItem('lab.arenaH') || 360; order = localStorage.getItem('lab.order') || 'number'; } catch (e) { /* fine */ }

// ARENA mode (lab.html#arena): the replay card alone, filling the page, no random pool — the Fleet Generator shows a
// fight inside a frame this way (it posts {type:'fight', a, b}; the lab answers {type:'ready'} and {type:'result'})
const ARENA = /(^#|[#&])arena(?=&|$)/.test(location.hash) || /[?&]arena(?=&|$)/.test(location.search);
if (ARENA) document.body.classList.add('arena');
const tellParent = msg => { if (ARENA && window.parent !== window) { try { window.parent.postMessage(msg, '*'); } catch (e) { /* no parent to tell */ } } };
let runNote = '';
const fleetSizes = () => (LAB && LAB.fleetSizes) || [1, 1];
function run() {
  const budget = Math.min(20000, Math.max(150, +$('budget').value || 600)), battles = Math.min(400, Math.max(5, +$('n').value || 60)), seed = +$('seed').value || 1, pure = $('pure').checked;
  const maxN = Math.max(1, Math.min(25, Math.floor(budget / 150)));                 // no ship is built under 150
  let nA = Math.max(1, Math.min(25, Math.round(+$('nA').value || 1))), nB = Math.max(1, Math.min(25, Math.round(+$('nB').value || 1)));
  let gens = Math.max(1, Math.min(20, Math.round(+$('gens').value || 1)));
  $('run').disabled = true; picked = []; runNote = '';
  if (nA > maxN || nB > maxN) { nA = Math.min(nA, maxN); nB = Math.min(nB, maxN); runNote = `a ship costs at least 150, so ${budget} buys at most ${maxN} ships a fleet`; }
  if (gens > 1 && (nA > 1 || nB > 1)) { gens = 1; runNote = 'generations run one ship a side for now — set both fleets to 1 for them; this is one crop'; }
  if (gens === 1) {
    EVO = null; $('gensH').hidden = $('gensCard').hidden = true;
    const shapes = nA === nB ? (nA > 1 ? ` (${nA} ships sharing it, split evenly, flagship-style, in tiers or at random)` : '') : ` — fleet 1: ${nA} ship${nA > 1 ? 's' : ''} sharing ${budget}, fleet 2: ${nB} ship${nB > 1 ? 's' : ''} sharing ${budget}`;
    const head = `Building ${Math.min(24, battles)} ${nA === 1 && nB === 1 ? 'ships' : 'fleets'} at ${budget}${shapes}`;
    $('status').textContent = `${head} and fighting ${battles} battles…`;
    runLabAsync(S, { budget, battles, seed, pure, pool: Math.min(24, Math.max(8, battles)), fleets: [nA, nB] }, st => { $('status').textContent = st.phase === 'build' ? `${head}: ${st.i} of ${st.n}…` : `Fighting: battle ${st.i} of ${st.n}…`; return breathe(); })
      .then(L => { LAB = L; if (L.underSpent) runNote = `${L.underSpent} could not spend all the money (guns, armour and dials maxed) and sail cheaper`; render(); })
      .catch(e => { $('status').textContent = 'Something broke: ' + e.message; console.error(e); })
      .finally(() => { $('run').disabled = false; });
    return;
  }
  // generations: four ships of each kind, every ship fights every other, the best of each kind breeds the next crop
  const n = 4 * MAINS.length, per = n * (n - 1) / 2;
  $('status').textContent = `Generation 1 of ${gens}: ${n} ships at ${budget}, four of each kind, every ship against every other (${per} fights)…`;
  evolve(S, { budget, generations: gens, seed, pure }, (g, G, f, F) => { $('status').textContent = `Generation ${g} of ${G} · fight ${f} of ${F}…`; return new Promise(r => setTimeout(r, 0)); })
    .then(E => { EVO = E; showGen(E.gens.length - 1); })
    .catch(e => { $('status').textContent = 'Something broke: ' + e.message; console.error(e); })
    .finally(() => { $('run').disabled = false; });
}
// show one generation of the run as the lab's pool: its ships, its fights, its table
function showGen(i) {
  viewGen = i; const G = EVO.gens[i];
  const fleets = G.ships.map(s => Object.assign(fleetOf([s], s.name), { id: s.id, w: s.w, l: s.l, d: s.d, gen: s.gen, born: s.born, parent: s.parent }));   // one ship a side: each ship is its own fleet
  LAB = { fleets, fights: G.fights, table: G.table, rate: G.rate, budget: EVO.budget, seed: EVO.seed, gen: G.n, gens: EVO.gens.length, fleetSizes: [1, 1] };
  picked = []; render(); renderGenerations();
  $('gensH').hidden = $('gensCard').hidden = false;
}
function renderGenerations() {
  if (!EVO) return;
  const G = EVO.gens;
  const cell = (c, i, kind) => {
    if (!c) return '<td>—</td>';
    const prev = i ? G[i - 1].champions[kind] : null, how = !i ? 'first' : c.born === 'held' ? 'held' : prev && c.parent === prev.name ? 'child' : 'line';
    const words = { first: 'first crop', held: '= held the crown', child: '↑ a child took over', line: '✱ another line took over' };
    return `<td class="${how}"><b>${esc(c.name)}</b> <span class="rec">${c.w}W ${c.l}L${c.d ? ' ' + c.d + 'D' : ''}</span><br><small>${esc(c.arch.label)}</small><br><small class="how">${words[how]}</small></td>`;
  };
  $('gensTable').innerHTML = `<table class="gens"><tr><th></th>${MAINS.map(m => `<th style="color:${MAINC[m]}">${m}</th>`).join('')}</tr>${G.map((g, i) => `<tr class="${i === viewGen ? 'on' : ''}"><th><button class="x ${i === viewGen ? 'go' : ''}" data-gen="${i}">Gen ${g.n}</button></th>${MAINS.map(k => cell(g.champions[k], i, k)).join('')}</tr>`).join('')}</table>`;
  // did it settle? per kind, counted back from the last generation: crowns held as is, and crowns kept in the family
  const lines = MAINS.map(k => {
    let held = 0, family = 0;
    for (let i = G.length - 1; i > 0; i--) { const c = G[i].champions[k], p = G[i - 1].champions[k]; if (!c || !p) break; const h = c.born === 'held'; if (!(h || c.parent === p.name)) break; family++; if (h && held === family - 1) held++; }
    const c = G[G.length - 1].champions[k]; if (!c) return `<b style="color:${MAINC[k]}">${k}</b>: none left`;
    const verdict = held >= 2 ? `settled — <b>${esc(c.name)}</b> has held the crown ${held} generations running` : family >= 2 ? `one family for ${family} generations — ${held ? `<b>${esc(c.name)}</b> holds the crown now, one generation so far` : `a child just took it over (<b>${esc(c.name)}</b>)`}` : G.length > 1 ? `still shifting — the crown changed lines (now <b>${esc(c.name)}</b>)` : '';
    return `<b style="color:${MAINC[k]}">${k}</b>: ${verdict} <small>· ${esc(c.arch.label)} · ${esc(loadout(c))}</small>`;
  });
  $('gensNote').innerHTML = lines.join('<br>') + `<div style="margin-top:8px">Each generation the best ship of each kind stays exactly as it is, and three children are rolled from small tweaks — two of the champion, one of the runner-up: a dial a notch, a role, a gun more or less, armour / shields / thrusters / fabricator on or off, another silhouette, an escort gun — all trimmed back to the price. Every ship fights every other once. Click a generation to see its ships and fights below.</div>`;
}

function render() {
  const { fleets, fights, rate, table, budget, seed, byShape } = LAB, [nA, nB] = fleetSizes(), solo = nA === 1 && nB === 1;
  for (const f of fights) { f.A = fleets[f.a]; f.B = fleets[f.b]; }
  const decided = fights.filter(f => f.winner !== null).length;
  const shapes = nA === nB ? (nA > 1 ? ` (${nA} ships sharing it)` : '') : ` — fleet 1: ${nA} ship${nA > 1 ? 's' : ''} sharing ${budget}, fleet 2: ${nB} ship${nB > 1 ? 's' : ''} sharing ${budget}`;
  $('status').textContent = (LAB.gen ? `Generation ${LAB.gen} of ${LAB.gens}: ` : '') + `${fleets.length} ${solo ? 'ships' : 'fleets'}, each built for about ${budget}${shapes} · ${fights.length} battles${LAB.gen ? ' (every ship against every other)' : ''}, ${decided} decided, ${fights.length - decided} draws · seed ${seed}` + (runNote ? ' · ' + runNote : '');
  const shapeBars = byShape ? [0, 1].map(k => { const r = byShape[k], p = r.n ? r.w / r.n : 0, n = k ? nB : nA; return `<div class="bar"><span style="color:${SIDE[k]}">Fleet ${k + 1}: ${n} × ${fmt(budget / n)}</span><div class="track"><div style="width:${p * 100}%;background:${SIDE[k]}"></div></div><b>${r.n ? Math.round(p * 100) + '%' : '—'}</b><small>${r.n} fights${k ? `, ${r.n - byShape[0].w - byShape[1].w} draws` : ''}</small></div>`; }).join('') + `<div class="tiny" style="margin:2px 0 10px">Which shape of fleet wins at the same price. Below, the same fights by the fleets' main weapon (where the money went).</div>` : '';
  $('rates').innerHTML = shapeBars + MAINS.map(m => { const r = rate[m], p = r.n ? r.w / r.n : 0; return `<div class="bar"><span>${m} ${solo ? 'ships' : 'fleets'}</span><div class="track"><div style="width:${p * 100}%;background:${MAINC[m]}"></div></div><b>${r.n ? Math.round(p * 100) + '%' : '—'}</b><small>${r.n} fights</small></div>`; }).join('');
  $('shipsH').textContent = solo ? 'The ships' : 'The fleets';
  renderCompositions();
  $('matrix').innerHTML = `<table><tr><th></th>${MAINS.map(m => `<th>vs ${m}</th>`).join('')}</tr>${MAINS.map(a => `<tr><th>${a}</th>${MAINS.map(b => { const c = table[a][b]; const p = c.n ? c.w / c.n : null; return `<td style="${p === null ? '' : `background:rgba(${p > 0.5 ? '126,243,176' : '255,121,121'},${Math.abs(p - 0.5) * 0.9})`}">${p === null ? '—' : Math.round(p * 100) + '%'}<small>${c.n}</small></td>`; }).join('')}</tr>`).join('')}</table>
    <div class="tiny">Row beats column: how often the row's kind of ship won against the column's. Faint = close to even. "—" = no such fight this run.</div>`;
  renderShips(); renderFights(); renderBuilder();
  watch(0);
}
const stockLine = s => !s.stock ? (s.missiles || s.drones ? ' · no fabricator: what it carries is all it has' : '') : ` · fabricator stock ${fmt(s.stock)} = up to ${s.missiles ? `${s.maxReloads} more missiles` : ''}${s.missiles && s.drones ? ' OR ' : ''}${s.drones ? `${s.maxSorties} drone sorties` : ''}${s.missiles && s.drones ? ' (one stock, not both)' : ''}`;
const shipLine = s => `${esc((hullDef(s.design.hull) || {}).name || s.design.hull)} · hull ${fmt(s.hpMax)}${s.arMax ? ` · armour ${fmt(s.arMax)}` : ''} · shield ${fmt(s.shMax)} (${Math.round(s.cover * 100)}% cover) · ${fmt(s.dps)} dmg/s · reach ${s.pref} · speed ${fmt(s.speed)} · turns ${Math.round(s.turn || 0)}°/s · evasion ${Math.round(s.evade * 100)}% · cost ${fmt(s.cost)}${s.missiles ? ` · ${s.missiles} missiles` : ''}${s.drones ? ` · ${s.drones} drones, ${s.airCap} in the air at once (one mount each) · battery: ${volleysFrom(150)} volleys from 150 u, ${volleysFrom(300)} from 300, ${volleysFrom(450)} from 450` : ''}${stockLine(s)}`;
const loadout = s => s.design.modules.filter(m => KINDS[m.kind].mount).map(m => KINDS[m.kind].hangar ? `Hangar${m.n > 1 ? ' ×' + m.n : ''} (drones ×${m.cnt || 1}, size ×${m.sz || 1})` : `${KINDS[m.kind].name}${m.n > 1 ? ' ×' + m.n : ''}${m.preset && m.preset !== 'standard' && PRESETS[m.preset] ? ' ' + PRESETS[m.preset].name.toLowerCase() : ''} (dmg ×${m.dmg || 1}, rate ×${m.rof || 1}, range ×${m.rng || 1}${KINDS[m.kind].charges ? `, charges ×${m.chg || 1}` : ''})`).join(' · ')
  + (s.design.modules.some(m => m.kind === 'armor') ? ' · armour ×' + s.design.modules.find(m => m.kind === 'armor').n : '') + (s.design.modules.some(m => m.kind === 'shield') ? ' · shields ×' + s.design.modules.find(m => m.kind === 'shield').n : '');
// what wins among fleets: how the money was split, what the flagship was, and which composition counters which
const SPLIT_WORDS = { even: 'even split', flagship: 'flagship + escorts', tiers: 'tiers (small / middling / big)', random: 'random split' };
const SPLITC = { even: '#9eb3d8', flagship: '#ffd26a', tiers: '#7ef3b0', random: '#cf89ff' };
function renderCompositions() {
  const C = LAB.comp, show = C && LAB.fleets.some(f => f.n > 1);
  $('compH').hidden = $('compCard').hidden = !show; if (!show) return;
  const bar = (label, r, color) => { const p = r.n ? r.w / r.n : 0; return `<div class="bar"><span>${label}</span><div class="track"><div style="width:${p * 100}%;background:${color}"></div></div><b>${r.n ? Math.round(p * 100) + '%' : '—'}</b><small>${r.n} fights</small></div>`; };
  const styles = Object.keys(SPLIT_WORDS).filter(k => C.byStyle[k]).map(k => bar(SPLIT_WORDS[k], C.byStyle[k], SPLITC[k])).join('');
  const flags = ['corvette', 'frigate', 'destroyer', 'cruiser', 'capital'].filter(k => C.byFlag[k]).map(k => bar(`biggest ship: ${k}`, C.byFlag[k], '#9eb3d8')).join('');
  const comps = C.comps.filter(c => c.n >= 4);
  const rows = comps.map(c => `<tr><td style="text-align:left"><b style="color:${MAINC[c.main] || '#fff'}">${c.main}</b> <small style="display:inline">${SPLIT_WORDS[c.split]}</small></td><td><b>${Math.round(c.p * 100)}%</b><small>${c.n} fights</small></td><td style="text-align:left">${c.counter ? `<b style="color:${MAINC[c.counter.key.split('·')[1]] || '#fff'}">${c.counter.key.split('·')[1]}</b> <small style="display:inline">${SPLIT_WORDS[c.counter.key.split('·')[0]]}</small> — beats it ${Math.round(c.counter.p * 100)}% <small style="display:inline">(${c.counter.n} fights)</small>` : '<span class="tiny">nothing beat it often enough to tell (3+ fights needed)</span>'}</td></tr>`).join('');
  $('comp').innerHTML = `<div class="tiny" style="margin-bottom:6px">HOW THE MONEY WAS SPLIT</div>${styles}<div class="tiny" style="margin:10px 0 6px">THE BIGGEST SHIP IN THE FLEET</div>${flags}
    <div class="tiny" style="margin:10px 0 6px">COMPOSITIONS — main weapon × split — AND WHAT COUNTERS THEM</div>
    ${rows ? `<table><tr><th style="text-align:left">composition</th><th>wins</th><th style="text-align:left">countered by</th></tr>${rows}</table>` : '<div class="tiny">Not enough fights per composition yet — raise Battles to 200–400 for trends.</div>'}
    <div class="tiny" style="margin-top:8px">A fleet's money is split one of four ways: evenly; a flagship taking 40–60% with escorts sharing the rest; tiers (many small, some middling, one or two big); or at random. No ship is built under 150. Ship classes by price: corvette ≤ 350, frigate ≤ 800, destroyer ≤ 1600, cruiser ≤ 3200, capital above. "Countered by" is the composition that beat this one most often in this run (3+ fights). More battles = firmer trends.</div>`;
}
function renderShips() {
  const fleets = LAB.fleets, list = fleets.slice().sort(order === 'record' ? (a, b) => (b.w - b.l) - (a.w - a.l) : (a, b) => a.id - b.id), solo = fleets.every(f => f.n === 1);
  const member = (s, fid, k) => `<div class="sub"><b>${esc(s.name)}</b> <span class="arch">${esc(s.arch.label)}</span> <button class="x" data-design="${fid}:${k}">design</button><div class="tiny">${shipLine(s)}</div><div class="tiny">${loadout(s)}</div></div>`;
  $('ships').innerHTML = list.map(f => `<div class="ship ${picked.includes(f.id) ? 'picked' : ''}"><div class="n"><button class="x pick ${picked.includes(f.id) ? 'go' : ''}" data-pickship="${f.id}" title="pick it for a fight">${picked.includes(f.id) ? '✓' : '○'}</button><b>${esc(f.name)}</b><span class="arch">${esc(f.arch.label)}</span>${f.gen ? `<span class="arch gen">${f.born === 'held' ? 'held over from gen ' + (f.gen - 1) : f.parent ? 'child of ' + esc(f.parent) : 'first crop'}</span>` : ''}${f.n === 1 ? `<button class="x" data-design="${f.id}:0">design</button>` : `<span class="arch gen">${f.n} ships · ${SPLIT_WORDS[f.split] || f.split} · ${fmt(f.cost)}</span>`}<span class="rec">${f.w}W ${f.l}L${f.d ? ' ' + f.d + 'D' : ''}</span></div>
    ${f.n === 1 ? `<div class="tiny">${shipLine(f.ships[0])}</div><div class="tiny">${loadout(f.ships[0])}</div>` : f.ships.map((s, k) => member(s, f.id, k)).join('')}</div>`).join('');
  const two = picked.length === 2;
  $('duel').disabled = !two; $('duel').textContent = two ? `Fight: ${fleets[picked[0]].name} vs ${fleets[picked[1]].name}` : `Pick two ${solo ? 'ships' : 'fleets'} (${picked.length} of 2)`;
  $('order').value = order;
}
function fightRow(f, i) {
  const A = f.A, Bs = f.B, w = f.winner === null ? null : f.winner === 0 ? A : Bs, running = f.live && !f.live.done;
  return `<button class="fight ${f.custom ? 'custom' : ''} ${f.challenge ? 'chal' : ''}" data-fight="${i}"><span class="who">${f.command ? '<small>you in command · </small>' : f.custom ? '<small>your fight · </small>' : f.challenge ? '<small>challenge · </small>' : ''}<b style="color:${SIDE[0]}">${esc(A.name)}</b> <small>${esc(A.arch.label)}</small> vs <b style="color:${SIDE[1]}">${esc(Bs.name)}</b> <small>${esc(Bs.arch.label)}</small></span>
    <span class="res">${running ? '<b>live</b> — still fighting' : w ? `<b style="color:${SIDE[f.winner]}">${esc(w.name)} wins</b> in ${f.time}s, ${Math.round(f.left[f.winner] * 100)}% hull left` : `draw after ${f.time}s`}${f.timedOut ? ' · ran to the clock' : ''}</span></button>`;
}
function renderFights() {
  const keep = (f) => ffilter === 'all' ? true : ffilter === 'custom' ? f.custom : ffilter === 'challenge' ? f.challenge : [f.A.arch.main, f.B.arch.main].includes(ffilter);
  $('fights').innerHTML = LAB.fights.map((f, i) => keep(f) ? fightRow(f, i) : '').join('') || '<div class="tiny">No fight matches the filter.</div>';
  for (const b of document.querySelectorAll('[data-fight]')) b.classList.toggle('on', cur && LAB.fights[+b.dataset.fight] === cur);
}
// a fight between the two picked ships, with fresh dice
function duel() {
  if (picked.length !== 2) return;
  const A = LAB.fleets[picked[0]], Bf = LAB.fleets[picked[1]];
  const r = simulate(A.ships, Bf.ships, rng32(Math.floor(Math.random() * 1e9)));
  LAB.fights.unshift({ a: picked[0], b: picked[1], A, B: Bf, ...r, custom: true });
  renderFights(); watch(0);
}
// a design joins the pool in fleet 1's shape: that many copies, each built at its share of the price
function joinPool(d, count) {
  const nA = count || fleetSizes()[0], id = LAB.fleets.length, num = id + 1;
  const copies = Array.from({ length: nA }, (_, k) => { const s = shipFromDesign(S, d); s.arch = archetype(s); s.name = nA === 1 ? `Ship ${num}` : `${num}${'abcdefghijklmnopqrstuvwxy'[k] || k + 1}`; return s; });
  const f = Object.assign(fleetOf(copies, nA === 1 ? `Ship ${num}` : `Fleet ${num}`), { id, w: 0, l: 0, d: 0 }); LAB.fleets.push(f);
  picked = [...picked.slice(-1), id];
  return f;
}
// the challenger: the best ship of one kind we can find at this price, thrown at forty random ships
function runChallenge() {
  if (!LAB) return;
  const kind = $('chKind').value, label = $('chKind').selectedOptions[0].textContent, [nA, nB] = fleetSizes(), each = LAB.budget / nA;
  const head = `Looking for the best ${label.toLowerCase()} at ${fmt(each)}${nA > 1 ? ` — ${nA} of them make a fleet-1 squadron` : ''}`;
  $('chRun').disabled = true; $('chStatus').textContent = `${head}: 24 candidates, each against the same field… then 40 fights against fresh random ${nB > 1 ? `fleets of ${nB} × ${fmt(LAB.budget / nB)}` : 'ships'}.`;
  (async () => {
    try {
      const words = { field: 'rolling the field', search: 'candidate', field2: 'rolling the bigger field', final: 'rechecking finalist' };
      const best = await bestShipOfAsync(S, kind, { budget: each, seed: Math.floor(Math.random() * 1e6) }, st => { $('chStatus').textContent = `${head}: ${words[st.phase]} ${st.i} of ${st.n}…`; return breathe(); });
      if (!best) { $('chStatus').textContent = 'Could not build one at this price.'; $('chRun').disabled = false; return; }
      const id = LAB.fleets.length, copies = Array.from({ length: nA }, (_, k) => { const s = k ? shipFromDesign(S, best.ship.design) : best.ship; s.arch = archetype(s); s.name = nA === 1 ? best.ship.name : `${best.ship.name} ${'abcdef'[k]}`; return s; });
      const f = Object.assign(fleetOf(copies, nA === 1 ? best.ship.name : `${best.ship.name} ×${nA}`), { id, w: 0, l: 0, d: 0 }); LAB.fleets.push(f);
      const ch = await challengeAsync(S, f.ships, { budget: LAB.budget, n: 40, seed: Math.floor(Math.random() * 1e6), opp: nB }, st => { $('chStatus').textContent = st.phase === 'build' ? `${esc(f.name)}: rolling random opponents ${st.i} of ${st.n}…` : `${esc(f.name)}: fight ${st.i} of ${st.n}…`; return breathe(); });
      LAB.fights = [...ch.fights.map(x => ({ A: f, B: x.opp, ...x, challenge: true })), ...LAB.fights.filter(x => !x.challenge)];
      const kinds = Object.entries(ch.byKind).sort((a, b) => b[1].n - a[1].n);
      $('chStatus').innerHTML = `<b>${esc(f.name)}</b> — ${esc(f.arch.label)}, cost ${fmt(f.cost)}${nA > 1 ? ` (${nA} × ${fmt(f.cost / nA)})` : ''} · won <b>${ch.wins} of ${ch.fights.length}</b> (${ch.losses} lost${ch.draws ? `, ${ch.draws} drawn` : ''}) · in the search one of them took ${Math.round(best.score * 100)}% against its field`;
      $('chOut').innerHTML = kinds.map(([k, v]) => `<div class="bar"><span>vs ${k} ${nB > 1 ? 'fleets' : 'ships'}</span><div class="track"><div style="width:${100 * v.w / v.n}%;background:${MAINC[k]}"></div></div><b>${Math.round(100 * v.w / v.n)}%</b><small>${v.n} fights</small></div>`).join('')
        + `<div class="tiny" style="margin-top:6px">${esc(loadout(f.ships[0]))}</div><div style="margin-top:6px"><button class="x" data-design="${id}:0">its design</button> · it is in the pool below as ${esc(f.name)}; the lost fights are in the list — filter "challenge".</div>`;
      ffilter = 'challenge'; $('ffilter').value = 'challenge'; picked = [id];
      renderShips(); renderFights(); watch(LAB.fights.findIndex(f => f.challenge && f.winner !== 0) >= 0 ? LAB.fights.findIndex(f => f.challenge && f.winner !== 0) : 0);
    } catch (e) { $('chStatus').textContent = 'Something broke: ' + e.message; console.error(e); }
    $('chRun').disabled = false;
  })();
}
// a ship from words, thrown into the pool
function makeShip() {
  let text = $('words').value.trim(); if (!text || !LAB) return;
  // "20 x 2 beams pd + fast" = a fleet of twenty of them, each at its share of the price; no prefix = fleet 1's shape
  const lead = text.match(/^(\d+)\s*[x×*]\s*(.+)$/i), nA = lead ? Math.max(1, Math.min(25, Math.min(+lead[1], Math.floor(LAB.budget / 150)))) : fleetSizes()[0];
  if (lead) text = lead[2].trim();
  const d = designFromWords(S, text, LAB.budget / nA, rng32(Math.floor(Math.random() * 1e9)));
  if (!d) { $('wordsNote').textContent = 'I did not find a weapon in that. Say beam, gun, missile or drone, with a count or a role if you like, plus traits: armoured, shielded, fast, fabricator. Start with "20 x" for a fleet of twenty.'; return; }
  const f = joinPool(d, nA);
  $('wordsNote').textContent = `${f.name}: ${f.arch.label} — cost ${fmt(f.cost)}${nA > 1 ? ` (${nA} ships × ${fmt(f.cost / nA)}${lead ? '' : ", fleet 1's shape"})` : ''}. It is picked; pick another and press Fight.`;
  renderShips(); showDesign(f.ships[0]);
}

// ---------------- the chip builder ----------------
// drag a chip from the palette into the tray: onto a stack of the same kind = one more on top
// (emphasis); next to it = its own stack; a role chip onto a weapon stack = that role
const CHIPS = { weapon: [['weapon_energy', 'Beam'], ['weapon_kinetic', 'Gun'], ['weapon_missile', 'Missile'], ['hangar', 'Drones']],
  role: [['sniper', 'Sniper'], ['capital', 'Capital'], ['pd', 'Point defence'], ['antishield', 'Anti-shield'], ['antiarmor', 'Anti-armour']],
  trait: [['armor', 'Armoured'], ['shield', 'Shielded'], ['fast', 'Fast'], ['fab', 'Fabricator']] };
const CHIPC = { weapon_energy: COLOR.e, weapon_kinetic: COLOR.k, weapon_missile: COLOR.m, hangar: COLOR.d, armor: '#c9d4e8', shield: '#cf89ff', fast: '#7ef3b0', fab: '#ffb347' };
let tray = [], traySel = null, chipId = 1;
const chipHtml = (type, key, label) => `<span class="chipb ${type}" data-chip="${type}:${key}" style="--c:${CHIPC[key] || '#ffd26a'}">${label}</span>`;
function renderBuilder() {
  $('palette').innerHTML = `<div class="prow"><span class="tiny">Weapons</span>${CHIPS.weapon.map(([k, l]) => chipHtml('weapon', k, l)).join('')}</div>
    <div class="prow"><span class="tiny">Roles</span>${CHIPS.role.map(([k, l]) => chipHtml('role', k, l)).join('')}</div>
    <div class="prow"><span class="tiny">Traits</span>${CHIPS.trait.map(([k, l]) => chipHtml('trait', k, l)).join('')}</div>`;
  const label = s => s.type === 'weapon' ? CHIPS.weapon.find(c => c[0] === s.kind)[1] : CHIPS.trait.find(c => c[0] === s.kind)[1];
  $('tray').innerHTML = tray.map(s => `<span class="stack ${s.id === traySel ? 'sel' : ''}" data-stack="${s.id}" style="--c:${CHIPC[s.kind]}"><b>${label(s)}</b>${s.h > 1 ? `<i class="hh">×${s.h}</i>` : ''}${s.role ? `<small>${CHIPS.role.find(c => c[0] === s.role)[1]}</small>` : ''}<button class="x" data-unstack="${s.id}" title="one off">−</button></span>`).join('')
    || '<span class="tiny">Empty. Drag or tap chips from above. Drop a chip on a stack to pile it up; drop a role on a weapon to give it that role.</span>';
  if (!LAB) return;
  const [nA] = fleetSizes(), each = LAB.budget / nA;
  const d = tray.length ? designFromChips(S, tray.map(s => ({ kind: s.kind, h: s.h, role: s.role })), each, rng32(7)) : null;
  if (!d) { $('trayNote').textContent = tray.length ? 'Add at least one weapon.' : ''; $('buildChips').disabled = true; return; }
  const t = shipFromDesign(S, d).t;
  $('trayNote').innerHTML = `<b>${esc(d.name)}</b> → cost ${fmt(t.cost)}${nA > 1 ? ` each, ${nA} of them (fleet 1's shape)` : ''} · ${t.squares} squares · hull ${fmt(t.hp)} · ${fmt(t.dps)} dmg/s${t.drones ? ` · ${t.drones} drones, ${t.airCap} in the air` : ''}${t.missiles ? ` · ${t.missiles} missiles` : ''} · speed ${fmt(t.speed)}${Math.abs(t.cost - each) / each > 0.06 ? ' <span class="tiny">(it could not be brought to the price exactly)</span>' : ''}`;
  $('buildChips').disabled = false;
}
function dropChip(type, key, onStack) {
  const s = onStack != null ? tray.find(x => x.id === onStack) : null;
  if (type === 'role') { const w = s && s.type === 'weapon' ? s : tray.find(x => x.id === traySel && x.type === 'weapon') || tray.filter(x => x.type === 'weapon').at(-1); if (w) { w.role = w.role === key ? null : key; traySel = w.id; } }
  else if (s && s.kind === key) { s.h++; traySel = s.id; }
  else if (type === 'trait' && tray.some(x => x.kind === key) && !s) { const x = tray.find(x => x.kind === key); x.h++; traySel = x.id; }
  else { const n = { id: chipId++, type, kind: key, h: 1, role: null }; tray.push(n); traySel = n.id; }
  renderBuilder();
}
function buildFromChips() {
  if (!LAB || !tray.length) return;
  const [nA] = fleetSizes(), d = designFromChips(S, tray.map(s => ({ kind: s.kind, h: s.h, role: s.role })), LAB.budget / nA, rng32(Math.floor(Math.random() * 1e9))); if (!d) return;
  const f = joinPool(d);
  $('trayNote').innerHTML = `<b>${f.name}</b> joined the pool as ${esc(d.name)} — cost ${fmt(f.cost)}${nA > 1 ? ` (${nA} ships × ${fmt(f.cost / nA)})` : ''}. It is picked; pick another and press Fight.`;
  renderShips(); showDesign(f.ships[0]);
}

{
  let drag = null, ghost = null;
  const under = (x, y) => { if (ghost) ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return el; };
  document.addEventListener('pointerdown', e => {
    const c = e.target.closest('[data-chip]'); if (!c) return;
    const [type, key] = c.dataset.chip.split(':'); drag = { type, key, x: e.clientX, y: e.clientY, moved: false, el: c };
    try { c.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer: carry on without capture */ }
    e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) { drag.moved = true; ghost = drag.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]');
    for (const s of document.querySelectorAll('[data-stack]')) s.classList.toggle('over', s === st);
    $('tray').classList.toggle('over', !!el?.closest?.('#tray') && !st);
  });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null;
    for (const s of document.querySelectorAll('[data-stack]')) s.classList.remove('over'); $('tray').classList.remove('over');
    if (ghost) { ghost.remove(); ghost = null; }
    if (!d.moved) return dropChip(d.type, d.key, null);                       // a tap: a new stack (a role goes on the chosen weapon)
    const el = under(e.clientX, e.clientY), st = el?.closest?.('[data-stack]');
    if (st) return dropChip(d.type, d.key, +st.dataset.stack);
    if (el?.closest?.('#tray') || el?.closest?.('#builder')) return dropChip(d.type, d.key, null);
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => {
    const u = e.target.closest('[data-unstack]'); if (u) { const s = tray.find(x => x.id === +u.dataset.unstack); if (s) { s.h--; if (s.h <= 0) tray = tray.filter(x => x !== s); } return renderBuilder(); }
    const st = e.target.closest('[data-stack]'); if (st) { traySel = +st.dataset.stack; return renderBuilder(); }
  });
}

// ---------------- replay ----------------
function watch(i) {
  cur = LAB.fights[i]; if (!cur) return; clock = 0; playing = true; last = 0; cam = null; liveAcc = 0; armed = null; camUser = null; cur.tiers = null; $('camFit').hidden = true; hideMenu();
  const A = cur.A, Bs = cur.B; cur.ships = [...A.ships, ...Bs.ships];
  const side = (f, k) => `<b style="color:${SIDE[k]}">${esc(f.name)}</b> <small>${esc(f.arch.label)}${f.n > 1 ? ` · ${f.n} ships` : ''}</small>`;
  $('fightTitle').innerHTML = `${side(A, 0)} &nbsp;vs&nbsp; ${side(Bs, 1)}`;
  for (const b of document.querySelectorAll('[data-fight]')) b.classList.toggle('on', LAB.fights[+b.dataset.fight] === cur);
  updateCmdBar();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function tick(now) {
  if (!cur) return;
  if (!last) last = now;
  const dtReal = Math.min(0.25, (now - last) / 1000); last = now;
  const live = cur.live;
  if (live && !live.done) { /* a live battle is stepped by liveStep on a timer, so a throttled animation frame cannot stall it */ }
  else if (playing) clock = Math.min(cur.frames.length - 1, clock + dtReal * speed * PACE);   // ×1 runs the fight at half its real pace (his call: the ships were too fast to follow)
  draw();
  if (playing && !(live && !live.done) && clock >= cur.frames.length - 1) playing = false;
  $('play').textContent = playing ? '❚❚' : '▶';
  raf = requestAnimationFrame(tick);
}
// ---------------- command mode: you run Fleet 1, live ----------------
// the same pairing fought again, tick by tick, with the order bar live; orders go to side 0 (cyan)
function commandFight() {
  if (!cur || !LAB) return;
  const A = cur.A, Bf = cur.B, bt = createBattle(A.ships, Bf.ships, rng32(Math.floor(Math.random() * 1e9)), { record: B.dt });
  bt.step();                                                                      // one tick, so there is a frame to draw before the clock starts
  const f = { a: cur.a, b: cur.b, A, B: Bf, live: bt, frames: bt.frames, n: [A.n, Bf.n], winner: null, time: 0, left: [1, 1], custom: true, command: true };
  LAB.fights.unshift(f); renderFights(); watch(0);
  liveLast = 0; clearInterval(liveTimer); liveTimer = setInterval(liveStep, 50);
}
// the live battle's clock: pay it the real time that passed (× speed) a tick at a time, show one tick behind, eased.
// On a timer rather than an animation frame: a background or throttled tab still advances (slowly), never stalls.
let liveTimer = 0, liveLast = 0;
function liveStep() {
  const live = cur && cur.live; if (!live || live.done) { clearInterval(liveTimer); liveTimer = 0; return; }
  const now = performance.now(); if (!liveLast) liveLast = now; const dtReal = Math.min(0.25, (now - liveLast) / 1000); liveLast = now;
  if (!playing) return;
  liveAcc += dtReal * speed * PACE; let n = 0; while (liveAcc >= B.dt && !live.done && n < 400) { live.step(); liveAcc -= B.dt; n++; }
  clock = Math.max(0, cur.frames.length - 2 + Math.min(1, liveAcc / B.dt));
  if (live.done) { Object.assign(cur, live.result(), { frames: cur.frames }); clock = cur.frames.length - 1; playing = false; renderFights(); updateCmdBar(); }
  draw();
}
const CMD_WORDS = { eliminate: 'tap enemy ships to mark them — the fleet puts everything on them (tap again to unmark)', avoid: 'tap enemy ships to keep away from — every ship stays ~650 u off them, shooting what it can', protect: 'tap a spot — the fleet stays inside a 300 u circle there and fights what comes', 'avoid-area': 'tap a spot — nobody enters a 300 u circle there', 'attack-area': 'tap a spot — the fleet goes there and fights what is in it' };
function updateCmdBar() {
  const live = cur && cur.live, bar = $('cmdBar'); if (!bar) return;
  bar.hidden = !live; $('cmdStart').hidden = !cur || (live && !live.done);
  if (!live) return;
  for (const b of bar.querySelectorAll('[data-cmd]')) { b.classList.toggle('armed', b.dataset.cmd === armed); b.classList.toggle('on', b.dataset.cmd === 'retreat' && live.orders[0].retreat); b.disabled = live.done; }
  const rb = bar.querySelector('[data-cmd="retreat"]'); if (rb) rb.textContent = live.orders[0].retreat ? '⟲ Retreating — call it off' : retreatArm && Date.now() - retreatArm < 4000 ? '⟲ Sure? Retreat!' : '⟲ Retreat';
  const O = live.orders[0], ships = cur.ships, names = set => [...set].map(j => ships[j]?.name).filter(Boolean).join(', ');
  const now = [O.eliminate.size ? `eliminate ${names(O.eliminate)}` : '', O.avoid.size ? `keep away from ${names(O.avoid)}` : '', O.area ? `${O.area.kind} area` : '', O.retreat ? 'RETREAT' : ''].filter(Boolean).join(' · ');
  $('cmdNote').innerHTML = live.done ? `Over. ${cur.winner === null ? 'A draw.' : `<b style="color:${SIDE[cur.winner]}">${esc((cur.winner === 0 ? cur.A : cur.B).name)}</b> won.`} Press <b>Command this fight</b> to go again.` : `You command <b style="color:${SIDE[0]}">${esc(cur.A.name)}</b>. ${armed ? `<b>${CMD_WORDS[armed]}</b>` : 'Pick an order, then tap the field; pause any time.'}${now ? `<br>Standing orders: <b>${esc(now)}</b>` : '<br>No orders: the fleet fights on its own.'}`;
}
function giveOrder(cmd) {
  const live = cur && cur.live; if (!live || live.done) return;
  if (cmd === 'retreat') {                                                        // a retreat is asked twice: press, then "Sure?" within 4 s (calling it off is one press)
    if (live.orders[0].retreat) live.order(0, { type: 'retreat' });
    else if (retreatArm && Date.now() - retreatArm < 4000) { live.order(0, { type: 'retreat' }); retreatArm = 0; }
    else { retreatArm = Date.now(); setTimeout(updateCmdBar, 4100); }
    armed = null;
  }
  else if (cmd === 'clear') { live.order(0, { type: cmd }); armed = null; }
  else { armed = armed === cmd ? null : cmd; if (armed) playing = false; }     // arming an order pauses the fight so the tap can be aimed
  updateCmdBar(); draw();
}
function fieldTap(e) {
  if (suppressTap) { suppressTap = false; return; }                             // the end of a drag, not a tap
  const cv = $('arena'), cam2 = cv._cam, P = cv._P; if (!cur || !cam2 || !P) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height, nA = cur.n ? cur.n[0] : 1;
  const nearest = (from) => { let best = -1, bd = 28; P.forEach(([px, py], j) => { if (j >= from) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = j; } } }); return best; };
  const live = cur.live && !cur.live.done ? cur.live : null;
  if (armed && live) {                                                             // an order waiting for its target
    if (armed === 'eliminate' || armed === 'avoid') { const best = nearest(nA); if (best >= 0) live.order(0, { type: armed, ships: [best] }); }
    else { live.order(0, { type: 'area', kind: armed === 'protect' ? 'protect' : armed === 'avoid-area' ? 'avoid' : 'attack', x: cam2.cx + (x - cam2.W / 2) / cam2.sc, y: cam2.cy + (y - cam2.H / 2) / cam2.sc, r: 300 }); armed = null; }
    updateCmdBar(); draw(); return;
  }
  const j = nearest(0); if (j >= 0) focusShip(j);                                 // a tap on a ship: the camera rides it, close enough to see its guns work
}
function focusShip(j) {
  const s = cur.ships[j], L = s.ds.hull.bw * B.unit, cv = $('arena'), now = cv._cam ? cv._cam.sc : 1;
  camUser = { focus: j, dx: 0, dy: 0, sc: Math.max(now, 120 / L) };
  $('camFit').hidden = false; $('camFit').textContent = '⌖ Whole fight'; draw();
}
function draw() {
  const cv = $('arena'); if (!ARENA) cv.style.height = arenaH + 'px';            // in arena mode the canvas fills the page instead
  const W = cv.clientWidth || 360, H = cv.clientHeight || arenaH;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'), F = cur.frames; if (!F.length) return;
  const i = Math.max(0, Math.min(F.length - 1, Math.floor(clock))), k = Math.max(0, Math.min(1, clock - i)), f0 = F[i], f1 = F[Math.min(F.length - 1, i + 1)];
  const lerp = (a, b) => a + (b - a) * k;
  const ships = cur.ships, nA = cur.n ? cur.n[0] : 1, nB = ships.length - nA, sideOf = j => j < nA ? 0 : 1;
  const Wp = ships.map((s, j) => [lerp(f0.p[j][0], f1.p[j][0]), lerp(f0.p[j][1], f1.p[j][1])]), hpOf = j => lerp(f0.hp[j], f1.hp[j]);
  // the camera fits every living ship (everything, once a side is gone), whatever the frame's shape:
  // room across and room down separately, gliding there (faster at higher playback speed)
  let live = ships.map((_, j) => j).filter(j => hpOf(j) > 0); if (new Set(live.map(sideOf)).size < 2) live = ships.map((_, j) => j);
  const xs = live.map(j => Wp[j][0]), ys = live.map(j => Wp[j][1]), minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys), pad = 100;
  // a FOLLOWED ship (tap one) puts the camera on it; otherwise the camera rides the middle of the fight
  const focus = camUser && camUser.focus != null && ships[camUser.focus] ? camUser.focus : null;
  const want = { cx: focus != null ? Wp[focus][0] : (minx + maxx) / 2, cy: focus != null ? Wp[focus][1] : (miny + maxy) / 2, hx: Math.max(200, (maxx - minx) / 2 + pad), hy: Math.max(110, (maxy - miny) / 2 + pad) };
  if (!cam) cam = { ...want }; else { const a = playing ? Math.min(1, (focus != null ? 0.15 : 0.06) * speed) : 1; for (const kk of ['cx', 'cy', 'hx', 'hy']) cam[kk] += (want[kk] - cam[kk]) * a; }
  for (const kk of ['hx', 'hy']) if (want[kk] > cam[kk]) cam[kk] = want[kk];              // never let a ship slip out: zoom out at once, zoom in gently
  // the viewer's zoom (wheel) and pan (drag) sit ON TOP of the following camera, so a zoomed-in view keeps riding the action; ⌖ or the middle button drops them
  const fitSc = Math.min((W / 2 - 10) / cam.hx, (H / 2 - 10) / cam.hy);
  const view = { cx: cam.cx + (camUser ? camUser.dx : 0), cy: cam.cy + (camUser ? camUser.dy : 0), sc: camUser && camUser.sc ? camUser.sc : fitSc };
  const sc = view.sc, X = x => W / 2 + (x - view.cx) * sc, Y = y => H / 2 + (y - view.cy) * sc;
  g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H);
  const gs = Math.max(24, 100 * sc), ox = ((-cam.cx * sc) % gs + gs) % gs, oy = ((-cam.cy * sc) % gs + gs) % gs;      // a grid that scrolls with the camera, 100 u a cell
  g.fillStyle = 'rgba(140,180,240,.14)'; for (let x = ox; x < W; x += gs) for (let y = oy; y < H; y += gs) g.fillRect(x - 1, y - 1, 2, 2);
  g.strokeStyle = 'rgba(158,179,216,.22)'; g.setLineDash([4, 8]); g.beginPath(); g.arc(X(0), Y(0), B.arena * sc, 0, 7); g.stroke(); g.setLineDash([]);     // the edge of the field
  const P = Wp.map(([x, y]) => [X(x), Y(y)]);
  // the nearest living enemy to a point on screen, for a ship's nose and a missile's heading
  const foeOf = (x, y, side) => { let best = -1, bd = Infinity; ships.forEach((_, m) => { if (sideOf(m) !== side && hpOf(m) > 0) { const d = Math.hypot(P[m][0] - x, P[m][1] - y); if (d < bd) { bd = d; best = m; } } }); return best; };
  const headTo = (x, y, side) => { const o = foeOf(x, y, side); return o >= 0 ? Math.atan2(P[o][1] - y, P[o][0] - x) : (side ? Math.PI : 0); };
  // a ship's heading comes from the battle itself (nose on its target), eased between frames the short way round
  const lerpAng = (a0, a1) => { let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a0 + d * k; };
  const angOf = j => { if (!f0.a) return headTo(P[j][0], P[j][1], sideOf(j)); return lerpAng(f0.a[j], f1.a ? f1.a[j] : f0.a[j]); };
  // where a turret points: the battle records every mount's lay each frame (it slews at its own rate); older replays fall back to the last shot's direction
  const turretAng = (j, gi, fallback) => { const g0 = f0.ga && f0.ga[j] ? f0.ga[j][gi] : undefined; if (g0 === undefined) return fallback; const g1 = f1.ga && f1.ga[j] && f1.ga[j][gi] !== undefined ? f1.ga[j][gi] : g0; return lerpAng(g0, g1); };
  // the range each living ship wants to hold
  ships.forEach((s, j) => { if (hpOf(j) <= 0) return; g.strokeStyle = SIDE[sideOf(j)] + '33'; g.setLineDash([3, 5]); g.beginPath(); g.arc(P[j][0], P[j][1], Math.max(2, s.pref * sc), 0, 7); g.stroke(); g.setLineDash([]); });
  // SHOTS, drawn live. A frame holds the shots of the second BEFORE it, each with the moment it fired (u). While the
  // replay runs from f0 to f1 (k = 0 → 1) the shots of f1 fire at k = u, and the late phases of f0's shots play out
  // first. Every shot is anchored to where things are NOW: its start is the barrel's current spot (the shooter's
  // interpolated position and heading, the gun's mount), its end the target's current spot plus the mark's offset at
  // the moment of firing — so a hit lands ON the ship, not where the ship was. Beams flash and die within a third of
  // a second; shells travel down the line and burst where they land; a missile's arrival bursts where the missile got.
  const E1 = new Map(f1.ents.map(e => [e[0], e])), entAt = new Map();                 // entity id → where it is now on screen (missiles, drones)
  for (const e of f0.ents) { const nx = E1.get(e[0]); entAt.set(e[0], [X(nx ? lerp(e[3], nx[3]) : e[3]), Y(nx ? lerp(e[4], nx[4]) : e[4])]); }
  for (const e of f1.ents) if (!entAt.has(e[0])) entAt.set(e[0], [X(e[3]), Y(e[4])]);
  const barrelOf = (si, gi) => { const s = ships[si], gun = s && s.guns[gi]; if (!gun || gun.mx === undefined) return null; const a = angOf(si), c = Math.cos(a), sn = Math.sin(a); return [P[si][0] + (c * gun.mx - sn * gun.my) * sc, P[si][1] + (sn * gun.mx + c * gun.my) * sc]; };
  const shotEnds = sh => {
    const [, , , fx0, fy0, tx0, ty0, si, gi, , ti, te, se, ox, oy] = sh, isShip = si !== undefined && si !== null;
    const from = (isShip && barrelOf(si, gi)) || (se && entAt.get(se)) || [X(fx0), Y(fy0)];
    const tgt = ti >= 0 && ships[ti] ? P[ti] : te ? entAt.get(te) : null;
    return [from, tgt ? [tgt[0] + (ox || 0) * sc, tgt[1] + (oy || 0) * sc] : [X(tx0), Y(ty0)]];
  };
  const aim = new Map();                                                             // gun → { a: where it points now, p: seconds since it fired }
  const mark = (kind, out, tx, ty, f, col) => {                                      // what a shot leaves where it lands, fading with f
    if (f <= 0) return; g.globalAlpha = f;
    if (out === 1) { g.fillStyle = col; g.beginPath(); g.arc(tx, ty, (kind === 'd' ? 2 : 3) + 3 * f, 0, 7); g.fill(); }                                              // on the hull
    if (out === 4) { g.fillStyle = 'rgba(207,137,255,.5)'; g.beginPath(); g.arc(tx, ty, 3 + 5 * f, 0, 7); g.fill(); g.strokeStyle = '#cf89ff'; g.lineWidth = 1; g.beginPath(); g.arc(tx, ty, 5 + 8 * (1 - f), 0, 7); g.stroke(); }   // the shield took it: a ripple
    if (out === 2) { g.fillStyle = '#ffd26a'; g.beginPath(); g.arc(tx, ty, 3 + 4 * f, 0, 7); g.fill(); }                        // a missile swatted
    if (out === 3) { g.fillStyle = '#fff'; g.beginPath(); g.arc(tx, ty, 2 + 2 * f, 0, 7); g.fill(); }                           // a drone hit
  };
  const drawShot = (sh, p, n) => {
    const [, kind, out, , , , , si, gi] = sh, [[fx, fy], [tx, ty]] = shotEnds(sh), ang = Math.atan2(ty - fy, tx - fx), jit = ((n * 7919) % 23 - 11) * 0.06, col = COLOR[kind] || '#fff';
    if (si !== undefined && si !== null && p <= 1) { const prev = aim.get(si * 1000 + gi); if (!prev || p < prev.p) aim.set(si * 1000 + gi, { a: ang, p }); }
    if (kind === 'm') {                                                              // a missile arriving: on the hull an orange blast, on a shield a purple flash at the shield's edge, a miss fizzles past
      const f = 1 - p / 0.6; if (f <= 0) return; g.globalAlpha = f;
      if (out === 4) { g.fillStyle = 'rgba(207,137,255,.55)'; g.beginPath(); g.arc(tx, ty, 5 + 9 * f, 0, 7); g.fill(); g.strokeStyle = '#cf89ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(tx, ty, 8 + 16 * (1 - f), 0, 7); g.stroke(); }
      else if (out) { g.fillStyle = COLOR.m; g.beginPath(); g.arc(tx, ty, 4 + 7 * f, 0, 7); g.fill(); g.fillStyle = 'rgba(255,230,160,.9)'; g.beginPath(); g.arc(tx, ty, 2 + 3 * f, 0, 7); g.fill(); }
      else { g.fillStyle = 'rgba(255,138,107,.4)'; g.beginPath(); g.arc(tx + Math.cos(ang) * 26 * (1 - f), ty + Math.sin(ang) * 26 * (1 - f), 2, 0, 7); g.fill(); }
      return;
    }
    const landed = out === 1 || out === 4, ex = landed ? tx : tx + Math.cos(ang + jit * 4) * 24, ey = landed ? ty : ty + Math.sin(ang + jit * 4) * 24;   // hits land where the battle says (hull edge / shield edge); misses scatter past
    const x2 = landed ? ex : ex + Math.sin(ang) * jit * 30, y2 = landed ? ey : ey - Math.cos(ang) * jit * 30;
    if (kind === 'e') {                                                              // a beam: instant — a soft glow with a bright core from the barrel to the mark, gone in a third of a second
      const life = 0.35, f = 1 - p / life; if (f <= 0) return;
      g.globalAlpha = (out ? 0.4 : 0.15) * f; g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.moveTo(fx, fy); g.lineTo(x2, y2); g.stroke();
      g.globalAlpha = (out ? 1 : 0.45) * f; g.strokeStyle = '#eafffb'; g.lineWidth = landed ? 1.6 : 1; g.beginPath(); g.moveTo(fx, fy); g.lineTo(x2, y2); g.stroke();
      mark(kind, out, tx, ty, f, col);
    } else if (kind === 'k') {                                                       // a shell: a tracer running down the line to where the target is now, then the burst
      const travel = 0.45;
      if (p <= travel) {
        const t1 = p / travel, t0 = Math.max(0, t1 - 0.18);
        g.globalAlpha = 0.1; g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy); g.lineTo(x2, y2); g.stroke();
        g.globalAlpha = 0.95; g.strokeStyle = '#ffe2a8'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(fx + (x2 - fx) * t0, fy + (y2 - fy) * t0); g.lineTo(fx + (x2 - fx) * t1, fy + (y2 - fy) * t1); g.stroke(); g.lineCap = 'butt';
      } else mark(kind, out, tx, ty, 1 - (p - travel) / 0.4, col);
    } else {                                                                         // a drone's volley: a thin flick
      const f = 1 - p / 0.25; if (f <= 0) return;
      g.globalAlpha = (out ? 0.9 : 0.3) * f; g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy); g.lineTo(x2, y2); g.stroke();
      mark(kind, out, tx, ty, f, col);
    }
  };
  f0.shots.forEach((sh, n) => drawShot(sh, 1 - (sh[9] || 0) + k, n));             // last second's shots: their late phases
  f1.shots.forEach((sh, n) => { const p = k - (sh[9] || 0); if (p >= 0) drawShot(sh, p, n + 500); });   // this second's shots, as they fire
  g.globalAlpha = 1;
  // missiles and drones in flight, eased between frames by id; a missile that arrives this second flies on to where it bursts
  const arrivals = new Map(); for (const sh of f1.shots) if (sh[1] === 'm' && sh[12]) arrivals.set(sh[12], sh);
  for (const e of f0.ents) {
    const nx = E1.get(e[0]), side = e[1]; let ex, ey, ang;
    const arr = !nx && e[2] === 'm' ? arrivals.get(e[0]) : null;
    if (arr) {                                                                           // its last leg: from where it was to where it burst, arriving at the moment it did
      const u = Math.max(0.05, arr[9] || 0); if (k >= u) continue;
      const [, [ax, ay]] = shotEnds(arr), x0 = X(e[3]), y0 = Y(e[4]), q = k / u; ex = x0 + (ax - x0) * q; ey = y0 + (ay - y0) * q; ang = Math.atan2(ay - y0, ax - x0);
    } else { ex = X(nx ? lerp(e[3], nx[3]) : e[3]); ey = Y(nx ? lerp(e[4], nx[4]) : e[4]); ang = headTo(ex, ey, side); }
    if (e[2] === 'm') {                                                                 // a missile: a dart with a short trail
      g.strokeStyle = 'rgba(255,138,107,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ex - Math.cos(ang) * 10, ey - Math.sin(ang) * 10); g.lineTo(ex, ey); g.stroke();
      g.fillStyle = COLOR.m; g.beginPath(); g.moveTo(ex + Math.cos(ang) * 4, ey + Math.sin(ang) * 4); g.lineTo(ex + Math.cos(ang + 2.6) * 3, ey + Math.sin(ang + 2.6) * 3); g.lineTo(ex + Math.cos(ang - 2.6) * 3, ey + Math.sin(ang - 2.6) * 3); g.closePath(); g.fill();
    } else {                                                                            // a drone: a small chevron in its side's colour, dimmer when hurt, hollow when heading home
      g.globalAlpha = 0.45 + 0.55 * (e[5] ?? 100) / 100; g.fillStyle = e[6] ? 'rgba(255,224,138,.25)' : COLOR.d; g.strokeStyle = SIDE[side]; g.lineWidth = 1;
      g.beginPath(); g.moveTo(ex + Math.cos(ang) * 5, ey + Math.sin(ang) * 5); g.lineTo(ex + Math.cos(ang + 2.4) * 4, ey + Math.sin(ang + 2.4) * 4); g.lineTo(ex + Math.cos(ang - 2.4) * 4, ey + Math.sin(ang - 2.4) * 4); g.closePath(); g.fill(); g.stroke(); g.globalAlpha = 1;
    }
  }
  // the ships: up close the hull with its bars; far out a TACTICAL SYMBOL — a shape per size class (the
  // biggest ship in this fight sets the scale), a vessel filled with the hull like fluid, in the side's
  // colour, turning red as it drains, a shield arc round it; in between the two fade into each other
  const tiers = cur.tiers || (cur.tiers = tiersOf(ships)), few = ships.length <= 6;
  // each fleet's COAT (skins.js): a plating style and a two-colour wash from its name, never the same style on both sides
  const lookA = skinsOn() ? (cur.A && cur.A.look) || lookOf(cur.A ? cur.A.name : 'A') : null, looks = lookA ? [lookA, (cur.B && cur.B.look) || lookOf(cur.B ? cur.B.name : 'B', lookA)] : null;   // a designed fleet wears the coat its designer chose
  ships.forEach((s, j) => {
    const side = sideOf(j), hull = s.ds.hull, Lraw = hull.bw * B.unit * sc, L = Math.max(16, Lraw), scale = L / hull.bw, [cx, cy] = P[j], hp = hpOf(j), ang = angOf(j);
    const symA = Math.max(0, Math.min(1, (SYM.far - Lraw) / (SYM.far - SYM.near)));       // 1 = symbol only, 0 = ship only
    const sp = looks && symA < 1 ? spriteOf(s, looks[side], () => { if (!playing && cur) draw(); }) : null;   // the painted ship once its sheets are in; the plain plate until then
    if (symA < 1) {
      g.save(); g.translate(cx, cy); g.rotate(ang);
      g.beginPath(); hull.poly.forEach(([x, y], n) => { const X2 = (x - (hull.box.minx + hull.box.maxx) / 2) * scale, Y2 = y * scale; n ? g.lineTo(X2, Y2) : g.moveTo(X2, Y2); }); g.closePath();
      if (sp) {                                                                           // the painted hull on its centre; a dead one dim and reddened
        const kk = scale / sp.S; g.globalAlpha = (1 - symA) * (hp <= 0 ? 0.45 : 1); g.drawImage(sp.cv, -sp.w / 2 * kk, -sp.h / 2 * kk, sp.w * kk, sp.h * kk);
        if (hp <= 0) { g.fillStyle = 'rgba(120,30,30,.5)'; g.fill(); }
        g.globalAlpha = 1 - symA;
      } else {
        // the hull: a dark plate in the side's colour with a bright edge, so what sits on it reads
        g.fillStyle = hp <= 0 ? '#2a1818' : mixColor(SIDE[side], '#0b1120', 0.55); g.globalAlpha = (1 - symA) * (hp <= 0 ? 0.7 : 1); g.fill(); g.globalAlpha = 1 - symA; g.strokeStyle = hp <= 0 ? '#7a4a4a' : SIDE[side]; g.lineWidth = Math.min(2, Math.max(1, scale * 0.12)); g.stroke();
        if (scale >= 10) { g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke(); }   // the spine
      }
      if (s.shMax && hp > 0) {                                                        // the shield: a skin over the ship, solid at its rim and falling off fast inward (so the ship shows), brighter the fuller it is
        const sh = lerp(f0.sh[j], f1.sh[j]), rx = L * 0.62, ry = L * 0.4, A = 0.18 + 0.72 * Math.max(0, sh);
        g.save(); g.scale(rx, ry); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, 'rgba(207,137,255,0)'); gr.addColorStop(0.62, 'rgba(207,137,255,0)'); gr.addColorStop(0.86, `rgba(207,137,255,${(0.22 * A).toFixed(3)})`); gr.addColorStop(1, `rgba(207,137,255,${(0.78 * A).toFixed(3)})`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
        g.strokeStyle = `rgba(228,186,255,${(0.6 * A).toFixed(3)})`; g.lineWidth = Math.max(1, Math.min(2, scale * 0.08)); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.stroke();
      }
      g.restore();
      // the hard points: every gun a TURRET on its mount — a dark drum rimmed in the weapon's colour, a pale barrel on the ship's target
      // or swung onto what it just shot at, a muzzle flash when it fired this frame; a launcher sits fixed, facing forward
      if (scale >= 4 && hp > 0) {
        const c = Math.cos(ang), sn = Math.sin(ang), kpx = scale / B.unit, big = scale >= 9;
        s.guns.forEach((gun, gi) => {
          if (gun.mx === undefined) return;
          const tx = cx + (c * gun.mx - sn * gun.my) * kpx, ty = cy + (sn * gun.mx + c * gun.my) * kpx, tr = Math.max(big ? 3 : 1.6, 0.17 * scale * Math.sqrt(gun.size || 1));
          const fired = aim.get(j * 1000 + gi), a = turretAng(j, gi, fired ? fired.a : ang), kch = gun.kind.slice(7, 8), col = COLOR[kch] || '#fff', len = tr * (kch === 'k' ? 3.4 : 2.8);
          const fl = fired ? Math.max(0, 1 - fired.p / 0.3) : 0;                     // the muzzle flash: bright the instant it fires, gone in a third of a second
          const flash = (mx2, my2, fr) => { const gr = g.createRadialGradient(mx2, my2, 0, mx2, my2, fr * 2.2); gr.addColorStop(0, `rgba(255,255,230,${0.95 * fl})`); gr.addColorStop(0.4, `rgba(255,220,120,${0.6 * fl})`); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.beginPath(); g.arc(mx2, my2, fr * 2.2, 0, 7); g.fill(); };
          g.globalAlpha = 1 - symA;
          const T = sp && sp.turrets ? sp.turrets.cells[TCELL[gun.kind]] : null, rr = sp ? (sp.r[gi] || 0) * scale / sp.S : 0;
          if (T && rr >= 2) {                                                       // the style's own turret on its mount: beams and guns swung onto the target, a launcher fixed forward, a flash at the muzzle
            const [sx, sy, sw, sh, px, py, body] = T, kq = 2 * rr / body, a2 = kch === 'm' ? ang : a;
            g.save(); g.translate(tx, ty); g.rotate(a2); g.drawImage(sp.turrets.img, sx, sy, sw, sh, -px * kq, -py * kq, sw * kq, sh * kq); g.restore();
            if (fl > 0) { const bl = (sw - px) * kq; flash(tx + Math.cos(a2) * bl, ty + Math.sin(a2) * bl, rr * 0.5 + 2 * fl); }
            return;
          }
          if (kch === 'm') {                                                        // a launcher: a wedge pointing forward, lit when it fires
            g.fillStyle = fl > 0 ? '#fff' : col; g.beginPath(); g.moveTo(tx + Math.cos(ang) * tr * 1.9, ty + Math.sin(ang) * tr * 1.9); g.lineTo(tx + Math.cos(ang + 2.3) * tr * 1.4, ty + Math.sin(ang + 2.3) * tr * 1.4); g.lineTo(tx + Math.cos(ang - 2.3) * tr * 1.4, ty + Math.sin(ang - 2.3) * tr * 1.4); g.closePath(); g.fill();
            if (big) { g.strokeStyle = '#0b1120'; g.lineWidth = 1; g.stroke(); }
          } else {
            g.strokeStyle = '#e8eef8'; g.lineWidth = Math.max(1.2, tr * (kch === 'k' ? 0.7 : 0.45)); g.lineCap = 'round';   // the barrel first, so the drum sits on its root
            g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len); g.stroke(); g.lineCap = 'butt';
            g.fillStyle = '#1b2233'; g.beginPath(); if (kch === 'k') g.rect(tx - tr, ty - tr, 2 * tr, 2 * tr); else g.arc(tx, ty, tr, 0, 7); g.fill();   // the drum
            g.strokeStyle = fl > 0 ? '#fff' : col; g.lineWidth = big ? 1.6 : 1; g.stroke();
            if (fl > 0) flash(tx + Math.cos(a) * len, ty + Math.sin(a) * len, tr * 0.9 + 2 * fl);   // muzzle flash
          }
        });
        g.globalAlpha = 1;
      }
      if (symA < 0.5) {
        // three bars: shield (purple), armour (grey), hull (green) — narrower, with less text, when the field is crowded
        g.globalAlpha = 1 - 2 * symA;
        const crowded = !few, bw = crowded ? 40 : 72, bx = cx - bw / 2, rows = 1 + (s.arMax ? 1 : 0) + (s.shMax ? 1 : 0), by = cy - L * 0.5 - 12 - rows * 7;
        let yy = by;
        if (s.shMax) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(bx, yy, bw, 4); g.fillStyle = '#cf89ff'; g.fillRect(bx, yy, bw * Math.max(0, lerp(f0.sh[j], f1.sh[j])), 4); yy += 7; }
        if (s.arMax) { const ar = f0.ar ? lerp(f0.ar[j], f1.ar[j]) : 0; g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(bx, yy, bw, 4); g.fillStyle = '#c9d4e8'; g.fillRect(bx, yy, bw * Math.max(0, ar), 4); yy += 7; }
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(bx, yy, bw, 5); g.fillStyle = '#7ef3b0'; g.fillRect(bx, yy, bw * Math.max(0, hp), 5);
        g.fillStyle = hp <= 0 ? '#7a4a4a' : SIDE[side]; g.font = `bold ${crowded ? 10 : 11}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(s.name, cx, by - 5);
        const msl = f0.msl ? f0.msl[j] : 0, dr = f0.dr ? f0.dr[j] : 0, bays = f0.bays ? f0.bays[j] : 0, spent = f0.spent ? f0.spent[j] : 0, stock = f0.stock ? f0.stock[j] : 0;
        g.fillStyle = '#9eb3d8'; g.font = '10px system-ui, sans-serif';
        if (!crowded) g.fillText(hp <= 0 ? 'destroyed' : `${Math.round(Math.max(0, hp) * 100)}%${s.missiles ? ` · ${msl ? msl + ' msl' : 'dry'}` : ''}${s.drones ? ` · ${dr}/${s.airCap} out, ${bays} ready${spent ? `, ${spent} spent` : ''}` : ''}${s.stock ? ` · stock ${stock}` : ''}`, cx, cy + L * 0.5 + 20);
        else if (hp > 0 && (s.missiles || s.drones)) g.fillText(`${s.missiles ? (msl ? msl + ' msl' : 'dry') : ''}${s.missiles && s.drones ? ' · ' : ''}${s.drones ? `${dr}/${s.airCap} out` : ''}`, cx, cy + L * 0.5 + 16);   // crowded: the bars say the rest
      }
      g.globalAlpha = 1;
    }
    if (symA > 0) {
      g.globalAlpha = symA;
      drawSymbol(g, cx, cy, tiers[j], hp, side, s.shMax && hp > 0 ? lerp(f0.sh[j], f1.sh[j]) : null);
      if (few && symA >= 0.5) { g.fillStyle = hp <= 0 ? '#7a4a4a' : SIDE[side]; g.font = 'bold 10px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(s.name, cx, cy - SYM.size[tiers[j]] - 6); }
      g.globalAlpha = 1;
    }
  });
  // the HUD: the clock, how close the nearest enemies are, and who is still standing
  g.fillStyle = '#9eb3d8'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'left';
  let dNow = Infinity; for (let a = 0; a < nA; a++) for (let b = nA; b < ships.length; b++) if (hpOf(a) > 0 && hpOf(b) > 0) dNow = Math.min(dNow, Math.hypot(Wp[a][0] - Wp[b][0], Wp[a][1] - Wp[b][1]));
  if (!isFinite(dNow)) dNow = 0;
  const len = Math.max(...ships.map(s => s.ds.hull.bw)) * B.unit, upA = ships.filter((_, j) => j < nA && hpOf(j) > 0).length, upB = ships.filter((_, j) => j >= nA && hpOf(j) > 0).length;
  g.fillText(`${Math.round(lerp(f0.t, f1.t))} s · ${nA > 1 || nB > 1 ? 'nearest enemies ' : ''}${Math.round(dNow)} u apart (${(dNow / len).toFixed(1)} ship lengths)${nA > 1 || nB > 1 ? ` · ${upA} of ${nA} vs ${upB} of ${nB} standing` : ''}`, 10, 16);
  // command mode: the orders drawn on the field — marked enemies, the area, the retreat
  if (cur.live) {
    const O = cur.live.orders[0];
    for (const j of O.eliminate) if (ships[j] && hpOf(j) > 0) { const [x, y] = P[j], rr = Math.max(12, ships[j].ds.hull.bw * B.unit * sc * 0.7); g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); for (const a of [0, 1.57, 3.14, 4.71]) { g.beginPath(); g.moveTo(x + Math.cos(a) * (rr - 5), y + Math.sin(a) * (rr - 5)); g.lineTo(x + Math.cos(a) * (rr + 5), y + Math.sin(a) * (rr + 5)); g.stroke(); } }
    for (const j of O.avoid) if (ships[j] && hpOf(j) > 0) { const [x, y] = P[j]; g.strokeStyle = '#ffb347'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.arc(x, y, Math.max(2, 650 * sc), 0, 7); g.stroke(); g.setLineDash([]); }
    if (O.area) { const a = O.area, col = a.kind === 'protect' ? '126,243,176' : a.kind === 'avoid' ? '255,107,107' : '255,179,71'; g.fillStyle = `rgba(${col},.10)`; g.strokeStyle = `rgba(${col},.8)`; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.beginPath(); g.arc(X(a.x), Y(a.y), a.r * sc, 0, 7); g.fill(); g.stroke(); g.setLineDash([]); g.fillStyle = `rgba(${col},.9)`; g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(a.kind.toUpperCase() + ' AREA', X(a.x), Y(a.y) - a.r * sc - 6); }
    g.textAlign = 'left'; g.font = 'bold 11px system-ui, sans-serif';
    if (O.retreat) { g.fillStyle = '#ffd26a'; g.fillText('RETREAT — flat out, away from the enemy', 10, 32); }
    if (armed && !cur.live.done) { g.fillStyle = '#7ef3b0'; g.fillText(armed === 'eliminate' || armed === 'avoid' ? 'TAP AN ENEMY SHIP' : 'TAP A SPOT ON THE FIELD', 10, O.retreat ? 48 : 32); }
    if (!cur.live.done) { g.fillStyle = SIDE[0]; g.textAlign = 'right'; g.fillText(playing ? 'LIVE' : 'PAUSED', W - 10, 16); }
  }
  if (!playing && clock >= cur.frames.length - 1 && !(cur.live && !cur.live.done)) { const w = cur.winner; g.textAlign = 'right'; g.fillStyle = w === null ? '#ffd26a' : SIDE[w]; g.font = 'bold 12px system-ui, sans-serif'; g.fillText(w === null ? 'DRAW' : `${(w === 0 ? cur.A : cur.B).name.toUpperCase()} WINS`, W - 10, 16); }
  $('scrub').max = F.length - 1; $('scrub').value = clock;
  g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'left';
  if (focus != null) { g.fillStyle = SIDE[sideOf(focus)]; g.fillText(`FOLLOWING ${ships[focus].name} · ⌖ for the whole fight`, 10, H - 10); }
  else if (Math.max(...ships.map(s => s.ds.hull.bw)) * B.unit * sc < SYM.far) { g.fillStyle = 'rgba(158,179,216,.8)'; g.fillText('tap a ship to ride along and watch its guns work', 10, H - 10); }   // zoomed out: say how to get close
  cv._P = P; cv._cam = { cx: view.cx, cy: view.cy, sc, W, H, followCx: cam.cx, followCy: cam.cy }; cv._fight = cur;   // where the ships are on screen and how the field maps, for taps and the wheel (and the fight, for poking at from the console)
}
// tactical symbols: size tiers by cost against the biggest ship in THIS fight (later: proper classes)
const SYM = { near: 16, far: 34, size: [6, 7, 8, 9, 11] };
const tiersOf = ships => { const mx = Math.max(...ships.map(s => s.cost)) || 1; return ships.map(s => { const r = s.cost / mx; return r >= 0.75 ? 4 : r >= 0.45 ? 3 : r >= 0.25 ? 2 : r >= 0.12 ? 1 : 0; }); };
const mixColor = (a, b, t) => { const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const A = h(a), Bc = h(b); return `rgb(${A.map((v, i) => Math.round(v + (Bc[i] - v) * t)).join(',')})`; };
function symbolPath(g, x, y, r, tier) {
  g.beginPath();
  if (tier === 0) { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); }                                                   // corvette: triangle
  else if (tier === 1) { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); }                                   // frigate: diamond
  else if (tier === 2) { g.moveTo(x, y - r); g.lineTo(x + r, y - r * 0.2); g.lineTo(x + r * 0.65, y + r); g.lineTo(x - r * 0.65, y + r); g.lineTo(x - r, y - r * 0.2); }   // destroyer: pentagon
  else if (tier === 3) { for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; k ? g.lineTo(px, py) : g.moveTo(px, py); } }   // cruiser: hexagon
  else g.rect(x - r * 1.3, y - r * 0.8, r * 2.6, r * 1.6);                                                                                    // capital: a broad block
  g.closePath();
}
// a vessel filled with the hull like fluid: full and in the side's colour when whole, draining and reddening as it dies
function drawSymbol(g, x, y, tier, hp, side, sh) {
  const r = SYM.size[tier], col = SIDE[side];
  if (hp <= 0) { g.strokeStyle = '#6b4a4a'; g.lineWidth = 1; symbolPath(g, x, y, r, tier); g.stroke(); g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); return; }
  g.save(); symbolPath(g, x, y, r, tier); g.clip();
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x - r * 1.5, y - r, r * 3, r * 2);
  const top = y + r - 2 * r * Math.max(0, Math.min(1, hp));
  g.fillStyle = mixColor(col, '#ff4d4d', 1 - Math.max(0, Math.min(1, hp))); g.fillRect(x - r * 1.5, top, r * 3, y + r - top + 1);
  g.restore();
  g.strokeStyle = col; g.lineWidth = 1.2; symbolPath(g, x, y, r, tier); g.stroke();
  if (sh !== null && sh > 0.02) { g.strokeStyle = `rgba(207,137,255,${0.35 + 0.6 * sh})`; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sh); g.stroke(); }   // the shield, as an arc round it
}

// the design behind a ship: its silhouette with the guns on it, and what is inside
function showDesign(id) {
  const s = typeof id === 'object' ? id : typeof id === 'string' ? LAB.fleets[+id.split(':')[0]]?.ships[+id.split(':')[1] || 0] : LAB.fleets[id]?.ships[0]; if (!s) return;   // a ship, "fleet:member", or a fleet's first ship
  $('dsgnTitle').innerHTML = `<b>${esc(s.name)}</b> <span class="arch">${esc(s.arch.label)}</span> · cost ${fmt(s.cost)} · ${s.ds.t.squares} squares (${esc(s.design.hull)})`;
  const cv = $('dsgn'); cv.width = cv.clientWidth || 360; cv.height = 220;
  drawHull(cv, s.ds, null, null);
  const t = s.ds.t;
  $('dsgnInfo').innerHTML = s.ds.mods.map(m => `<div class="mline" style="--c:${m.K.color}"><b>${m.K.name}${m.n > 1 ? ' × ' + m.n : ''}${m.K.scale ? ` <small>×${m.k}</small>` : ''}${m.K.mount && !m.K.hangar && m.mod.preset && m.mod.preset !== 'standard' && PRESETS[m.mod.preset] ? ` <small>${PRESETS[m.mod.preset].name}</small>` : ''}</b><span>${m.K.hangar ? `${Math.round(m.v.craft)} drones × size ${m.v.size.toFixed(1)} · each ${fmt(B.drone.hp * m.v.size)} HP, ${fmt(B.drone.dmg * m.v.size)} HP/s, speed ${fmt(B.drone.speed / Math.pow(m.v.size, 0.3))}` : m.K.mount ? `dmg ×${m.tune.dmg} · rate ×${m.tune.rof} · range ×${m.tune.rng}${m.K.charges ? ` · charges ×${m.tune.chg} (${Math.round(m.v.charges)} each)` : ''} · ${fmt(m.v.damage)} HP/shot, ${m.v.rate.toFixed(2)}/s, ${fmt(m.v.range)} u, ${Math.round(m.v.accuracy)}%${traverseOf(m.kind, m.volume / m.K.volume) ? ` · turret slews ${Math.round(traverseOf(m.kind, m.volume / m.K.volume))}°/s` : ' · launcher, no turret'}` : m.kind === 'reactor' ? `${fmt(m.v.output)} MW` : m.kind === 'stardrive' ? `moves ${fmt(m.v.lift)} volume · thrust ${fmt(m.v.thrust)}` : m.kind === 'shield' ? `${fmt(m.v.capacity)} HP · reach ${m.v.radius.toFixed(1)} sq` : m.kind === 'armor' ? `${fmt(m.v.hp)} HP · shrugs ${m.v.deflect.toFixed(1)}/hit` : m.kind === 'weapon_system' ? `${num(m.v.mounts, 1)} mounts · +${num(m.v.bonus, 1)}% targeting` : m.kind === 'works' ? `${fmt(m.v.industry)} industry → ${(m.v.industry * 0.02 * 60).toFixed(1)} missiles/min or ${(m.v.industry * 0.008 * 60).toFixed(1)} drone sorties/min · stock ${fmt(m.volume * m.n * 4)}` : ''}</span><span class="tiny">cost ${fmt(m.cost * m.n)} · vol ${fmt(m.volume * m.n)}</span></div>`).join('')
    + `<div class="tiny" style="margin-top:6px">hull ${fmt(t.hp)} HP${t.armor ? ` · armour ${fmt(t.armor)} HP (shrugs ${t.deflect.toFixed(1)}/hit)` : ''}${t.hullRepair ? ` · fabricator patches ${t.hullRepair.toFixed(1)} hull/s` : ''} · shield ${fmt(t.shieldRaw)} (${Math.round(t.cover * 100)}% cover, +${fmt(t.shieldRec)}/s) · power ${fmt(t.powerOut)} / ${fmt(t.powerUse)} MW${t.powerFactor < 1 ? ` (runs at ${Math.round(t.powerFactor * 100)}%)` : ''} · mounts ${num(t.mountsUsed, 1)} / ${num(t.mounts, 1)}${t.fireFactor < 1 ? ` (guns at ${Math.round(t.fireFactor * 100)}%)` : ''}${t.drones ? ` · ${t.airCap} drones in the air at once` : ''} · speed ${fmt(t.speed)} · evasion ${Math.round(t.evasion)}%${stockLine(s)}</div>`;
  $('design').hidden = false;
  $('design').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------- wiring ----------------
$('run').onclick = run;
$('rand').onclick = () => { $('seed').value = Math.floor(Math.random() * 1e6); run(); };
$('play').onclick = () => { if (!cur) return; if (cur.live && !cur.live.done) clock = cur.frames.length - 1; else if (clock >= cur.frames.length - 1) clock = 0; playing = !playing; last = 0; };
$('cmdStart').onclick = commandFight;
document.addEventListener('click', e => { const c = e.target.closest('[data-cmd]'); if (c) giveOrder(c.dataset.cmd); });
$('arena').addEventListener('click', fieldTap);
// ---------------- the camera: wheel zooms round the cursor, a drag pans, the middle button (or ⌖) hands it back to following ----------------
{
  const cv = $('arena'); let pan = null, moved = false;
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height, cv.width / r.width]; };
  // the viewer's zoom and pan live on top of the following camera: `sc` is the zoom, `dx/dy` the offset from what is being followed
  const base = () => camUser || { focus: null, dx: 0, dy: 0, sc: null };
  cv.addEventListener('wheel', e => {
    const c = cv._cam; if (!cur || !c) return; e.preventDefault();
    const [mx, my] = toCanvas(e), sc = Math.max(0.03, Math.min(8, c.sc * Math.exp(-e.deltaY * 0.0015))), wx = c.cx + (mx - c.W / 2) / c.sc, wy = c.cy + (my - c.H / 2) / c.sc;
    camUser = { ...base(), sc, dx: wx - (mx - c.W / 2) / sc - c.followCx, dy: wy - (my - c.H / 2) / sc - c.followCy };   // the spot under the cursor stays put
    $('camFit').hidden = false; if (camUser.focus == null) $('camFit').textContent = '⌖ Follow'; draw();
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    if (e.button === 1) { e.preventDefault(); camUser = null; $('camFit').hidden = true; if (cur) draw(); return; }
    if (e.button !== 0 || !cv._cam) return; const b = base(); pan = { x: e.clientX, y: e.clientY, dx: b.dx, dy: b.dy, sc: cv._cam.sc }; moved = false;
  });
  cv.addEventListener('pointermove', e => {
    if (!pan) return; const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true; const k = toCanvas(e)[2]; camUser = { ...base(), dx: pan.dx - dx * k / pan.sc, dy: pan.dy - dy * k / pan.sc }; $('camFit').hidden = false; draw();
  });
  const up = () => { if (pan && moved) suppressTap = true; pan = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  $('camFit').onclick = () => { camUser = null; $('camFit').hidden = true; $('camFit').textContent = '⌖ Follow'; if (cur) draw(); };
}
// ---------------- keys: space pauses, escape drops an armed order / closes the menu ----------------
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.code === 'Space' && cur) { e.preventDefault(); $('play').click(); }
  if (e.key === 'Escape') { armed = null; hideMenu(); updateCmdBar(); if (cur) draw(); }
});
// ---------------- right-click (long-press on a phone): orders on a ship or on a spot, in command mode ----------------
function showMenu(x, y, items, title) {
  const m = $('ctxMenu'); m.innerHTML = (title ? `<div class="ttl">${esc(title)}</div>` : '') + items.map((it, i) => `<button data-mi="${i}">${it.label}</button>`).join('');
  m.hidden = false; m._items = items; m.style.left = Math.max(4, Math.min(x, innerWidth - 230)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - 36 * items.length - 40)) + 'px';
}
function hideMenu() { const m = $('ctxMenu'); if (m) { m.hidden = true; m._items = null; } }
document.addEventListener('click', e => {
  const mi = e.target.closest('[data-mi]'), m = $('ctxMenu');
  if (mi && m._items) { const it = m._items[+mi.dataset.mi]; if (it.confirm && !it.confirmed) { it.confirmed = true; mi.textContent = it.confirm; return; } hideMenu(); it.run(); updateCmdBar(); if (cur) draw(); return; }
  if (!e.target.closest('#ctxMenu')) hideMenu();
});
$('arena').addEventListener('contextmenu', e => {
  e.preventDefault(); const live = cur && cur.live, cv = $('arena'), c = cv._cam, P = cv._P; if (!live || live.done || !c || !P) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height, nA = cur.n ? cur.n[0] : 1;
  let best = -1, bd = 30; P.forEach(([px, py], j) => { if (j >= nA) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = j; } } });
  playing = false; armed = null; updateCmdBar();
  if (best >= 0) { const name = cur.ships[best].name; showMenu(e.clientX, e.clientY, [{ label: `☠ Eliminate ${esc(name)}`, run: () => live.order(0, { type: 'eliminate', ships: [best] }) }, { label: `↔ Keep away from ${esc(name)}`, run: () => live.order(0, { type: 'avoid', ships: [best] }) }], name); }
  else {
    const wx = c.cx + (x - c.W / 2) / c.sc, wy = c.cy + (y - c.H / 2) / c.sc, area = kind => () => live.order(0, { type: 'area', kind, x: wx, y: wy, r: 300 });
    showMenu(e.clientX, e.clientY, [{ label: '⛨ Protect this area', run: area('protect') }, { label: '⚔ Attack this area', run: area('attack') }, { label: '⊘ Avoid this area', run: area('avoid') }, { label: live.orders[0].retreat ? '⟲ Call off the retreat' : '⟲ Retreat…', confirm: 'Sure? Retreat!', confirmed: live.orders[0].retreat, run: () => live.order(0, { type: 'retreat' }) }, { label: 'Clear orders', run: () => live.order(0, { type: 'clear' }) }], 'Here');
  }
});
$('speed').onclick = () => { speed = speed === 1 ? 3 : speed === 3 ? 8 : 1; $('speed').textContent = '×' + speed; };
$('scrub').oninput = e => { if (!cur) return; playing = false; clock = +e.target.value; draw(); };
$('order').onchange = e => { order = e.target.value; try { localStorage.setItem('lab.order', order); } catch (x) { /* fine */ } renderShips(); };
$('ffilter').onchange = e => { ffilter = e.target.value; renderFights(); };
$('duel').onclick = duel;
$('make').onclick = makeShip;
$('buildChips').onclick = buildFromChips;
$('clearChips').onclick = () => { tray = []; traySel = null; renderBuilder(); };
$('words').addEventListener('keydown', e => { if (e.key === 'Enter') makeShip(); });
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fight]'); if (f) return watch(+f.dataset.fight);
  const g = e.target.closest('[data-gen]'); if (g && EVO) return showGen(+g.dataset.gen);
  const d = e.target.closest('[data-design]'); if (d) return showDesign(d.dataset.design);
  const p = e.target.closest('[data-pickship]'); if (p) { const id = +p.dataset.pickship; picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked.slice(-1), id]; return renderShips(); }
});
$('arena').addEventListener('dblclick', e => {
  const cv = $('arena'), P = cv._P; if (!cur || !P) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  let best = 0, bd = Infinity; P.forEach(([px, py], j) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = j; } });
  showDesign(cur.ships[best]);                                                      // the nearest ship of either fleet
});
$('chRun').onclick = runChallenge;
// the arena's bottom edge drags up and down
{
  const grip = $('grip'); let drag = null;
  grip.addEventListener('pointerdown', e => { drag = { y: e.clientY, h: arenaH }; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  grip.addEventListener('pointermove', e => { if (!drag) return; arenaH = Math.max(200, Math.min(1000, drag.h + (e.clientY - drag.y))); $('arena').style.height = arenaH + 'px'; if (cur) draw(); });
  const up = () => { if (!drag) return; drag = null; try { localStorage.setItem('lab.arenaH', arenaH); } catch (x) { /* fine */ } };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  if (!ARENA) $('arena').style.height = arenaH + 'px';
}
$('skins').onchange = () => { if (cur) draw(); };
$('toPainter').onclick = () => { location.href = 'paint.html'; };        // the same tab: a published page may not open new ones
// ---------------- the player's silhouettes: random ships wear them when there are any ----------------
// The library is the painter's (the same storage when both run from the same place). From elsewhere the painter hands
// it over as a code — in the link (#hulls=…) or pasted into the box — and it is merged in by id and kept.
const HULL_KEY = 'forge.eon.hulls.v1';
let HULLS = [];
function importLibrary(code, quiet = false) {
  let list; try { list = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); } catch (e) { if (!quiet) $('hullsNote').textContent = 'That is not a library code — copy it from the painter with ⧉ Library code.'; return; }
  if (!Array.isArray(list)) return;
  let n = 0; for (const h of list) { if (!h || !(h.poly && h.poly.length >= 3)) continue; const i = HULLS.findIndex(x => x.id === h.id); if (i >= 0) HULLS[i] = h; else HULLS.push(h); n++; }
  try { localStorage.setItem(HULL_KEY, JSON.stringify(HULLS)); } catch (e) { /* fine */ }
  setUserHulls(HULLS); libraryNote(n);
}
function libraryNote(added = 0) {
  const mine = HULLS.filter(h => (h.klass || 'starship') === 'starship').length;
  $('hullsNote').textContent = (added ? `${added} taken in · ` : '') + (mine ? `${mine} of your silhouettes — random ships wear them (Run for new ships)` : 'none of yours yet, so random ships wear the built-in ones — draw some in the painter and bring them here');
}
try { HULLS = JSON.parse(localStorage.getItem(HULL_KEY) || '[]') || []; } catch (e) { HULLS = []; }
{ const m = /[#&]hulls=([^&]+)/.exec(location.hash); if (m) { importLibrary(m[1], true); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* fine */ } } }
setUserHulls(HULLS); libraryNote();
$('hullsImport').onclick = () => { importLibrary($('hullsIn').value); $('hullsIn').value = ''; };


// ---------------- two fleets by code (from the Fleet Generator) fight each other ----------------
function fightCodes() {
  if (!LAB) return;
  const pa = planFromCode($('codeA').value), pb = planFromCode($('codeB').value);
  if (!pa || !pb) { $('codesNote').textContent = (pa ? 'Fleet 2' : 'Fleet 1') + ' is not a fleet code — copy it from the Fleet Generator (⚙).'; tellParent({ type: 'error', text: $('codesNote').textContent }); return; }
  setUserHulls([...HULLS, ...Object.values(pa.hulls || {}), ...Object.values(pb.hulls || {})]);          // their own silhouettes travel inside the code
  const mk = p => { const id = LAB.fleets.length, f = buildPlan(S, p, undefined, (id + 1) + ''); if (!f.ships.length) return null; f.name = p.name || `Fleet ${id + 1}`; f.look = lookFromColors(p.style, p.colA, p.colB); Object.assign(f, { id, w: 0, l: 0, d: 0 }); LAB.fleets.push(f); return f; };
  const A = mk(pa), Bf = mk(pb); if (!A || !Bf) { $('codesNote').textContent = 'One of the fleets could not be built.'; tellParent({ type: 'error', text: $('codesNote').textContent }); return; }
  const r = simulate(A.ships, Bf.ships, rng32(Math.floor(Math.random() * 1e9)));
  LAB.fights.unshift({ a: A.id, b: Bf.id, A, B: Bf, ...r, custom: true });
  picked = [A.id, Bf.id]; renderShips(); renderFights(); watch(0);
  $('codesNote').innerHTML = `<b>${esc(A.name)}</b> (${A.n} ships, ${fmt(A.cost)}) vs <b>${esc(Bf.name)}</b> (${Bf.n} ships, ${fmt(Bf.cost)}): ${r.winner === null ? 'a draw' : `<b style="color:${SIDE[r.winner]}">${esc(r.winner === 0 ? A.name : Bf.name)} wins</b>`} in ${r.time}s.${ARENA ? '' : ' Both are in the pool — press Fight again for fresh dice, or Command this fight.'}`;
  if (ARENA) tellParent({ type: 'result', html: $('codesNote').innerHTML, winner: r.winner, time: r.time, a: A.name, b: Bf.name });
  else $('replay').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('fightCodes').onclick = fightCodes;
$('toGen').onclick = () => { location.href = 'fleet.html'; };
// ---------------- the saved fleets (the Fleet Generator's, same browser): pick one into a code box, copy its code, export them all ----------------
function showFleetPick(anchor) {
  const box = $('fleetPick'), list = plansLoad(), r = anchor.getBoundingClientRect();
  box.innerHTML = (list.length ? list.map((p, i) => `<div class="frow"><b title="${esc(p.name)}">${esc(p.name)}</b><small>${p.ships.length} ships · ${fmt(p.budget)}</small><button data-fpk="A:${i}" title="into Fleet 1">→ 1</button><button data-fpk="B:${i}" title="into Fleet 2">→ 2</button><button data-fpk="C:${i}" title="copy its code">⧉</button></div>`).join('')
    : '<div class="tiny" style="padding:6px">No saved fleets yet — compose one in the ⚙ Fleet Generator and press Save there.</div>')
    + `<div class="frow" style="border:0"><button data-fpk="X" class="x">⤓ Export all as text</button><button data-fpk="G" class="x">⚙ Fleet Generator</button><span class="tiny" style="margin-left:auto">${list.length} saved</span></div>`;
  box.hidden = false; box._list = list;
  box.style.left = Math.max(4, Math.min(r.left, innerWidth - 300)) + 'px'; box.style.top = Math.min(r.bottom + 4, innerHeight - 120) + 'px';
}
document.addEventListener('click', e => {
  const k = e.target.closest('[data-fpk]');
  if (k) {
    const [what, i] = k.dataset.fpk.split(':'), list = $('fleetPick')._list || [];
    if (what === 'G') { location.href = 'fleet.html'; return; }
    if (what === 'X') { downloadText('starforge-fleets.txt', exportAllText(list)); $('fleetPick').hidden = true; return; }
    const p = list[+i]; if (!p) return; const code = planCode(p);
    if (what === 'A') { $('codeA').value = code; $('codesNote').innerHTML = `<b>${esc(p.name)}</b> is Fleet 1.`; }
    else if (what === 'B') { $('codeB').value = code; $('codesNote').innerHTML = `<b>${esc(p.name)}</b> is Fleet 2.`; }
    else { (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { $('codesNote').innerHTML = `Copied the code of <b>${esc(p.name)}</b>.`; }).catch(() => { $('codeA').value = code; $('codeA').select(); $('codesNote').textContent = 'Put in Fleet 1 and selected — copy it from there.'; }); }
    $('fleetPick').hidden = true; return;
  }
  if (!e.target.closest('#fleetPick') && !e.target.closest('#pickFleet') && !e.target.closest('#codeA') && !e.target.closest('#codeB')) $('fleetPick').hidden = true;
});
$('pickFleet').onclick = e => showFleetPick(e.currentTarget);
for (const id of ['codeA', 'codeB']) $(id).addEventListener('focus', e => { if (plansLoad().length) showFleetPick(e.currentTarget); });   // a click in a code box offers the saved fleets; typing or pasting still works
function downloadText(name, text) {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); $('codesNote').textContent = `Saved ${name}.`; }
  catch (e) { $('codeA').value = text.slice(0, 2000); $('codesNote').textContent = 'Could not save a file here — the text is in the Fleet 1 box.'; }
}
{ const m = /[#&]fleetA=([^&]+)/.exec(location.hash), m2 = /[#&]fleetB=([^&]+)/.exec(location.hash); if (m) $('codeA').value = decodeURIComponent(m[1]); if (m2) $('codeB').value = decodeURIComponent(m2[1]); if (m || m2) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* fine */ } } }
if (!$('seed').value) $('seed').value = Math.floor(Math.random() * 1e6);
if (ARENA) {
  // a window for one fight: an empty pool, the codes come by message from the page around us (or in the link as #arena&fleetA=…&fleetB=…)
  LAB = { fleets: [], fights: [], budget: 6000, fleetSizes: [1, 1], table: {}, rate: {} };
  window.addEventListener('message', e => { const d = e.data; if (!d || d.type !== 'fight' || e.source !== window.parent) return; $('codeA').value = d.a || ''; $('codeB').value = d.b || ''; fightCodes(); });
  if ($('codeA').value && $('codeB').value) fightCodes();
  tellParent({ type: 'ready' });
} else run();
