// The eon screens: Empire (focus + research attention), Galaxy (the seeded map of star systems),
// Star system (the places of one system, colonies, ships), Design (modules as pieces on a board).
import { $, clamp, fmt, signed, esc } from '../util.js';
import { DOMAINS } from '../data/properties.js';
import { XS, X_INFO, T, CENTER, FIELD_IDS, newState, compute, endEon, uid, isIntegrated, giveAttention, sendShip, recallShip, settle, starEons, sysDistance, worldOf,
  setSplit, setDevFocus, planCell, queueAdd, queueCount, queueMove, queueDrop, canUndoSend, undoSend, regroupSend,
  LY, VOY, SCALE, shipRange, forecast, fleetRange, sendFleet, lyBetween, peopleWord, upgrade, hostileIn, hostileWord, hostileWorth, ZONE, bubbles, zoneOfSys, effectiveLy } from './model.js';
import { KINDS, KIND_IDS, CLASS_NAME, GANTRY, GUN, PRESETS, applyPreset, allCapsules, designStats, isRelevant, dockFit, reachBand, fitModule, autoFit, traverseOf } from './modules.js';
import { GALAXY, STARS, galaxyOf } from './galaxy.js';
import { createTetra } from './tetra.js';
import { drawHull } from './hullview.js';
import { hullDef, hullsFor, setUserHulls, bboxOf, areaOf, HULL_VOLUME, fieldBubble } from './hull.js';
import { createHullEditor } from './hulledit.js';
import { mountNav } from './nav.js';
import { lookOf as fleetLook, lookFromColors, styleChoices, spriteOf, thumbOf } from './skins.js';
import { shipFromDesign, designFromStacks, archetype } from './battle.js';
import { createChipEditor, CIVIL, vsLayers, CHIPS, CHIPC } from './chipeditor.js';
import { chipsOfDesign } from './shipcode.js';
import { createShapeEditor, GW, GH } from './shapeedit.js';
import { createDialog, saveFlow } from './hullui.js';
import { paintHull, recipeWith, RECIPE } from './paint.js';
import { STYLES, loadStyle } from './styles.js';
import { buildPlan, planCode } from './fleetplan.js';
import { applyEon } from './replay.js';
import { WORLD, MAX_EMPIRES, createWorld, worldEndEon, worldSnapshot, worldRestore, worldPlayEon, applyWorldEon, ownerOf, invade, invasionOdds, newLog, campaignEon, finishLog, HIGHLIGHT } from './world.js';
import { makeBrain } from './ai.js';
import { designSpecHtml, modulesLine } from './spec.js';
import { FACTORS, FACTOR_COLOR, SIZES, sizeClassOf, gridOf, habitabilityOf, habWord } from './districts.js';
import { SLOT, DEV, TRAITS, TRAIT, KIND_WORD as SLOT_WORD, xy, filletWhy, isFull, counts } from './colony.js';
import { drawSurface, focusTetra, drawTri as drawEffortTri, triFromPoint, triBall, toCanvas, cellAt as surfaceCellAt, mapSize, nextPlan } from './colonyview.js';
mountNav('eon', { into: document.getElementById('topbar') });

const KEY = 'forge.eon.v8';
const HULL_KEY = 'forge.eon.hulls.v1';       // the player's own silhouettes live outside the game: a new game keeps them
let S = load();
// THE WORLD (world.js; his ask, 2026-10-16 "when you take over, the AI stops"): other empires on the same galaxy, each with a head of
// its own (ai.js) that plays on while you play yours — from a replay you stopped, or a new game against AI empires. Null = alone.
let W = null;
try { const w = JSON.parse(localStorage.getItem(KEY + '.world') || 'null'); if (w && w.snap) { W = createWorld(w.seedText, w.n, { galaxy: w.galaxy || null }); worldRestore(W, w.snap); W.me = w.me; W.focus = w.focus || null; S = W.empires[W.me]; } } catch (e) { W = null; }
const brainFor = (w, E) => makeBrain(w, E, { focus: w.focus ? w.focus[E.empire] : 'default' });   // an AI empire's head, leaning the way the setup said
const foreignEmpires = () => W ? W.empires.map((E, k) => ({ E, k, col: E.look.colA })).filter(x => x.E !== S && !x.E.dead) : [];   // the other empires, as they are (not a summary)
const sysOfPlaceOf = (E, id) => (E.places.find(p => p.id === id) || {}).sys;
let tab = 'empire', newIds = new Set();
let curDesign = S.designs[0]?.id || null, selMod = null, openBt = new Set(), note = '', noteT = null, FIT = null;
let HULLS = loadHulls(); setUserHulls(HULLS);
let selSys = S.homeSys, selPlace = S.homePlace || 'home', hoverPlace = null, DS = null, LAST = null;
let gSel = S.homeSys, gHover = null, gHoverFleet = false, gField = null, seedDraft = null;
let gView = { z: 1, x: 0, y: 0 }, gMode = 'system';   // the galaxy map's zoom and pan (the wheel; a middle- or right-drag) · what the panel shows at the chosen star: the system, or your fleet there (its icon)
// GOD MODE (his ask, 2026-10-16: "see everything, not just from Sol's perspective — the territory they own, all the movements, click
// any ship"): in a world replay the galaxy shows EVERY empire — spheres, colonies, fleets, ships under way — and the panel is a
// scoreboard plus whatever is at the chosen star; a fleet opens its ships one by one, a ship its card. Read-only.
let GOD = false, godPick = null, GODC = null;       // on/off · { kind: 'fleet', k, sys } | { kind: 'ship', k, id } · every empire's compute() this refresh
let SIM = null;                                      // a SIMULATION running in the game (every empire an AI): { W, log, brains, cap, running, snaps }
const godEmpires = () => GOD && W && ((REPLAY && REPLAY.world) || SIM) ? W.empires : null;
const empireLook = E => { const L = E.look || {}, lk = lookFromColors(L.style || styleChoices()[0].id, L.colA || '#7fb3ff', L.colB || '#ffb347'); lk.wash = 0.6; lk.lights = 0.5; lk.key += '|god'; return lk; };
// FLEETS, Master of Orion's way (his ask, 2026-10-15): your ships at a star are STACKS by design — "Corvette ×30" — each with a
// count to send. Pick some, then click where they go: a star on the galaxy map (only ships that can cross between stars are
// offered there), a place on the system map. At most MAX_SHIP_DESIGNS ship designs (structures do not count).
const MAX_SHIP_DESIGNS = 12;
let picks = new Map(), pickScope = null, sendTo = null, sendPlace = null;   // sendPlace: on the galaxy, WHERE in the chosen system (his ask, 2026-10-18) — the star when none
const sendDest = () => pickScope && (pickScope.kind === 'galaxy' || pickScope.kind === 'outgoing') ? (sendPlace && placeOf(sendPlace)?.sys === sendTo ? sendPlace : sysOf(sendTo).star) : sendTo;   // design id → how many of it are picked · { kind: 'galaxy', sys } | { kind: 'system', place } · the destination clicked (a system, or a place)
let fleetPopPlace = null;                            // the system map's fleet pop-up: the place whose parked ships it shows (its triangles clicked)
const shipDesignCount = () => S.designs.filter(d => designStats(S, d, LAST ? LAST.caps : allCapsules(S)).t.klass !== 'structure').length;
// THE LOOK: every ship of yours wears your coat (a plating style and two colours, chosen in Design); a hostile fleet wears one of
// its own, drawn from its name
const myLook = () => {                               // the coat: a style and two colours — and (2026-10-15) the wash's strength, the lights' colour and strength
  const L = S.look || {}, lk = lookFromColors(L.style || styleChoices()[0].id, L.colA || '#7fb3ff', L.colB || '#ffb347');
  lk.wash = L.wash ?? 0.6; lk.lights = L.lights ?? 0.5; if (L.light) lk.lightColor = L.light; lk.key += '|' + lk.wash + '|' + lk.lights + '|' + lk.lightColor; return lk;
};
const hashS = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const paintedShips = new Map();
function paintedShip(design, caps) {               // a design as the battle builds it, for its painted picture (the id carries the modules: an edit paints afresh)
  const key = design.id + ':' + hashS(design.hull + JSON.stringify(design.modules.map(m => [m.kind, m.n, m.k, m.dmg, m.rof, m.rng, m.chg, m.cnt, m.sz, m.preset, m.w, m.h, m.caps, m.src])) + JSON.stringify(design.paint || 0));   // src too: a cached ship with stale pile ids showed "nothing of it made it into the ship" (2026-10-16)
  let s = paintedShips.get(key); if (!s) { s = shipFromDesign(S, { ...design, id: key }, caps); try { s.arch = archetype(s); } catch (e) { s.arch = null; } paintedShips.set(key, s); } return s;
}
const thumbShips = new Map(), thumbCache = new Map();
function fillThumbs(root) {                         // every <canvas data-thumb> under root gets its ship's painted picture
  for (const cv of root.querySelectorAll('canvas[data-thumb]')) {
    const ship = thumbShips.get(cv.dataset.thumb); if (!ship) continue;
    const lk = cv.dataset.foe ? fleetLook(cv.dataset.foe) : cv.dataset.emp != null && W ? empireLook(W.empires[+cv.dataset.emp]) : myLook(), key = ship.design.id + '|' + lk.key;
    const draw = (img, c = cv) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const q = Math.min(c.width / img.width, c.height / img.height); g.drawImage(img, (c.width - img.width * q) / 2, (c.height - img.height * q) / 2, img.width * q, img.height * q); };
    const had = thumbCache.get(key); if (had) { draw(had); continue; }
    // painted later: onto this canvas, or — when the panel was redrawn meanwhile (the colony pop-up redraws its line) — onto its successors
    thumbOf(ship, lk, 120).then(img => { if (!img) return; thumbCache.set(key, img); if (cv.isConnected) draw(img); else for (const c of document.querySelectorAll('canvas[data-thumb]')) if (c.dataset.thumb === cv.dataset.thumb && !c.dataset.foe && c.dataset.emp == null && cv.dataset.emp == null && !cv.dataset.foe) draw(img, c); });
  }
}
// stacks: ships at rest grouped by design, the freshest first inside each
function groupsOf(list) {
  const m = new Map();
  for (const s of list) { const k = s.u.design.id; let g = m.get(k); if (!g) { g = { key: k, name: s.u.name, ships: [], t: s.t, klass: s.u.klass }; m.set(k, g); } g.ships.push(s); }
  for (const g of m.values()) { g.ships.sort((a, b) => (b.u.st ?? 100) - (a.u.st ?? 100)); g.range = Math.min(...g.ships.map(s => s.range || 0)); }
  return [...m.values()].sort((a, b) => b.t.cost - a.t.cost);
}
// OUTGOING (his ask, 2026-10-18): a fleet sent to another star THIS eon has not moved yet — it waits at its star's left, one icon
// per fleet, and can still be undone in part or sent elsewhere. Its key: the fleet's id (a ship sent alone: its own id)
const outKeyOf = u => u && u.voy && canUndoSend(S, u) ? u.voy.fleet || u.id : null;
const canLeave = s => s.u.klass === 'starship' && !s.t.underDriven;
const picked = groups => groups.flatMap(g => g.ships.slice(0, Math.min(g.ships.length, picks.get(g.key) || 0)));
const pickCount = () => [...picks.values()].reduce((a, n) => a + n, 0);
function setScope(scope) {
  const same = pickScope && pickScope.kind === scope.kind && pickScope.sys === scope.sys && pickScope.place === scope.place && pickScope.key === scope.key;
  if (!same) { picks = new Map(); sendTo = null; } pickScope = scope;
}
// the stacks of the current scope (what the send buttons act on)
function scopeGroups(c) {
  if (!pickScope) return [];
  if (pickScope.kind === 'galaxy') return groupsOf(c.ships.filter(s => !s.u.dest && placeOf(s.u.at)?.sys === pickScope.sys && canLeave(s)));
  if (pickScope.kind === 'outgoing') return groupsOf(c.ships.filter(s => outKeyOf(s.u) === pickScope.key));   // a fleet that left this eon: its ships
  return groupsOf(c.ships.filter(s => !s.u.dest && s.u.at === pickScope.place));
}
function stackRow(g, { send = true, settleAt = null, foe = null } = {}) {
  const n = picks.get(g.key) || 0, total = g.ships.length, tid = (foe ? 'f' : 'm') + g.key;
  thumbShips.set(tid, foe ? g.ship : paintedShip(g.ships[0].u.design, LAST.caps));
  let line;
  if (foe) line = `${esc(g.ship.arch ? g.ship.arch.label : '')} · worth ${fmt(g.ship.cost)} each · ${fmt(g.ship.dps)} dmg/s`;
  else {
    const sts = g.ships.map(s => s.u.st ?? 100), lo = Math.min(...sts), hi = Math.max(...sts), people = g.ships.reduce((a, s) => a + (s.u.people || 0), 0), strain = Math.max(0, ...g.ships.map(s => s.u.strain || 0));
    const z = zoneOfSys(S, placeOf(g.ships[0].u.at)?.sys), restock = ZONE.recover[z] > 0;
    line = [`worth ${fmt(g.t.cost)} each`, g.t.dps ? `${fmt(g.t.dps)} dmg/s` : '', g.t.research ? `lab ${fmt(g.t.research)}` : '', g.klass === 'starship' && !g.t.underDriven ? `reach ${g.range.toFixed(1)} ly` : g.klass === 'starship' ? '<b class="up">drive too small to leave</b>' : 'thrusters only',
      `stamina ${Math.round(lo) === Math.round(hi) ? Math.round(lo) : `${Math.round(lo)}–${Math.round(hi)}`} %${lo < 100 ? (restock ? ` (restocking +${ZONE.recover[z]} an eon in the ${ZONE.names[z]})` : ' — <b class="up">no restocking out here</b>') : ''}`, strain > 0.05 ? `<b class="${restock ? '' : 'up'}">strain ${strain.toFixed(1)} ly</b>${restock ? '' : ' (it stacks out here)'}` : '', people ? `${peopleWord(people)} people aboard` : ''].filter(Boolean).join(' · ');
  }
  const settler = !foe && settleAt && g.ships.find(s => s.u.people > 0);
  return `<div class="shiprow" ${foe ? '' : `data-shipctx="me|${g.ships.map(s => s.u.id).join(',')}" title="right-click for the full spec"`}><div class="n"><span style="display:flex;align-items:center;gap:8px"><canvas data-thumb="${tid}" ${foe ? `data-foe="${esc(foe)}"` : ''} width="96" height="56" style="width:64px;height:38px;border-radius:6px;background:#04070f;flex:none"></canvas><b>${esc(g.name)}</b><b style="color:var(--time)">×${total}</b></span>
    ${send ? `<span class="stepper" title="how many of them to send"><button data-gpick="${g.key}" data-max="${total}" data-d="-1">−</button><b>${n}</b><button data-gpick="${g.key}" data-max="${total}" data-d="1">+</button><button class="x" data-gall="${g.key}" data-max="${total}">${n === total ? 'none' : 'all'}</button></span>` : foe ? '' : '<span class="tiny">stays in its system</span>'}</div>
    <div class="tiny">${line}</div>${settler ? `<div class="acts"><button class="go" data-settle="${settler.u.id}">Settle ${esc(settleAt.name)} with one</button></div>` : ''}</div>`;
}
// what is picked, and where it would go
function sendBar(c, groups) {
  const ships = picked(groups); if (!ships.length) return '';
  const names = groups.filter(g => picks.get(g.key)).map(g => `${esc(g.name)} ×${Math.min(picks.get(g.key), g.ships.length)}`).join(', ');
  if (pickScope.kind === 'galaxy') {
    const R = fleetRange(S, ships.map(s => s.u)), st = Math.min(...ships.map(s => s.u.st ?? 100)), worth = ships.reduce((a, s) => a + s.t.cost, 0);
    let h = `<div class="okbox" style="margin:6px 0"><b>${ships.length} picked</b>: ${names} · worth ${fmt(worth)} · reach <b>${R.toFixed(1)} ly</b> (by bulk) · the weakest at ${Math.round(st)} % — <b>click a star on the map to send them</b> <button class="x" data-pclear>clear</button>`;
    if (sendTo) {
      const d = lyBetween(S, pickScope.sys, sendTo), eff = d > 0 ? effectiveLy(S, pickScope.sys, sendTo) / d : 1, strain = Math.max(0, ...ships.map(s => s.u.strain || 0)), f = forecast(R, d, c.warp, strain, st, eff), foe = hostileIn(S, sendTo), z = zoneOfSys(S, sendTo);
      h += `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)">To <b>${esc(sysOf(sendTo).name)}</b> <span class="tiny">(${ZONE.names[z]}${z < 5 ? ', restocking +' + ZONE.recover[z] + ' an eon' : ', no restocking'})</span>: ${d.toFixed(1)} ly, ${(d * eff).toFixed(1)} of strain${strain > 0.05 ? ` on top of ${strain.toFixed(1)} carried` : ''} · ${plural(f.eons, 'eon')} · <b>${f.chance >= 1 ? 'sure to make it' : Math.round(f.chance * 100) + ' %'}</b>${f.chance < 1 ? ` · in at ~${Math.round(f.expected)} %${f.lost ? ' — some could be lost' : ` (worst ${Math.round(f.worst)} %)`}` : ''}${foe ? ` · <b class="up">⚔ ${esc(hostileWord(foe))}</b>` : ''}
        <div class="acts" style="margin-top:4px"><button class="go" data-psend>Send them</button><button class="x" data-pcancel>pick another star</button></div></div>`;
    }
    return h + '</div>';
  }
  let h = `<div class="okbox" style="margin:6px 0"><b>${ships.length} picked</b>: ${names} — <b>click a place on the map to send them there</b>${ships.some(canLeave) ? ' · <button class="x" data-ptogalaxy>to another star ▸</button>' : ''} <button class="x" data-pclear>clear</button>`;
  if (sendTo) { const to = placeOf(sendTo), eta = Math.max(...ships.map(s => T.travel[s.u.klass] || 0)); h += `<div style="margin-top:6px">To <b>${esc(to.name)}</b>: ${plural(eta, 'eon')} <div class="acts" style="margin-top:4px"><button class="go" data-psend>Send them</button><button class="x" data-pcancel>pick another place</button></div></div>`; }
  return h + '</div>';
}
// ships under way, by fleet: who, where to, how long, how worn — and call back
function movingLines(list) {
  const m = new Map(); for (const s of list) { const k = (s.u.voy && s.u.voy.fleet) || s.u.id; (m.get(k) || m.set(k, []).get(k)).push(s); }
  return [...m.values()].map(ss => {
    const u = ss[0].u, cnt = {}; for (const s of ss) cnt[s.u.name] = (cnt[s.u.name] || 0) + 1;
    const names = Object.entries(cnt).map(([n, k]) => `${esc(n)} ×${k}`).join(', '), to = placeOf(u.dest), V = u.voy, lo = Math.min(...ss.map(s => s.u.st ?? 100));
    return `<div class="shiprow" data-shipctx="me|${ss.map(s => s.u.id).join(',')}" title="right-click for the full spec"><div class="n"><span>${names} → ${esc(to.name)}${V && to.kind !== 'star' ? ` (${esc(sysOf(to.sys).name)})` : ''} <span class="tiny">· ${plural(u.eta, 'eon')}</span></span>${canUndoSend(S, u) ? `<button class="go" data-unsend="${u.id}" title="sent this eon: nothing has moved yet — they stay where they were">↶ undo</button>` : `<button class="x" data-recall="${u.id}" title="${V ? 'the fleet turns round: the way back counts on the same voyage' : 'they stay where they are'}">call back</button>`}</div>${V ? `<div class="tiny">${V.left.toFixed(1)} ly to go · stamina ${Math.round(lo)} %${V.travelled > V.range ? ` · <b class="up">${(V.travelled - V.range).toFixed(1)} ly past its reach — crawling, wearing</b>` : ''}${V.back ? ' · turned back' : ''}</div>` : ''}</div>`;
  }).join('');
}
// a hostile fleet's ships, built once for its picture and its stacks
const foeCache = new Map();
function foeStacks(H) {
  const key = H.id + ':' + H.plan.ships.length; let built = foeCache.get(key);
  if (!built) { built = buildPlan({ breakthroughs: [] }, { ...H.plan, ships: H.plan.ships.map(p => ({ ...p })) }).ships; foeCache.set(key, built); }
  const m = new Map(); for (const s of built) { const k = s.plan.words; let g = m.get(k); if (!g) { g = { key: H.id + hashS(k), name: s.arch ? s.arch.label.split(' · ')[0] : 'Ship', ship: s, ships: [] }; m.set(k, g); } g.ships.push(s); }
  return [...m.values()];
}

function galaxyFleetPanel(c, s, yours) {            // the chosen star's ships: yours as stacks to send (the fleet panel), those under way, the hostile one's
  if (yours && (!pickScope || pickScope.kind !== 'galaxy' || pickScope.sys !== s.id)) setScope({ kind: 'galaxy', sys: s.id });
  const rest = c.ships.filter(x => !x.u.dest && placeOf(x.u.at)?.sys === s.id), go = groupsOf(rest.filter(canLeave)), stay = groupsOf(rest.filter(x => !canLeave(x)));
  const moving = c.ships.filter(x => x.u.dest && x.u.voy && (x.u.voy.A === s.id || x.u.voy.B === s.id)), H = hostileIn(S, s.id);
  let h = '';
  if (yours && (go.length || stay.length)) h += `<h3>Your ships here</h3>` + go.map(g => stackRow(g)).join('') + stay.map(g => stackRow(g, { send: false })).join('') + sendBar(c, go)
    + (go.length && !pickCount() ? '<div class="tiny">Pick how many of each to send (+ / all), then click the star they should go to.</div>' : '');
  if (moving.length) h += `<h3>Under way</h3>` + movingLines(moving);
  if (H) h += `<h3 style="color:var(--bad)">⚔ ${esc(H.plan.name)}</h3>` + foeStacks(H).map(g => stackRow(g, { send: false, foe: H.plan.name })).join('');
  return h;
}
// DESIGN as the painter (his ask, 2026-10-15): the ship PAINTED in your coat on the big canvas, the chips dropped onto it, its
// plating / fittings / greeble seed under that, and the coat in a folded tab. It grows as chips go in: a fixed scale per square.
const SHEETS = new Map();                           // a style's sheets for the live painting (skins.js keeps its own for the sprites)
function sheetsFor(styleId, onReady) {
  const st = STYLES[styleId] && STYLES[styleId].ribbon ? STYLES[styleId] : STYLES.greeble1, k = st.id, had = SHEETS.get(k); if (had) return had === 'loading' ? null : had;
  SHEETS.set(k, 'loading');
  Promise.all([loadStyle(st), st.deco ? Promise.all(st.deco.sheets.map(s => loadStyle({ sheet: s }).catch(() => null))) : null, st.turrets ? loadStyle({ sheet: st.turrets.sheet }).catch(() => null) : null]).then(([img, deco, tur]) => { SHEETS.set(k, { st, img, deco, tur }); if (onReady) onReady(); }).catch(() => SHEETS.set(k, { st, img: null, deco: null, tur: null }));
  return null;
}
const scaleInfo = (poly, volume) => { const a0 = areaOf(poly) || 1, b = bboxOf(poly); return { s: Math.sqrt(Math.max(volume / HULL_VOLUME, 0.5) / a0), cx: (b.minx + b.maxx) / 2, cy: (b.miny + b.maxy) / 2 }; };
// the STAGE (his layout, 2026-10-15): the chip piles float over the left of the canvas (#cTray, TRAY_W wide), the systems the
// design sizes for itself show among them (autoChips), the ship takes a share of the rest by its width (shipShare).
// The price and the size, big, above the ship.
const TRAY_W = 300;                                 // wide piles (his ask, 2026-10-16): room for the multiplier, a role, the stat line, the buttons — and more to come
function stageGeo() {
  const cv = $('dPaint'), W = cv.clientWidth || 900, H = cv.clientHeight || 440; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
  const x0 = TRAY_W + 16, w = Math.max(160, W - 16 - x0); return { W, H, x0, w, X: x0 + w / 2 };
}
// how much of the stage a hull takes, by its width in squares: a corvette (3 across) a third, a 15-across cruiser two thirds,
// 30 across fills it (his call, 2026-10-15: a 5.8k ship must not fill the screen; a capital one may)
const shipShare = bw => clamp(0.7 * Math.sqrt(bw / 30), 0.2, 0.66);   // a third smaller again (his call: a 24k ship filled the screen — "you're never going to see the ship that big anyway")
const pxFor = (G, bw, bh) => Math.min(shipShare(bw) * G.w / bw, G.H * 0.76 / bh);
const TCELL = { weapon_energy: 0, weapon_kinetic: 1, weapon_missile: 2 };   // a style's turret cells: beam, gun, missile (lab.js draws the same)
// the battle's own hard points, the mount of a weapon KIND one size across the ship (his ask: eight lasers all the same size)
function gameHardpoints() {
  const big = {}; for (const m of DS.mounts) big[m.kind] = Math.max(big[m.kind] || 0, m.size || 1);
  return DS.mounts.filter(m => m.kind !== 'weapon_orbital').map(m => ({ kind: m.kind, x: m.x, y: m.y, size: big[m.kind] }));
}
function drawTurrets(g, hps, sheets) {              // the turrets on their mounts, facing forward — the lab aims the same cells
  for (const h of hps) { const T = sheets.st.turrets.cells[TCELL[h.kind]]; if (!T || !h.r) continue; const [sx, sy, sw, sh, px, py, body] = T, kq = 2 * h.r * RECIPE.turret / body; g.drawImage(sheets.tur, sx, sy, sw, sh, h.x - px * kq, h.y - py * kq, sw * kq, sh * kq); }
}
// the fittings (−40 … f0) at which every mount sits whole on the hull and clear of its neighbours. A mount's size goes as
// (1 + f/100)² — the engines and the mounts both scale with the fittings (paint.js recipeWith) — so each constraint caps that
// square; the tightest wins. Never up: the dial stays his; it only comes down when the piles change and the guns no longer fit.
function fittingsToFit(R, px, f0) {
  const hps = R.hardpoints, k0 = 1 + f0 / 100, sq = R.mountSq * px; if (!hps.length || !sq) return f0;
  const r0 = h => sq * Math.sqrt(h.size || 1) / 2; let kk = Infinity;                      // r0: the mount's radius at f0 before the hull's width capped it
  for (const h of hps) if (h.r < r0(h) * 0.98) kk = Math.min(kk, h.r / r0(h));
  for (let i = 0; i < hps.length; i++) for (let j = i + 1; j < hps.length; j++) { const a = hps[i], b = hps[j], dd = Math.hypot(a.x - b.x, a.y - b.y), need = (r0(a) + r0(b)) * 0.95; if (dd < need) kk = Math.min(kk, dd / need); }
  if (kk === Infinity) return f0;
  return Math.max(-40, Math.floor(100 * (k0 * Math.sqrt(kk) - 1) / 5) * 5);
}
function paintMain(d) {
  const cv = $('dPaint'); if (!cv || !DS || d.klass === 'structure') return;
  const G = stageGeo(), g = cv.getContext('2d'), lk = myLook(), sheets = sheetsFor(lk.style.id, () => { if (tab === 'design' && design() === d) paintMain(d); }), hull = DS.hull, editing = outEd.editing, shift = G.X - G.W / 2;
  let poly, px, center, hp;
  if (editing) { const L = outLock || (outLock = outlineLock()), f = outEd.fullPoly(); poly = f.length >= 3 ? f.map(([x, y]) => [(x - L.cx) * L.s, (y - L.cy) * L.s]) : hull.poly; px = L.S; center = [-shift / px, 0]; hp = {}; }   // no guns while the outline is reshaped (his call: placing them on every change made it crawl); they come back at Done
  else { const b = hull.box; poly = hull.poly; px = pxFor(G, hull.bw, hull.bh); center = [(b.minx + b.maxx) / 2 - shift / px, (b.miny + b.maxy) / 2]; hp = { hardpoints: gameHardpoints() }; }
  let R = null;
  if (sheets && sheets.img && poly.length >= 3) R = paintHull(cv, poly, sheets.img, sheets.st, { ...recipeWith(DS.t.volume, d.paint || {}), px, center, ...hp, wash: lk.wash, washA: lk.washA, washB: lk.washB, lights: lk.lights, lightColor: lk.lightColor, background: '#04070f' }, sheets.deco);
  else {                                             // the plain plate until the sheets are in
    g.fillStyle = '#04070f'; g.fillRect(0, 0, G.W, G.H);
    if (poly.length >= 3) { const ox = G.W / 2 - center[0] * px, oy = G.H / 2 - center[1] * px; g.beginPath(); poly.forEach(([x, y], i) => i ? g.lineTo(ox + x * px, oy + y * px) : g.moveTo(ox + x * px, oy + y * px)); g.closePath(); g.fillStyle = lk.washA; g.globalAlpha = 0.35; g.fill('evenodd'); g.globalAlpha = 1; }
  }
  if (R && sheets.tur && sheets.st.turrets) drawTurrets(g, R.hardpoints, sheets);
  if (!editing && DS.shields.length) {                // the shields' field: one purple bubble round the ship, as big as the cover (hull.js fieldBubble, as the plan view had it)
    const bub = fieldBubble(hull, DS.t.cover), ox = G.W / 2 - center[0] * px, oy = G.H / 2 - center[1] * px;
    g.save(); g.beginPath(); g.ellipse(ox + bub.cx * px, oy + bub.cy * px, Math.max(0.1, bub.rx * px), Math.max(0.1, bub.ry * px), 0, 0, 7); g.fillStyle = 'rgba(207,137,255,.07)'; g.fill(); g.strokeStyle = 'rgba(207,137,255,.85)'; g.lineWidth = 1.5; g.setLineDash([6, 5]); g.stroke(); g.restore();
  }
  cv._paint = { turrets: !!(R && sheets.tur && sheets.st.turrets), hardpoints: R ? R.hardpoints.length : 0, px, bubble: !editing && DS.shields.length > 0, cover: DS.t.cover };   // what the last paint did (a probe for tests)
  const t = DS.t;                                    // the two numbers that matter most, big: the price and the size
  g.textAlign = 'center'; g.font = 'bold 30px sans-serif'; g.fillStyle = '#ffd26a'; g.fillText(`${ICON.cost} ${fmt(t.cost)}`, G.X, 42);
  g.font = '15px sans-serif'; g.fillStyle = '#e8f0ff'; g.fillText(`${ICON.volume} ${plural(t.squares, 'square')} · ${fmt(t.volume)} volume`, G.X, 66);
  g.font = '13px sans-serif'; g.fillStyle = '#9eb3d8'; g.fillText([`${ICON.hp} ${fmt(t.hp)} HP`, t.armor ? `▣ ${fmt(t.armor)} armour` : '', t.shieldRaw ? `${ICON.shield} ${fmt(t.shield)} shield` : '', t.dps ? `${ICON.damage} ${fmt(t.dps)} dmg/s` : ''].filter(Boolean).join(' · '), G.X, 88);   // the main numbers, under the price and the size (his ask)
  g.textAlign = 'right'; g.font = '11px sans-serif'; g.fillStyle = '#6b7a99'; g.fillText(editing ? 'drag a point · double-tap the line to add one, a point to remove it · Done or Save as… below' : 'double-click the ship to reshape its outline', G.W - 12, G.H - 10); g.textAlign = 'left';
  // while the outline is reshaped the painting is KEPT (outSnap): a drag or a hover only redraws the overlay over it (the full paint
  // on every pointer move was the lag); the paint itself follows on dragend
  if (editing) { if (!outSnap || outSnap.width !== G.W || outSnap.height !== G.H) outSnap = new OffscreenCanvas(G.W, G.H); outSnap.getContext('2d').drawImage(cv, 0, 0); outEd.draw(g); cv._handles = outEd.state().pts.map(outFrame().toPx); } else { outSnap = null; cv._handles = null; }
  // the guns must fit: after the piles changed, the fittings come down until every mount sits whole on the hull and clear of the next
  if (R && !editing && fitGunsFor === d.id) { fitGunsFor = null; const f0 = d.paint?.fittings || 0, f = fittingsToFit(R, px, f0); if (f < f0) { d.paint = { plating: 0, seed: 0, ...(d.paint || {}), fittings: f }; save(); syncPaintCtl(d); paintMain(d); } }
}
// the paint dials (the design's) and the coat tab (yours), from the design and the coat
function syncPaintCtl(d) {
  const p = d.paint || (d.paint = { plating: 0, fittings: 0, seed: 0 }), L = S.look || {}, sg = v => (v > 0 ? '+' : '') + v + ' %';
  $('pPlat').value = p.plating; $('pPlatV').textContent = sg(p.plating); $('pFit').value = p.fittings; $('pFitV').textContent = sg(p.fittings); $('pSeed').value = p.seed; $('pSeedV').textContent = p.seed;
  if (!$('cStyle').children.length) $('cStyle').innerHTML = styleChoices().map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('cStyle').value = L.style || styleChoices()[0].id; $('cColA').value = L.colA || '#7fb3ff'; $('cColB').value = L.colB || '#ffb347'; $('cWash').value = Math.round((L.wash ?? 0.6) * 100); $('cLight').value = L.light || myLook().lightColor; $('cLights').value = Math.round((L.lights ?? 0.5) * 100);
}
// which designer shows: a ship's (chips on the painted ship) or a structure's (modules one by one, under the plan)
function showMode(chip) {
  const sh = (id, on, disp = '') => { $(id).style.display = on ? disp : 'none'; };
  $('dMain').classList.toggle('chipmode', chip);     // (not "chip": that is the capsule's class — it rounded the whole column into an egg, 2026-10-15)
  sh('dChipBox', chip); sh('dOldSys', !chip); sh('dHull', !chip, 'block'); sh('dStage', chip, 'block'); sh('dPaintCtl', chip, 'flex'); sh('pCoat', chip); sh('dOldNote', !chip); sh('dStats', chip); sh('dOldWeap', !chip);
  if (!chip) leaveOutline();
}
// the reach of your best starship resting at a star (for the galaxy map's rings); 0 when none rests there
const ringR = sysId => { const c = LAST; if (!c) return 0; return Math.max(0, ...c.ships.filter(s => !s.u.dest && placeOf(s.u.at)?.sys === sysId).map(s => s.range || 0)); };

function load() {
  try {
    const raw = localStorage.getItem(KEY), s = JSON.parse(raw || 'null');
    if (s && (s.version === 8 || s.version === 9)) {
      // a save from before the colony SURFACE (2026-10-18): keep it as it was, once, before upgrade() turns its districts into slots
      if (s.places && s.places.some(p => p.colony && !p.colony.surface) && !localStorage.getItem(KEY + '.pre-slots')) try { localStorage.setItem(KEY + '.pre-slots', raw); } catch (e) { /* no room: go on */ }
      return upgrade(s);
    }
  } catch (e) { /* new game */ }
  return newState();
}
function save() { if (SIM) return; try { localStorage.setItem(KEY, JSON.stringify(S)); if (W && !REPLAY) localStorage.setItem(KEY + '.world', JSON.stringify({ seedText: W.seedText, n: W.n, galaxy: W.galaxy, me: W.me, focus: W.focus || null, snap: worldSnapshot(W) })); else localStorage.removeItem(KEY + '.world'); } catch (e) { /* ignore */ } }   // the world too, while you play in one (a replay or a running simulation is not kept)
function loadHulls() { try { return JSON.parse(localStorage.getItem(HULL_KEY) || '[]') || []; } catch (e) { return []; } }
function saveHulls() { try { localStorage.setItem(HULL_KEY, JSON.stringify(HULLS)); } catch (e) { /* ignore */ } setUserHulls(HULLS); }

const xColor = x => X_INFO[x].color;
const pct = v => Math.round(v * 100) + '%';
const row = (a, b, cls = '') => `<div class="row"><span>${a}</span><b class="${cls}">${b}</b></div>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const design = () => S.designs.find(d => d.id === curDesign) || null;
const num = (v, dec) => dec ? v.toFixed(dec) : fmt(v);
const placeOf = id => S.places.find(p => p.id === id);
const sysOf = id => S.systems.find(s => s.id === id);
const placesIn = sysId => S.places.filter(p => p.sys === sysId);
// a capsule chip: the fill behind the text is how far it has been integrated
const capChip = (cp, extra = '', attrs = '') => `<span class="chip ${extra}" ${attrs} style="color:${xColor(cp.x)};border-color:${xColor(cp.x)};background:linear-gradient(90deg,rgba(255,255,255,.17) ${cp.a * 100}%,transparent ${cp.a * 100}%)"`;
const topFields = pl => FIELD_IDS.map(f => [f, pl.mult[f] * pl.fresh[f], pl.mult[f]]).sort((a, b) => b[1] - a[1]);
const KIND_WORD = { star: 'star', planet: 'planet', moon: 'moon', giant: 'gas giant', anomaly: 'anomaly' };
const badgeOf = t => t.dock ? '<span class="badge dock">Space dock</span>' : `<span class="badge ${t.klass}">${CLASS_NAME[t.klass]}</span>`;
const extraCost = fit => `+${Math.round((fit.mult - 1) * 100)}% cost, +${plural((fit.sections - 1) * T.sectionEons, 'eon')} to join the sections`;
const LOOK = { star: ['#ffd06a', 22], planet: ['#4fa3ff', 12], moon: ['#b8c4d8', 6], giant: ['#c9a86b', 19], anomaly: ['#cf89ff', 9] };
const lookOf = pl => ({ color: pl.color || LOOK[pl.kind][0], size: LOOK[pl.kind][1] * (pl.size || 1) });
// where you are: systems that hold a colony or a parked ship of yours
function presence(c) {
  const m = new Map(), at = sys => m.get(sys) || m.set(sys, { colonies: 0, ships: 0 }).get(sys);
  for (const col of c.colonies) at(col.pl.sys).colonies++;
  for (const { u } of c.ships) if (!u.dest) { const p = at(placeOf(u.at).sys); if (u.klass === 'platform') p.platforms = (p.platforms || 0) + 1; else p.ships++; }   // platforms apart: they never leave (his ask, 2026-10-20: a rectangle under the star)
  return m;
}

// =====================================================================
// EMPIRE
// =====================================================================
const reach = () => clamp(S.cohesion / 100, 0, 1);  // cohesion 0–100: the share of the centre-to-corner distance the focus may move this eon
const tetra = createTetra($('eTetra'), {
  labels: XS.map(x => X_INFO[x].name), colors: XS.map(xColor),
  getState: () => ({ w: S.focus, w0: S.focusStart, reach: reach() }),
  onChange: w => { S.focus = w; const c = compute(S); renderEmpire(c, true); renderTop(c); },
  onRelease: () => { save(); refresh(); },            // (a double-click on the ball: back to the centre, as far as cohesion lets it this eon)
});

function renderTop(c) {
  const cell = (label, val, sub = '', neg = false) => `<div class="r"><span>${label}</span><b>${val}</b>${sub ? ` <small class="${neg ? 'neg' : ''}">${sub}</small>` : ''}</div>`;
  const dPeople = c.colonies.reduce((a, p) => a + p.dPeople, 0), dCoh = c.cohesionGain - c.moveCost;
  $('eStats').innerHTML = cell('Eon', S.eon) + cell('People', peopleWord(c.people), (dPeople < 0 ? '−' : '+') + peopleWord(Math.abs(dPeople)), dPeople < 0)
    + cell('Research', fmt(c.research)) + cell('Reserves', fmt(S.reserves || 0), (c.net < 0 ? '−' : '+') + fmt(Math.abs(c.net)), c.net < 0) + cell('Cohesion', Math.round(S.cohesion) + ' %', signed(dCoh), dCoh < 0)
    + cell('Focus steady', plural(S.steady || 0, 'eon')) + cell('Between stars', (VOY.speed * c.warp).toFixed(1) + ' ly/eon');
}

const starRow = v => { const n = Math.round(v); return `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(10 - n)}</i></span>`; };

function renderEmpire(c, skipTetra) {
  const left = S.cohesion - c.moveCost;
  $('eFocus').innerHTML = `<div class="fx">${XS.map((x, i) => `<div style="border-color:${xColor(x)}"><span style="color:${xColor(x)}">${X_INFO[x].name}</span><b>${pct(S.focus[i])}</b><button class="x" data-fplus="${i}" title="a step toward ${X_INFO[x].name}, at the cost of the other three">+</button></div>`).join('')}</div>
    <div class="tiny" style="margin-top:6px">${c.moved ? `Moving the focus this far costs <b>${c.moveCost.toFixed(1)}</b> cohesion (you have ${Math.round(S.cohesion)} %, ${Math.round(left)} % left)${c.shock > 0.5 ? ' — <b class="up">a shock to the people: happiness drops</b>' : ''}${c.setback ? `, and loses ${plural(c.setback, 'step')} of research in every field` : ''}.` : `The focus has not moved this eon${S.steady ? ` (steady for ${plural(S.steady, 'eon')})` : ''}.`}
    The dashed circle is as far as your cohesion reaches (${Math.round(S.cohesion)} % of the way from the centre to a corner; it climbs ${c.cohesionGain.toFixed(1)} this eon, slower the higher it is). <button class="x" data-freset title="back toward the centre, as far as the reach allows">⌖ centre</button></div>`;
  const builds = c.colonies.flatMap(p => p.done.map(d => `${d.d.name} at ${p.pl.name}`));
  const on = c.fields.filter(f => f.points > 0).sort((a, b) => b.points - a.points).map(f => `${f.name} ${f.points}`).join(' · ');
  $('ePredict').innerHTML = `<div class="card">
    ${row('Attention on', on || '<span class="up">nothing — no field can advance</span>')}
    ${row('Built this eon', builds.length ? builds.join(', ') : 'nothing finishes')}
    ${row('Integration', `${c.speed.toFixed(1)}% per eon${c.moved ? ' — the focus moved' : ''}`)}
    ${row('Cohesion', `+${c.cohesionGain.toFixed(1)} earned${c.moveCost > 0.05 ? `, −${c.moveCost.toFixed(1)} spent on the focus` : ''}`)}
    ${row('Reserves', `${fmt(S.reserves || 0)} · excess +${fmt(c.income)} − upkeep ${fmt(c.upkeep.total)} <span class="tiny">(military ${fmt(c.upkeep.military)} · social ${fmt(c.upkeep.social)} · research ${fmt(c.upkeep.research)}${c.upkeep.water > 0.005 ? ` · water ${fmt(c.upkeep.water)}` : ''})</span> = <b class="${c.net < 0 ? 'up' : 'down'}">${c.net < 0 ? '−' : '+'}${fmt(Math.abs(c.net))}</b>${c.shortNext > 0.005 ? ` · <b class="up">${Math.round(c.shortNext * 100)} % will go unpaid</b>` : ''}${c.unpaid > 0.005 ? ` · <b class="up">last eon ${Math.round(c.unpaid * 100)} % unpaid: the fleet wears, people grumble, research slows</b>` : ''}`, c.net < 0 ? 'up' : '')}</div>`;

  $('eFields').innerHTML = `<div class="tiny" style="margin-bottom:8px">You have <b>${T.attention}</b> points of attention; <b>${c.free}</b> ${c.free === 1 ? 'is' : 'are'} unspent. Giving a field one more takes it from the spare ones, then from the field that has the most.
      The stars are how much there is to find — they come from the places you are studying, not from how hard you look.</div>`
    + c.fields.map(f => {
      const top = XS[f.lean.indexOf(Math.max(...f.lean))];
      const src = f.sources.filter(s => s.c > 0.06).slice(0, 3).map(s => `${esc(s.place.name)} ${pct(s.c)}`).join(' · ');
      return `<div class="frow"><div class="top"><span class="name">${f.name}</span><span class="stepper"><button data-att="${f.id}" data-d="-1">−</button><b>${f.points}</b><button data-att="${f.id}" data-d="1">+</button></span></div>
        <div title="with your attention on it: ${pct(f.chance)} to take a step forward this eon">${starRow(f.stars)} <span class="tiny">${f.stars.toFixed(1)} of 10</span></div>
        <div class="tiny">${src ? 'from ' + src : 'nothing worth the name where you are looking'} · found ${S.found[f.id]}</div>
        <div class="xbar" title="which way a find would lean under the current focus">${f.lean.map((l, i) => `<i style="width:${l * 100}%;background:${xColor(XS[i])}"></i>`).join('')}</div>
        <div class="tiny">a find would lean <b style="color:${xColor(top)}">${X_INFO[top].name}</b></div></div>`;
    }).join('');

  const capOf = new Map(c.caps.map(cp => [cp.id, cp]));
  const live = S.breakthroughs.filter(b => !isIntegrated(b)), known = S.breakthroughs.filter(isIntegrated);
  $('eBreaks').innerHTML = live.map(b => `<div class="bt ${newIds.has(b.id) ? 'new' : ''}">
      <div class="n"><span>${esc(b.name)}</span><span class="tiny">${b.fieldName} · ${esc(b.origin)} · ${b.eon ? 'eon ' + b.eon : 'known from the start'}${b.under ? ` · under <b style="color:${xColor(b.under)}">${X_INFO[b.under].name}</b>` : ''}</span></div>
      ${b.props.map((p, pi) => `<div class="prop"><b>${esc(p.name)}</b> <span class="tiny">${p.rarity} — ${esc(p.what)}</span><br>
        ${p.channels.map(ch => { const cp = capOf.get(`${b.id}|${pi}|${ch.channel}`); return capChip(cp) + ` title="${esc(ch.how)} · ${cp.done ? 'fully integrated' : `${pct(cp.a)} integrated, about ${plural(Math.ceil(cp.left / c.speed), 'eon')} to go at this pace`}${ch.helped ? ' · helped by ' + plural(ch.helped, 'later find') : ''}">${cp.name} +${ch.pct}%${cp.done ? ' ✓' : ''}</span>`; }).join('')}
        ${p.muted ? `<span class="tiny">· ${p.muted} more too weak to show under that focus</span>` : ''}</div>`).join('')}</div>`).join('')
    + (known.length ? `<h2 style="margin-top:12px">Fully integrated — in every design for free</h2><div class="known">${known.map(b => esc(b.name)).join(' · ')}</div>` : '')
    + `<div class="tiny" style="margin-top:8px">The pale fill in a capsule is how far it has been integrated. Everyone already gets that share of it.</div>`;
  const icon = { breakthrough: '★', bad: '▼', integ: '◆', step: '›', move: '→', battle: '⚔' }, col = { breakthrough: 'var(--time)', bad: 'var(--bad)', integ: 'var(--good)', battle: 'var(--good)' };
  if (S.report?.length) $('eReport').innerHTML = `<div class="rep">${S.report.map(r => `<div>${icon[r.kind] || '·'} <span style="color:${col[r.kind] || 'inherit'}">${esc(r.text)}</span>${r.battle && (S.battles || []).some(b => b.id === r.battle) ? ` <button class="go" data-watch="${r.battle}" title="replay it, as it was fought">▶ Watch</button>` : ''}</div>`).join('')}</div>`;
  else $('eReport').textContent = S.eon > 1 ? 'A quiet eon.' : 'Nothing yet.';
  if (!skipTetra) tetra.draw();
}

// =====================================================================
// GALAXY — the map of star systems
// =====================================================================
function fitCanvas(cv) { const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return { w, h, cx: w / 2, cy: h / 2 }; }
function drawGalaxy(c) {
  const cv = $('gMap'); if (!cv || !cv.clientWidth) return;
  const G = fitCanvas(cv), g = cv.getContext('2d'), mine = presence(c);
  const RAD = (S.galaxy && S.galaxy.radius) || GALAXY.radius;   // a bigger sector (galaxy.js galaxyOf) draws to the same frame
  G.cx += gView.x; G.cy += gView.y; G.k = Math.max(20, Math.min(G.w, G.h) / 2 - 34) / RAD * gView.z; G.pos = {}; G.fleet = {}; G.battle = {};
  for (const s of S.systems) G.pos[s.id] = { x: G.cx + s.x * G.k, y: G.cy + s.y * G.k };
  cv._geo = G;
  g.clearRect(0, 0, G.w, G.h);
  // the disc
  const R = G.k * RAD * 1.07, gr = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, R);
  gr.addColorStop(0, 'rgba(150,170,255,.11)'); gr.addColorStop(0.7, 'rgba(120,140,255,.04)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(G.cx, G.cy, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(170,210,255,.12)'; g.setLineDash([2, 6]); g.beginPath(); g.arc(G.cx, G.cy, R * 0.98, 0, 7); g.stroke(); g.setLineDash([]);
  // the REACH of your best starship resting at the chosen star (STAR TRAVEL): its range, then a ring a light year apart —
  // green 90 %, yellow 70 %, orange 40 %, red 10 %
  // THE SPHERE OF INFLUENCE (model.js ZONE): every colony's bubble — blue inside, then green / yellow / orange / red a light year
  // each — merged into one region; inside it ships restock and their strain heals, outside neither
  const GE = godEmpires(); G.gfleet = {}; G.gship = {}; G.myship = {};
  if (GE) {                                          // GOD MODE: every empire's sphere in its own colour (the core solid, the bands faint, the outermost dashed)
    for (const E of GE) {
      if (E.dead) continue; const col = E.look.colA, bubs = bubbles(E);
      for (let z = 4; z >= 0; z--) {
        g.beginPath(); for (const b of bubs) { const p = G.pos[b.sys]; if (!p) continue; const r = (b.r + z * ZONE.band) * LY * G.k; g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, 7); }
        g.fillStyle = col; g.globalAlpha = z === 0 ? 0.13 : 0.03; g.fill();
        if (z === 0 || z === 4) { g.globalAlpha = z ? 0.22 : 0.5; g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(z ? [3, 5] : []); g.stroke(); g.setLineDash([]); }
      }
    }
    g.globalAlpha = 1;
  } else {
    const bubs = bubbles(S);
    for (let z = 4; z >= 0; z--) {
      g.beginPath(); for (const b of bubs) { const p = G.pos[b.sys]; if (!p) continue; const r = (b.r + z * ZONE.band) * LY * G.k; g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, 7); }
      g.fillStyle = ZONE.colors[z]; g.globalAlpha = z === 0 ? 0.14 : 0.06; g.fill(); g.globalAlpha = 0.3; g.strokeStyle = ZONE.colors[z]; g.lineWidth = 1; g.setLineDash(z ? [3, 5] : []); g.stroke(); g.setLineDash([]);
    }
    g.globalAlpha = 1;
  }
  // the reach of the fleet at the chosen star (its own range) when its panel is open: a white dashed ring
  const reachR = ringR(gSel);
  if (gMode === 'fleet' && reachR > 0 && G.pos[gSel]) { const p = G.pos[gSel]; g.strokeStyle = '#fff'; g.globalAlpha = 0.45; g.setLineDash([2, 4]); g.beginPath(); g.arc(p.x, p.y, reachR * LY * G.k, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
  // picked ships, and the star they would go to
  if (sendTo && (pickScope?.kind === 'galaxy' || pickScope?.kind === 'outgoing') && G.pos[pickScope.sys] && G.pos[sendTo]) { const a = G.pos[pickScope.sys], b = G.pos[sendTo]; g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
  // derelicts, where they broke down (in God mode everyone's)
  for (const E of GE || [S]) for (const w of E.derelicts || []) { const a = G.pos[w.A], b = G.pos[w.B]; if (!a || !b) continue; const x = a.x + (b.x - a.x) * w.pos, y = a.y + (b.y - a.y) * w.pos; g.strokeStyle = '#8a93a8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); g.lineWidth = 1; }
  // ships crossing between stars (in God mode every empire's, in its colour; each dot is clickable)
  // ships under way travel as FLEETS: one dot per fleet (the ships that left together, or alone), its count beside it — in God mode
  // a click opens the whole fleet (his ask, 2026-10-17: "I'm clicking at a fleet in transit and I see one ship")
  const flights = GE ? GE.flatMap((E, k) => E.dead || !GODC || !GODC[k] ? [] : GODC[k].ships.map(s => ({ u: s.u, k, E, col: E.look.colA }))) : c.ships.map(s => ({ u: s.u, k: null, E: S, col: '#7ef3b0' }));
  const convoys = new Map();
  // (this eon's departures wait at their star — the OUTGOING icons below — not on the line)
  for (const f of flights) { const u = f.u; if (!u.dest) continue; if (!GE && outKeyOf(u)) continue; const V = u.voy, key = `${f.k}|${V && V.fleet ? V.fleet : V ? `${V.A}>${V.B}@${(V.pos ?? 0).toFixed(2)}` : `${u.at}>${u.dest}@${u.eta}`}`; (convoys.get(key) || convoys.set(key, { ...f, ids: [] }).get(key)).ids.push(u.id); }
  // WATER ROUTES between stars (his ask, 2026-10-18): a blue dotted line from the star that sends water to the dry colony's star
  if (!GE) for (const pc of c.colonies) for (const r of pc.waterRoutes || []) { if (r.sys === pc.pl.sys) continue; const a = G.pos[r.sys], b = G.pos[pc.pl.sys]; if (!a || !b) continue; g.setLineDash([2, 4]); g.strokeStyle = '#4fa3ff'; g.globalAlpha = r.chance < 0.9 ? 0.5 : 0.8; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 1; }
  for (const [key, { u, k: ek, E, col, ids }] of convoys) {
    const pOf = id => (E.places.find(p => p.id === id) || {}).sys;
    const V = u.voy, a = V ? G.pos[V.A] : G.pos[pOf(u.at)], b = V ? G.pos[V.B] : G.pos[pOf(u.dest)]; if (!a || !b || a === b) continue;
    const k = V ? clamp(V.pos ?? 0, 0.02, 1) : clamp(1 - u.eta / (u.trip || u.eta || 1), 0.06, 1), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    const on = GE && godPick && ((godPick.kind === 'ship' && godPick.k === ek && ids.includes(godPick.id)) || (godPick.kind === 'transit' && godPick.key === key));
    g.setLineDash([4, 5]); g.strokeStyle = col; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const rad = ids.length > 1 ? 4.5 : 3.5;
    g.fillStyle = on ? '#fff' : col; g.beginPath(); g.arc(x, y, on ? rad + 1.5 : rad, 0, 7); g.fill();
    if (on) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, rad + 6, 0, 7); g.stroke(); g.lineWidth = 1; }
    if (ids.length > 1) { g.fillStyle = on ? '#fff' : col; g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.fillText(String(ids.length), x + rad + 3, y + 4); g.textAlign = 'center'; }
    if (GE) G.gship[key] = { x, y, k: ek, id: u.id, ids, key }; else G.myship[key] = { x, y, ids };   // yours: a click opens its card — undo the send this eon, or call it back
  }
  g.textAlign = 'center';
  for (const s of S.systems) {
    const p = G.pos[s.id], st = STARS[s.type], size = 2.6 + 3.2 * st.size, here = mine.get(s.id);
    if (gField) {                                      // how much of the chosen field there is to find in this system
      const best = Math.max(...placesIn(s.id).map(pl => pl.mult[gField] * pl.fresh[gField]));
      if (best > 0.06) { g.fillStyle = `rgba(207,137,255,${0.08 + best * 0.5})`; g.beginPath(); g.arc(p.x, p.y, 5 + best * best * 40, 0, 7); g.fill(); }
    }
    g.shadowColor = st.color; g.shadowBlur = 10; g.fillStyle = st.color; g.beginPath(); g.arc(p.x, p.y, size, 0, 7); g.fill(); g.shadowBlur = 0;
    const foe = hostileIn(S, s.id);                    // a HOSTILE FLEET holds this system: a red ring and its worth
    if (foe) { g.strokeStyle = '#ff5c5c'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); g.arc(p.x, p.y, size + 6, 0, 7); g.stroke(); g.setLineDash([]); g.lineWidth = 1; g.fillStyle = '#ff7979'; g.font = 'bold 9px sans-serif'; g.fillText('⚔ ' + hostileWorth(foe), p.x, p.y - size - 8); }
    let label = s.name, labelCol = s.home || here ? '#e8f0ff' : '#8598bb', bold = !!(s.home || here);
    if (GE) {                                          // GOD MODE: every empire's colonies as rings (one ring per empire, outward), every fleet as a triangle in a slot of its own
      const SLOT = [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1.6]]; let ring = 0;   // a slot per empire round the star (the fifth above it)
      GE.forEach((E, k) => {
        if (E.dead) return; const col = E.look.colA, cols = E.places.filter(pl => pl.colony && pl.sys === s.id), ships = GODC && GODC[k] ? GODC[k].ships.filter(x => !x.u.dest && (E.places.find(pl => pl.id === x.u.at) || {}).sys === s.id) : [];
        if (cols.length) { const hm = cols.some(pl => pl.id === E.homePlace); g.strokeStyle = col; g.lineWidth = hm ? 2.5 : 1.5; g.setLineDash(hm ? [] : [4, 3]); g.beginPath(); g.arc(p.x, p.y, size + 4 + 3 * ring++, 0, 7); g.stroke(); g.setLineDash([]); g.lineWidth = 1; if (hm) { label = s.name + ' · ' + E.name; labelCol = col; bold = true; } }
        if (ships.length) {
          const [sx, sy] = SLOT[k % SLOT.length], x = p.x + sx * (size + 15), y = p.y + sy * (size + 7), key = s.id + '|' + k, on = godPick && godPick.kind === 'fleet' && godPick.k === k && godPick.sys === s.id; G.gfleet[key] = { x, y, k, sys: s.id };
          g.fillStyle = on ? '#fff' : col; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath(); g.fill();
          if (on || gHover === key) { g.strokeStyle = on ? col : 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y + 1, 13, 0, 7); g.stroke(); g.lineWidth = 1; }
          g.font = 'bold 11px sans-serif'; g.textAlign = sx > 0 ? 'left' : 'right'; g.fillStyle = on ? '#fff' : col; g.fillText(String(ships.length), x + sx * 12, y + 5); g.textAlign = 'center';
        }
      });
      for (const [key, n] of Object.entries(W.sieges || {})) {   // a blockade under way here: who, how long
        const [sys, victim, attacker] = key.split('|'); if (sys !== s.id) continue; const A = GE[+attacker];
        g.fillStyle = A ? A.look.colA : '#ff7979'; g.font = 'bold 9px sans-serif'; g.fillText(`blockade ${n} of ${WORLD.siege}`, p.x, p.y + size + 24);
      }
    } else {
      if (here?.colonies) { g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, size + 4, 0, 7); g.stroke(); g.lineWidth = 1; }
      if (here?.ships) {                               // YOUR FLEET here: a big triangle by the star — click it for the fleet, the star for the system (his ask, 2026-10-15)
        const x = p.x + size + 15, y = p.y - size - 7, on = gMode === 'fleet' && s.id === gSel; G.fleet[s.id] = { x, y };
        g.fillStyle = on ? '#fff' : '#7ef3b0'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath(); g.fill();
        if (on || (s.id === gHover && gHoverFleet)) { g.strokeStyle = on ? '#7ef3b0' : 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y + 1, 13, 0, 7); g.stroke(); g.lineWidth = 1; }
        g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillStyle = on ? '#fff' : '#7ef3b0'; g.fillText(String(here.ships), x + 12, y + 5); g.textAlign = 'center';
      }
      if (here?.platforms) {                           // YOUR PLATFORMS here: orange rectangles in a row under the star (his ask, 2026-10-20)
        const n = Math.min(here.platforms, 6), w = 9, gap = 4, x0 = p.x - ((n - 1) * (w + gap)) / 2, y = p.y + size + 24;
        g.fillStyle = '#ffb347'; for (let i = 0; i < n; i++) g.fillRect(x0 + i * (w + gap) - w / 2, y - 3, w, 6);
        if (here.platforms > n) { g.font = 'bold 9px sans-serif'; g.textAlign = 'left'; g.fillText('+' + (here.platforms - n), x0 + n * (w + gap) - w / 2, y + 3); g.textAlign = 'center'; }
      }
      for (const o of S.others || []) {                // the OTHER EMPIRES (a world, world.js): their colonies a ring in their colour (solid for a homeworld), their resting fleets a triangle on the left with the count
        const col = o.colonies.filter(x => x.sys === s.id), fl = o.fleets.find(f => f.sys === s.id);
        if (col.length) { const hm = col.some(x => x.home); g.strokeStyle = o.color; g.lineWidth = hm ? 2.5 : 1.5; g.setLineDash(hm ? [] : [4, 3]); g.beginPath(); g.arc(p.x, p.y, size + 6, 0, 7); g.stroke(); g.setLineDash([]); g.lineWidth = 1; if (hm) { label = s.name + ' · ' + o.name; labelCol = o.color; bold = true; } }
        if (fl) { const x = p.x - size - 15, y = p.y - size - 7; g.fillStyle = o.color; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath(); g.fill(); g.font = 'bold 11px sans-serif'; g.textAlign = 'right'; g.fillText(String(fl.n), x - 11, y + 5); g.textAlign = 'center'; }
      }
    }
    const bt = GE ? GE.flatMap((E, k) => E.dead ? [] : (E.battles || []).filter(b => b.sys === s.id).map(b => ({ b, k }))).map(x => ({ id: x.b.id, k: x.k }))[0] : (S.battles || []).filter(b => b.sys === s.id).map(b => ({ id: b.id, k: null }))[0];   // a battle fought here this eon: a ▶ badge — click it to watch it (his ask, 2026-10-16); a fallen empire's record is not this eon's
    if (bt) { const x = p.x - size - 14, y = p.y + size + 6; G.battle[s.id] = { x, y, id: bt.id, k: bt.k }; g.fillStyle = '#ff5c5c'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('▶', x + 0.5, y + 3.5); }
    const onStar = s.id === gSel && gMode !== 'fleet' && !(GE && godPick);   // the white ring: on the star in system mode, on the fleet icon in fleet mode
    if (onStar || (s.id === gHover && !gHoverFleet)) { g.strokeStyle = onStar ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, size + 8, 0, 7); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = labelCol; g.font = (bold ? 'bold ' : '') + '10px sans-serif';
    g.fillText(s.home && !GE ? s.name + ' · home' : label, p.x, p.y + size + 13);
  }
  // OUTGOING FLEETS (his asks, 2026-10-18/20): what left a star THIS eon waits at its LEFT, where the resting fleet sits on its right
  // — the same triangle, turned toward where it goes, at a fixed spot whatever the zoom, each with its own dotted line. Two fit side
  // by side; three or more gather into ONE stacked icon (their lines still start there) that spreads into a block when clicked —
  // as boxy as can be: 2 × 2, then two columns of three, then 3 × 3… — and folds back on a click elsewhere. Click a fleet: its
  // ships, all of them chosen, to undo their travel in part or send them elsewhere
  G.out = {}; G.outStack = {};
  if (!GE) {
    const bySys = new Map();
    for (const { u } of c.ships) { const key = outKeyOf(u); if (!key) continue; const sys = u.voy.A; let m = bySys.get(sys); if (!m) bySys.set(sys, m = new Map()); let o = m.get(key); if (!o) m.set(key, o = { key, sys, to: u.voy.B, dest: u.dest, ids: [] }); o.ids.push(u.id); }
    if (outOpen && !bySys.has(outOpen)) outOpen = null;
    const line = (x, y, b, strong) => { if (!b) return; g.setLineDash([4, 5]); g.strokeStyle = '#7ef3b0'; g.globalAlpha = strong ? 0.9 : 0.55; g.lineWidth = strong ? 2 : 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 1; };
    const tri = (x, y, ang, col) => { g.save(); g.translate(x, y + 1); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(0, -9); g.lineTo(8, 7); g.lineTo(-8, 7); g.closePath(); g.fill(); g.restore(); };
    for (const [sys, m] of bySys) {
      const p = G.pos[sys], st = sysOf(sys) && STARS[sysOf(sys).type]; if (!p || !st) continue;
      const size = 2.6 + 3.2 * st.size, foreignHere = (S.others || []).some(o => o.fleets.some(f => f.sys === sys)), x0 = p.x - size - 15 - (foreignHere ? 34 : 0), y0 = p.y - size - 7;
      const list = [...m.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0), n = list.length;
      if (n >= 3 && outOpen !== sys) {                   // the STACK: one icon, a triangle behind a triangle, the fleets' count; every route from it
        const hov = gHover === 'outs:' + sys; G.outStack[sys] = { x: x0, y: y0, sys, n };
        for (const o of list) line(x0, y0, G.pos[o.to], hov);
        tri(x0 - 6, y0 - 5, 0, 'rgba(126,243,176,.45)'); tri(x0 - 3, y0 - 2.5, 0, 'rgba(126,243,176,.7)'); tri(x0, y0, 0, '#7ef3b0');
        if (hov) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x0 - 3, y0 - 1, 15, 0, 7); g.stroke(); g.lineWidth = 1; }
        g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#7ef3b0'; g.fillText(`${n} fleets`, x0 - 3, y0 + 24);
        continue;
      }
      // one by one: in a row while they are two, else the block (rows = ⌈√n⌉, filled a row at a time, leftward and upward)
      const rows = n <= 2 ? 1 : Math.ceil(Math.sqrt(n)), cols = Math.ceil(n / rows);
      list.forEach((o, i) => {
        const x = x0 - (i % cols) * 28, y = y0 - Math.floor(i / cols) * 30, b = G.pos[o.to], on = pickScope && pickScope.kind === 'outgoing' && pickScope.key === o.key, hov = gHover === 'out:' + o.key; G.out[o.key] = { ...o, x, y };
        line(x, y, b, on || hov);
        tri(x, y, b ? Math.atan2(b.y - y, b.x - x) + Math.PI / 2 : 0, on ? '#fff' : '#7ef3b0');
        if (on || hov) { g.strokeStyle = on ? '#7ef3b0' : 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y + 1, 13, 0, 7); g.stroke(); g.lineWidth = 1; }
        g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = on ? '#fff' : '#7ef3b0'; g.fillText(String(o.ids.length), x + 11, y - 6);
      });
    }
  }
  g.textAlign = 'left';
  renderFleetPop(false); renderSendBadge();          // the overlays follow a pan or a zoom
}
const mapXY = e => { const cv = $('gMap'), r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function sysAt(e) {
  const G = $('gMap')._geo; if (!G) return null;
  const [mx, my] = mapXY(e); let best = null, bd = 17;
  for (const s of S.systems) { const p = G.pos[s.id], d = Math.hypot(mx - p.x, my - p.y); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
function fleetAt(e) {                                // the fleet icon under the mouse, if any: its star's id
  const G = $('gMap')._geo; if (!G || !G.fleet) return null;
  const [mx, my] = mapXY(e);
  for (const [id, f] of Object.entries(G.fleet)) if (Math.hypot(mx - f.x, my - f.y - 1) < 14) return id;
  return null;
}
function battleAt(e) {                               // the ▶ badge of a battle under the mouse, if any: the battle (id, and in God mode whose record it is)
  const G = $('gMap')._geo; if (!G || !G.battle) return null;
  const [mx, my] = mapXY(e);
  for (const b of Object.values(G.battle)) if (Math.hypot(mx - b.x, my - b.y) < 11) return b;
  return null;
}
function godFleetAt(e) {                             // God mode: an empire's fleet triangle under the mouse → 'sys|k'
  const G = $('gMap')._geo; if (!G || !G.gfleet) return null; const [mx, my] = mapXY(e);
  for (const [key, f] of Object.entries(G.gfleet)) if (Math.hypot(mx - f.x, my - f.y - 1) < 14) return key;
  return null;
}
function outStackAt(e) {                              // a STACK of departing fleets (three or more at one star) under the mouse
  const G = $('gMap')._geo; if (!G || !G.outStack) return null; const [mx, my] = mapXY(e);
  for (const o of Object.values(G.outStack)) if (Math.hypot(mx - o.x + 3, my - o.y - 1) < 16) return o;
  return null;
}
function outAt(e) {                                   // an OUTGOING fleet's icon (left this eon, at its star's left) under the mouse
  const G = $('gMap')._geo; if (!G || !G.out) return null; const [mx, my] = mapXY(e);
  for (const o of Object.values(G.out)) if (Math.hypot(mx - o.x, my - o.y - 1) < 13) return o;
  return null;
}
function myShipAt(e) {                               // your fleet under way under the mouse → { ids }
  const G = $('gMap')._geo; if (!G || !G.myship) return null; const [mx, my] = mapXY(e); let best = null, bd = 9;
  for (const sh of Object.values(G.myship)) { const d = Math.hypot(mx - sh.x, my - sh.y); if (d < bd) { bd = d; best = sh; } }
  return best;
}
function godShipAt(e) {                              // God mode: a ship under way under the mouse → { k, id }
  const G = $('gMap')._geo; if (!G || !G.gship) return null; const [mx, my] = mapXY(e); let best = null, bd = 9;
  for (const sh of Object.values(G.gship)) { const d = Math.hypot(mx - sh.x, my - sh.y); if (d < bd) { bd = d; best = sh; } }
  return best;
}
function sysBlurb(s) {
  const here = placesIn(s.id), best = here.flatMap(pl => FIELD_IDS.map(f => [pl.mult[f] * pl.fresh[f], f, pl])).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return `<b>${esc(s.name)}</b> — ${STARS[s.type].name} · ${here.length > 1 ? `${plural(here.length - 1, 'place')} around it, ${here.filter(p => p.landable).length} can be settled` : 'nothing circles it'}<br>
    the most to learn: ${best.map(b => `${DOMAINS[b[1]].name} ${pct(b[0])} at ${esc(b[2].name)}`).join(' · ')}${LAST && presence(LAST).get(s.id)?.platforms ? `<br>${plural(presence(LAST).get(s.id).platforms, 'platform')} of yours rest here` : ''}`;
}
$('gMap').addEventListener('mousemove', e => {
  if (godEmpires()) {                                // God mode: a fleet, a ship under way, or a star
    const GE = godEmpires(), gf = godFleetAt(e), gs = gf ? null : godShipAt(e), id = gf || (gs ? gs.k + '|' + gs.id : sysAt(e)); if (id === gHover) return;
    gHover = id; gHoverFleet = !!gf; $('gMap').style.cursor = id ? 'pointer' : 'default';
    let h = '';
    if (gf) { const [sys, k] = gf.split('|'), E = GE[+k], n = GODC[+k].ships.filter(x => !x.u.dest && (E.places.find(pl => pl.id === x.u.at) || {}).sys === sys).length; h = `<b style="color:${E.look.colA}">${esc(E.name)}'s fleet at ${esc(sysOf(sys).name)}</b> — ${plural(n, 'ship')}. Click it for the ships.`; }
    else if (gs) { const E = GE[gs.k], u = E.ships.find(x => x.id === gs.id); if (u) { const to = E.places.find(p => p.id === u.dest); h = `<b style="color:${E.look.colA}">${esc(E.name)}'s ${gs.ids.length > 1 ? `fleet of ${plural(gs.ids.length, 'ship')}` : esc(u.name)}</b> → ${esc(to ? to.name : '?')} · ${plural(u.eta, 'eon')}. Click it for ${gs.ids.length > 1 ? 'the ships' : 'its card'}.`; } }
    else if (id) h = sysBlurb(sysOf(id));
    $('gHover').innerHTML = h; if (LAST) drawGalaxy(LAST); return;
  }
  const os = outStackAt(e); if (os) { if (gHover !== 'outs:' + os.sys) { gHover = 'outs:' + os.sys; gHoverFleet = false; $('gMap').style.cursor = 'pointer'; $('gHover').innerHTML = `<b>${os.n} fleets leaving ${esc(sysOf(os.sys).name)}</b> this eon — click to spread them out.`; if (LAST) drawGalaxy(LAST); } return; }
  const oa = outAt(e); if (oa) { if (gHover !== 'out:' + oa.key) { const to = placeOf(oa.dest); gHover = 'out:' + oa.key; gHoverFleet = false; $('gMap').style.cursor = 'pointer'; $('gHover').innerHTML = `<b>Your fleet leaving for ${esc(to ? to.name : '?')}</b> — ${plural(oa.ids.length, 'ship')}, it left this eon. Click it: undo the travel for some or all, or send them elsewhere.`; if (LAST) drawGalaxy(LAST); } return; }
  const ms = myShipAt(e); if (ms) { const u = S.ships.find(x => x.id === ms.ids[0]), to = u && placeOf(u.dest); gHover = 'ms'; $('gMap').style.cursor = 'pointer'; $('gHover').innerHTML = u ? `<b>Your ${ms.ids.length > 1 ? `fleet of ${plural(ms.ids.length, 'ship')}` : esc(u.name)}</b> → ${esc(to ? to.name : '?')} · ${plural(u.eta, 'eon')} — click it: ${canUndoSend(S, u) ? 'undo the send (it left this eon)' : 'call it back'}` : ''; return; }
  const f = fleetAt(e), id = f || sysAt(e); if (id === gHover && !!f === gHoverFleet) return;
  gHover = id; gHoverFleet = !!f; $('gMap').style.cursor = id ? 'pointer' : 'default';
  $('gHover').innerHTML = f ? `<b>Your fleet at ${esc(sysOf(f).name)}</b> — ${LAST ? plural(presence(LAST).get(f)?.ships || 0, 'ship') : ''}. Click it for the fleet; click the star for the system.` : id ? sysBlurb(sysOf(id)) : '';
  if (LAST) drawGalaxy(LAST);
});
// a click: the fleet icon → the fleet panel; a star → the system (or, with ships picked, where they go). You are on one or the other.
// In God mode: a fleet triangle → that empire's ships there; a ship under way → its card; a star → everything at it.
$('gMap').addEventListener('click', e => {
  const bt = battleAt(e); if (bt) return watchBattle(bt.id, bt.k != null && W ? W.empires[bt.k] : S);
  if (godEmpires()) {
    const gf = godFleetAt(e); if (gf) { const [sys, k] = gf.split('|'); godPick = { kind: 'fleet', k: +k, sys }; gSel = sys; gMode = 'god'; return refresh(); }
    const gs = godShipAt(e); if (gs) { godPick = gs.ids.length > 1 ? { kind: 'transit', k: gs.k, ids: gs.ids, key: gs.key } : { kind: 'ship', k: gs.k, id: gs.id }; gMode = 'god'; return refresh(); }
    const id = sysAt(e); if (!id) { if (sysPop) { sysPop = null; refresh(); } return; } godPick = null; gSel = id; gMode = 'god'; sysPop = id; return refresh();   // God mode too: the star's worlds in a pop-up
  }
  const os = outStackAt(e); if (os) { outOpen = os.sys; sysPop = null; gSel = os.sys; gMode = 'system'; return refresh(); }   // the stack spreads into its fleets
  const oa = outAt(e); if (oa) { setScope({ kind: 'outgoing', sys: oa.sys, key: oa.key }); for (const g of scopeGroups(LAST)) picks.set(g.key, g.ships.length); sendTo = null; sysPop = null; gSel = oa.sys; gMode = 'system'; return refresh(); }   // a fleet leaving this eon: all of it chosen — undo, or send elsewhere   // a fleet leaving this eon: its ships, to undo or send elsewhere
  const ms = myShipAt(e); if (ms) { e.stopPropagation(); return openShipPop(null, ms.ids, e.clientX, e.clientY); }   // your fleet under way: its card (undo / call back)
  const f = fleetAt(e), id = f || sysAt(e); if (!id) { if (sysPop || outOpen) { sysPop = null; outOpen = null; refresh(); } return; }   // empty space: the system pop-up closes, a spread stack folds
  if (!f && pickCount() && (pickScope?.kind === 'galaxy' || pickScope?.kind === 'outgoing') && id !== pickScope.sys) { sendTo = id; sysPop = null; return refresh(); }
  if (pickScope && pickScope.kind === 'outgoing') { pickScope = null; picks = new Map(); sendTo = null; }   // nothing chosen of a leaving fleet: a star click is just a star click
  outOpen = null;
  gSel = id; gMode = f ? 'fleet' : 'system'; sysPop = f ? null : id; refresh();   // a star: its worlds in a pop-up beside it (his ask, 2026-10-18)
});
$('gMap').addEventListener('dblclick', e => { if (fleetAt(e) || godFleetAt(e) || godShipAt(e)) return; const id = sysAt(e); if (id) openSystem(id); });
// ZOOM with the wheel, about the mouse; PAN with a middle- or right-drag (his ask, 2026-10-15)
{
  const cv = $('gMap'); let pan = null, panMoved = false;
  cv.addEventListener('pointerdown', e => { if (e.button !== 1 && e.button !== 2) return; pan = { x: e.clientX, y: e.clientY, vx: gView.x, vy: gView.y, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!pan) return; if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 3) pan.moved = true; gView.x = pan.vx + e.clientX - pan.x; gView.y = pan.vy + e.clientY - pan.y; if (LAST) drawGalaxy(LAST); });
  const stop = () => { panMoved = !!(pan && pan.moved); pan = null; }; cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  cv.addEventListener('contextmenu', e => {          // a right-click (not a drag) on a fleet icon or a ship under way: its full spec
    e.preventDefault(); if (panMoved || !LAST) return;
    const GE = godEmpires();
    if (GE) { const gf = godFleetAt(e); if (gf) { const [sys, k] = gf.split('|'), E = GE[+k]; return openShipPop(+k, GODC[+k].ships.filter(x => !x.u.dest && sysOfPlaceOf(E, x.u.at) === sys).map(x => x.u.id), e.clientX, e.clientY); } const gs = godShipAt(e); if (gs) return openShipPop(gs.k, gs.ids, e.clientX, e.clientY); }
    const f = fleetAt(e); if (f) openShipPop(null, LAST.ships.filter(x => !x.u.dest && placeOf(x.u.at)?.sys === f).map(x => x.u.id), e.clientX, e.clientY);
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const [px, py] = mapXY(e), mx = px - cv.width / 2, my = py - cv.height / 2, z = clamp(gView.z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 0.5, 8), k = z / gView.z;
    gView = { z, x: mx - (mx - gView.x) * k, y: my - (my - gView.y) * k }; if (LAST) drawGalaxy(LAST);
  }, { passive: false });
}

function renderGalaxy(c) {
  drawGalaxy(c);
  const s = sysOf(gSel) || sysOf(S.homeSys), here = placesIn(s.id), mine = presence(c).get(s.id), d = sysDistance(S, S.homeSys, s.id), H = hostileIn(S, s.id);
  if (gMode === 'fleet' && !(mine && mine.ships)) gMode = 'system';            // the fleet left: back to the system
  const have = mine ? [mine.colonies ? `${mine.colonies} ${mine.colonies === 1 ? 'colony' : 'colonies'}` : '', mine.ships ? plural(mine.ships, 'ship') : ''].filter(Boolean).join(' and ') : '';
  const top = `<h2>The galaxy</h2>
    <div class="tiny">${S.systems.length} star systems, all grown from one seed. The same seed always gives the same galaxy — any number or word will do.</div>
    ${setupHtml()}
    <h3>Show where a field is rich</h3>
    <div>${FIELD_IDS.map(f => `<button class="x ${gField === f ? 'go' : ''}" data-gfield="${f}" style="margin:0 4px 4px 0">${DOMAINS[f].name}</button>`).join('')}</div>
    <div class="tiny">${gField ? `The bigger the purple halo, the more ${DOMAINS[gField].name} there is to find in that system. Click the field again to switch it off.` : 'Pick a field and the map marks the systems worth going to for it.'}</div>`;
  let h;
  if (godEmpires()) h = godPanel(s);
  else if (gMode === 'fleet') h = `<h2 style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">Your fleet at ${esc(s.name)} <button class="x" data-gsys title="the system itself">◂ the system</button></h2>
    <div class="tiny" style="margin-bottom:6px">${plural(mine.ships, 'ship')} resting here.${H ? ` <b class="up">⚔ ${esc(hostileWord(H))} holds this system</b> — they fight at the end of the eon.` : ''}</div>
    ${galaxyFleetPanel(c, s, true)}
    <div class="tiny" style="margin-top:8px">Pick how many of each to send (+ / all), click the star they go to, then Send. Click the star here instead for the system itself.</div>`;
  else h = `<h2 style="margin-top:14px">${esc(s.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${STARS[s.type].name}${s.home ? ' · your home' : ''}</span></h2>
    <div class="tiny" style="margin-bottom:6px">${s.home ? 'Where your people come from.' : `${(d / LY).toFixed(1)} light years from Home — about ${plural(starEons(d, c.warp), 'eon')} for a plain star drive.`}${have ? ` You have ${have} here.` : ''}</div>${H ? `<div class="note" style="margin:4px 0 6px">⚔ <b>${esc(hostileWord(H))}</b> holds this system. Ships of yours that come to rest here fight it at the end of the eon — every eon, until one side is gone or yours leave.</div>` : ''}
    ${(S.others || []).map(o => { const col = o.colonies.filter(x => x.sys === s.id), fl = o.fleets.find(f => f.sys === s.id); if (!col.length && !fl) return ''; return `<div class="note" style="margin:4px 0 6px;border-color:${o.color}"><b style="color:${o.color}">${esc(o.name)}</b>${col.length ? ` holds ${col.map(x => esc(x.name) + (x.home ? ' (its homeworld)' : '') + ', ' + peopleWord(x.people) + ' people' + (x.blockaded ? ` — <b>blockaded ${plural(x.blockaded, 'eon')}</b>` : '')).join(' and ')} here` : ''}${fl ? `${col.length ? ';' : ''} a fleet of ${plural(fl.n, 'ship')} (worth ${Math.round(fl.worth)}) rests here — ships of yours that come to rest in this system fight it at the end of the eon${mine && mine.colonies && !mine.ships ? `; <b class="up">unopposed, it blockades your colonies here — ${WORLD.siege} eons and they are destroyed</b>` : ''}` : ''}.${col.length ? ` Armed ships of yours resting here unopposed blockade it; ${WORLD.siege} eons of that and the colony is destroyed (troops landed take it at once).` : ''}</div>`; }).join('')}
    ${(S.battles || []).filter(b => b.sys === s.id).map(b => `<button class="go" data-watch="${b.id}" style="margin:2px 6px 6px 0" title="replay it, as it was fought">▶ Watch the battle fought here this eon</button>`).join('')}
    ${mine && mine.ships ? `<button class="go" data-gfleet style="margin:2px 0 6px" title="the ships of yours resting here, as stacks to send">⯈ Your fleet here — ${plural(mine.ships, 'ship')}</button>` : ''}
    ${galaxyFleetPanel(c, s, false)}
    ${here.map(pl => `<div class="shiprow" data-gplace="${pl.id}" style="cursor:pointer"><div class="n"><span><i class="dot" style="background:${lookOf(pl).color}"></i>${esc(pl.name)}${pl.cool ? ' <span title="a remarkable place" style="color:var(--time)">✦</span>' : ''}</span><span class="tiny">${KIND_WORD[pl.kind]}${pl.colony ? ' · settled' : pl.landable ? ' · can be settled' : ' · orbit only'}</span></div>
      <div class="tiny">${topFields(pl).filter(x => x[2] > 0.06).map(x => `${DOMAINS[x[0]].name} <b>${pct(x[1])}</b>`).join(' · ')}</div></div>`).join('')}
    <button class="go" data-opensys="${s.id}" style="margin-top:4px">Open the ${esc(s.name)} system ▸</button>
    <div class="tiny" style="margin-top:8px">Click a star to look at it; double-click to open it. A green ring is a colony of yours, the big green triangle your fleet (click it for the fleet), a grey × a derelict, a red dashed ring a hostile fleet (⚔ its worth — the further from home, the stronger). Wheel to zoom, drag with the middle or right button to move about${gView.z !== 1 || gView.x || gView.y ? ' · <button class="x" data-greset>whole galaxy</button>' : ''}. <b>The coloured bubbles</b> are your sphere of influence, thrown by your colonies: <span style="color:#4da3ff">blue</span> is home waters — flight there costs no strain and a ship restocks fully in an eon; <span style="color:#7ef3b0">green</span>, <span style="color:#ffd26a">yellow</span>, <span style="color:#ffb347">orange</span>, <span style="color:#ff7979">red</span> a light year each, restocking ${ZONE.recover.slice(1, 5).join(' / ')} an eon (green flight counts half). Beyond the red nothing restocks, and the strain of every light year flown stacks from hop to hop until a ship is back inside; past its reach it rolls to break down. The white dashed ring is the open fleet's own reach.${(S.others || []).length ? ` <b>The other empires</b> — ${(S.others || []).map(o => `<b style="color:${o.color}">${esc(o.name)}</b>`).join(', ')} — ring their colonies in their colour (solid for a homeworld) and mark a resting fleet with a triangle on the left. Fleets of two empires in one system fight at the end of the eon; an armed fleet resting unopposed where another empire has colonies blockades them, and after ${WORLD.siege} eons destroys them — the world lies empty to settle again; troops landed on a colony (ships with people aboard, the system clear of its armed ships — each trooper is worth ${T.ground.ratio} of its militia, 1 in ${Math.round(1 / T.ground.militia)} of its people) take it at once; an empire whose homeworld falls is gone.` : ''}</div>`;
  $('gPanel').innerHTML = top + h; fillThumbs($('gPanel'));
}
// GOD MODE's panel: the scoreboard of every empire, the sieges under way, then the chosen star — every empire's colonies, resting
// ships and ships bound here — or, picked on the map, one fleet's ships one by one, or one ship's card. Nothing here gives orders.
function godShipLine(E, k, s, big) {
  const u = s.u, t = s.t, caps = GODC[k].caps, tid = `g${k}|${u.id}`; thumbShips.set(tid, paintedShip(u.design, caps));
  const pl = E.places.find(p => p.id === u.at), to = u.dest ? E.places.find(p => p.id === u.dest) : null, V = u.voy, z = pl ? zoneOfSys(E, pl.sys) : 5;
  const where = u.dest ? `under way to <b>${esc(to ? to.name : '?')}</b>${V ? ` (${esc(sysOf(V.B)?.name || '?')}), ${V.left.toFixed(1)} ly to go` : ''} · ${plural(u.eta, 'eon')}${V && V.travelled > V.range ? ` · <b class="up">${(V.travelled - V.range).toFixed(1)} ly past its reach</b>` : ''}` : `resting at <b>${esc(pl ? pl.name : '?')}</b> (${esc(pl ? sysOf(pl.sys)?.name || '' : '')}, ${ZONE.names[z]})`;
  const stats = [`worth ${fmt(t.cost)}`, t.dps ? `${fmt(t.dps)} dmg/s` : '', `hull ${fmt(t.hp)}`, t.armor ? `armour ${fmt(t.armor)}` : '', t.shieldRaw ? `shield ${fmt(t.shieldRaw)}` : '', t.research ? `lab ${fmt(t.research)}` : '', u.klass === 'starship' && !t.underDriven ? `reach ${shipRange(t).toFixed(1)} ly` : u.klass === 'starship' ? 'drive too small' : 'no star drive', `stamina ${Math.round(u.st ?? 100)} %`, (u.strain || 0) > 0.05 ? `strain ${u.strain.toFixed(1)} ly` : '', u.people ? `${peopleWord(u.people)} people aboard` : ''].filter(Boolean).join(' · ');
  return `<div class="shiprow" data-shipctx="${k}|${u.id}" title="right-click for the full spec" ${big ? '' : `data-gship="${k}|${u.id}" style="cursor:pointer"`}><div class="n"><span style="display:flex;align-items:center;gap:8px"><canvas data-thumb="${tid}" data-emp="${k}" width="${big ? 240 : 96}" height="${big ? 140 : 56}" style="width:${big ? 160 : 64}px;height:${big ? 94 : 38}px;border-radius:6px;background:#04070f;flex:none"></canvas>${big ? `<span><b>${esc(u.design.name || u.name)}</b> <span class="tiny">· ${CLASS_NAME[u.klass] || u.klass}</span></span>` : `<b style="color:${E.look.colA}">${esc(u.name)}</b><span class="tiny">${Math.round(u.st ?? 100)} %${(u.strain || 0) > 0.05 ? ` · strain ${u.strain.toFixed(1)}` : ''}</span>`}</span>${big ? `<button class="x" data-gback>◂ back</button>` : ''}</div>
    ${big ? `<div class="tiny">${where}</div><div class="tiny">${stats}</div><div class="acts" style="margin-top:4px"><button class="x" data-gspec="${k}|${u.id}">full spec ▸</button></div>${u.design.chips ? `<div class="tiny">fitted: ${u.design.chips.filter(c => !c.off).map(c => `${c.kind.replace('weapon_', '')}${c.role ? ' ' + c.role : ''} ×${c.h}`).join(', ')}</div>` : ''}` : ''}</div>`;
}
function godPanel(s) {
  const GE = godEmpires(), W = REPLAY && REPLAY.world ? REPLAY.world : SIM.W, sysName = id => sysOf(id)?.name || id;   // a replay's world, or the simulation's
  const board = GE.map((E, k) => {
    const c = GODC[k], col = E.look.colA; if (!c) return `<div class="shiprow"><div class="n"><span><i class="dot" style="background:${col}"></i><b style="color:${col}">${esc(E.name)}</b> <span class="tiny">· fallen</span></span></div></div>`;
    const cols = E.places.filter(p => p.colony), people = cols.reduce((a, p) => a + p.colony.people, 0), rest = c.ships.filter(x => !x.u.dest).length, away = c.ships.length - rest, worth = c.ships.reduce((a, x) => a + x.t.cost, 0);
    return `<div class="shiprow"><div class="n"><span><i class="dot" style="background:${col}"></i><b style="color:${col}">${esc(E.name)}</b> <span class="tiny">· home ${esc(sysName(E.homeSys))}</span></span><span class="tiny">${plural(cols.length, 'colony').replace('colonys', 'colonies')} · ${peopleWord(people)} people</span></div>
      <div class="tiny">${plural(c.ships.length, 'ship')} (${rest} resting, ${away} under way) worth ${fmt(worth)} · reserves ${fmt(E.reserves || 0)} · cohesion ${Math.round(E.cohesion)} % · ${plural(E.breakthroughs.length, 'breakthrough')} · focus ${XS.map((x, i) => `${X_INFO[x].name.slice(0, 6)} ${pct(E.focus[i])}`).join(' · ')}</div></div>`;
  }).join('');
  const sieges = Object.entries(W.sieges || {}).map(([key, n]) => { const [sys, v, a] = key.split('|'); return `<div class="note" style="margin:4px 0;border-color:${GE[+a].look.colA}"><b style="color:${GE[+a].look.colA}">${esc(GE[+a].name)}</b> blockades <b style="color:${GE[+v].look.colA}">${esc(GE[+v].name)}</b> at ${esc(sysName(sys))} — ${n} of ${WORLD.siege} eons</div>`; }).join('');
  let h = `<h2 style="margin-top:14px">👁 God mode <span class="tiny" style="text-transform:none;letter-spacing:0">· everyone, everything · eon ${W.eon}${W.winner != null ? ` · <b>${esc(GE[W.winner].name)} holds the galaxy</b>` : ''}</span></h2>${board}${sieges}`;
  if (godPick && godPick.kind === 'ship') {           // one ship's card
    const E = GE[godPick.k], sh = GODC[godPick.k] && GODC[godPick.k].ships.find(x => x.u.id === godPick.id);
    if (sh) return h + `<h3 style="margin-top:12px;color:${E.look.colA}">${esc(E.name)}'s ${esc(sh.u.name)}</h3>` + godShipLine(E, godPick.k, sh, true);
    godPick = null;
  }
  if (godPick && godPick.kind === 'transit') {        // a fleet under way, ship by ship (God mode sees everything; a player will not, later)
    const E = GE[godPick.k], c = GODC[godPick.k], ships = c ? c.ships.filter(x => godPick.ids.includes(x.u.id)) : [], u0 = ships[0] && ships[0].u, to = u0 && E.places.find(p => p.id === u0.dest);
    if (ships.length) return h + `<h3 style="margin-top:12px;display:flex;justify-content:space-between;align-items:center"><span style="color:${E.look.colA}">${esc(E.name)}'s fleet under way to ${esc(to ? to.name : '?')} — ${plural(ships.length, 'ship')}, worth ${fmt(ships.reduce((a, x) => a + x.t.cost, 0))} · ${plural(u0.eta, 'eon')}</span><button class="x" data-gback>◂ the star</button></h3><div class="tiny" style="margin-bottom:4px">Click a ship for its card; right-click the dot on the map for the whole fleet's spec.</div>` + ships.sort((a, b) => b.t.cost - a.t.cost).map(x => godShipLine(E, godPick.k, x, false)).join('');
    godPick = null;
  }
  if (godPick && godPick.kind === 'fleet') {          // one fleet, ship by ship
    const E = GE[godPick.k], c = GODC[godPick.k], ships = c ? c.ships.filter(x => !x.u.dest && (E.places.find(pl => pl.id === x.u.at) || {}).sys === godPick.sys) : [];
    if (ships.length) return h + `<h3 style="margin-top:12px;display:flex;justify-content:space-between;align-items:center"><span style="color:${E.look.colA}">${esc(E.name)}'s fleet at ${esc(sysName(godPick.sys))} — ${plural(ships.length, 'ship')}, worth ${fmt(ships.reduce((a, x) => a + x.t.cost, 0))}</span><button class="x" data-gback>◂ the star</button></h3><div class="tiny" style="margin-bottom:4px">Click a ship for its card.</div>` + ships.sort((a, b) => b.t.cost - a.t.cost).map(x => godShipLine(E, godPick.k, x, false)).join('');
    godPick = null;
  }
  h += `<h3 style="margin-top:12px">${esc(s.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${STARS[s.type].name}</span></h3>`;
  let any = false;
  GE.forEach((E, k) => {
    const c = GODC[k]; if (!c) return; const col = E.look.colA, cols = E.places.filter(p => p.colony && p.sys === s.id), here = c.ships.filter(x => !x.u.dest && (E.places.find(pl => pl.id === x.u.at) || {}).sys === s.id), bound = c.ships.filter(x => x.u.dest && x.u.voy && x.u.voy.B === s.id), leaving = c.ships.filter(x => x.u.dest && x.u.voy && x.u.voy.A === s.id);
    if (!cols.length && !here.length && !bound.length && !leaving.length) return; any = true;
    h += `<div class="note" style="margin:6px 0;border-color:${col}"><b style="color:${col}">${esc(E.name)}</b>${cols.length ? ` holds ${cols.map(p => `${esc(p.name)}${p.id === E.homePlace ? ' (its homeworld)' : ''}, ${peopleWord(p.colony.people)} people${p.colony.factories ? `, ${p.colony.factories} factories` : ''}`).join(' and ')}` : ''}${here.length ? `${cols.length ? ';' : ''} ${plural(here.length, 'ship')} resting here (worth ${fmt(here.reduce((a, x) => a + x.t.cost, 0))}) <button class="x" data-gfleet="${s.id}|${k}">the ships ▸</button>` : ''}${bound.length ? `${cols.length || here.length ? ';' : ''} ${plural(bound.length, 'ship')} on the way here (${Math.max(...bound.map(x => x.u.eta))} eons at most)` : ''}${leaving.length ? `; ${plural(leaving.length, 'ship')} leaving` : ''}.</div>`;
  });
  if (!any) h += `<div class="tiny">Nobody here.</div>`;
  h += `<div class="tiny" style="margin-top:8px">Every empire's sphere is drawn in its colour (solid core, dashed edge); a ring round a star is a colony (solid = a homeworld), a triangle a resting fleet (its slot by empire), a dot on a dashed line a ship under way — click any of them. The Empire select above still picks whose Empire and Star-system tabs you see.</div>`;
  return h;
}
// A SHIP'S FULL SPEC on a RIGHT-CLICK (his ask, 2026-10-16: "if I right click it, a pop-up with its full spec, exactly what it is
// — and if it came in with fatigue, its fatigue"): the design as built, in the Design tab's own figures, its modules, then every
// ship of the group with its own state — stamina, strain, where it is or where it is bound, what it carries. Any ship row, the
// fleet icons and ships under way on the galaxy map, the ships parked at a place on the system map; yours or another empire's.
let POP = null;                                      // { k: empire index (null = you), ids: [ship ids], x, y }
function openShipPop(k, ids, x, y) { if (!ids.length) return; POP = { k: W && W.empires[k] === S ? null : k, ids, x, y }; renderShipPop(); }
function closeShipPop() { POP = null; $('shipPop').hidden = true; }
function renderShipPop() {
  const el = $('shipPop'); if (!el) return; if (!POP) { el.hidden = true; return; }
  const E = POP.k == null ? S : W ? W.empires[POP.k] : null, c = POP.k == null ? LAST : GODC && GODC[POP.k]; if (!E || !c) return closeShipPop();
  const units = POP.ids.map(id => c.ships.find(s => s.u.id === id)).filter(Boolean); if (!units.length) return closeShipPop();
  const col = POP.k == null ? '#7ef3b0' : E.look.colA, who = POP.k == null ? 'Your' : `${esc(E.name)}'s`;
  const groups = new Map(); for (const s of units) { const g = groups.get(s.u.design.id) || { d: s.u.design, ships: [] }; g.ships.push(s); groups.set(s.u.design.id, g); }
  let h = `<h2><span style="color:${col}">${who} ${units.length === 1 ? esc(units[0].u.name) : plural(units.length, 'ship')}</span><button class="x" data-popclose title="close (Esc)">✕</button></h2>`;
  // yours under way: UNDO the send while the eon it left in lasts (nothing has moved yet), else CALL IT BACK (his ask, 2026-10-18)
  const moving = POP.k == null ? units.filter(s => s.u.dest) : [];
  if (moving.length) { const u0 = moving[0].u, undo = canUndoSend(S, u0); h += `<div class="acts" style="margin:0 0 8px;align-items:center">${undo ? `<button class="go" data-unsend="${u0.id}">↶ Undo the send</button><span class="tiny">it left this eon — nothing has moved yet: it stays where it was</span>` : `<button class="x" data-recall="${u0.id}">↩ Call back</button><span class="tiny">${u0.voy ? 'the fleet turns round: the way back counts on the same voyage' : 'it stays where it is'}</span>`}</div>`; }
  for (const g of groups.values()) h += specBlock(E, POP.k, g.d, g.ships, c);
  el.innerHTML = h; el.hidden = false; fillThumbs(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(12, Math.min(POP.x + 12, innerWidth - r.width - 12)) + 'px'; el.style.top = Math.max(60, Math.min(POP.y + 12, innerHeight - r.height - 12)) + 'px';
}
// a design AS DESIGNED (his ask, 2026-10-20: "I want to see the chips, the way it looked at the design table, compressed"): its chip
// piles as the table shows them — then the ship's own systems (reactor, star drive, weapons computer), grey, as the table's auto chips
function chipStripHtml(d) {
  const chips = d.chips && d.chips.length ? d.chips.filter(c => !c.off) : chipsOfDesign(d, 1);
  const nameOf = c => c.kind === 'fast' ? 'Thrusters' : ([...CHIPS.weapon, ...CHIPS.trait, ...CIVIL.trait].find(x => x[0] === c.kind) || [])[1] || c.kind;
  const roleOf = r => (PRESETS[r] && PRESETS[r].name) || r;
  const piles = chips.map(c => `<span class="stack mini" style="--c:${CHIPC[c.kind] || '#ffd26a'}"><b>${esc(nameOf(c))}</b>${c.h > 1 ? `<i class="hh">×${c.h}</i>` : ''}${c.role ? `<small>${esc(roleOf(c.role))}</small>` : ''}${c.caps && c.caps.length ? `<span class="tuned" title="breakthrough capsules on it">✦${c.caps.length}</span>` : ''}</span>`);
  const autos = d.modules.filter(m => ['reactor', 'stardrive', 'weapon_system'].includes(m.kind)).map(m => `<span class="stack mini auto" style="--c:#9eb3d8" title="sized by the design table to what the chips need"><b>${esc(KINDS[m.kind].name)}</b>${m.k != null && m.k !== 1 ? `<small>size ${m.k}</small>` : ''}${(m.n || 1) > 1 ? `<i class="hh">×${m.n}</i>` : ''}</span>`);
  return `<div class="cstrip">${piles.join('')}${autos.join('')}${!piles.length && !autos.length ? '<span class="tiny">nothing fitted</span>' : ''}</div>`;
}
function specBlock(E, k, d, ships, c) {
  const ds = designStats(E, d, c.caps), t = ds.t, tid = (k == null ? 'p' : 'pg' + k) + '|' + d.id; thumbShips.set(tid, paintedShip(d, c.caps));
  const spec = designSpecHtml(ds, { reach: t.klass === 'starship' ? `reach ${shipRange(t, c.warp).toFixed(1)} light years · ${(VOY.speed * c.warp).toFixed(1)} ly a turn` : null, reachBad: !t.underDriven && shipRange(t, c.warp) < 3, shipHousing: SCALE.shipHousing, peopleWord });
  let arch = null; try { arch = paintedShip(d, c.caps).arch; } catch (e) { arch = null; }   // what kind of ship it is, in the lab's words
  const unit = s => {
    const u = s.u, st = Math.round(u.st ?? 100), strain = u.strain || 0, pl = E.places.find(p => p.id === u.at), z = pl ? zoneOfSys(E, pl.sys) : 5, restock = ZONE.recover[z] > 0, V = u.voy, to = u.dest && E.places.find(p => p.id === u.dest), sysN = id => (E.systems.find(x => x.id === id) || {}).name || '?';
    const where = u.dest ? `under way to <b>${esc(to ? to.name : '?')}</b>${V ? ` (${esc(sysN(V.B))}) · ${V.left.toFixed(1)} ly to go` : ''} · ${plural(u.eta, 'eon')}${V && V.travelled > V.range ? ` · <b class="up">${(V.travelled - V.range).toFixed(1)} ly past its reach — rolling to break down</b>` : ''}` : `at <b>${esc(pl ? pl.name : '?')}</b> (${esc(pl ? sysN(pl.sys) : '?')}, ${ZONE.names[z]})`;
    const fatigue = st < 100 && !u.dest ? (restock ? ` · restocking +${ZONE.recover[z]} an eon` : ' · <b class="up">no restocking out here</b>') : '';
    const strainW = strain > 0.05 ? ` · strain <b class="${restock || u.dest ? '' : 'up'}">${strain.toFixed(1)} ly</b>${!u.dest ? (restock ? ` (heals ${ZONE.heal[z] === Infinity ? 'at once' : ZONE.heal[z] + ' ly an eon'})` : ' — it stacks out here') : ' carried on this voyage'}` : '';
    return `<div class="unit"><span><b>${esc(u.name)}</b>${u.sections > 1 ? ` <span class="tiny">· built in ${u.sections} sections</span>` : ''}${u.eon ? ` <span class="tiny">· built eon ${u.eon}</span>` : ''}</span><span class="st ${st < 70 ? 'low' : ''}">stamina ${st} %</span><div class="tiny">${where}${fatigue}${strainW}${u.people ? ` · ${peopleWord(u.people)} people aboard` : ''}</div></div>`;
  };
  return `<div class="sec head"><canvas data-thumb="${tid}" ${k != null ? `data-emp="${k}"` : ''} width="240" height="140"></canvas><div><b style="font-size:15px">${esc(d.name)}</b> <span class="tiny">· ${CLASS_NAME[t.klass] || t.klass}</span>${arch && arch.label ? `<div class="tiny" style="margin-top:3px;color:var(--good)">${esc(arch.label)}</div>` : ''}<div class="tiny" style="margin-top:3px">${fmt(t.cost)} to build · ${fmt(t.volume)} volume${t.dps ? ` · ${fmt(t.dps)} dmg/s` : ''}${t.hp ? ` · hull ${fmt(t.hp)}` : ''}${t.shieldRaw ? ` · shield ${fmt(t.shieldRaw)}` : ''}</div></div></div>`
    + `<div class="spec2"><div class="sec chips"><h3>As designed</h3>${chipStripHtml(d)}</div><div class="nums">${spec}</div></div>`
    + `<div class="sec"><h3>${plural(ships.length, 'ship')} of this design — state</h3>${ships.map(unit).join('')}</div>`;
}
document.addEventListener('click', e => { const cv = e.target.closest('canvas[data-thumb]'), row = cv && cv.closest('[data-shipctx]'); if (!row) return; e.shipPopOpened = true; const [k, ids] = row.dataset.shipctx.split('|'); openShipPop(k === 'me' ? null : +k, ids.split(','), e.clientX, e.clientY); });   // the picture: its spec (his ask, 2026-10-20: 'I click on a ship, I want to see the design')
document.addEventListener('contextmenu', e => { const row = e.target.closest('[data-shipctx]'); if (!row) return; e.preventDefault(); const [k, ids] = row.dataset.shipctx.split('|'); openShipPop(k === 'me' ? null : +k, ids.split(','), e.clientX, e.clientY); });
document.addEventListener('click', e => { if (!POP || e.shipPopOpened) return; if (e.target.closest('[data-popclose]') || !e.target.closest('#shipPop')) closeShipPop(); });   // (not the click that just opened it)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && POP) closeShipPop(); });
$('sMap').addEventListener('contextmenu', e => {         // the ships parked at a place: yours first, else another empire's
  e.preventDefault(); const id = placeAt(e); if (!id || !LAST) return;
  const own = LAST.ships.filter(s => !s.u.dest && s.u.at === id).map(s => s.u.id); if (own.length) return openShipPop(null, own, e.clientX, e.clientY);
  for (const { k } of foreignEmpires()) { const ids = GODC && GODC[k] ? GODC[k].ships.filter(s => !s.u.dest && s.u.at === id).map(s => s.u.id) : []; if (ids.length) return openShipPop(k, ids, e.clientX, e.clientY); }
});
// THE FLEET POP-UP ON THE MAP (his ask, 2026-10-17: "a pop-up of the fleet right there on screen… two columns like a table, the
// ships move to the selected column with their numbers, arrows between them, a double arrow for a batch… click a planet and see
// the route and a Send-here icon — not back and forth to the side panel"): click a fleet icon on the galaxy map, or the ships
// parked under a place on the system map → the stacks in two columns, HERE | TO SEND, ‹ › one at a time, « » a batch (a fifth
// of a small stack, a tenth of a big one), ⇶ all; then click a star (or a place): a dotted route and a SEND HERE badge there.
// The picks are the same `picks` the side panel reads, so both stay in step.
const batchOf = n => n <= 5 ? n : n < 10 ? 3 : n < 30 ? 5 : n < 50 ? 10 : Math.ceil(n * 0.2);   // » moves a BUNCH (his steps, 2026-10-20): up to five, all; under ten, three; under thirty, five; under fifty, ten; then a fifth
function fleetPopWhere() {                           // which pop-up is live now, and the canvas it sits on
  if (!LAST || !pickScope) return null;
  if (tab === 'galaxy' && gMode === 'fleet' && pickScope.kind === 'galaxy') return { el: $('fleetPop'), cv: $('gMap'), kind: 'galaxy' };
  if (tab === 'galaxy' && pickScope.kind === 'outgoing') return { el: $('fleetPop'), cv: $('gMap'), kind: 'outgoing' };   // a fleet that left this eon
  if (tab === 'system' && fleetPopPlace && pickScope.kind === 'system' && pickScope.place === fleetPopPlace) return { el: $('sFleetPop'), cv: $('sMap'), kind: 'system' };
  return null;
}
function placeOverlay(el, cv, anchor, dx = 24) {    // beside its anchor on the map, kept inside the map
  const wrap = cv.parentElement, W0 = wrap.clientWidth, H0 = wrap.clientHeight, w = el.offsetWidth, h = el.offsetHeight, ox = cv.offsetLeft, oy = cv.offsetTop;
  let x = anchor.x + dx, y = anchor.y - 12; if (x + w > W0 - 8) x = anchor.x - w - dx; if (x < 4) x = 4; if (y + h > H0 - 8) y = H0 - h - 8; if (y < 4) y = 4;
  el.style.left = Math.round(ox + x) + 'px'; el.style.top = Math.round(oy + y) + 'px';
}
function renderFleetPop(full = true) {
  for (const id of ['fleetPop', 'sFleetPop']) { const e = $(id); if (e) e.hidden = true; }
  const P = fleetPopWhere(); if (!P) return;
  const G = P.cv._geo; if (!G) return;
  const anchor = P.kind === 'outgoing' ? G.out && G.out[pickScope.key] : P.kind === 'galaxy' ? G.fleet && G.fleet[pickScope.sys] : G.pos[pickScope.place]; if (!anchor) { if (P.kind === 'outgoing') { pickScope = null; picks = new Map(); } return; }
  const groups = scopeGroups(LAST); if (!groups.length) return;
  if (full) {
    const out = P.kind === 'outgoing' ? anchor : null, dest = out && placeOf(out.dest), where = out ? `${dest ? dest.name : '?'}${dest && dest.kind !== 'star' ? ` (${sysOf(dest.sys).name})` : ''}` : P.kind === 'galaxy' ? sysOf(pickScope.sys).name : placeOf(pickScope.place).name, ships = picked(groups), total = ships.length;
    const rows = groups.map(g => { const max = g.ships.length, n = Math.min(max, picks.get(g.key) || 0), here = max - n, b = batchOf(max);
      return `<div class="fprow"><span class="h">${esc(g.name)} <b>×${here}</b></span><span class="ar"><button data-fp="${g.key}|${-b}" ${n ? '' : 'disabled'} title="${b} back">«</button><button data-fp="${g.key}|-1" ${n ? '' : 'disabled'} title="one back">‹</button><button data-fp="${g.key}|1" ${here ? '' : 'disabled'} title="one over">›</button><button data-fp="${g.key}|${b}" ${here ? '' : 'disabled'} title="${b} over">»</button></span><span class="s"><b>×${n}</b>${n ? ' ' + esc(g.name) : ''}</span></div>`; }).join('');
    let foot;
    if (out) foot = !total ? 'It left this eon — nothing has moved yet. Move ships to the right, then <b>undo their travel</b>, or <b>click another star</b> to send them there instead.'
      : `<button class="go" data-outundo title="they stay where they are; the rest go on">↶ Undo travel for ${plural(total, 'ship')}</button> — or <b>click another star</b> to send ${total === 1 ? 'it' : 'them'} there; the rest go on to ${esc(where)}.`;
    else if (!total) foot = `Move ships to the right, then <b>click ${P.kind === 'galaxy' ? 'a star' : 'a place'}</b> on the map to send them.`;
    else if (P.kind === 'galaxy') { const R = fleetRange(S, ships.map(s => s.u)), st = Math.min(...ships.map(s => s.u.st ?? 100)); foot = `<b>${plural(total, 'ship')}</b> to send · reach <b>${R.toFixed(1)} ly</b> (by bulk) · the weakest at ${Math.round(st)} % — <b>click a star</b> on the map.`; }
    else foot = `<b>${plural(total, 'ship')}</b> to send — <b>click a place</b> on the map${ships.some(canLeave) ? ', or <button class="x" data-ptogalaxy>another star ▸</button>' : ''}.`;
    P.el.innerHTML = `<div class="fphead"><b>${out ? `Leaving for ${esc(where)}` : `Your fleet at ${esc(where)}`}</b><button class="x" data-fpall title="everything over">⇶ all</button><button class="x" data-pclear title="everything back">⇇ none</button><button class="x" data-fpclose title="close">✕</button></div><div class="cols"><span>${out ? 'leaving' : 'here'}</span><span></span><span>${out ? 'to change' : 'to send'}</span></div>${rows}<div class="foot tiny">${foot}</div>`;
  }
  P.el.hidden = false; placeOverlay(P.el, P.cv, anchor, P.kind === 'system' ? 30 : 26);
}
// THE SYSTEM POP-UP ON THE GALAXY (his ask, 2026-10-18: "click a star system and see its planets; hover one for its details; click a
// colony of mine and get its panel; click outside and go anywhere else"): the star's worlds in a row beside it, the star first
let sysPop = null, outOpen = null;             // outOpen: the star whose stack of departing fleets is spread out
function placeTip(pl) {                               // a world in words: what it is, its size and nature, who is there, what there is to learn
  const own = pl.colony ? null : ownerOfPlace(pl.id), g = gridOf(pl), size = g ? SIZES[sizeClassOf(pl)] : null, pc = LAST && LAST.colonies.find(x => x.pl.id === pl.id), H = hostileIn(S, pl.sys);
  const here = LAST ? LAST.ships.filter(s => !s.u.dest && s.u.at === pl.id).length : 0, learn = topFields(pl).filter(x => x[2] > 0.06).slice(0, 3);
  return `<b>${esc(pl.name)}</b> · ${KIND_WORD[pl.kind]}${size ? ` · ${size.name} ${size.w} × ${size.h}` : ''}<br>${pl.landable ? esc(habWord(habitabilityOf(pl))) : esc(pl.note || '')}`
    + (pc ? `<br><span style="color:#7ef3b0">your colony — ${peopleWord(pc.P.people)} people · industry ${fmt(pc.industry)} · research ${fmt(pc.research)}${pc.water ? '' : pc.waterNeed > 0 ? ` · water ${fmt(pc.waterIn)} / ${fmt(pc.waterNeed)} M` : ' · no water'}</span><br><b>click: open the colony</b>` : own ? `<br><span style="color:${own.col}">${esc(own.E.name)}'s colony</span>` : pl.landable ? '<br>can be settled' : '')
    + (here ? `<br>${plural(here, 'ship')} of yours in orbit` : '') + (H ? `<br><span class="up">⚔ ${esc(hostileWord(H))}</span>` : '')
    + (learn.length ? `<br><span class="tiny">to learn: ${learn.map(([f, now]) => `${DOMAINS[f].name} ${pct(now)}`).join(' · ')}</span>` : '');
}
function renderSysPop() {
  const el = $('sysPop'); if (!el) return; el.hidden = true;
  if (!sysPop || tab !== 'galaxy' || pickCount() || !LAST) return;
  const G = $('gMap')._geo, p = G && G.pos[sysPop], s = sysOf(sysPop); if (!p || !s) return;
  const places = placesIn(sysPop);
  const row = places.map(pl => { const lk = lookOf(pl), r = Math.round(Math.max(6, Math.min(15, lk.size * 1.1))), own = pl.colony ? null : ownerOfPlace(pl.id), ring = pl.colony ? '#7ef3b0' : own ? own.col : 'transparent', pc = LAST.colonies.find(x => x.pl.id === pl.id) || (own && GODC && GODC[own.k] ? GODC[own.k].colonies.find(x => x.pl.id === pl.id) : null);
    const dry = pc && !pc.water && pc.waterIn < pc.waterNeed - 0.5;
    return `<button class="sp ${pl.colony ? 'mine' : ''}" data-spplace="${pl.id}"><i style="width:${2 * r}px;height:${2 * r}px;background:${lk.color};outline:2px solid ${ring};outline-offset:2px"></i><small>${esc(pl.name)}</small>${pl.colony ? `<em>${peopleWord(pl.colony.people)}${dry ? ' · 💧!' : ''}</em>` : own ? `<em style="color:${own.col}">${esc(own.E.name)}${pc ? ' · ' + peopleWord(pc.P.people) : ''}${dry ? ' · 💧!' : ''}</em>` : ''}</button>`; }).join('');
  el.innerHTML = `<div class="fphead"><b>${esc(s.name)}</b><span class="tiny">${STARS[s.type].name}</span><button class="x" data-opensys="${s.id}" title="the star-system screen">open ▸</button><button class="x" data-spclose title="close (or click outside)">✕</button></div><div class="sprow">${row}</div><div class="tiny">Hover a world for its details${places.some(pl => pl.colony) ? ' · click your colony to open it' : ''}${godEmpires() && places.some(pl => !pl.colony && ownerOfPlace(pl.id)) ? ' · click any colony to open it (God mode)' : ''} · click another to see it in the system.</div>`;
  el.hidden = false; placeOverlay(el, $('gMap'), p, 22);
}
document.addEventListener('mouseover', e => { const b = e.target.closest?.('[data-spplace], [data-sendplace]'), tip = $('cpTip'); if (!b) return; const pl = placeOf(b.dataset.spplace || b.dataset.sendplace); if (!pl) return; tip.innerHTML = placeTip(pl); tip.style.display = 'block'; const r = b.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 300, r.left) + 'px'; tip.style.top = (r.bottom + 6) + 'px'; });
document.addEventListener('mouseout', e => { if (e.target.closest?.('[data-spplace], [data-sendplace]') && !e.relatedTarget?.closest?.('[data-spplace], [data-sendplace]')) $('cpTip').style.display = 'none'; });
document.addEventListener('click', e => {
  if (e.target.closest('[data-spclose]')) { sysPop = null; $('cpTip').style.display = 'none'; return refresh(); }
  const b = e.target.closest('[data-spplace]'); if (b) { const pl = placeOf(b.dataset.spplace); $('cpTip').style.display = 'none'; if (!pl) return; if (pl.colony) return openColPop(pl.id); const own = godEmpires() ? ownerOfPlace(pl.id) : null; if (own) return openColPop(pl.id, own.k); sysPop = null; return openSystem(pl.sys, pl.id); }
  if (sysPop && !e.target.closest('#sysPop') && e.target.id !== 'gMap') { sysPop = null; $('sysPop').hidden = true; }   // a click anywhere else closes it (a click on the map is the map's own)
});
function renderSendBadge() {
  for (const [id, cvId, kind, tabName] of [['sendBadge', 'gMap', 'galaxy', 'galaxy'], ['sSendBadge', 'sMap', 'system', 'system']]) {
    const el = $(id); if (!el) continue; el.hidden = true;
    if (!LAST || !sendTo || !pickScope || (pickScope.kind === 'outgoing' ? 'galaxy' : pickScope.kind) !== kind || tab !== tabName) continue;
    const cv = $(cvId), G = cv._geo, p = G && G.pos[sendTo]; if (!p) continue;
    const ships = picked(scopeGroups(LAST)); if (!ships.length) continue;
    let line;
    if (kind === 'galaxy') {
      const R = fleetRange(S, ships.map(s => s.u)), st = Math.min(...ships.map(s => s.u.st ?? 100)), d = lyBetween(S, pickScope.sys, sendTo), eff = d > 0 ? effectiveLy(S, pickScope.sys, sendTo) / d : 1, strain = Math.max(0, ...ships.map(s => s.u.strain || 0)), f = forecast(R, d, LAST.warp, strain, st, eff), z = zoneOfSys(S, sendTo), foe = hostileIn(S, sendTo), them = (S.others || []).filter(o => o.fleets.some(x => x.sys === sendTo) || o.colonies.some(x => x.sys === sendTo));
      // THE SYSTEM, IN THE BADGE (his ask, 2026-10-18: "open the system as a pop-up and let me pick exactly where to send it"): its
      // places in a row, the star first — click one, then Send here; a colony of yours ringed, another empire's in its colour
      const dest = placeOf(sendDest()), places = placesIn(sendTo);
      const row = places.map(pl => { const lk = lookOf(pl), r = Math.round(Math.max(5, Math.min(12, lk.size * 0.9))), own = pl.colony ? null : ownerOfPlace(pl.id), ring = pl.colony ? '#7ef3b0' : own ? own.col : 'transparent';
        return `<button class="sp ${dest && dest.id === pl.id ? 'on' : ''}" data-sendplace="${pl.id}" title="${esc(pl.name)} — ${KIND_WORD[pl.kind]}${pl.colony ? ' · your colony' : own ? ` · ${esc(own.E.name)}'s colony` : pl.landable ? ' · can be settled' : ''}"><i style="width:${2 * r}px;height:${2 * r}px;background:${lk.color};outline:2px solid ${ring};outline-offset:1px"></i><small>${esc(pl.name)}</small></button>`; }).join('');
      line = `<b>${plural(ships.length, 'ship')} → ${esc(dest ? dest.name : sysOf(sendTo).name)}${dest && dest.kind !== 'star' ? ` <span class="tiny">(${esc(sysOf(sendTo).name)})</span>` : ''}</b><div class="sprow">${row}</div><div class="tiny">${d.toFixed(1)} ly · ${plural(f.eons, 'eon')} · <b class="${f.chance < 0.9 ? 'up' : 'down'}">${f.chance >= 1 ? 'sure' : Math.round(f.chance * 100) + ' %'}</b> to make it${f.chance < 1 ? ` (in at ~${Math.round(f.expected)} %)` : ''} · ${ZONE.names[z]}${z < 5 ? '' : ' — no restocking there'}${foe ? ` · <b class="up">⚔ ${esc(hostileWord(foe))}</b>` : ''}${them.length ? ` · <b class="up">${them.map(o => `<span style="color:${o.color}">${esc(o.name)}</span>`).join(', ')} ${them.some(o => o.fleets.some(x => x.sys === sendTo)) ? 'has a fleet there — a fight on arrival' : 'holds a colony there — a blockade on arrival'}</b>` : ''}</div>`;
    } else { const to = placeOf(sendTo), eta = Math.max(...ships.map(s => T.travel[s.u.klass] || 0)), own = ownerOfPlace(sendTo); line = `<b>${plural(ships.length, 'ship')} → ${esc(to.name)}</b><div class="tiny">${plural(eta, 'eon')}${own ? ` · <b style="color:${own.col}">${esc(own.E.name)}'s colony</b>${ships.some(s => s.u.people > 0) ? ' — troops aboard can land there' : ''}` : to.landable && !to.colony && ships.some(s => s.u.people > 0) ? ' · settlers aboard can land there' : ''}</div>`; }
    el.innerHTML = `${line}<div class="acts"><button class="go" data-psend>⤵ Send here</button><button class="x" data-pcancel>✕ cancel</button></div>`;
    el.hidden = false; placeOverlay(el, cv, { x: p.x - el.offsetWidth / 2, y: p.y + 30 }, 0);   // under the star or place, centred (clear of the fleet pop-up)
  }
}
const ownerOfPlace = id => foreignEmpires().find(x => x.E.places.find(q => q.id === id)?.colony) || null;
function parkedAt(e) {                               // the row of triangles under a place on the system map (your parked ships): its place id
  const cv = $('sMap'), G = cv._geo; if (!G || !LAST) return null;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  for (const pl of placesIn(selSys)) { const p = G.pos[pl.id]; if (!p) continue; const n = Math.min(6, S.ships.filter(u => !u.dest && u.at === pl.id).length); if (!n) continue; const { size } = lookOf(pl), y = p.y + size + 12, half = (n - 1) * 6 + 8; if (Math.abs(my - y) <= 8 && Math.abs(mx - p.x) <= half) return pl.id; }
  return null;
}
document.addEventListener('click', e => {
  const fp = e.target.closest('[data-fp]'); if (fp) { const [key, d] = fp.dataset.fp.split('|'); const g = scopeGroups(LAST).find(x => x.key === key); if (!g) return; picks.set(key, clamp((picks.get(key) || 0) + +d, 0, g.ships.length)); return refresh(); }
  if (e.target.closest('[data-fpall]')) { for (const g of scopeGroups(LAST)) if (canLeave(g.ships[0]) || pickScope.kind === 'system') picks.set(g.key, g.ships.length); return refresh(); }
  if (e.target.closest('[data-fpclose]')) { picks = new Map(); sendTo = null; if (pickScope && pickScope.kind === 'outgoing') pickScope = null; if (tab === 'galaxy') gMode = 'system'; fleetPopPlace = null; return refresh(); }
});
function openSystem(id, placeId) {
  selSys = gSel = id;
  selPlace = placeId || (placesIn(id).find(p => p.colony) || placeOf(sysOf(id).star)).id;
  hoverPlace = null; $('sHover').innerHTML = '';
  go('system');
}
function seedOf(text) {                               // a number is used as it is; a word is turned into one
  const s = String(text).trim();
  if (/^\d{1,9}$/.test(s)) return Number(s);
  let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function startGame(text, n = 1, stars = GALAXY.count, { me = 0, focus = null } = {}) {   // n > 1: a WORLD of n empires, you `me`, the rest played by ai.js (each leaning its focus); stars: the sector's size (galaxyOf)
  const seedText = String(text).trim() || '7', galaxy = galaxyOf(stars);
  leaveOutline(); simStop(false); REPLAY = null; GOD = false; godPick = null;
  if (n > 1) { W = createWorld(seedText, n, { galaxy }); W.me = me; W.focus = focus; S = W.empires[me]; }
  else { W = null; S = newState(seedOf(seedText), { galaxy }); S.seedText = seedText; }
  freshView(); save(); refresh();
}
// THE SETUP (his ask, 2026-10-17: "instead of starting as a game: how many stars, how many empires, which are AIs and which are
// players — by default all AI — each one's focus; then run it and see"): the galaxy panel's New game block. All AI → a SIMULATION
// runs in the game itself (the same heads, the same world — no tool, no other engine), eon by eon in the background, God mode on,
// and ends as a replay to scrub; any empire marked You → a game, the rest played by the heads.
const FOCUS_CHOICES = [['default', 'default (exterminate)'], ['mid', 'mid — never moves'], ['expand', 'Expansion'], ['exploit', 'Exploitation'], ['explore', 'Exploration'], ['exterm', 'Extermination']];
let setup = { seed: null, stars: GALAXY.count, n: 3, who: ['ai', 'ai', 'ai', 'ai', 'ai'], focus: ['default', 'default', 'default', 'default', 'default'], cap: 1200 };
function setupHtml() {
  const n = setup.n, rows = Array.from({ length: n }, (_, i) => `<div class="shiprow" style="display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;padding:4px 8px"><i class="dot" style="background:${WORLD.colors[i % WORLD.colors.length][0]}"></i><b>${WORLD.names[i]}</b>
    <select data-su="who|${i}" ${n === 1 ? 'disabled' : ''} title="an AI plays it, or you do">${[['ai', 'AI'], ['you', 'You']].map(([v, w]) => `<option value="${v}" ${(n === 1 ? 'you' : setup.who[i]) === v ? 'selected' : ''}>${w}</option>`).join('')}</select>
    <select data-su="focus|${i}" ${setup.who[i] === 'you' && n > 1 ? 'disabled' : ''} title="the focus this empire's head leans to">${FOCUS_CHOICES.map(([v, w]) => `<option value="${v}" ${setup.focus[i] === v ? 'selected' : ''}>${w}</option>`).join('')}</select></div>`).join('');
  const sim = n > 1 && setup.who.slice(0, n).every(w => w === 'ai');
  return `<details id="gSetup" open><summary style="cursor:pointer"><b>New game or simulation</b></summary>
    <div style="display:flex;gap:6px;margin:6px 0 4px;align-items:center;flex-wrap:wrap"><span class="tiny">Seed</span><input type="text" id="gSeed" value="${esc(setup.seed ?? seedDraft ?? S.seedText ?? S.seed)}" style="flex:1;min-width:80px"><button data-randseed title="put a random seed in the box">Random</button>
      <select data-su="stars" title="how big a sector: the same density, more room">${[50, 100, 150, 200].map(v => `<option value="${v}" ${v === setup.stars ? 'selected' : ''}>${v} stars</option>`).join('')}</select>
      <select data-su="n" title="how many empires in all (1 = you alone against the hostile fleets)">${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${v === setup.n ? 'selected' : ''}>${v === 1 ? '1 empire — alone' : v + ' empires'}</option>`).join('')}</select></div>
    ${rows}
    <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap">${sim ? `<span class="tiny">Simulate to eon</span><input type="number" data-su="cap" value="${setup.cap}" min="10" max="5000" style="width:72px"><button class="go" data-newseed>▶ Simulate — every empire an AI</button>` : `<button class="go" data-newseed>▶ Start — you play ${WORLD.names[setup.who.slice(0, n).indexOf('you') < 0 ? 0 : setup.who.slice(0, n).indexOf('you')]}</button>`}</div>
    <div class="tiny" style="margin-top:4px">${sim ? 'The heads play every empire inside the game — no outside engine, no tokens; it runs in the background and ends as a replay you can scrub with God mode on.' : 'Mark every empire AI to watch them fight it out instead.'}</div></details>`;
}
function simStart() {
  const seedText = String($('gSeed')?.value || setup.seed || '7').trim() || '7', n = setup.n, focus = setup.focus.slice(0, n);
  leaveOutline(); REPLAY = null; godPick = null;
  W = createWorld(seedText, n, { galaxy: galaxyOf(setup.stars) }); W.me = null; W.focus = focus; S = W.empires[0];
  const log = newLog(W, { player: 'game', focus });
  const brains = W.empires.map((E, k) => makeBrain(W, E, { focus: focus[k], onAct: (E2, a) => log.empires[E2.empire].actions.push({ eon: W.eon, ...a }) }));
  SIM = { W, log, brains, cap: Math.max(10, Math.min(5000, +setup.cap || 1200)), running: false, snaps: new Map([[1, worldSnapshot(W)]]), snapEvery: 50, t0: performance.now() };
  GOD = true; gMode = 'god'; freshView(); go('galaxy'); simRun();
}
function simRun() {                                  // chunks of ~40 ms, so the page breathes; the map redraws every ten eons
  if (!SIM || SIM.running) return; SIM.running = true;
  const tick = () => {
    if (!SIM || !SIM.running) return;
    const t0 = performance.now(); let drew = false;
    while (SIM.running && SIM.W.winner == null && SIM.W.eon <= SIM.cap && performance.now() - t0 < 40) {
      campaignEon(SIM.W, SIM.brains, SIM.log); S = SIM.W.empires[REPLAY ? 0 : (S.empire ?? 0)];
      if (SIM.W.eon % SIM.snapEvery === 0) SIM.snaps.set(SIM.W.eon, worldSnapshot(SIM.W));
      if (SIM.W.eon % 10 === 0) { refresh(); drew = true; }
    }
    if (!drew) renderReplayBar();
    if (SIM.W.winner != null || SIM.W.eon > SIM.cap) return simFinish();
    setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
function simStop(toReplay = true) { if (!SIM) return; SIM.running = false; if (toReplay) simFinish(); else SIM = null; }
function simFinish() {                               // the simulation becomes a replay: its world as it stands, its snapshots, its log (⤓ to keep it)
  if (!SIM) return; const { W: w, log, brains, snaps, snapEvery } = SIM; SIM = null;
  finishLog(w, log, brains);
  REPLAY = { log, world: w, view: 0, last: log.eons.length ? log.eons.at(-1).eon : w.eon, snaps, snapEvery, ended: true };
  S = w.empires[0]; gMode = 'god'; refresh(); say(w.winner != null ? `${w.empires[w.winner].name} holds the galaxy — the simulation is a replay now: rewind it, or save its log` : 'The simulation stopped — it is a replay now: rewind it, or save its log');
}
// THE BATTLE HISTORY (his ask, 2026-10-17): the run's big battles and the falls, from the log — click one to go to that eon and
// watch it (the battle as the attacker recorded it, God mode on so the badge is there too)
function battleListHtml() {
  const log = REPLAY && REPLAY.log; if (!log) return '';
  const hs = log.highlights || [], names = (log.empires || []).map(e => e.name), col = k => (W && W.empires[k] && W.empires[k].look.colA) || '#fff';
  if (!hs.length) return `<div class="tiny">${log.battles ? 'No battle stood out in this run.' : 'This log was written before the battle history existed — run it again to get one.'}</div>`;
  return `<div class="tiny" style="margin-bottom:6px">${log.battles ? `${log.battles.length} battles in the run, median size ${fmt(log.baseline.median)}; a highlight is ${HIGHLIGHT.times}× that or more.` : ''}</div>` + hs.map(h => h.kind === 'battle'
    ? `<div class="unit" data-bgo="${h.eon}|${h.sys}|${h.a}" style="cursor:pointer" title="go to eon ${h.eon + 1} and watch it"><span><b>eon ${h.eon}</b> · ${esc(h.where || h.sys)} — <b style="color:${col(h.a)}">${esc(names[h.a] || '?')}</b> ${h.nA} <span class="tiny">(${fmt(h.worthA)})</span> vs <b style="color:${col(h.b)}">${esc(names[h.b] || '?')}</b> ${h.nB} <span class="tiny">(${fmt(h.worthB)})</span></span><span class="st">${h.winner == null ? 'draw' : esc(names[h.winner]) + ' won'}</span><div class="tiny">${h.nA + h.nB} ships, ${fmt(h.size)} of worth · lost ${h.lostA} / ${h.lostB} · ▶ watch</div></div>`
    : `<div class="unit" data-bgo="${h.eon}||" style="cursor:pointer" title="go to eon ${h.eon + 1}"><span><b>eon ${h.eon}</b> · ${h.kind === 'win' ? '🏆' : '☠'} ${esc(h.text)}</span><span></span></div>`).join('');
}
function openBattleList(x, y) { const el = $('battlePop'); if (!el || !REPLAY) return; el.innerHTML = `<h2><span>⚔ The run's battles</span><button class="x" data-bclose title="close (Esc)">✕</button></h2>${battleListHtml()}`; el.hidden = false; const r = el.getBoundingClientRect(); el.style.left = Math.max(12, Math.min(x, innerWidth - r.width - 12)) + 'px'; el.style.top = Math.max(60, Math.min(y, innerHeight - r.height - 12)) + 'px'; }
function closeBattleList() { const el = $('battlePop'); if (el) el.hidden = true; }
document.addEventListener('click', e => {
  if (e.target.closest('[data-blist]')) return openBattleList(e.clientX - 200, e.clientY + 16);
  if (e.target.closest('[data-bclose]')) return closeBattleList();
  const g = e.target.closest('[data-bgo]'); if (g) { const [eon, sys, k] = g.dataset.bgo.split('|'); closeBattleList(); replayGoto(+eon + 1); if (sys && W) { if (!GOD && W) { GOD = true; gMode = 'god'; go('galaxy'); } const E = W.empires[+k], b = E && (E.battles || []).find(x => x.sys === sys); if (b) watchBattle(b.id, E); else say('That battle is not in the record at this eon'); } return; }
  const el = $('battlePop'); if (el && !el.hidden && !e.target.closest('#battlePop') && !e.target.closest('[data-blist]')) closeBattleList();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBattleList(); });
function saveLog() {                                 // the replay's log as a file (the tool's format: load it again any time)
  const log = REPLAY && REPLAY.log; if (!log) return;
  const blob = new Blob([JSON.stringify(log)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `world-${log.seedText}-${log.n}x${(log.galaxy && log.galaxy.count) || GALAXY.count}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let foesDraft = 1, starsDraft = GALAXY.count;        // (older drafts, kept for the quick "new game" button)
function freshView() { curDesign = S.designs[0]?.id || null; selMod = null; chipsFor = null; gMode = 'system'; gView = { z: 1, x: 0, y: 0 }; selSys = gSel = S.homeSys; selPlace = S.homePlace || 'home'; newIds = new Set(); seedDraft = null; picks = new Map(); pickScope = null; sendTo = null; }   // a new game, or another empire's eyes: nothing chosen yet

// =====================================================================
// STAR SYSTEM — the places of one system
// =====================================================================
function mapGeo(cv) {
  const G = fitCanvas(cv); G.R = Math.max(20, Math.min(G.w, G.h) / 2 - 40); G.pos = {};   // R never negative on a small canvas (it threw and blanked the panel)
  for (const pl of placesIn(selSys)) {
    let x = G.cx + Math.cos(pl.a) * pl.r * G.R, y = G.cy + Math.sin(pl.a) * pl.r * G.R;
    if (pl.moon) { x += 34; y -= 27; }
    G.pos[pl.id] = { x, y };
  }
  return G;
}
function drawMap(c) {
  const cv = $('sMap'); if (!cv || !cv.clientWidth) return;
  const G = mapGeo(cv), g = cv.getContext('2d'), here = placesIn(selSys), sys = sysOf(selSys), foreign = foreignEmpires();
  g.clearRect(0, 0, G.w, G.h);
  g.strokeStyle = 'rgba(170,210,255,.09)';
  for (const r of new Set(here.filter(p => p.r > 0).map(p => p.r))) { g.beginPath(); g.arc(G.cx, G.cy, r * G.R, 0, 7); g.stroke(); }
  // the route a pick would take: a dotted line from where the picked ships rest to the place clicked (the send-here badge sits there)
  if (sendTo && pickScope && pickScope.kind === 'system' && G.pos[pickScope.place] && G.pos[sendTo]) { const a = G.pos[pickScope.place], b = G.pos[sendTo]; g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
  // ships under way inside this system (a crossing to another star is drawn on the galaxy map)
  for (const u of S.ships) {
    const a = G.pos[u.at], b = u.dest && G.pos[u.dest]; if (!a || !b) continue;
    const k = Math.max(0.12, 1 - u.eta / (u.trip || T.travel[u.klass] || 1)), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(126,243,176,.45)'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#7ef3b0'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  // THE WATER (his ask, 2026-10-18: "a dotted line that shows the trade route"): blue dots from each source in this system to the dry
  // colony it waters; water from another star comes in from the edge, toward that star
  for (const pc of c.colonies) {
    if (pc.water || pc.pl.sys !== selSys) continue; const b = G.pos[pc.pl.id]; if (!b) continue;
    for (const r of pc.waterRoutes) {
      const a = r.sys === selSys ? G.pos[r.from] : null; g.setLineDash([2, 5]); g.strokeStyle = '#4fa3ff'; g.lineWidth = 2; g.globalAlpha = 0.75;
      if (a && a !== b) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      else if (!a) { const s0 = sysOf(selSys), s1 = sysOf(r.sys), ang = Math.atan2(s1.y - s0.y, s1.x - s0.x), ex = b.x + Math.cos(ang) * 130, ey = b.y + Math.sin(ang) * 130; g.beginPath(); g.moveTo(ex, ey); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; g.fillStyle = '#4fa3ff'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(`water from ${s1.name}`, ex, ey - 6); }
      g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 1;
    }
  }
  g.textAlign = 'center';
  for (const pl of here) {
    const p = G.pos[pl.id], { color, size } = lookOf(pl), st = c.studied.find(s => s.pl.id === pl.id);
    if (pl.kind === 'star') { const gr = g.createRadialGradient(p.x, p.y, 3, p.x, p.y, size * 2.2); gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.45, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, size * 2.2, 0, 7); g.fill(); }
    else if (pl.kind === 'anomaly') { g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4); g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color; g.fillRect(-size, -size, size * 2, size * 2); g.restore(); }
    else { g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, size, 0, 7); g.fill(); }
    if (pl.colony) { g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, size + 5, 0, 7); g.stroke(); }
    // ANOTHER EMPIRE's colony here (his ask, 2026-10-16: "you can't see their planets"): a ring in its colour, solid for its homeworld; its ships below
    const owner = foreign.find(x => x.E.places.find(q => q.id === pl.id)?.colony), theirHome = owner && owner.E.homePlace === pl.id;
    if (owner) { g.strokeStyle = owner.col; g.lineWidth = theirHome ? 2.5 : 1.5; g.setLineDash(theirHome ? [] : [4, 3]); g.beginPath(); g.arc(p.x, p.y, size + 5, 0, 7); g.stroke(); g.setLineDash([]); }
    if (pl.id === selPlace || pl.id === hoverPlace) { g.strokeStyle = pl.id === selPlace ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, size + 10, 0, 7); g.stroke(); }
    g.lineWidth = 1;
    if (st && st.power > 0) { g.fillStyle = '#5fe3d0'; g.beginPath(); g.arc(p.x + size + 6, p.y - size - 4, 4, 0, 7); g.fill(); }       // someone is studying it
    const pcw = !pl.colony ? null : c.colonies.find(x => x.pl.id === pl.id);                                                              // a dry colony: a drop, red when its farms want more water
    if (pcw && !pcw.water) { const short = pcw.waterIn < pcw.waterNeed - 0.5 || (pcw.waterReach <= 0); g.font = '13px sans-serif'; g.textAlign = 'right'; g.fillText('💧', p.x - size - 6, p.y - size); if (short) { g.fillStyle = '#ff7979'; g.font = 'bold 13px sans-serif'; g.textAlign = 'left'; g.fillText('!', p.x - size - 5, p.y - size); } g.textAlign = 'center'; }
    g.fillStyle = owner ? owner.col : pl.colony ? '#e8f0ff' : '#9eb3d8'; g.font = (pl.colony || owner ? 'bold ' : '') + '12px sans-serif';
    g.fillText(owner ? `${pl.name} · ${owner.E.name}` : pl.name, p.x, p.y - (pl.kind === 'star' ? size * 1.9 : size) - 12);
    const parked = S.ships.filter(u => !u.dest && u.at === pl.id);
    parked.slice(0, 6).forEach((u, i) => { const x = p.x - (Math.min(parked.length, 6) - 1) * 6 + i * 12, y = p.y + size + 12; g.fillStyle = u.klass === 'starship' ? '#7ef3b0' : '#ffb347'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.fill(); });
    let row = 0;
    for (const { E, col } of foreign) { const theirs = E.ships.filter(u => !u.dest && u.at === pl.id); if (!theirs.length) continue; row++; theirs.slice(0, 6).forEach((u, i) => { const x = p.x - (Math.min(theirs.length, 6) - 1) * 6 + i * 12, y = p.y + size + 12 + 11 * row; g.fillStyle = col; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.fill(); }); if (theirs.length > 6) { g.fillStyle = col; g.font = 'bold 9px sans-serif'; g.fillText(`+${theirs.length - 6}`, p.x + 40, p.y + size + 15 + 11 * row); } }
  }
  g.textAlign = 'left';
  g.fillStyle = '#9eb3d8'; g.font = 'bold 12px sans-serif'; g.fillText(`${sys.name.toUpperCase()} SYSTEM`, 14, G.h - 28);
  g.font = '11px sans-serif'; g.fillText(`${STARS[sys.type].name} · ${sys.home ? 'your home' : `${plural(starEons(sysDistance(S, S.homeSys, sys.id), c.warp), 'eon')} from Home by star drive`}`, 14, G.h - 12);
  cv._geo = G;
  renderFleetPop(false); renderSendBadge();
}
function placeAt(e) {
  const cv = $('sMap'), G = cv._geo; if (!G) return null;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 30;
  for (const pl of placesIn(selSys)) { const p = G.pos[pl.id]; if (!p) continue; const d = Math.hypot(mx - p.x, my - p.y) - lookOf(pl).size; if (d < bd) { bd = d; best = pl.id; } }
  return best;
}
$('sMap').addEventListener('mousemove', e => {
  const id = placeAt(e); if (id === hoverPlace) return;
  hoverPlace = id; $('sMap').style.cursor = id ? 'pointer' : 'default';
  const pl = id && placeOf(id);
  $('sHover').innerHTML = pl ? `<b>${esc(pl.name)}</b> — ${esc(pl.note)}<br>to be learned here: ${topFields(pl).filter(x => x[2] > 0.06).map(x => `${DOMAINS[x[0]].name} ${pct(x[1])}`).join(' · ')}` : '';
  if (LAST) drawMap(LAST);
});
$('sMap').addEventListener('click', e => {
  const parked = parkedAt(e); if (parked && !(pickCount() && pickScope?.kind === 'system' && parked !== pickScope.place)) { selPlace = parked; fleetPopPlace = parked; return refresh(); }   // the triangles under a place: its fleet pop-up
  const id = parked || placeAt(e); if (!id) return;
  if (pickCount() && pickScope?.kind === 'system' && id !== pickScope.place) { sendTo = id; return refresh(); }   // ships picked: a click on another place is where they go
  if (id !== selPlace) fleetPopPlace = null; selPlace = id; refresh();
  if (placeOf(id)?.colony && !parked) openColPop(id);  // one of your colonies: its pop-up (his call — the colony over the map, not in a sidebar)
  else if (!parked && godEmpires()) { const own = ownerOfPlace(id); if (own) openColPop(id, own.k); }   // God mode: anyone's, read-only
});

function renderSystem(c) {
  if (!sysOf(selSys)) selSys = S.homeSys;
  if (placeOf(selPlace)?.sys !== selSys) selPlace = sysOf(selSys).star;
  drawMap(c);
  const pl = placeOf(selPlace), st = c.studied.find(s => s.pl.id === pl.id), pc = c.colonies.find(x => x.pl.id === pl.id), mine = presence(c);
  const byHome = [...S.systems].map(s => [s, sysDistance(S, S.homeSys, s.id)]).sort((a, b) => a[1] - b[1]);
  // THE OTHER EMPIRES in this system (his ask, 2026-10-16): who holds what, whose fleet rests here, who blockades whom
  const foreign = foreignEmpires(), owner = foreign.find(x => x.E.places.find(q => q.id === pl.id)?.colony) || null;
  const foreignNotes = foreign.map(({ E, k, col }) => {
    const cols = E.places.filter(q => q.colony && q.sys === pl.sys), here = E.ships.filter(u => !u.dest && sysOfPlaceOf(E, u.at) === pl.sys), worth = GODC && GODC[k] ? GODC[k].ships.filter(x => !x.u.dest && sysOfPlaceOf(E, x.u.at) === pl.sys).reduce((a, x) => a + x.t.cost, 0) : 0;
    if (!cols.length && !here.length) return '';
    const iBlock = W.sieges[`${pl.sys}|${E.empire}|${S.empire}`], theyBlock = W.sieges[`${pl.sys}|${S.empire}|${E.empire}`];
    const armedHere = GODC && GODC[k] ? GODC[k].ships.some(x => !x.u.dest && x.t.dps > 0 && sysOfPlaceOf(E, x.u.at) === pl.sys) : false, myArmed = c.ships.some(x => !x.u.dest && x.t.dps > 0 && placeOf(x.u.at)?.sys === pl.sys);
    return `<div class="note" style="margin-bottom:8px;border-color:${col}"><b style="color:${col}">${esc(E.name)}</b>${cols.length ? ` holds ${cols.map(q => esc(q.name) + (q.id === E.homePlace ? ' (its homeworld)' : '') + ', ' + peopleWord(q.colony.people) + ' people').join(' and ')} here` : ''}${here.length ? `${cols.length ? ';' : ''} ⚔ a fleet of ${plural(here.length, 'ship')} (worth ${fmt(worth)}) rests here — your ships resting anywhere in this system fight it at the end of the eon` : ''}.${iBlock ? ` <b class="down">Your fleet blockades ${cols.length > 1 ? 'them' : 'it'}: ${iBlock} of ${WORLD.siege} eons — at ${WORLD.siege} the colon${cols.length > 1 ? 'ies are' : 'y is'} destroyed (the world is then free to settle).</b>` : cols.length && myArmed && !armedHere ? ` <b class="down">Your armed ships here start a blockade at the end of the eon: ${WORLD.siege} eons unbroken and the colon${cols.length > 1 ? 'ies are' : 'y is'} destroyed.</b>` : cols.length && myArmed && armedHere ? ' <b class="up">Their armed ships here stop any blockade — fight first.</b>' : cols.length && !myArmed ? ' <span class="tiny">Only armed ships blockade: bring warships here.</span>' : ''}${theyBlock ? ` <b class="up">Its fleet blockades your colonies here: ${theyBlock} of ${WORLD.siege} eons — at ${WORLD.siege} they are destroyed. Bring armed ships to break it.</b>` : ''}</div>`;
  }).join('');
  let h = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><span class="tiny">System</span><select data-syspick style="flex:1">${byHome.map(([s]) => `<option value="${s.id}" ${s.id === selSys ? 'selected' : ''}>${mine.has(s.id) ? '● ' : ''}${esc(s.name)} — ${STARS[s.type].name}</option>`).join('')}</select><button data-tab="galaxy">Galaxy map</button></div>
    ${hostileIn(S, pl.sys) ? `<div class="note" style="margin-bottom:8px">⚔ <b>${esc(hostileWord(hostileIn(S, pl.sys)))}</b> holds this system. Your ships resting anywhere in it fight it at the end of the eon.</div>` : ''}${foreignNotes}<h2>${esc(pl.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${KIND_WORD[pl.kind]}${owner ? ` · <b style="color:${owner.col}">${esc(owner.E.name)}'s colony</b>` : pl.colony ? ' · settled' : pl.landable ? ' · not settled' : ' · orbit only'}</span></h2><div class="tiny" style="margin-bottom:8px">${esc(pl.colony ? pl.note.replace(', never settled', '') : pl.note)}</div>`;

  // what there is to learn here
  const tf = topFields(pl), strong = tf.filter(x => x[2] > 0.06), weak = tf.length - strong.length;
  h += `<h3>What there is to learn here</h3>` + strong.map(([f, now, base]) => `<div class="potrow"><span>${DOMAINS[f].name}</span><div class="potbar"><div style="width:${now * 100}%"></div></div><span class="tiny">${pct(now)}${now < base - 0.005 ? ` <span title="it was ${pct(base)} before you took finds from it">worn</span>` : ''}</span></div>`).join('')
    + `<div class="tiny">The other ${weak} fields: about 5% each.</div>`;
  const who = [];
  if (st.onGround > 0) who.push(`${fmt(st.onGround)} research on the ground`);
  if (st.inOrbit > 0) who.push(`${fmt(st.inOrbit)} from orbit (counts ${T.orbit * 100}%)`);
  if (pl.kind === 'star' && (c.sysResearch[pl.sys] || 0) - st.inOrbit > 0) who.push(`every other lab in this system, at ${T.starShare * 100}%`);
  h += `<div class="${who.length ? 'okbox' : 'note'}" style="margin-top:6px">${who.length ? 'Being studied: ' + who.join(' · ') + '.' : `Nobody is studying it, so it adds nothing to your research. ${pl.landable ? 'Settle it, or park a ship with a lab in orbit.' : 'Park a ship or a station with a lab in orbit.'}`}</div>`;

  // the colony: a line of figures here — the colony itself (development, effort, the surface, the production line) is its POP-UP
  if (pc) {
    const P = pc.P, n = pc.G ? counts(pc.G) : null, line = pc.queue.filter(q => !q.gone);
    h += `<h3>The colony</h3>
      <div class="tiny" style="margin:4px 0 8px">${peopleWord(P.people)} people of ${peopleWord(pc.housing)} room <b class="${pc.dPeople < 0 ? 'up' : 'down'}">${pc.dPeople < 0 ? '−' : '+'}${peopleWord(Math.abs(pc.dPeople))}</b> · industry ${fmt(pc.industry)} · research ${fmt(pc.research)} · ${pc.water ? `food ${signed(pc.surplus)}` : '<b class="up">no water</b>'}${n ? ` · ${n.total} of ${pc.G.cells.length * SLOT.per} slots built` : ''}${pc.blockaded ? ` · <b class="up">blockaded ${pc.blockaded} of ${WORLD.siege} eons</b>` : ''}${line.length ? ` · building ${esc(line[0].d.name)}${line.length > 1 ? ` and ${plural(line.length - 1, 'more project')}` : ''}` : ' · the production line is empty'}</div>
      <button class="go" data-colpop="${pl.id}" style="width:100%">Open the colony ▸ <span class="tiny">development · effort · production</span></button>
      <h3>Districts built here</h3>${P.structures.map(u => `<span class="chip" style="border-color:var(--line)">${esc(u.name)}</span>`).join('') || '<span class="tiny">none</span>'}`;
  }
  // ANOTHER EMPIRE's colony: what it is, and LANDING TROOPS (his rule: a colony is taken by troops, never by siege)
  if (owner) {
    const Q = owner.E.places.find(q => q.id === pl.id).colony, odds = invasionOdds(W, S, pl.id);
    h += `<h3 style="color:${owner.col}">${esc(owner.E.name)}'s colony</h3><div class="tiny">${peopleWord(Q.people)} people${pl.id === owner.E.homePlace ? ' · <b>its HOMEWORLD</b> — taken, the empire is gone' : ''} · ${Q.factories || 0} factor${Q.factories === 1 ? 'y' : 'ies'} · ${plural(Q.structures.length, 'structure')}${Q.blockaded ? ` · <b class="up">blockaded ${Q.blockaded} of ${WORLD.siege} eons</b>` : ''}</div>
      <div class="note" style="margin-top:6px">Militia: <b>${peopleWord(odds.militia)}</b> (1 in ${Math.round(1 / T.ground.militia)} of its people). ${odds.ships.length ? `Your ${plural(odds.ships.length, 'ship')} here ${odds.ships.length === 1 ? 'carries' : 'carry'} <b>${peopleWord(odds.troops)}</b> troops, worth <b>${peopleWord(odds.power)}</b> on the ground (${T.ground.ratio} militia each) — ${odds.power > odds.militia ? '<b class="down">enough to take it</b>' : '<b class="up">not enough: they would be thrown back and lost</b>'}.` : `Bring ships with people aboard (a habitat) here to land troops — each trooper is worth ${T.ground.ratio} of the militia, so about ${peopleWord(odds.militia / T.ground.ratio)} aboard will do.`}${odds.defended ? ' <b class="up">Its fleet defends the system — clear it first.</b>' : ''}
      ${odds.ships.length && !odds.defended ? `<div class="acts" style="margin-top:4px"><button class="${odds.power > odds.militia ? 'go' : 'x'}" data-invade="${pl.id}">⚔ Land the troops${odds.power > odds.militia ? '' : ' anyway'}</button></div>` : ''}${godEmpires() ? `<div class="acts" style="margin-top:6px"><button class="go" data-colpopk="${owner.k}|${pl.id}">👁 Open ${esc(owner.E.name)}'s colony ▸</button></div>` : ''}</div>`;
    const theirs = GODC && GODC[owner.k] ? GODC[owner.k].ships.filter(x => !x.u.dest && x.u.at === pl.id) : [];
    if (theirs.length) h += `<h3 style="color:${owner.col}">${esc(owner.E.name)}'s ships here</h3>` + theirs.map(x => godShipLine(owner.E, owner.k, x, false)).join('');
  }
  for (const { E, k, col } of foreign) {              // other empires' ships at this place (not the owner's — shown above)
    if (owner && E === owner.E) continue; const theirs = GODC && GODC[k] ? GODC[k].ships.filter(x => !x.u.dest && x.u.at === pl.id) : []; if (!theirs.length) continue;
    h += `<h3 style="color:${col}">${esc(E.name)}'s ships here</h3>` + theirs.map(x => godShipLine(E, k, x, false)).join('');
  }
  // ships, as STACKS by design (FLEETS): pick how many, then click a place on the map — or, for ships that can, a star (▸)
  if (!pickScope || pickScope.kind !== 'system' || pickScope.place !== pl.id) setScope({ kind: 'system', place: pl.id });
  const groups = groupsOf(c.ships.filter(s => !s.u.dest && s.u.at === pl.id));
  const coming = c.ships.filter(s => s.u.dest === pl.id), leaving = c.ships.filter(s => s.u.dest && s.u.at === pl.id && s.u.dest !== pl.id);
  h += `<h3>In orbit here</h3>` + (groups.map(g => stackRow(g, { settleAt: pl.landable && !pl.colony && !owner ? pl : null })).join('') || '<div class="tiny">Nothing.</div>') + sendBar(c, groups);
  if (coming.length) h += `<h3>On the way here</h3>` + movingLines(coming);
  if (leaving.length) h += `<h3>Leaving</h3>` + movingLines(leaving);
  if (!pc && !owner && pl.landable) h += `<div class="tiny" style="margin-top:8px">To settle ${esc(pl.name)}: build a ship that has a habitat (the people go aboard when it is built), send it here, and press Settle. The ship becomes the colony's first building.</div>`;
  $('sPanel').innerHTML = h; fillThumbs($('sPanel'));
}
// THE COLONY POP-UP (his design, 2026-10-18 — "no sidebars: click on a planet and its surface pops up"): one of your colonies over the
// map. On top the COLONY DEVELOPMENT FOCUS (the rectangle — industry, food, housing, science — with its live fillet) and the EFFORT
// (the triangle — industry, research, development); under them the SURFACE (cells of four slots growing out of the landing; click a
// cell to plan it); under that the eon's OUTPUT as bars and icon rows. On the right the PRODUCTION LINE: a card per project — the
// design's own picture, its name and numbers, a progress bar; the top card is being built; drag to re-order, − n ＋ for how many of
// it, ✕ to drop it, ⚡ to buy the rest from the reserves; '＋ Add construction project' lists your ships, platforms and docks.
// The rules and the pictures are colony.js and colonyview.js — the same ones the sandbox (planet.html) runs.
let cpTetra = null, colPop = null, colPopK = null, cpHover = -1, cpAdd = false, cpDrag = null, cpDragEnd = 0;   // colPopK: whose colony (null = yours; in God mode any empire's, read-only)
const cpE = () => colPopK == null ? S : W && W.empires[colPopK], cpC = () => colPopK == null ? LAST : GODC && GODC[colPopK], cpRO = () => colPopK != null;
const WORLD_KIND = { living: 'living', ocean: 'ocean', ice: 'ice', other: 'barren' };
const cpColony = () => { const c = cpC(); return colPop && c ? c.colonies.find(x => x.pl.id === colPop) || null : null; };
const cpWhy = pc => ({ staffed: pc.staffed, fed: pc.fed, housing: pc.housing, people: pc.P.people, food: pc.food / T.foodPerHead, eat: pc.P.people });
const cpSkeleton = () => `<div class="cpbox"><div class="cphead"><b id="cpName"></b><span id="cpMeta"></span><button class="go" data-cpend title="end the eon — the colony stays open">End eon ▸</button><button class="x" data-cpclose title="close (Esc, or click outside)">✕</button></div>
  <div class="cpgrid"><div class="cpmain">
    <div class="cprow2"><div class="cpcard cpwidget"><h3>Colony development focus</h3><canvas id="cpRect" width="250" height="250" style="cursor:grab;touch-action:none"></canvas></div>
      <div class="cpcard cpwidget"><h3>Effort — the people</h3><canvas id="cpTri" width="250" height="250"></canvas></div></div>
    <div class="cpcard"><canvas id="cpMap"></canvas><div class="tiny" style="margin-top:4px">Drag the ball in the tetrahedron: the builders build toward it — click an edge for half and half of its two corners (the food–housing edge: 50 % food, 50 % housing), a corner's name to pull toward it, empty space to turn it; a corner the colony cannot use is cut off and holds the ball back (hover it: why). Click a cell to plan it (industry → food → housing → science → pairs → any): that kind goes there first. ⛏ deposits · 🌾 fertile · ☼ calm · ✦ anomaly: that kind yields ×${TRAIT.boost} there. ⚒ the next slot, ✕ a slot being torn down.</div></div>
    <div class="cpcard" id="cpOut"></div></div>
  <div class="cpcard cpqueue" id="cpQueue"></div></div></div>`;
function openColPop(placeId, k = null) {
  colPop = placeId; colPopK = k; cpAdd = false; cpHover = -1;
  const el = $('colPop'); el.innerHTML = cpSkeleton(); el.hidden = false;
  [$('cpMap').width, $('cpMap').height] = mapSize();
  const light = () => { LAST = compute(S); renderColPop(); };                        // while dragging: the pop-up alone (the rest on release)
  const dragOn = (cv, fn) => {
    cv.addEventListener('pointerdown', e => { if (cpRO()) return; cpDrag = cv.id; cv.setPointerCapture(e.pointerId); fn(...toCanvas(cv, e)); light(); });
    cv.addEventListener('pointermove', e => { if (cpDrag === cv.id) { fn(...toCanvas(cv, e)); light(); } });
    cv.addEventListener('pointerup', () => { if (cpDrag) { cpDrag = null; cpDragEnd = performance.now(); save(); refresh(); } });
  };
  cpTetra = focusTetra($('cpRect'), { getG: () => cpColony()?.G, noFood: () => !!cpColony()?.noFood, onChange: w => { if (cpRO()) return; setDevFocus(S, colPop, w); LAST = compute(S); renderColPop(true); }, onRelease: () => { if (cpRO()) return; cpDragEnd = performance.now(); save(); refresh(); } });   // the focus TETRAHEDRON (2026-10-20)
  dragOn($('cpTri'), (x, y) => { const t = triFromPoint(x, y); setSplit(S, colPop, [t.industry, t.research, t.development]); });
  $('cpTri').addEventListener('dblclick', e => { if (cpRO()) return; const pc = cpColony(); if (!pc) return; const b = triBall({ industry: pc.P.split[0], research: pc.P.split[1], development: pc.P.split[2] }), [x, y] = toCanvas($('cpTri'), e); if (Math.hypot(x - b.x, y - b.y) > 22) return; setSplit(S, colPop, [1, 1, 1]); save(); refresh(); });   // double-click the ball: a third each (his ask, 2026-10-20)
  const map = $('cpMap');
  map.addEventListener('click', e => { const pc = cpColony(); if (!pc || cpRO()) return; const i = surfaceCellAt(map, pc.G, e); if (i < 0) return; toastErr(planCell(S, colPop, i, nextPlan(pc.G.cells[i].plan))); save(); refresh(); });
  map.addEventListener('mousemove', e => {
    const pc = cpColony(); if (!pc) return; const i = surfaceCellAt(map, pc.G, e), tip = $('cpTip');
    if (i !== cpHover) { cpHover = i; drawSurface(map, pc.G, { next: pc.next, hover: i, frameColor: cpFrame(), planet: cpPlanet(pc) }); }
    if (i < 0) { tip.style.display = 'none'; return; }
    const cell = pc.G.cells[i], out = pc.perCell[i], [x, y] = xy(pc.G, i);
    tip.innerHTML = `<b>cell ${x + 1},${y + 1}</b> · ${cell.trait === 'none' ? 'plain ground' : `${cell.trait} ground (${SLOT_WORD[TRAITS[cell.trait]]} × ${TRAIT.boost})`}${cell.plan ? ` · planned: ${cell.plan.map(k => SLOT_WORD[k]).join(' + ')}` : ''}<br>${cell.slots.length ? `slots: ${cell.slots.map(k => `<span style="color:${FACTOR_COLOR[k]}">${SLOT_WORD[k]}</span>`).join(', ')}<br>gives: ${FACTORS.filter(k => out[k] > 0.5).map(k => `${SLOT_WORD[k]} ${Math.round(out[k])} M`).join(' · ')}${out.staffed < 0.999 ? `<br><span class="up">short of hands: no home of its own (${Math.round(out.staffed * 100)} %)</span>` : ''}${out.purity > 0.99 ? '<br><span class="up">pure: a focus shock hits it hardest</span>' : ''}` : 'not built yet'}`;
    tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - 300, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  });
  map.addEventListener('mouseleave', () => { cpHover = -1; $('cpTip').style.display = 'none'; const pc = cpColony(); if (pc) drawSurface(map, pc.G, { next: pc.next, frameColor: cpFrame(), planet: cpPlanet(pc) }); });
  renderColPop();
}
function closeColPop() { colPop = null; colPopK = null; cpDrag = null; $('colPop').hidden = true; $('cpTip').style.display = 'none'; }
const cpFrame = () => { const E = cpE(); return E && E.look && E.look.colA ? E.look.colA + '99' : 'rgba(126,243,176,.45)'; };   // the developed cells framed in the empire's colour
const cpPlanet = pc => ({ id: pc.pl.id, kind: worldOf(pc.pl) });   // the planet under the cells (terrain.js): its id seeds the ground, its kind colours it ('other' = rock)
function renderColPop(fromTetra = false) {
  if (!colPop) return; const pc = cpColony(); if (!pc || !pc.G) return closeColPop();
  const bar = $('replayBar'), top = Math.max($('topbar').getBoundingClientRect().bottom, bar && !bar.hidden ? bar.getBoundingClientRect().bottom : 0);
  $('colPop').style.top = Math.round(top) + 'px';    // under the top bar: End eon stays in reach (his ask, 2026-10-18)
  const E = cpE(), pl = pc.pl, P = pc.P, G = pc.G, size = SIZES[sizeClassOf(pl)], home = pl.id === (E.homePlace || 'home');
  $('cpName').textContent = cpRO() ? `${E.name}'s ${pl.name}` : pl.name; $('cpName').style.color = cpRO() ? E.look.colA : '';
  $('cpMeta').textContent = `${cpRO() ? '👁 GOD MODE · ' : ''}${home ? 'HOMEWORLD' : 'COLONY'}   TYPE: ${WORLD_KIND[worldOf(pl)].toUpperCase()}   SIZE: ${size.name.toUpperCase()} ${size.w} × ${size.h}`;
  $('cpMeta').title = habWord(habitabilityOf(pl));
  drawSurface($('cpMap'), G, { next: pc.next, hover: cpHover, frameColor: cpFrame(), planet: cpPlanet(pc) });
  if (cpTetra && !fromTetra) cpTetra.draw(); $('cpRect').title = FACTORS.map(k => filletWhy(G, k, cpWhy(pc))).join('\n') + '\n(drag the ball · click a corner to pull toward it · drag empty space to turn it)';
  drawEffortTri($('cpTri'), { industry: P.split[0], research: P.split[1], development: P.split[2] });
  $('cpTri').title = `industry: ${fmt(pc.people.industry)} M hands for ${fmt(pc.cap.industry)} M of works · research: ${fmt(pc.people.research)} M for ${fmt(pc.cap.science)} M of labs · development: ${fmt(pc.people.development)} M builders → ${pc.dev.toFixed(1)} points an eon`;
  $('cpOut').innerHTML = cpOutHtml(pc);
  $('cpQueue').innerHTML = cpQueueHtml(pc); fillThumbs($('cpQueue'));
}
const cpBar = (name, val, max, col, text) => `<div class="cpbar"><span style="color:${col}">${name}</span><div class="track"><div style="width:${Math.min(100, 100 * val / Math.max(1e-9, max))}%;background:${col}"></div></div><b>${text}</b></div>`;
const reps = (icon, n, max = 40) => icon.repeat(Math.max(0, Math.min(max, Math.round(n))));
function cpOutHtml(pc) {
  const P = pc.P, G = pc.G, fedM = pc.food / T.foodPerHead, eatM = P.people, toLine = pc.queue.reduce((a, q) => a + (q.spend || 0), 0), next = pc.next;
  const plates = Math.ceil(eatM / 20), fedPlates = Math.min(plates, Math.ceil(Math.min(fedM, eatM) / 20)), grain = Math.floor(Math.max(0, fedM - eatM) / 20);
  const cellName = i => xy(G, i).map(v => v + 1).join(',');
  const nextLine = pc.blockaded ? '<b class="up">blockaded — nothing is built</b>'
    : !next ? (isFull(G) ? `the world is fully developed and in balance — ${fmt(pc.people.development)} M builders stand idle: move them in the triangle` : 'nothing to build')
    : next.demolish ? `tearing down a <b style="color:${FACTOR_COLOR[next.demolish]}">${SLOT_WORD[next.demolish]}</b> slot in cell ${cellName(next.cell)} (${DEV.demolish} pts), then <b style="color:${FACTOR_COLOR[next.kind]}">${SLOT_WORD[next.kind]}</b> goes up in its place (${DEV.cost} pts)`
    : `${next.partial ? 'going up' : 'next'}: <b style="color:${FACTOR_COLOR[next.kind]}">${SLOT_WORD[next.kind]}</b> in cell ${cellName(next.cell)}${next.partial ? ` — ${next.b < 0.1 ? (next.b * 100).toFixed(1) : Math.round(next.b * 100)} % built` : ''}${G.cells[next.cell].plan ? ' — planned' : TRAITS[G.cells[next.cell].trait] === next.kind ? ` — ${G.cells[next.cell].trait} ground` : ''} · ${pc.dev > 0 ? `adds about ${peopleWord(SLOT.cap[next.kind] * pc.dev / DEV.cost)} ${next.kind === 'housing' ? 'of homes' : next.kind === 'food' ? 'fed' : next.kind === 'industry' ? 'of works' : 'of labs'} an eon${(1 - (next.b || 0)) * DEV.cost / pc.dev < 200 ? `, done in ${plural(Math.max(1, Math.ceil((1 - (next.b || 0)) * DEV.cost / pc.dev)), 'eon')}` : ''}` : 'nobody builds'}`;   // a slot going up gives its share as it goes (2026-10-20)
  const pol = pc.pol.industry + pc.pol.social + pc.pol.research > 1 ? ` · pollution: <span title="an industrial world: people sicken">industrial ${Math.round(pc.pol.industry)}</span> · <span title="the development corner held past half: industry and research slacken">docile ${Math.round(pc.pol.social)}</span> · <span title="the research corner held past half: the builders slacken">aloof ${Math.round(pc.pol.research)}</span>` : '';
  return `
    ${cpBar('people', P.people, pc.housing, FACTOR_COLOR.housing, `${peopleWord(P.people)} / ${peopleWord(pc.housing)} <span class="tiny">homes · ${pc.dPeople >= 0 ? '+' : '−'}${peopleWord(Math.abs(pc.dPeople))}</span>`)}
    ${pc.water ? cpBar('food', Math.min(fedM, eatM), eatM, FACTOR_COLOR.food, `${fmt(fedM)} / ${fmt(eatM)} M <span class="tiny">fed / eat</span>`) + `<div class="icons" title="a plate = 20 M people eating (dim: unfed); a sheaf = 20 M more fed than live here — a surplus for the colonies round it (logistics, later)">${reps('🍽', fedPlates)}<span class="dim">${reps('🍽', plates - fedPlates)}</span> ${reps('🌾', grain, 30)}${pc.fed < 1 ? ` <b class="up" style="font-size:12px">hungry — works at ${Math.round(pc.hungry * 100)} %</b>` : ''}</div>`
      : cpWaterHtml(pc) + (pc.waterNeed > 0 ? cpBar('food', Math.min(fedM, eatM), eatM, FACTOR_COLOR.food, `${fmt(fedM)} / ${fmt(eatM)} M <span class="tiny">fed / eat</span>`) + `<div class="icons">${reps('🍽', fedPlates)}<span class="dim">${reps('🍽', plates - fedPlates)}</span> ${reps('🌾', grain, 30)}</div>` : '')}
    ${cpBar('industry', Math.min(pc.people.industry, pc.cap.industry), pc.cap.industry, FACTOR_COLOR.industry, `${fmt(pc.industry)} <span class="tiny">${fmt(pc.people.industry)} M hands / ${fmt(pc.cap.industry)} M works</span>`)}
    <div class="icons" title="a gear = 10 industry; a wrench = 10 of it into the production line; money = 10 into the reserves (credits)">${reps('⚙', pc.industry / 10)} <span class="tiny">→</span> ${reps('🔧', toLine / 10)}${reps('💰', pc.toReserves / 10)}<span class="tiny"> ${Math.round(toLine)} to the line${pc.newFactories ? ` · ${pc.newFactories} factor${pc.newFactories === 1 ? 'y' : 'ies'} built` : ''} · ${Math.round(pc.toReserves)} to the reserves</span></div>
    ${cpBar('science', Math.min(pc.people.research, pc.cap.science), pc.cap.science, FACTOR_COLOR.science, `${fmt(pc.research)} <span class="tiny">${fmt(pc.people.research)} M / ${fmt(pc.cap.science)} M labs</span>`)}
    <div class="icons" title="a microscope or a tube = 10 research">${Array.from({ length: Math.min(40, Math.round(pc.research / 10)) }, (_, i) => i % 2 ? '🧪' : '🔬').join('')}</div>
    ${cpBar('building', next ? next.b || 0 : 0, 1, '#f5a3c7', `${pc.dev.toFixed(1)} <span class="tiny">pts/eon · ${fmt(pc.people.development)} M builders</span>`)}
    <div class="icons" title="a hammer = one builder point an eon (a slot costs ${DEV.cost}, tearing one down ${DEV.demolish})">${reps('🔨', pc.dev)}</div>
    <div class="tiny" style="margin:0 0 6px 92px">${nextLine}${pc.cap.pure ? ` · <span class="up">${plural(pc.cap.pure, 'pure cell')}</span>` : ''}</div>
    <div class="tiny">happiness ${Math.round(P.happiness)} · ${pc.factories} factor${pc.factories === 1 ? 'y' : 'ies'}${pc.needI > 0 ? ` · sustain ${fmt(pc.needI)} industry / ${fmt(pc.needR)} research${pc.short > 0.005 ? ` <b class="up">${Math.round(pc.short * 100)} % short — unrest</b>` : ' ✓'}` : ''}${pol}${pc.blockaded ? ` · <b class="up">blockaded ${pc.blockaded} of ${WORLD.siege} eons</b>` : ''}</div>`;
}
// THE WATER of a dry world (his design, 2026-10-18): what its farms could use, what arrives and from where, what the haul costs —
// and, short of it, that it needs more water to grow
function cpWaterHtml(pc) {
  const short = pc.waterIn < pc.waterNeed - 0.5, none = pc.waterReach <= 0;
  const from = pc.waterRoutes.map(r => `💧 ${r.kind === 'harvest' ? `harvested by ${esc(r.name)}` : `from ${esc(r.name)}`}${r.ly ? ` · ${r.ly.toFixed(1)} ly${r.chance < 0.999 ? `, ${Math.round(r.chance * 100)} % arrives` : ''}` : ' · in the system'} · ${fmt(r.amount)} M`).join('<br>');
  return cpBar('water', pc.waterIn, Math.max(pc.waterNeed, 1e-9), '#4fa3ff', pc.waterNeed > 0 ? `${fmt(pc.waterIn)} / ${fmt(pc.waterNeed)} M <span class="tiny">for the farms</span>` : '<span class="tiny">no farms yet</span>')
    + `<div class="tiny" style="margin:0 0 6px 92px">${none ? '<b class="up">no water within reach</b> — the settlers live on their stores, no farms, no growth: settle near a world of yours with water, or park a ship or platform with fabricators at any world with water to harvest it'
      : `${from || 'water can reach it — the builders will lay farms'}${pc.waterCost > 0.005 ? `<br>the haul costs ${pc.waterCost.toFixed(2)} an eon from the reserves` : ''}${short ? '<br><b class="up">needs more water to grow</b> — the farms run dry: a nearer source, or more fabricators harvesting' : ''}`}</div>`;
}
// what the line can build: ships, platforms and docks (a district with a gantry) — the surface builds itself from development
const cpBuildable = (d, caps) => { const t = designStats(cpE(), d, caps).t; return t.klass !== 'structure' || t.gantries.length > 0; };
function cpQueueHtml(pc) {
  const E = cpE(), ro = cpRO(), caps = cpC().caps, pl = pc.pl, rows = pc.queue.filter(q => !q.gone), slips = pc.gantries.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  const card = (q, i) => {
    const tid = 'cq|' + q.d.id; try { thumbShips.set(tid, paintedShip(q.d, caps)); } catch (e) { /* no picture: the frame stays empty */ }
    const top = i === 0 && !q.noDock, done = Math.round(100 * Math.min(1, (q.item.progress || 0) / q.cost));
    const status = q.noDock ? '<b class="up">no space dock here</b>' : q.joining ? `joining its sections, ${plural(q.joinLeft, 'eon')}` : top ? '<span class="down">building</span>' : 'waiting';
    const when = q.noDock ? '' : !Number.isFinite(q.eta) ? 'nobody in industry' : q.count > 1 ? `first in ${plural(q.eta, 'eon')}, all ${q.count} in ${q.etaAll}` : `ready in ${plural(q.eta, 'eon')}`;
    const buy = !ro && !q.noDock && q.need > 1e-6 && (E.reserves || 0) >= q.need ? `<button class="x" data-buynow="${q.item.id}" data-planet="${pl.id}" title="pay what is left of this one from the reserves">⚡ ${fmt(q.need)}</button>` : '';
    return `<div class="qcard ${top ? 'top' : ''}" draggable="${ro ? 'false' : 'true'}" ${ro ? '' : `data-cq="${q.item.id}"`} title="${ro ? '' : 'drag to change its place in the line'}">
      <canvas class="qimg" data-thumb="${tid}" ${colPopK != null ? `data-emp="${colPopK}"` : ''} width="64" height="56"></canvas>
      <div class="qinfo"><b>${esc(q.d.name)}</b>${fmt(q.cost)} ⚙ each · ${status}<br>${when}${q.sections > 1 ? ` · <span class="up" title="too big for the ${q.fit.w} × ${q.fit.h} gantry: ${extraCost(q.fit)}">${q.sections} sections</span>` : ''}${q.ds.klass !== 'structure' && q.ds.housing > 0 ? ` · takes ${peopleWord(Math.max(0, Math.min(q.ds.housing * SCALE.shipHousing, pc.P.people - 5)))} aboard` : ''}
        ${ro ? `<div class="qctl"><span class="tiny">${q.count} of these</span></div>` : `<div class="qctl"><button class="x" data-cqminus="${q.item.id}" title="one fewer">−</button><input type="number" min="1" max="99" value="${q.count}" data-cqcount="${q.item.id}" title="how many of these — type it"><button class="x" data-cqplus="${q.item.id}" title="one more">＋</button>${buy}</div>`}</div>
      ${ro ? '' : `<div class="qbtns"><button class="x" data-cqdel="${q.item.id}" title="drop it">✕</button></div>`}
      <div class="qbar"><div style="width:${done}%"></div></div></div>`;
  };
  const menu = cpAdd && !ro ? `<div class="qmenu">${E.designs.filter(d => cpBuildable(d, caps)).map(d => { const t = designStats(E, d, caps).t; return `<button data-cqadd="${d.id}"><span>${esc(d.name)} <small>${CLASS_NAME[t.klass].toLowerCase()}</small></span><small>${fmt(t.cost)} ⚙</small></button>`; }).join('')}</div>` : '';
  return `<h3>Production</h3>${ro ? '' : '<button class="go" data-cqopen style="width:100%">＋ Add construction project</button>'}${menu}
    ${rows.map(card).join('') || '<div class="tiny">Nothing in the line — the industry builds factories, then goes to the reserves.</div>'}
    <div class="tiny" style="margin-top:6px">${slips.length ? `Space dock: gantry ${slips.map(s => `${s.w} × ${s.h}`).join(', ')} — a hull that fits is built whole, a bigger one in sections (dearer, slower).` : '<b class="up">No space dock here</b> — ships and platforms wait until there is one.'}</div>`;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && colPop) closeColPop(); });
// the line's cards: drag one onto another and it takes that one's place
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-cq]'); if (!c) return; cpDrag = 'q:' + c.dataset.cq; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cq:' + c.dataset.cq); });
document.addEventListener('dragover', e => { const c = e.target.closest?.('[data-cq]'); if (!c || !String(cpDrag).startsWith('q:')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.qcard.over').forEach(x => x.classList.remove('over')); c.classList.add('over'); });
document.addEventListener('drop', e => {
  const c = e.target.closest?.('[data-cq]'); if (!c || !String(cpDrag).startsWith('q:') || !colPop || cpRO()) return; e.preventDefault();
  const id = cpDrag.slice(2), P = placeOf(colPop)?.colony; cpDrag = null; if (!P) return;
  const to = P.queue.findIndex(q => q.id === c.dataset.cq); if (to >= 0 && id !== c.dataset.cq) toastErr(queueMove(S, colPop, id, to));
  save(); refresh();
});
document.addEventListener('dragend', () => { if (String(cpDrag).startsWith('q:')) cpDrag = null; document.querySelectorAll('.qcard.drag, .qcard.over').forEach(x => x.classList.remove('drag', 'over')); });
document.addEventListener('change', e => { const t = e.target.closest?.('[data-cqcount]'); if (!t || !colPop || cpRO()) return; toastErr(queueCount(S, colPop, t.dataset.cqcount, +t.value)); save(); refresh(); });   // "make 4 of this in one block"

// WHAT HAPPENED (his ask, 2026-10-18: "a little notification at the end of an eon — the ship has arrived, this colony has completed
// this construction project…"): the eon's events worth a look in the corner — a ship that arrived, something built, a district
// completed, a battle, a find, a loss. Click one to go there (a colony opens its pop-up, a battle plays), ✕ to dismiss; the next eon
// brings its own. The routine ones (factories built from spare industry, research steps) stay in the Empire tab's report.
let NOTES = [], notesAll = false;
const NOTE_ICON = { move: '⇢', build: '🔨', battle: '⚔', bad: '⚠', breakthrough: '✦', capture: '⚑', repelled: '⚔', win: '♛' };
function notesFromEon() {
  const extra = W && !REPLAY && !SIM ? (W.events || []).filter(ev => ev.eon === W.eon - 1 && (ev.text || '').includes(S.name) && !S.report.some(r => r.text === ev.text)) : [];
  NOTES = [...(S.report || []), ...extra].filter(r => NOTE_ICON[r.kind] && !r.minor).map((r, i) => ({ ...r, i })); notesAll = false; renderNotes();
}
function renderNotes() {
  const el = $('notes'); if (!el) return;
  if (!NOTES.length || SIM || REPLAY) { el.hidden = true; return; }
  const show = notesAll ? NOTES : NOTES.slice(0, 6);
  el.innerHTML = `<div class="nhead"><b>Eon ${S.eon - 1} — what happened</b><button class="x" data-nclear title="dismiss all">✕</button></div>`
    + show.map(n => `<div class="nrow n-${n.kind}" data-note="${n.i}" title="${n.place || n.sys || n.battle || n.kind === 'breakthrough' ? 'click: go there' : ''}"><span class="ni">${NOTE_ICON[n.kind]}</span><span>${esc(n.text)}</span><button class="x" data-ndel="${n.i}" title="dismiss">✕</button></div>`).join('')
    + (NOTES.length > show.length ? `<button class="x nmore" data-nmore>+ ${NOTES.length - show.length} more</button>` : '');
  el.hidden = false;
}
document.addEventListener('click', e => {
  const del = e.target.closest('[data-ndel]'); if (del) { NOTES = NOTES.filter(n => n.i !== +del.dataset.ndel); return renderNotes(); }
  if (e.target.closest('[data-nclear]')) { NOTES = []; return renderNotes(); }
  if (e.target.closest('[data-nmore]')) { notesAll = true; return renderNotes(); }
  const row = e.target.closest('[data-note]'); if (!row) return;
  const n = NOTES.find(x => x.i === +row.dataset.note); if (!n) return;
  if (n.battle) return watchBattle(n.battle);
  if (n.kind === 'breakthrough') { closeColPop(); return go('empire'); }
  const pl = n.place && placeOf(n.place);
  if (pl) { openSystem(pl.sys, pl.id); if (n.colony && pl.colony) openColPop(pl.id); else closeColPop(); return; }
  if (n.sys && sysOf(n.sys)) { closeColPop(); openSystem(n.sys); }
});
addEventListener('resize', () => { if (!LAST) return; if (tab === 'system') drawMap(LAST); if (tab === 'galaxy') drawGalaxy(LAST); });


// =====================================================================
// DESIGN — systems on the left, the hull in the middle, weapons on the right
// =====================================================================
function say(text) { note = text; clearTimeout(noteT); noteT = setTimeout(() => { note = ''; refresh(); }, 2400); refresh(); }
// a small picture of a silhouette, for the picker
const tplIcon = (T, on) => { const b = bboxOf(T.poly), w = b.maxx - b.minx, h = b.maxy - b.miny, m = Math.max(w, h) * 0.08; return `<svg viewBox="${b.minx - m} ${b.miny - m} ${w + 2 * m} ${h + 2 * m}" width="${Math.round(30 * Math.max(1, Math.min(2, w / h)))}" height="30" preserveAspectRatio="xMidYMid meet"><polygon points="${T.poly.map(p => p.join(',')).join(' ')}" fill="${on ? 'rgba(126,243,176,.55)' : 'rgba(158,179,216,.35)'}" stroke="${on ? '#7ef3b0' : '#9eb3d8'}" stroke-width="${Math.max(w, h) * 0.03}"/></svg>`; };
// the silhouette editor, over the whole page
const hullEd = createHullEditor($('hullEd'), {
  library: () => HULLS,
  save: h => { HULLS = HULLS.filter(x => x.id !== h.id).concat([h]); saveHulls(); refresh(); },
  remove: id => { HULLS = HULLS.filter(x => x.id !== id); saveHulls(); refresh(); },
  use: id => { const d = design(); if (d) { d.hull = id; save(); } refresh(); },
  onClose: () => refresh(),
});
// ---- the CHIPS (chipeditor.js — the Fleet Generator's and the Painter's) on a ship design: the stacks become the modules
// (battle.js designFromStacks) and the price and the bulk follow — a capital gun is a given size, two of them twice that
const gameChips = createChipEditor({ palette: $('cPalette'), tray: $('cTray'), info: $('cInfo'), sheet: $('cSheet'), dropZones: ['#dPaint'] },
  { extra: { ...CIVIL, names: { fast: 'Thrusters' } }, onChange: chipsChanged, infoExtra: capsuleHtml, onInfoClick: capsuleClick, labels: { weapon: 'Military', role: 'Roles', trait: 'Utilities' },
    groupBy: s => s.kind === 'fast' ? 'Energy & thrust' : s.type === 'weapon' ? 'Military' : 'Utilities', groupOrder: ['Energy & thrust', 'Utilities', 'Military'], openOnClick: true, onRender: placeInfo, autoChips, gunsPerChip: 1, stackSub });   // "Fast" is the thrusters here (his call); a weapon chip is one gun
// what a pile gives the ship, under its name (his ask, 2026-10-16): armour its HP, a shield its capacity, a gun its damage …
function stackSub(s, mods) {
  if (!DS || !mods.length) return '';
  const t = DS.t, sum = f => mods.reduce((a, m) => a + f(m.v) * m.n, 0);
  if (s.kind === 'shield') return `${fmt(sum(v => v.capacity))} · +${fmt(sum(v => v.recovery))}/s`;
  if (s.kind === 'armor') return `${fmt(sum(v => v.hp))} HP · shrugs ${t.deflect.toFixed(1)}`;
  if (s.kind === 'fast') return `speed ${fmt(t.speed)} · evasion ${Math.round(t.evasion)} %`;
  if (s.kind === 'fab') return `${fmt(sum(v => v.industry))} industry · stock ${fmt(t.fabStock)}`;
  if (s.kind === 'lab') return `+${fmt(sum(v => v.research))} research`;
  if (s.kind === 'habitat') return `${peopleWord(sum(v => v.housing) * SCALE.shipHousing)} people`;
  if (s.kind === 'gantry') return `${mods.reduce((a, m) => a + m.n, 0)} × (4 × 2) dock`;
  if (s.kind === 'hangar') return `${t.drones} drones · ${t.airCap} in the air`;
  if (KINDS[s.kind]?.mount) { const d = mods.reduce((a, m) => a + m.v.damage * m.v.rate * Math.min(98, m.v.accuracy + t.bonus) / 100 * m.n, 0) * t.powerFactor * t.fireFactor; return `${fmt(d)} dmg/s · reach ${fmt(mods[0].v.range)}`; }
  return '';
}
// the systems the design sizes for itself — not chips, but shown among them (his ask, 2026-10-15): the reactor, the star drive and
// the thrusters under Energy & thrust, the weapons computer first under Military, shields added for cover under Utilities; each
// with its size (×k) and count (×n), which grow with what the piles ask for
const ENERGY = ['reactor', 'stardrive', 'thruster'];
function autoChips(group) {
  if (!DS) return [];
  const t = DS.t, what = m => {                       // what it gives the ship, on the chip (his ask: the reactor's MW, the thrusters' speed and evasion …)
    const v = m.v, n = m.n;
    if (m.kind === 'reactor') return `${fmt(v.output * n)} MW`;
    if (m.kind === 'stardrive') return `moves ${fmt(v.lift * n)} volume · speed ${fmt(t.speed)}`;
    if (m.kind === 'thruster') return `speed ${fmt(t.speed)} · evasion ${Math.round(t.evasion)} %`;
    if (m.kind === 'weapon_system') return `${num(v.mounts * n, 1)} mounts · +${num(v.bonus, 1)} % aim`;
    return '';
  };
  const item = m => ({ label: m.K.name, sub: `${what(m)} · ${m.K.scale ? 'size ×' + m.k : ''}${m.n > 1 ? `${m.K.scale ? ' ' : ''}×${m.n}` : ''}`.replace(/ · $/, ''), color: m.K.color, title: 'sized by the design itself — it grows with what you add; not a chip' });
  const auto = DS.mods.filter(m => !m.mod.src);
  if (group === 'Energy & thrust') return auto.filter(m => ENERGY.includes(m.kind)).map(item);
  if (group === 'Military') return auto.filter(m => m.kind === 'weapon_system').map(item);
  if (group === 'Utilities') return auto.filter(m => !ENERGY.includes(m.kind) && m.kind !== 'weapon_system').map(item);
  return [];
}
document.addEventListener('click', e => { if (gameChips.openId == null || !e.target.isConnected || e.target.closest('#cInfo, [data-stack], .hdlg')) return; gameChips.close(); });   // a click anywhere else closes a pile's details (his ask); a click that re-rendered its own target (a pile, its + / −) is not "elsewhere"
// the details panel floats over the stage beside the pile it belongs to (his ask, 2026-10-15: "on the right side of the element")
function placeInfo(openId) {
  const info = $('cInfo'); if (openId == null || info.hidden) return;
  const pile = $('cTray').querySelector(`[data-stack="${openId}"]`), st = $('dStage'); if (!pile || !st) return;
  const top = pile.getBoundingClientRect().top - st.getBoundingClientRect().top;
  info.style.top = clamp(top, 8, Math.max(8, st.clientHeight - info.offsetHeight - 8)) + 'px';
}
let chipsFor = null, fitGunsFor = null;              // the design whose chips are in the editor · the design whose guns must be fitted on the next paint (its piles changed)
const stacksOut = () => gameChips.stacks.map(s => ({ id: s.id, type: s.type, kind: s.kind, h: s.h, role: s.role, ...(s.off ? { off: true } : {}), ...(s.dials ? { dials: { ...s.dials } } : {}), ...(s.caps && s.caps.length ? { caps: s.caps.slice() } : {}) }));
function rebuildFromChips(d, c) {
  d.chips = stacksOut();
  const made = designFromStacks(S, d.chips, { klass: d.klass, name: d.name, hull: d.hull || undefined, id: d.id, caps: c ? c.caps : allCapsules(S), gunsPerChip: 1 });   // a chip is ONE gun here (odd counts: a lone gun leads on the midline)
  d.modules = made.modules; if (!d.hull) d.hull = made.hull;
}
function chipsChanged() { const d = design(); if (!d || chipsFor !== d.id || d.klass === 'structure') return; rebuildFromChips(d, LAST); fitGunsFor = d.id; save(); refresh(); }
// breakthrough CAPSULES on a stack (one use per design, as on a module): under the stack's details
function capsuleHtml(stack, mods) {
  const c = LAST, d = design(); if (!c || !d) return '';
  const kinds = [...new Set(mods.map(m => m.kind))]; if (!kinds.length) return '';
  const used = new Map(); for (const m of d.modules) for (const id of m.caps || []) used.set(id, m);
  const on = (stack.caps || []).map(id => c.caps.find(x => x.id === id)).filter(Boolean);
  const fit = c.caps.filter(cp => !cp.done && !(stack.caps || []).includes(cp.id) && kinds.some(k => isRelevant(k, cp.channel)));
  return `<div class="dropzone">${on.length ? on.map(cp => capChip(cp, 'on') + ` title="${esc(cp.btName)} — ${esc(cp.prop)}">${cp.name} +${cp.pct}%<button data-suncap="${cp.id}">✕</button></span>`).join('') : '<span class="tiny">Capsules on it: none. Click one below.</span>'}</div>
    <div class="grp">Breakthroughs that fit</div>${fit.length ? fit.map(cp => { const u = used.get(cp.id); return capChip(cp, 'cap' + (u ? ' used' : ''), `data-scap="${cp.id}"`) + ` title="${esc(cp.prop)} — ${esc(cp.how)} · ${pct(cp.a)} integrated${u ? ' · already used on ' + KINDS[u.kind].name : ''}">${cp.name} +${cp.pct}%</span>`; }).join('') : '<div class="tiny">Nothing you have found fits this.</div>'}`;
}
function capsuleClick(e, stack) {
  const a = e.target.closest('[data-scap]'); if (a) { if (a.classList.contains('used')) { say('That capsule is already used in this design'); return false; } stack.caps = [...(stack.caps || []), a.dataset.scap]; return true; }
  const r = e.target.closest('[data-suncap]'); if (r) { stack.caps = (stack.caps || []).filter(x => x !== r.dataset.suncap); return true; }
  return false;
}
// ---- the OUTLINE, on the painted ship (shapeedit.js, the Painter's): double-click it, drag the points, Done — or Save as… under a name
const hdlg = createDialog();
let outLock = null, outDirty = false, outFor = null, outSnap = null;
function lightPaint(d) { const cv = $('dPaint'), g = cv.getContext('2d'); if (outSnap) g.drawImage(outSnap, 0, 0); else { g.fillStyle = '#04070f'; g.fillRect(0, 0, cv.width, cv.height); } outEd.draw(g); cv._handles = outEd.state().pts.map(outFrame().toPx); }   // the kept painting + the overlay (_handles: a probe for tests)
function outlineLock() {                             // the frame while the outline is edited: the ship held still, at its volume
  const G = stageGeo(), vol = DS ? DS.t.volume : 300, f = outEd.fullPoly(), raw = f.length >= 3 && outEd.valid() ? f : (hullDef(DS ? DS.hull.id : 'dart') || hullDef('dart')).poly;
  const { s, cx, cy } = scaleInfo(raw, vol), b = bboxOf(raw);
  return { s, cx, cy, X: G.X, S: pxFor(G, (b.maxx - b.minx) * s || 1, (b.maxy - b.miny) * s || 1) };
}
const outFrame = () => { const L = outLock || (outLock = outlineLock()), cv = $('dPaint'); return { toPx: ([gx, gy]) => [L.X + (gx - GW / 2 - L.cx) * L.s * L.S, cv.height / 2 + (gy - GH / 2 - L.cy) * L.s * L.S], fromPx: ([px, py]) => [(px - L.X) / (L.s * L.S) + L.cx + GW / 2, (py - cv.height / 2) / (L.s * L.S) + L.cy + GH / 2] }; };
const outEd = createShapeEditor($('dPaint'), {
  frame: outFrame,
  changed(what) {
    const d = design(); if (!d || !DS) return;
    if (what === 'start') { outEd.load(hullDef(DS.hull.id) || hullDef('dart')); outLock = outlineLock(); outDirty = false; outFor = d.id; syncOutBar(true); }
    if (what === 'end') { outLock = null; outSnap = null; if (outDirty && outFor === d.id && outEd.valid()) commitOutline(null, false); outDirty = false; outFor = null; syncOutBar(false); return refresh(); }
    if (what === 'drag' || what === 'hover' || what === 'dragstart') return lightPaint(d);
    if (what === 'edit' || what === 'dragend') { outLock = outlineLock(); outDirty = true; }
    paintMain(d);
  },
});
const ownHull = st => st.id ? HULLS.find(h => h.id === st.id) || null : null;
function leaveOutline() { if (outEd.editing) { outDirty = false; outEd.editing = false; } }   // an unfinished reshape is dropped (another design opened, the class switched)
function syncOutBar(on) {
  $('dOutBar').style.display = on ? 'flex' : 'none'; if (!on) return;
  const st = outEd.state(), mine = ownHull(st);
  $('dOutWho').textContent = mine ? `Reshaping “${st.name}” (yours)` : `Reshaping “${st.name}” — Done makes it yours`; $('dOutSym').value = st.sym || ''; $('dOutDel').style.display = mine ? '' : 'none';
}
// delete a silhouette of yours (the bar's Delete, or ✕ on its thumbnail): designs wearing it fall back to a built-in of their class
// the ships (and districts) built with an outline keep it: before it is overwritten or deleted, the old shape lives on under a new
// id, hidden from the picker, and they point at that
function keepAsBuilt(id) {
  const old = HULLS.find(x => x.id === id); if (!old) return;
  const used = [...S.ships, ...S.places.flatMap(p => p.colony ? p.colony.structures : [])].filter(u => u.design && u.design.hull === old.id); if (!used.length) return;
  const keep = { ...old, id: 'u' + Math.random().toString(36).slice(2, 9), name: old.name + ' (as built)', asBuilt: true }; HULLS.push(keep); for (const u of used) u.design.hull = keep.id;
}
async function deleteHull(id) {
  const h = HULLS.find(x => x.id === id); if (!h || !(await hdlg.confirmDelete(h))) return;
  if (outEd.editing) { outDirty = false; outEd.editing = false; }
  keepAsBuilt(id); HULLS = HULLS.filter(x => x.id !== id); saveHulls(); say(`Deleted “${h.name}”`);
}
$('dOutDel').onclick = () => { const st = outEd.state(); if (ownHull(st)) deleteHull(st.id); };
function commitOutline(name, asNew) {                // the outline becomes this design's silhouette: one of yours overwritten (unless asNew), anything else a new one
  const d = design(), st = outEd.state(), mine = ownHull(st), h = outEd.build(name || st.name);
  if (!mine || asNew) { h.id = 'u' + Math.random().toString(36).slice(2, 9); if (!name) h.name = d.name + ' outline'; } h.klass = DS.t.hullClass;
  keepAsBuilt(h.id);                                  // what is already BUILT keeps the shape it was built with (his rule, 2026-10-20)
  HULLS = HULLS.filter(x => x.id !== h.id).concat([h]); saveHulls(); d.hull = h.id; st.id = h.id; st.name = h.name; save(); return h;
}
$('dOutDone').onclick = () => { outEd.editing = false; };                              // 'end' keeps what was drawn
$('dOutUndo').onclick = () => outEd.undo();
$('dOutSym').onchange = () => outEd.setSym($('dOutSym').value);
$('dOutSave').onclick = async () => {
  if (!outEd.valid()) return say('Not a shape yet — three points and some area.');
  const d = design(), st = outEd.state();
  const h = await saveFlow(hdlg, { mine: ownHull(st), defaultName: st.name || d.name + ' outline', taken: n => HULLS.some(x => x.name.toLowerCase() === n.toLowerCase() && x.id !== st.id), commit: (id, name) => commitOutline(name, !id) });
  if (!h) return; outDirty = false; outEd.editing = false; say(`“${h.name}” is this design's silhouette now — kept with your silhouettes`);
};
// the plating / fittings / seed dials and the coat tab: live while dragged, kept on release
const paintInput = () => { const d = design(); if (!d) return; d.paint = { plating: +$('pPlat').value, fittings: +$('pFit').value, seed: +$('pSeed').value }; syncPaintCtl(d); paintMain(d); };
for (const id of ['pPlat', 'pFit', 'pSeed']) { $(id).addEventListener('input', paintInput); $(id).addEventListener('change', () => { save(); refresh(); }); }
$('pSeedNext').onclick = () => { $('pSeed').value = (+$('pSeed').value + 1) % 1000; paintInput(); save(); refresh(); };
const coatInput = () => { S.look = { style: $('cStyle').value, colA: $('cColA').value, colB: $('cColB').value, wash: +$('cWash').value / 100, light: $('cLight').value, lights: +$('cLights').value / 100 }; const d = design(); if (d) paintMain(d); };
for (const id of ['cStyle', 'cColA', 'cColB', 'cWash', 'cLight', 'cLights']) { $(id).addEventListener('input', coatInput); $(id).addEventListener('change', () => { coatInput(); save(); refresh(); }); }
const ICON = { cost: '⚒', volume: '⬢', hp: '✚', shield: '⛨', cover: '◍', power: '⚡', runs: '▲', speed: '➶', evasion: '↯', drive: '✦', stars: '✧', dock: '▭', house: '⌂', research: '⚗', industry: '⛭', social: '☺', upkeep: '⟳', gantry: '▦', fire: '◎', reach: '⟶', damage: '✸' };
const isWeapon = kind => KINDS[kind].group === 'Weapons';
const gunStats = (m, t) => {              // one gun of this module, as the ship runs it
  const v = m.v, dmg = v.damage * v.rate * v.accuracy / 100 * t.powerFactor * t.fireFactor, band = m.K.orbital ? null : reachBand(v.range);
  return { dmg, band, targeting: Math.min(98, v.accuracy + t.bonus) };
};
// a card for one module: in the systems column or the weapons column
// a card for one module, closed: one line. Open (clicked): its dials, its numbers, its capsules, and
// under them every capsule you own that would fit it — drag one up, or just click it.
let onlyFit = true;
function modCard(m, X) {
  const { t, caps, usedBy } = X, sel = m.mod.id === selMod;
  let line = `cost ${fmt(m.cost * m.n)} · vol ${fmt(m.volume * m.n)}`;
  if (m.kind === 'reactor') line = `${fmt(m.v.output * m.n)} MW · ${line}`;
  if (m.kind === 'stardrive') line = `moves ${fmt(m.v.lift * m.n)} volume · ${line}`;
  if (m.kind === 'weapon_system') line = `runs ${num(m.v.mounts * m.n, 1)} mounts · +${num(m.v.bonus, 1)}% targeting · ${fmt(m.v.power * m.n)} MW`;
  const g = m.K.mount && !m.K.hangar ? gunStats(m, t) : null;
  if (g) { const trav = traverseOf(m.kind, m.volume / m.K.volume); line = `${m.mod.preset && m.mod.preset !== 'standard' ? `<b>${PRESETS[m.mod.preset].name}</b> · ` : ''}${ICON.damage} ${fmt(g.dmg)}${m.n > 1 ? ' × ' + m.n : ''} dmg/s${m.K.orbital ? ' to the ground' : ` · <span style="color:${g.band.color}">${ICON.reach} ${fmt(m.v.range)} u ${g.band.name}</span>`} · ${ICON.fire} ${Math.round(g.targeting)}%${trav ? ` · <span title="how fast the turret slews — a heavy mount cannot follow a quick target">⟲ ${Math.round(trav)}°/s</span>` : ''}`; }
  if (m.K.hangar) line = `${Math.round(m.v.craft) * m.n} drones × size ${m.v.size.toFixed(1)} · they fly until they die; a Fabricator aboard builds more`;
  const head = `<div class="n"><span>${sel ? '▾' : '▸'} ${m.K.name}${m.n > 1 ? ' × ' + m.n : ''}${m.rect ? ` ${m.rect[0]} × ${m.rect[1]}` : ''}${m.K.scale ? ` <span class="tiny">×${m.k}</span>` : ''}</span>${sel ? `<span class="stepper"><button data-mcount="-1" title="one fewer">−</button><b>× ${m.n}</b><button data-mcount="1" title="one more of the same">+</button><button data-mdel="${m.mod.id}" class="x" title="Del">✕</button></span>` : ''}</div><div class="tiny">${line}</div>`;
  if (!sel) return `<div class="mcard mrow" data-mod="${m.mod.id}" data-pick="${m.mod.id}" style="--c:${m.K.color}">${head}${m.mine.length ? `<div>${m.mine.map(cp => capChip(cp, 'on') + `>${cp.name} +${cp.pct}%</span>`).join('')}</div>` : ''}</div>`;
  const sc = m.K.scale;
  // the capsules that would fit, grouped by breakthrough
  const byBt = new Map();
  for (const cp of caps) { if (cp.done) continue; if (onlyFit && !isRelevant(m.kind, cp.channel)) continue; (byBt.get(cp.bt) || byBt.set(cp.bt, []).get(cp.bt)).push(cp); }
  const fits = S.breakthroughs.filter(b => byBt.has(b.id)).map(b => `<div class="bt"><div class="n" data-btopen="${b.id}"><span>${openBt.has(b.id) ? '▾' : '▸'} ${esc(b.name)}</span><span class="tiny">${b.fieldName}</span></div>
      ${byBt.get(b.id).map(cp => { const u = usedBy.get(cp.id); return capChip(cp, 'cap' + (u ? ' used' : ''), `${u ? '' : 'draggable="true"'} data-cap="${cp.id}"`) + ` title="${esc(cp.prop)} — ${esc(cp.how)} · ${pct(cp.a)} integrated${u ? ' · already used on ' + KINDS[u.kind].name : ''}">${cp.name} +${cp.pct}%</span>`; }).join('')}
      ${openBt.has(b.id) ? b.props.map(p => `<div class="prop"><b>${esc(p.name)}</b> <span class="tiny">${p.rarity} — ${esc(p.what)}</span></div>`).join('') : ''}</div>`).join('');
  return `<div class="mcard mrow sel" data-mod="${m.mod.id}" style="--c:${m.K.color}"><div data-pick="${m.mod.id}" style="cursor:pointer">${head}</div>
    ${m.rect ? `<div class="srow"><span>Gantry size</span><b class="stepper"><button data-gsize="w" data-d="-1">−</button>${m.rect[0]}<button data-gsize="w" data-d="1">+</button> × <button data-gsize="h" data-d="-1">−</button>${m.rect[1]}<button data-gsize="h" data-d="1">+</button></b><span class="tiny">the biggest hull it builds whole — up to ${GANTRY.maxW} × ${GANTRY.maxH}</span></div>` : ''}
    ${sc ? `<div class="srow"><span>Size</span><b class="stepper"><button data-rk="-1">−</button>×${m.k}<button data-rk="1">+</button><button data-rfit title="the smallest size that covers what the rest of the design needs">fit</button></b><span class="tiny">×${sc.min} to ×${sc.max}: ${m.kind === 'reactor' ? 'output' : m.kind === 'stardrive' ? 'what it can move' : m.kind === 'shield' ? 'reach, capacity and power' : 'mounts'}, cost and bulk follow</span></div>` : ''}
    ${m.tune && !m.K.hangar ? `<div class="srow"><span>Role</span><b><select data-preset>${Object.entries(PRESETS).map(([id, p]) => `<option value="${id}" ${(m.mod.preset || 'standard') === id ? 'selected' : ''}>${p.name}</option>`).join('')}<option value="custom" ${m.mod.preset === 'custom' ? 'selected' : ''}>Custom</option></select></b><span class="tiny">${m.mod.preset && PRESETS[m.mod.preset] ? PRESETS[m.mod.preset].what : 'your own dials'}${(m.mod.role || 'ship') === 'pd' ? ' · shoots missiles and drones first' : ''}</span></div>` : ''}
    ${m.tune ? (m.K.hangar ? [['cnt', 'Drones'], ['sz', 'Drone size']] : [['dmg', 'Damage'], ['rof', 'Rate of fire'], ['rng', 'Range'], ...(m.K.charges ? [['chg', 'Charges']] : [])]).map(([k, label]) => `<div class="srow"><span>${label} dial</span><b class="stepper"><button data-gtune="${k}" data-d="-1">−</button>×${m.tune[k]}<button data-gtune="${k}" data-d="1">+</button></b></div>`).join('')
      + `<div class="tiny">${m.K.hangar ? `The hangar's bulk, cost and its load on the weapons computer (${num(m.load, 2)} mounts) follow the drones it carries.` : `The dials set the gun; power, bulk, cost, its load on the weapons computer (${num(m.load, 2)} mounts) and how hard it is to aim all follow — and climb fast.`}</div>` : ''}
    ${g ? `<div class="srow"><span>As the ship runs it</span><b>${fmt(g.dmg)} dmg/s</b><span class="tiny">${m.K.orbital ? 'to the ground · ' : `<span style="color:${g.band.color}">reach ${fmt(m.v.range)} u — ${g.band.name}</span> · `}targeting ${Math.round(g.targeting)}% (its own ${Math.round(m.v.accuracy)}% + the computer's ${num(t.bonus, 1)}%)</span></div>` : ''}
    ${m.stats.map(s => `<div class="srow"><span>${s.label}</span><b class="${s.boosted ? 'up2' : ''}">${num(s.val, s.dec)} ${s.unit}</b><span class="tiny">${s.boosted ? `standard ${num(s.std, s.dec)}` : Math.abs(s.std - s.base) > 0.005 ? `basic ${num(s.base, s.dec)}, ${s.less ? 'lowered' : 'raised'} by what you know` : 'basic'}</span></div>`).join('')}
    <div class="dropzone">${m.mine.length ? m.mine.map(cp => capChip(cp, 'on') + ` title="${esc(cp.btName)} — ${esc(cp.prop)}">${cp.name} +${cp.pct}%<button data-uncap="${cp.id}" data-mod="${m.mod.id}">✕</button></span>`).join('') : '<span class="tiny">Capsules on it: none. Drop or click one below.</span>'}</div>
    <div class="tiny" style="margin-top:6px">each: cost ${fmt(m.cost)} · volume ${fmt(m.volume)}${m.n > 1 ? ` · all ${m.n}: cost ${fmt(m.cost * m.n)} · volume ${fmt(m.volume * m.n)}` : ''}</div>
    <div class="grp" style="display:flex;justify-content:space-between;align-items:center">Breakthroughs that fit <button class="x" data-fitonly>${onlyFit ? 'show all' : 'only what fits'}</button></div>
    ${fits || `<div class="tiny">${onlyFit ? 'Nothing you have found fits this.' : 'Nothing left to place.'}</div>`}</div>`;
}

function renderDesign(c) {
  const d = design();
  $('dPick').innerHTML = S.designs.map(x => { const t = designStats(S, x, c.caps).t; return `<option value="${x.id}" ${x.id === curDesign ? 'selected' : ''}>${esc(x.name)} — ${t.dock ? 'space dock' : CLASS_NAME[t.klass].toLowerCase()}</option>`; }).join('');
  const addBtn = k => `<button data-addmod="${k}" style="--c:${KINDS[k].color}">＋ ${KINDS[k].name}</button>`;
  $('dSysAdd').innerHTML = KIND_IDS.filter(k => !isWeapon(k) && !KINDS[k].engine).map(addBtn).join('');   // a structure has no engines — with one it is a ship: switch the class above
  $('dWeapAdd').innerHTML = KIND_IDS.filter(isWeapon).map(addBtn).join('');
  if (!d) { DS = null; FIT = null; chipsFor = null; showMode(false); drawHull($('dHull'), null); for (const id of ['dHullPick', 'dSysList', 'dFire', 'dWeapList', 'dClass', 'dKlass']) $(id).innerHTML = ''; $('dSummary').innerHTML = '<div class="tiny">No design open. Press ＋.</div>'; return; }
  if (document.activeElement !== $('dName')) $('dName').value = d.name;
  if (!d.klass) d.klass = designStats(S, d, c.caps).t.klass;                     // an older design: its class from what it carries
  const chip = d.klass !== 'structure';                                           // a SHIP: chips on the painted ship · a STRUCTURE: modules one by one
  if (chip && chipsFor !== d.id) { gameChips.set(d.chips || chipsOfDesign(d, 1)); chipsFor = d.id; rebuildFromChips(d, c); }
  showMode(chip);
  const KL = { starship: 'a star drive: it crosses between stars', platform: 'thrusters only: a ship or a platform that moves inside its own system and cannot leave it', structure: 'no engine: a district, built on the ground' };
  $('dKlass').innerHTML = [['starship', 'Starship'], ['platform', 'Platform · in-system'], ['structure', 'District']].map(([k, l]) => `<button class="${d.klass === k ? 'go' : 'x'}" data-dklass="${k}" style="flex:1" title="${KL[k]}">${l}</button>`).join('');

  DS = designStats(S, d, c.caps);
  const t = DS.t;
  const hasShield = DS.shields.length > 0, isShip = t.klass !== 'structure', nDes = shipDesignCount();
  const why = t.dock ? `a space dock: ships are put together inside its gantry${isShip ? ' — and with an engine it can move' : ''}`
    : { structure: 'no engine: a district, built on the ground', platform: 'thrusters only: it crawls from place to place inside its own system and cannot leave it', starship: 'it has a star drive: next eon to any place in its system, and it can cross to other stars' }[t.klass];
  $('dClass').innerHTML = note ? `<span class="up">${esc(note)}</span>` : `${badgeOf(t)} <span class="tiny">${why} · ship designs <b class="${nDes >= MAX_SHIP_DESIGNS ? 'up' : ''}">${nDes} / ${MAX_SHIP_DESIGNS}</b></span>`;
  // which dock would build this — colony by colony, and the best of them as a size bar under the hull
  const fits = isShip ? c.colonies.map(p => ({ p, fit: dockFit(p.gantries, t.hull.area) })) : [];
  const best = isShip ? dockFit(c.colonies.flatMap(p => p.gantries), t.hull.area) : null, whole = fits.some(f => f.fit?.sections === 1);
  FIT = best && { area: t.hull.area, cap: best.cap, sections: best.sections, label: best.sections === 1 ? `${best.at} space dock: ${t.squares} of ${best.cap} squares — it fits` : `${best.at} space dock holds ${best.cap} squares: ${t.squares} → cut into ${best.sections} sections` };
  const cur = hullDef(DS.hull.id);
  $('dHullPick').innerHTML = `<span class="tiny">Silhouette</span>` + hullsFor(t.hullClass).filter(h => !h.asBuilt).map(h => `<button class="tpl ${DS.hull.id === h.id ? 'on' : ''}" data-hull="${h.id}" title="${esc(h.name)}${h.user ? ' (yours)' : ''}">${tplIcon(h, DS.hull.id === h.id)}</button>${chip && h.user ? `<button class="x" data-hulldel="${h.id}" title="delete “${esc(h.name)}”" style="padding:0 5px;margin-left:-3px">✕</button>` : ''}`).join('')
    + (chip ? '' : `<button class="x" data-hulldraw title="draw a new silhouette">✎ Draw…</button>${cur?.user ? `<button class="x" data-hulledit="${cur.id}" title="edit this silhouette">✎ edit</button>` : ''}`)
    + (chip ? '<span class="tiny">· double-click the ship to reshape it</span>' : `<span class="tiny">· ${plural(t.squares, 'square')} now · shape is looks, size is what the dock counts</span>`);
  let ps = null;
  if (chip) { ps = paintedShip(d, c.caps); syncPaintCtl(d); paintMain(d); gameChips.showShip(ps); }
  else {
    drawHull($('dHull'), DS, FIT, selMod);
    // the two columns; a clicked card opens in place with its dials and the capsules that fit it
    const usedBy = new Map();
    for (const mm of d.modules) for (const id of mm.caps) usedBy.set(id, mm);
    const X = { t, caps: c.caps, usedBy };
    const sys = DS.mods.filter(m => !isWeapon(m.kind)), fire = DS.mods.filter(m => m.kind === 'weapon_system'), guns = DS.mods.filter(m => m.K.mount);
    $('dSysList').innerHTML = sys.map(m => modCard(m, X)).join('') || '<div class="tiny">Nothing yet. Add systems above.</div>';
    $('dFire').innerHTML = (fire.map(m => modCard(m, X)).join('') || (guns.length ? '<div class="note">No weapons computer: the guns are worked by hand.</div>' : ''))
      + (t.mountsUsed || t.mounts ? `<div class="tiny" style="margin:2px 0 8px"><div class="prog"><div style="width:${100 * Math.min(1, t.mountsUsed / Math.max(t.mounts, 1e-9))}%;background:${t.fireFactor < 1 ? 'var(--bad)' : 'var(--good)'}"></div></div>${num(t.mountsUsed, 1)} of ${num(t.mounts, 1)} mounts used${t.fireFactor < 1 ? ` · <b class="up">guns fire at ${pct(t.fireFactor)}</b>` : ''} · beams 1, kinetics and hangars 2, missiles and orbital 3${t.weapons || t.ground ? ` · all guns ${fmt(t.dps)} dmg/s${t.ground ? `, ${fmt(t.ground)} to the ground` : ''}` : ''}${t.missiles ? ` · ${t.missiles} missiles` : ''}${t.drones ? ` · ${t.drones} drones, <b class="${t.airCap ? '' : 'up'}">${t.airCap} in the air at once</b> (each flying drone takes two mounts of the computer) · a drone flies on a battery: about 7 volleys from 150 u away, 1 from 450, then it must come home` : ''}${(t.missiles || t.drones) ? (t.fabStock ? ` · <b>fabricator stock ${fmt(t.fabStock)}</b>: at most ${t.missiles ? `${t.maxReloads} more missiles` : ''}${t.missiles && t.drones ? ' <i>or</i> ' : ''}${t.drones ? `${t.maxSorties} drone sorties` : ''}${t.missiles && t.drones ? ' — one stock for both, so in battle you get less of each' : ''}${t.reload ? `, at ${t.reload.toFixed(1)} missiles a minute` : ''}` : ' · <b class="up">no fabricator</b>: what it carries is all it has') : ''}</div>` : '');
    $('dWeapList').innerHTML = guns.map(m => modCard(m, X)).join('') || '<div class="tiny">No guns. Add weapons above; each gets its own hard points on the hull.</div>';
  }

  // the summary, in sections, with icons
  const box = (icon, label, val, bad) => `<div class="${bad ? 'bad' : ''}"><i>${icon}</i><span>${label}</span><b>${val}</b></div>`;
  const sec = (title, boxes) => boxes ? `<div class="sec"><h3>${title}</h3><div class="sum">${boxes}</div></div>` : '';
  let build = box(ICON.cost, 'Cost to build', fmt(t.cost));
  if (isShip) build += box(ICON.dock, 'Space dock', fits.map(({ p, fit }) => `${esc(p.pl.name)}: ${!fit ? 'no dock' : fit.sections === 1 ? `fits (${fit.cap} sq) ✓` : `${fit.sections} sections, ${extraCost(fit)}`}`).join(' · ') || 'no colony', !whole);
  if (t.upkeep) build += box(ICON.upkeep, 'Upkeep', '−' + fmt(t.upkeep) + ' industry/eon');
  let hull = box(ICON.volume, 'Volume', `${fmt(t.volume)} · ${plural(t.squares, 'square')}`) + box(ICON.hp, 'Hull', `${fmt(t.hp)} HP`);
  if (t.armor) hull += box('▣', 'Armour', `${fmt(t.armor)} HP · shrugs ${t.deflect.toFixed(1)}/hit`);
  if (t.hullRepair) hull += box(ICON.upkeep, 'Repairs in battle', `${t.hullRepair.toFixed(1)} hull/s`);
  if (hasShield) hull += box(ICON.shield, 'Shield', `${fmt(t.shield)} · +${fmt(t.shieldRec)}/s`) + box(ICON.cover, 'Shield covers', pct(t.cover) + ' of the hull', t.cover < 0.999);
  let power = box(ICON.power, 'Power', `${fmt(t.powerOut)} made / ${fmt(t.powerUse)} used`, t.powerFactor < 1);
  if (t.powerFactor < 1) power += box(ICON.runs, 'Runs at', pct(t.powerFactor), true);
  if (t.mounts || t.mountsUsed) power += box(ICON.fire, 'Weapons computer', `${num(t.mountsUsed, 1)} of ${num(t.mounts, 1)} mounts${t.fireFactor < 1 ? ` · guns fire at ${pct(t.fireFactor)}` : ''}`, t.fireFactor < 1);
  let fire = '';                                     // what the guns do to each layer, as the battle resolves it (chipeditor.js vsLayers)
  if (t.weapons || t.drones || t.missiles) {
    const L = { shield: 0, through: 0, armor: 0, hull: 0 };
    for (const x of DS.mods) if (x.K.mount && !x.K.hangar && !x.K.orbital) { const v = x.v, aim = Math.min(98, v.accuracy + t.bonus), l = vsLayers(v.damage * t.powerFactor * t.fireFactor, v.rate * aim / 100 * x.n, x.mod.preset, x.kind); for (const k in L) L[k] += l[k]; }
    fire = box(ICON.damage, 'Damage', `${fmt(t.dps)} dmg/s`) + box(ICON.shield, 'Against a shield', `${fmt(L.shield)}${L.through > 0.05 ? ` (+${fmt(L.through)} through it)` : ''}`) + box('▣', 'Against armour', fmt(L.armor)) + box(ICON.hp, 'Against the hull', fmt(L.hull))
      + (ps ? box(ICON.reach, 'Stands off at', `${ps.pref} u`) + (ps.pd ? box(ICON.fire, 'Point defence', plural(ps.pd, 'gun')) : '') : '') + (t.missiles ? box(ICON.speed, 'Missiles', t.missiles) : '') + (t.drones ? box(ICON.gantry, 'Drones', `${t.drones}, ${t.airCap} in the air at once`, !t.airCap) : '');
  }
  let travel = '';
  if (isShip) travel += box(ICON.speed, 'Battle speed', fmt(t.speed) + ' u/s') + box(ICON.speed, 'Turns', `${Math.round(t.turn)}°/s — half a turn in ${Math.round(180 / Math.max(1, t.turn))} s`) + box(ICON.evasion, 'Evasion', Math.round(t.evasion) + '%');
  if (t.klass === 'starship') travel += box(ICON.drive, 'Star drive', `moves ${fmt(t.lift)} of ${fmt(t.volume)} volume ${t.underDriven ? '✗' : '✓'}`, t.underDriven) + box(ICON.stars, 'Between stars', `reach ${shipRange(t, c.warp).toFixed(1)} light years · ${(VOY.speed * c.warp).toFixed(1)} ly a turn`, !t.underDriven && shipRange(t, c.warp) < 3);
  let civ = '';
  if (t.housing) civ += box(ICON.house, isShip ? 'Carries' : 'Houses', peopleWord(t.housing * (isShip ? SCALE.shipHousing : 1)) + ' people');
  if (t.research) civ += box(ICON.research, isShip ? 'Lab (studies where parked)' : 'Research', '+' + fmt(t.research));
  if (t.industry) civ += box(ICON.industry, 'Industry', '+' + fmt(t.industry) + '/eon');
  if (t.social) civ += box(ICON.social, 'Social', '+' + fmt(t.social) + '/eon');
  if (t.dock) civ += box(ICON.gantry, 'Gantry', t.gantries.map(s => `${s.w} × ${s.h}`).join(', ') + ` (${t.gantries.reduce((a, s) => a + s.w * s.h, 0)} squares)`);
  const warns = [], tips = [];
  if (t.powerFactor < 1) warns.push(`Not enough power: everything on it runs at ${pct(t.powerFactor)}. Turn the reactor up, add one, or use less.`);
  if (t.powerOut > t.powerUse * 1.6 && t.powerUse > 0) tips.push(`The reactor makes ${fmt(t.powerOut)} MW for ${fmt(t.powerUse)} needed — turn it down and the hull shrinks and gets cheaper.`);
  if (hasShield && t.cover < 0.999) warns.push(`The shield's field reaches only ${pct(t.cover)} of the hull: the uncovered part takes hits bare, so the shield counts for ${pct(t.cover)} of its strength. ${chip ? 'Take something out — the hull is past what a generator can cover.' : 'Turn its size up (open it and press "fit"), or Auto-fit.'}`);
  if (t.underDriven) warns.push(`The star drive moves ${fmt(t.lift)} of volume and the hull is ${fmt(t.volume)}: it cannot leave the system. Turn the drive up (open it and press "fit to need"), or take something out.`);
  if (isShip && !best) warns.push('None of your colonies has a space dock, so this cannot be built anywhere. Build a Space dock first.');
  else if (isShip && !whole) warns.push(`Too big for any gantry you have (${t.squares} squares against ${best.cap}). The dock would cut it into ${best.sections} sections and build those: ${extraCost(best)}. Take something out, turn the reactor down, or build a dock with a bigger gantry.`);
  if (t.fireFactor < 1) warns.push(`The weapons computer runs ${num(t.mounts, 1)} mounts and the guns need ${num(t.mountsUsed, 1)}: they fire at ${pct(t.fireFactor)}. Turn it up, add one, or carry fewer guns.`);
  if (t.drones && !t.airCap) warns.push('No drone can fly: the weapons computer has no mounts left over for them.');
  if (t.dock) tips.push(`Whatever fits inside the gantry is built whole. A bigger hull is cut into gantry-sized sections, and every extra section adds ${Math.round(Math.min(...t.gantries.map(s => s.overhead)))}% to its cost and ${plural(T.sectionEons, 'eon')} of joining to the build. The dock works for the colony it stands at${isShip ? ', or wherever it is parked' : ''}.`);
  if (isShip && t.housing) tips.push(`It carries people, so it is a colony ship: up to ${peopleWord(t.housing * SCALE.shipHousing)} go aboard when it is built (a ship's habitat holds a thousandth of a world's), and it can settle any world it can land on — landed, the ship is an outpost: its fabricators and labs work at a hundredth.`);
  if (isShip && t.research) tips.push('It has a lab: parked in orbit of a place, it studies that place.');
  const arm = DS.mods.find(m => m.kind === 'armor'); if (arm && arm.n > 1) tips.push(`Armour layers ring outward: ${arm.n} layers give ${arm.n}× the points for ${(arm.n + 0.2 * arm.n * (arm.n - 1)).toFixed(1)}× the bulk of one. Once the armour is gone, every hull point lost slows the ship and its guns.`);
  const html = (warns.length ? `<div class="probs"><b>Problems</b>${warns.map(w => `<div>⚠ ${w}</div>`).join('')}${chip ? '' : '<div class="tiny" style="margin-top:4px">⚙ Auto-fit (top of the Systems column) sizes the reactor, the star drive and the weapons computer, and adds shields.</div>'}</div>` : '')
    + sec('Build', build) + sec('Hull', hull) + sec('Firepower', fire) + sec('Power', power) + sec('Travel', travel) + sec('Civilian', civ)
    + (tips.length ? `<div class="notes tiny">${tips.map(w => `<div>· ${w}</div>`).join('')}</div>` : '');
  $(chip ? 'dStats' : 'dSummary').innerHTML = html; $(chip ? 'dSummary' : 'dStats').innerHTML = '';   // a ship's numbers on the right, a structure's under its plan
}

// guns on the hull: click one to open its weapon, drag it to slide the whole group along the hull,
// double-click to put the group back where the game had it
{
  const cv = $('dHull');
  let drag = null;
  const hullXY = e => { const r = cv.getBoundingClientRect(), map = cv._map; return map ? [((e.clientX - r.left) * cv.width / r.width - map.cx) / map.px, ((e.clientY - r.top) * cv.height / r.height - map.cy) / map.px] : null; };
  const gunAt = e => { const p = hullXY(e); if (!p || !DS) return null; let best = null, bd = 0.45; for (const m of DS.mounts) { const d = Math.hypot(m.x - p[0], m.y - p[1]); if (d < bd) { bd = d; best = m; } } return best; };
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const m = gunAt(e); if (!m) return;
    const mod = design()?.modules.find(x => x.id === m.modId); if (!mod) return;
    const p = hullXY(e), gx = DS.mounts.filter(x => x.modId === m.modId), cx = gx.reduce((a, x) => a + x.x, 0) / gx.length;
    drag = { mod, dx: cx - p[0], pos0: mod.pos, moved: false };
    if (selMod !== m.modId) { selMod = m.modId; refresh(); }
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) { const m = gunAt(e); cv.style.cursor = m ? 'grab' : 'default'; return; }
    const p = hullXY(e), hull = DS.hull, pos = clamp((p[0] + drag.dx - hull.box.minx) / hull.bw, 0.05, 0.95);
    if (Math.abs((drag.mod.pos ?? -1) - pos) < 0.004) return;
    drag.mod.pos = Math.round(pos * 200) / 200; drag.moved = true; refresh();
  });
  const drop = () => { if (!drag) return; const d = drag; drag = null; if (d.moved) save(); };
  cv.addEventListener('pointerup', drop); cv.addEventListener('pointercancel', drop);
  cv.addEventListener('dblclick', e => { const m = gunAt(e); const mod = m && design()?.modules.find(x => x.id === m.modId); if (mod && mod.pos != null) { delete mod.pos; save(); refresh(); } });
}

function applyCap(modId, capId) {
  const d = design(); if (!d) return;
  const m = d.modules.find(x => x.id === modId), cp = allCapsules(S).find(x => x.id === capId);
  if (!m || !cp) return;
  if (cp.done) return say(`${cp.name} is fully integrated already`);
  if (!isRelevant(m.kind, cp.channel)) return say(`${cp.name} does nothing for a ${KINDS[m.kind].name.toLowerCase()}`);
  if (d.modules.some(x => x.caps.includes(capId))) return say('That capsule is already used in this design');
  m.caps.push(capId); selMod = modId; save(); refresh();
}
function removeModule(modId) {
  const d = design(); if (!d) return;
  d.modules = d.modules.filter(x => x.id !== modId); if (selMod === modId) selMod = null;
  save(); refresh();
}

// =====================================================================
// events
// =====================================================================
const TABS = ['empire', 'galaxy', 'system', 'design'];
function refresh() {
  const c = LAST = compute(S);
  GODC = W ? W.empires.map(E => E.dead ? null : compute(E)) : null;   // every empire's figures: God mode, and the other empires' ships in your star systems
  renderTop(c); renderReplayBar();
  if (tab === 'empire') renderEmpire(c);
  if (tab === 'galaxy') renderGalaxy(c);
  if (tab === 'system') renderSystem(c);
  if (tab === 'design') renderDesign(c);
  renderShipPop();                                   // the spec pop-up follows the state (an eon ended, a ship moved)
  renderColPop();                                    // the colony pop-up too
  renderFleetPop(true); renderSendBadge(); renderSysPop();   // the fleet pop-up, the send-here badge and the system pop-up on the maps
}
function go(next) {
  tab = next;
  for (const t of TABS) $('tab-' + t).classList.toggle('hidden', t !== tab);
  for (const b of $('eTabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  refresh();
}
function toastErr(msg) { if (msg) { $('sHover').textContent = msg; $('gHover').textContent = msg; } }

document.addEventListener('click', e => {
  const q = s => e.target.closest(s);
  let t;
  if ((t = q('[data-tab]'))) return go(t.dataset.tab);
  if ((t = q('[data-att]'))) { giveAttention(S, t.dataset.att, +t.dataset.d); save(); return refresh(); }
  if ((t = q('[data-fplus]'))) { tetra.pull(+t.dataset.fplus); save(); return refresh(); }
  if ((t = q('[data-freset]'))) { tetra.to([...CENTER]); save(); return refresh(); }
  if ((t = q('[data-gfield]'))) { gField = gField === t.dataset.gfield ? null : t.dataset.gfield; return refresh(); }
  if ((t = q('[data-randseed]'))) { seedDraft = String(Math.floor(Math.random() * 1e6)); return refresh(); }
  if ((t = q('[data-newseed]'))) {
    const text = $('gSeed').value.trim() || '7', n = setup.n, who = setup.who.slice(0, n), sim = n > 1 && who.every(w => w === 'ai');
    if (!confirm(sim ? `Simulate ${n} AI empires on ${setup.stars} stars (seed "${text}") up to eon ${setup.cap}? The game you are playing is lost.` : `Start a new game in the galaxy of seed "${text}" (${setup.stars} stars${n > 1 ? `, ${n} empires` : ''})? The game you are playing is lost.`)) return;
    setup.seed = text; if (sim) simStart(); else startGame(text, n, setup.stars, { me: Math.max(0, who.indexOf('you')), focus: setup.focus.slice(0, n) }); return;
  }
  if ((t = q('[data-opensys]'))) return openSystem(t.dataset.opensys);
  if ((t = q('[data-gplace]'))) return openSystem(placeOf(t.dataset.gplace).sys, t.dataset.gplace);
  // THE COLONY POP-UP: open it, close it, its production line (add, how many, drop)
  if (colPop && e.target.id === 'colPop' && performance.now() - cpDragEnd > 300) return closeColPop();   // a click outside the colony (on the dimmed map) closes it — not the end of a drag
  if ((t = q('[data-colpop]'))) return openColPop(t.dataset.colpop);
  if ((t = q('[data-colpopk]'))) { const [k, place] = t.dataset.colpopk.split('|'); return openColPop(place, +k); }
  if ((t = q('[data-gspec]'))) { const [k, id] = t.dataset.gspec.split('|'); e.shipPopOpened = true; return openShipPop(+k, [id], e.clientX, e.clientY); }
  if ((t = q('[data-cpclose]'))) return closeColPop();
  if ((t = q('[data-cpend]'))) return $('eEnd').onclick();
  if ((t = q('[data-cqopen]'))) { cpAdd = !cpAdd; return renderColPop(); }
  if ((t = q('[data-cqadd]'))) { cpAdd = false; toastErr(queueAdd(S, colPop, t.dataset.cqadd, 1)); save(); return refresh(); }
  if ((t = q('[data-cqplus]')) || (t = q('[data-cqminus]'))) { const id = t.dataset.cqplus || t.dataset.cqminus, it = placeOf(colPop)?.colony?.queue.find(x => x.id === id); if (!it) return; toastErr(queueCount(S, colPop, id, (it.count || 1) + (t.dataset.cqplus ? 1 : -1))); save(); return refresh(); }
  if ((t = q('[data-cqdel]'))) { toastErr(queueDrop(S, colPop, t.dataset.cqdel)); save(); return refresh(); }
  if ((t = q('[data-unq]'))) { const P = placeOf(t.dataset.planet).colony; P.queue = P.queue.filter(x => x.id !== t.dataset.unq); save(); return refresh(); }
  if ((t = q('[data-buynow]'))) {                      // BUY NOW: the rest of a queue item paid from the reserves (stored industry)
    const pc = LAST.colonies.find(x => x.pl.id === t.dataset.planet), qi = pc && pc.queue.find(x => x.item && x.item.id === t.dataset.buynow); if (!qi || qi.noDock) return;
    if ((S.reserves || 0) < qi.need - 1e-6) return say('Not enough in the reserves');
    S.reserves -= qi.need; qi.item.progress += qi.need; save(); return refresh();
  }
  if ((t = q('[data-send]'))) { toastErr(sendShip(S, t.dataset.send, document.querySelector(`[data-dest="${t.dataset.send}"]`).value)); save(); return refresh(); }
  if ((t = q('[data-recall]'))) { recallShip(S, t.dataset.recall); save(); return refresh(); }
  if ((t = q('[data-outundo]'))) { const all = scopeGroups(LAST).flatMap(g => g.ships.map(x => x.u.id)), chosen = picked(scopeGroups(LAST)).map(x => x.u.id); toastErr(regroupSend(S, all, chosen, null)); picks.clear(); sendTo = null; pickScope = null; save(); return refresh(); }   // part of an outgoing fleet stays home
  if ((t = q('[data-unsend]'))) { toastErr(undoSend(S, t.dataset.unsend)); save(); return refresh(); }
  if ((t = q('[data-sendplace]'))) { sendPlace = t.dataset.sendplace; return refresh(); }   // the galaxy's send: WHERE in the chosen system
  if ((t = q('[data-gpick]'))) { const k = t.dataset.gpick, n = clamp((picks.get(k) || 0) + +t.dataset.d, 0, +t.dataset.max); if (n) picks.set(k, n); else picks.delete(k); return refresh(); }
  if ((t = q('[data-gall]'))) { const k = t.dataset.gall, max = +t.dataset.max; if ((picks.get(k) || 0) === max) picks.delete(k); else picks.set(k, max); return refresh(); }
  if ((t = q('[data-pclear]'))) { picks.clear(); sendTo = null; return refresh(); }
  if ((t = q('[data-pcancel]'))) { sendTo = null; return refresh(); }
  if ((t = q('[data-psend]'))) { const ships = picked(scopeGroups(LAST)), dest = sendDest(); if (pickScope && pickScope.kind === 'outgoing') { const all = scopeGroups(LAST).flatMap(g => g.ships.map(x => x.u.id)); toastErr(regroupSend(S, all, ships.map(x => x.u.id), dest)); picks.clear(); sendTo = null; sendPlace = null; pickScope = null; save(); return refresh(); } toastErr(sendFleet(S, ships.map(x => x.u.id), dest)); picks.clear(); sendTo = null; sendPlace = null; save(); return refresh(); }
  if ((t = q('[data-ptogalaxy]'))) { const keep = new Map(picks), sys = placeOf(pickScope.place).sys; pickScope = { kind: 'galaxy', sys }; picks = keep; sendTo = null; gSel = sys; gMode = 'fleet'; return go('galaxy'); }
  if ((t = q('[data-watch]'))) return watchBattle(t.dataset.watch);
  if ((t = q('[data-gsys]'))) { gMode = 'system'; return refresh(); }
  if ((t = q('[data-gfleet]'))) { gMode = 'fleet'; return refresh(); }
  if ((t = q('[data-greset]'))) { gView = { z: 1, x: 0, y: 0 }; return refresh(); }
  if ((t = q('[data-dklass]'))) {                      // the design's class: a ship (chips) or a structure (modules); a ship takes one of the design slots
    const d = design(); if (!d) return; const k = t.dataset.dklass; if (k === d.klass) return;
    if (d.klass === 'structure' && shipDesignCount() >= MAX_SHIP_DESIGNS) return say(`${MAX_SHIP_DESIGNS} ship designs at most — delete one first (refits come later)`);
    leaveOutline();
    if (k === 'structure') { d.klass = k; d.modules = d.modules.filter(m => !KINDS[m.kind].engine); chipsFor = null; }
    else { if (d.klass === 'structure') { d.chips = chipsOfDesign(d, 1); chipsFor = null; } d.klass = k; if (chipsFor === d.id) rebuildFromChips(d, LAST); }
    selMod = null; save(); return refresh();
  }
  if ((t = q('[data-settle]'))) { const u = S.ships.find(x => x.id === t.dataset.settle), o = u && W ? ownerOf(W, S, u.at) : null; toastErr(o ? `${o.name} holds it — land troops instead` : settle(S, t.dataset.settle)); save(); return refresh(); }
  if ((t = q('[data-invade]'))) { if (!W) return; const err = invade(W, S, t.dataset.invade); if (err) toastErr(err); else say(S.report.at(-1)?.text || 'The troops have landed'); save(); return refresh(); }
  if ((t = q('[data-hull]'))) { const d = design(); if (!d) return; d.hull = t.dataset.hull; fitGunsFor = d.id; save(); return refresh(); }
  if ((t = q('[data-hulldel]'))) return deleteHull(t.dataset.hulldel);
  if ((t = q('[data-hulldraw]'))) return hullEd.open({ klass: DS?.t.hullClass || 'starship' });
  if ((t = q('[data-hulledit]'))) return hullEd.open({ hull: t.dataset.hulledit });
  if ((t = q('[data-addmod]'))) { const d = design(); if (!d) return; if (KINDS[t.dataset.addmod].engine && DS && DS.t.klass === 'structure' && shipDesignCount() >= MAX_SHIP_DESIGNS) return say(`${MAX_SHIP_DESIGNS} ship designs at most — delete one first (refits come later)`); const m = { id: uid('m'), kind: t.dataset.addmod, caps: [], n: 1 }; d.modules.push(m); selMod = m.id; save(); return refresh(); }
  if ((t = q('[data-gsize]'))) { const m = design()?.modules.find(x => x.id === selMod); if (!m) return; const k = t.dataset.gsize; m[k] = clamp((m[k] || GANTRY[k]) + +t.dataset.d, 1, k === 'w' ? GANTRY.maxW : GANTRY.maxH); save(); return refresh(); }
  if ((t = q('[data-rk]'))) { const m = design()?.modules.find(x => x.id === selMod), sc = m && KINDS[m.kind].scale; if (!sc) return; m.k = clamp(Math.round(((m.k || 1) + sc.step * +t.dataset.rk) / sc.step) * sc.step, sc.min, sc.max); save(); return refresh(); }
  if ((t = q('[data-rfit]'))) { const d = design(); if (!d || !selMod) return; fitModule(S, d, selMod); save(); return refresh(); }
  if ((t = q('[data-gtune]'))) { const m = design()?.modules.find(x => x.id === selMod); if (!m || !KINDS[m.kind].mount) return; const k = t.dataset.gtune; m[k] = clamp(Math.round(((m[k] || 1) + GUN.step * +t.dataset.d) / GUN.step) * GUN.step, GUN.min, GUN.max); if (!KINDS[m.kind].hangar) m.preset = 'custom'; save(); return refresh(); }
  if ((t = q('[data-mcount]'))) { const d = design(), m = d?.modules.find(x => x.id === selMod); if (!m) return; m.n = (m.n || 1) + +t.dataset.mcount; if (m.n < 1) return removeModule(m.id); save(); return refresh(); }
  if ((t = q('[data-uncap]'))) { const m = design().modules.find(x => x.id === t.dataset.mod); m.caps = m.caps.filter(x => x !== t.dataset.uncap); save(); return refresh(); }
  if ((t = q('[data-mdel]'))) return removeModule(t.dataset.mdel);
  if ((t = q('[data-fitonly]'))) { onlyFit = !onlyFit; return refresh(); }
  if ((t = q('[data-pick]'))) { if (q('button')) return; selMod = selMod === t.dataset.pick ? null : t.dataset.pick; return refresh(); }
  if ((t = q('[data-btopen]'))) { openBt.has(t.dataset.btopen) ? openBt.delete(t.dataset.btopen) : openBt.add(t.dataset.btopen); return refresh(); }
  if ((t = q('[data-cap]'))) { if (t.classList.contains('used')) return; if (!selMod) return say('Open a system or a weapon first'); return applyCap(selMod, t.dataset.cap); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dPick') { leaveOutline(); curDesign = e.target.value; selMod = null; return refresh(); }
  if (e.target.closest?.('[data-preset]')) { const m = design()?.modules.find(x => x.id === selMod); if (!m) return; if (e.target.value === 'custom') m.preset = 'custom'; else applyPreset(m, e.target.value); save(); return refresh(); }
  const t = e.target.closest?.('[data-syspick]'); if (t) { selSys = gSel = t.value; selPlace = (placesIn(selSys).find(p => p.colony) || placeOf(sysOf(selSys).star)).id; refresh(); } });
document.addEventListener('input', e => { if (e.target.id === 'gSeed') seedDraft = e.target.value; });
addEventListener('keydown', e => {                   // ENTER sends (his ask, 2026-10-20): the Send-here badge on the map, if one is up
  if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { const b = document.querySelector('#sendBadge:not([hidden]) [data-psend], #sSendBadge:not([hidden]) [data-psend]'); if (b) { e.preventDefault(); return b.click(); } }
  if (tab !== 'design' || !selMod || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Delete') removeModule(selMod);
});

// drag and drop: capsules → a module card (under the silhouette or in the module panel)
document.addEventListener('dragstart', e => { const cap = e.target.closest?.('[data-cap]'); if (cap) e.dataTransfer.setData('text/plain', 'cap:' + cap.dataset.cap); });
const dropZone = e => e.target.closest?.('.mcard');
document.addEventListener('dragover', e => { const z = dropZone(e); if (z) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { dropZone(e)?.classList.remove('over'); });
document.addEventListener('drop', e => {
  const z = dropZone(e); if (!z) return;
  e.preventDefault(); z.classList.remove('over');
  const data = e.dataTransfer.getData('text/plain');
  if (data.startsWith('cap:')) applyCap(z.dataset.mod, data.slice(4));
});

$('dAuto').onclick = () => { const d = design(); if (!d) return; const done = autoFit(S, d); save(); say(done.length ? 'Auto-fit: ' + done.join(', ') : 'Nothing to fit — it is operational'); };
$('dName').oninput = e => { const d = design(); if (d) { d.name = e.target.value; save(); } };
$('dName').onblur = () => refresh();
// a new design is a starship with a pair of beams (a structure when the ship slots are full); a copy keeps chips, paint and class
$('dNew').onclick = () => { leaveOutline(); const full = shipDesignCount() >= MAX_SHIP_DESIGNS; const d = { id: uid('d'), name: 'New design', klass: full ? 'structure' : 'starship', modules: [], chips: full ? [] : [{ type: 'weapon', kind: 'weapon_energy', h: 1, role: null }], paint: { plating: 0, fittings: 0, seed: Math.floor(Math.random() * 1000) } }; S.designs.push(d); curDesign = d.id; selMod = null; chipsFor = null; save(); if (full) say(`${MAX_SHIP_DESIGNS} ship designs at most — this one is a district; delete a ship design to make room`); else refresh(); };
$('dCopy').onclick = () => { const d = design(); if (!d) return; if ((d.klass || DS?.t.klass) !== 'structure' && shipDesignCount() >= MAX_SHIP_DESIGNS) return say(`${MAX_SHIP_DESIGNS} ship designs at most — delete one first (refits come later)`); leaveOutline(); const c = JSON.parse(JSON.stringify(d)); c.id = uid('d'); c.name = d.name + ' II'; for (const m of c.modules) m.id = uid('m'); S.designs.push(c); curDesign = c.id; selMod = null; chipsFor = null; save(); refresh(); };
$('dDel').onclick = () => { const d = design(); if (!d || !confirm(`Delete the design "${d.name}"? What is already built stays.`)) return; leaveOutline(); S.designs = S.designs.filter(x => x.id !== d.id); curDesign = S.designs[0]?.id || null; selMod = null; chipsFor = null; save(); refresh(); };
$('eEnd').onclick = () => {
  if (SIM) return say('A simulation is running — pause or stop it in the bar above');
  if (REPLAY) return REPLAY.ended ? say('The replay is at its end — rewind it, or take over to play on') : replayStep(1);
  if (W) { worldPlayEon(W, brainFor); S = W.empires[W.me]; newIds = new Set(S.report.filter(r => r.kind === 'breakthrough').map(r => r.id)); }   // the other empires' heads give their orders, the world ends the eon
  else { const rep = endEon(S); newIds = new Set(rep.filter(r => r.kind === 'breakthrough').map(r => r.id)); }
  save(); refresh(); notesFromEon();                 // what happened: in the corner
};
// REPLAY a logged game (src/eon/replay.js; tools/play/play.mjs writes one, tools/play/world.mjs a WORLD of two or three AI
// empires): the seed, then every logged order eon by eon, through the game itself — the same seed and orders give the same game.
// REWIND (his ask, 2026-10-16: "rewind and not only move forward"): a snapshot every SNAP eons; going back restores the nearest one
// at or before the eon and steps forward from it. A world replay has an Empire select: look through any empire's eyes. Stop
// anywhere and the game is yours from there (in a world the other empires then stand still).
let REPLAY = null;
const SNAP = 10;
const sysWord = id => sysOf(id)?.name || id, designWord = id => S.designs.find(d => d.id === id)?.name || id;
const replayEon = () => REPLAY.world ? REPLAY.world.eon : S.eon;
function replayLoad(log) {
  const world = !!log && log.kind === 'world' && Array.isArray(log.empires);
  if (!log || log.seedText == null || !(world || Array.isArray(log.actions))) return say('That is not a game log');
  leaveOutline(); GOD = false; godPick = null;
  if (world) { W = createWorld(log.seedText, log.empires.length, { galaxy: log.galaxy || null }); S = W.empires[0]; }
  else { W = null; S = newState(seedOf(log.seedText)); S.seedText = String(log.seedText); }
  const acts = world ? log.empires.flatMap(e => e.actions) : log.actions;
  REPLAY = { log, world: W, view: 0, last: log.eons && log.eons.length ? Math.max(...log.eons.map(e => e.eon)) : Math.max(0, ...acts.map(a => a.eon)) + 1, snaps: new Map(), ended: false };
  freshView(); replaySnap(); replayApply(); save(); go('empire');
}
function replaySnap() { if (!REPLAY) return; const e = replayEon(); if (e === 1 || e % (REPLAY.snapEvery || SNAP) === 0) REPLAY.snaps.set(e, REPLAY.world ? worldSnapshot(REPLAY.world) : JSON.stringify(S)); }   // the state at the start of the eon, before its orders
function replayApply() {
  if (!REPLAY) return;
  if (REPLAY.world) { for (const E of REPLAY.world.empires) if (!E.dead) { const errs = applyWorldEon(REPLAY.world, E, REPLAY.log.empires[E.empire].actions, REPLAY.world.eon); if (errs.length) console.warn('replay: orders refused', E.name, errs); } }
  else { const errs = applyEon(S, REPLAY.log.actions, S.eon); if (errs.length) console.warn('replay: orders refused', errs); }
}
function replayAdvance() {                           // one eon on: the eon ends (the world's, or the game's), a snapshot now and then, the next eon's orders
  if (REPLAY.world) { worldEndEon(REPLAY.world); S = REPLAY.world.empires[REPLAY.view]; newIds = new Set(); }
  else { const rep = endEon(S); newIds = new Set(rep.filter(r => r.kind === 'breakthrough').map(r => r.id)); }
  if (replayEon() >= REPLAY.last) { REPLAY.ended = true; return; }
  replaySnap(); replayApply();
}
function replayStep(n) {
  if (!REPLAY) return; if (n < 0) return replayGoto(replayEon() + n);
  for (let k = 0; k < n && !REPLAY.ended; k++) replayAdvance();
  if (REPLAY.ended) say('The replay has reached its end — rewind it, or stop it here and play on');
  save(); refresh();
}
function replayGoto(eon) {
  if (!REPLAY) return; eon = Math.max(1, Math.min(REPLAY.last, Math.round(eon) || 1));
  const cur = replayEon(); if (eon === cur && !REPLAY.ended) return;
  if (eon < cur || REPLAY.ended) {                   // back: the nearest snapshot at or before the eon, its orders, then forward
    const at = Math.max(...[...REPLAY.snaps.keys()].filter(k => k <= eon));
    if (REPLAY.world) { worldRestore(REPLAY.world, REPLAY.snaps.get(at)); S = REPLAY.world.empires[REPLAY.view]; } else S = JSON.parse(REPLAY.snaps.get(at));
    REPLAY.ended = false; newIds = new Set(); replayApply();
  }
  while (replayEon() < eon && !REPLAY.ended) replayAdvance();
  save(); refresh();
}
function replayView(i) {                             // a world replay: look through another empire's eyes
  if (!REPLAY || !REPLAY.world || !REPLAY.world.empires[i]) return;
  leaveOutline(); REPLAY.view = i; S = REPLAY.world.empires[i]; freshView(); save(); refresh();
}
function renderReplayBar() {
  const bar = $('replayBar'); if (!bar) return;
  if (SIM) {                                         // the SIMULATION bar: where it is, pause / run / stop, whose eyes, God mode
    const w = SIM.W, secs = (performance.now() - SIM.t0) / 1000, alive = w.empires.filter(E => !E.dead).length, last = SIM.log.events.slice(-2).map(e => esc(e.text)).join(' · ');
    bar.hidden = false; bar.innerHTML = `<b>SIMULATION</b><select data-rview title="look through this empire's eyes">${w.empires.map((E, i) => `<option value="${i}" ${E === S ? 'selected' : ''}>${esc(E.name)}${E.dead ? ' (fallen)' : ''}</option>`).join('')}</select><button class="${GOD ? 'go' : 'x'}" data-rgod title="everything, everyone">👁 God mode${GOD ? ' ✓' : ''}</button><span class="tiny">seed “${esc(w.seedText)}” · ${w.empires[0].systems.length} stars · eon <b>${w.eon}</b> of ${SIM.cap} · ${alive} of ${w.n} empires standing · ${(w.eon / Math.max(0.1, secs)).toFixed(1)} eons/s${last ? ' · ' + last : ''}</span><span style="flex:1"></span>${SIM.running ? `<button class="x" data-simpause title="pause the simulation (the world waits)">❚❚ pause</button>` : `<button class="go" data-simrun title="run on">▶ run</button>`}<input type="number" data-simcap value="${SIM.cap}" min="${w.eon}" max="5000" title="run to this eon" style="width:72px"><button class="x" data-simstop title="stop here: the simulation becomes a replay you can rewind, save or take over">⏹ stop → replay</button>`;
    return;
  }
  if (!REPLAY) { bar.hidden = true; return; }
  const W = REPLAY.world, eon = replayEon(), ended = REPLAY.ended;
  const word = a => a.type === 'send' ? `send ${a.n} × ${designWord(a.design)} ${sysWord(a.from)} → ${a.toPlace ? (placeOf(a.toPlace)?.name || a.toPlace) : sysWord(a.to)}` : a.type === 'sendmix' ? `send ${(a.mix || []).map(m => `${m.n} × ${designWord(m.design)}`).join(' + ')} ${sysWord(a.from)} → ${a.toPlace ? (placeOf(a.toPlace)?.name || a.toPlace) : sysWord(a.to)}` : a.type === 'invade' ? `land troops on ${placeOf(a.place)?.name || a.place}` : a.type === 'devfocus' ? `development focus at ${placeOf(a.place)?.name || a.place}` : a.type === 'plan' ? `plan a cell at ${placeOf(a.place)?.name || a.place}` : a.type === 'count' || a.type === 'qmove' || a.type === 'unq' ? 'the production line' : a.type === 'develop' || a.type === 'district' ? '(an old district order)' : a.type === 'settle' ? `settle ${placeOf(a.place)?.name || a.place}` : a.type === 'build' ? `build ${designWord(a.design)}` : a.type === 'buynow' ? 'buy now' : a.type === 'split' ? `split ${a.split.map(v => Math.round(v * 100)).join(' / ')}` : a.type === 'design' ? `design ${a.design.name}` : a.type === 'focus' ? 'move the focus' : a.type;
  const acts = (W ? REPLAY.log.empires[REPLAY.view].actions : REPLAY.log.actions).filter(a => a.eon === eon);
  const events = W ? (REPLAY.log.events || []).filter(e => e.eon === eon - 1) : [];
  const who = W ? `<select data-rview title="look through this empire's eyes">${W.empires.map((E, i) => `<option value="${i}" ${i === REPLAY.view ? 'selected' : ''}>${esc(E.name)}${E.dead ? ' (fallen)' : ''}</option>`).join('')}</select><button class="${GOD ? 'go' : 'x'}" data-rgod title="the galaxy map shows every empire — spheres, colonies, fleets, ships under way — and the panel a scoreboard; click any fleet or ship">👁 God mode${GOD ? ' ✓' : ''}</button>` : '';
  bar.hidden = false; bar.innerHTML = `<b>REPLAY</b>${who}<span class="tiny">seed “${esc(REPLAY.log.seedText)}” · eon ${eon} of ${REPLAY.last}${ended ? ' · the end' : ''}${S.dead ? ' · <b style="color:var(--bad)">this empire has fallen</b>' : ''}${acts.length ? ' · this eon: ' + acts.map(a => esc(word(a))).join(' · ') : ' · no orders this eon'}${events.length ? ' · <b style="color:var(--bad)">' + events.slice(0, 3).map(e => esc(e.text)).join(' · ') + (events.length > 3 ? ` · and ${events.length - 3} more` : '') + '</b>' : ''}</span><span style="flex:1"></span>
    <button class="x" data-rgoto="1" title="back to the start">⏮</button><button class="x" data-rstep="-10" title="ten eons back (Page Up)">⏪ 10</button><button class="x" data-rstep="-1" title="an eon back (←)">◀</button><input type="number" data-reon value="${eon}" min="1" max="${REPLAY.last}" title="go to an eon (Enter)" style="width:66px"><button class="go" data-rstep="1" ${ended ? 'disabled' : ''} title="an eon on (→)">▶ next</button><button class="x" data-rstep="10" ${ended ? 'disabled' : ''} title="ten eons on (Page Down)">⏩ 10</button><button class="x" data-rgoto="${REPLAY.last}" title="to the end" ${ended ? 'disabled' : ''}>⏭</button><button class="x" data-blist title="the run's big battles and the falls — click one to go there and watch">⚔ battles${REPLAY.log.highlights ? ` (${REPLAY.log.highlights.filter(h => h.kind === 'battle').length})` : ''}</button><button class="x" data-rsave title="save this campaign's log as a file (load it again with ▶ replay…)">⤓ log</button><button class="x" data-rstop title="stop the replay here and play on yourself${W ? ' — the other empires play on with their heads' : ''}">✕ take over</button>`;
}
$('eReplay').onclick = () => $('eReplayFile').click();
$('eSetup').onclick = () => { go('galaxy'); const d = $('gSetup'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); const s = $('gSeed'); if (s) s.focus(); } };   // straight to the New game / simulation block
$('eReplayFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; f.text().then(t => { try { replayLoad(JSON.parse(t)); } catch (x) { say('Could not read that file as a game log'); } }); };
document.addEventListener('click', e => {
  const s = e.target.closest('[data-rstep]'); if (s) return replayStep(+s.dataset.rstep); const g = e.target.closest('[data-rgoto]'); if (g) return replayGoto(+g.dataset.rgoto);
  if (e.target.closest('[data-rstop]')) { if (REPLAY.world) { W.me = REPLAY.view; W.brains = null; W.focus = W.focus || (REPLAY.log.empires || []).map(x => x.focus || 'default'); say(`The game is yours as ${S.name} — the other empires play on`); } REPLAY = null; GOD = false; godPick = null; if (gMode === 'god') gMode = 'system'; save(); return refresh(); }   // a world goes on: the others get heads (worldPlayEon)
  if (e.target.closest('[data-rsave]')) return saveLog();
  if (e.target.closest('[data-simpause]')) { if (SIM) SIM.running = false; return renderReplayBar(); }
  if (e.target.closest('[data-simrun]')) { if (SIM) { const cap = +($('replayBar').querySelector('[data-simcap]')?.value || SIM.cap); SIM.cap = Math.max(SIM.W.eon, cap); simRun(); } return; }
  if (e.target.closest('[data-simstop]')) return simStop(true);
  if (e.target.closest('[data-rgod]')) { GOD = !GOD; godPick = null; gMode = GOD ? 'god' : 'system'; if (GOD) go('galaxy'); else refresh(); return; }
  const gf = e.target.closest('[data-gfleet]'); if (gf && godEmpires()) { const [sys, k] = gf.dataset.gfleet.split('|'); godPick = { kind: 'fleet', k: +k, sys }; gSel = sys; return refresh(); }
  const gs = e.target.closest('[data-gship]'); if (gs && godEmpires()) { const [k, id] = gs.dataset.gship.split('|'); godPick = { kind: 'ship', k: +k, id }; return refresh(); }
  if (e.target.closest('[data-gback]') && godEmpires()) { if (godPick && godPick.kind === 'ship') { const E = W.empires[godPick.k], u = E.ships.find(x => x.id === godPick.id), pl = u && !u.dest && E.places.find(p => p.id === u.at); godPick = pl ? { kind: 'fleet', k: godPick.k, sys: pl.sys } : null; } else godPick = null; return refresh(); }
});
document.addEventListener('change', e => { if (e.target.matches('[data-rview]')) { if (SIM) { S = SIM.W.empires[+e.target.value]; freshView(); gMode = GOD ? 'god' : 'system'; return refresh(); } return replayView(+e.target.value); }
  if (e.target.matches('[data-simcap]')) { if (SIM) SIM.cap = Math.max(SIM.W.eon, +e.target.value || SIM.cap); return; } if (e.target.matches('[data-reon]')) return replayGoto(+e.target.value); if (e.target.matches('[data-foes]')) foesDraft = +e.target.value; if (e.target.matches('[data-stars]')) starsDraft = +e.target.value;
  const su = e.target.closest('[data-su]'); if (su) { const [k, i] = su.dataset.su.split('|'); if (k === 'stars' || k === 'n' || k === 'cap') setup[k] = +su.value; else setup[k][+i] = su.value; setup.seed = $('gSeed') ? $('gSeed').value : setup.seed; renderGalaxy(LAST); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('[data-reon]')) return replayGoto(+e.target.value);
  // REPLAY KEYS (his ask, 2026-10-17): ← → an eon back / on, Page Up / Page Down ten eons; not while typing, not with the arena open
  if (!REPLAY || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || !$('arenaWrap').hidden) return;
  const step = { ArrowRight: 1, ArrowLeft: -1, PageDown: 10, PageUp: -10 }[e.key]; if (!step) return;
  e.preventDefault(); if (step > 0 && REPLAY.ended) return; replayStep(step);
});
window.sbsReplay = replayLoad;                       // for tests: load a log by hand
window.sbsReplayGoto = replayGoto;
window.sbsDebug = { get S() { return S; }, get W() { return W; }, refresh, save };   // for tests only: the live state and world
// WATCH A BATTLE (his ask, 2026-10-16): the lab's arena (lab.html#arena) in a frame over the game replays a fight this eon as it was
// fought — your ships' designs as they were (capsules and all, keep: true), each one's stamina, the hostile plan, the same dice; your
// side wears your coat, theirs the look drawn from its name. The frame answers with the result line and a tapped ship's card.
let arenaReady = false, arenaPending = null;
function watchBattle(id, E = S) {                    // E: whose record (God mode replays another empire's battle from its side)
  const b = (E.battles || []).find(x => x.id === id); if (!b) return say('That battle is gone from the record');
  const L = E.look || {}, hulls = {}, mine = E === S ? 'Your fleet' : `${E.name}'s fleet`;
  for (const m of b.mine) { const h = hullDef(m.design.hull); if (h && h.user) { const { user, ...rec } = h; hulls[h.id] = rec; } }
  const pa = { name: mine, style: L.style || styleChoices()[0].id, colA: L.colA || '#7fb3ff', colB: L.colB || '#ffb347', hulls, ships: b.mine.map(m => ({ design: m.design, keep: true, name: m.name, en0: m.en0, strain: m.strain || 0, cost: 0, seed: 1, locked: true })) };
  const msg = { type: 'fight', a: planCode(pa), b: planCode(b.foe), seed: b.seed, techA: E.breakthroughs, techB: b.foeTech || [] };   // another empire's fleet brings its own tech (world.js)
  $('arenaWrap').hidden = false; $('shipInfo').hidden = true; $('arenaNote').textContent = `Battle at ${esc(sysOf(b.sys)?.name || '?')}, eon ${b.eon} — ${E === S ? 'your' : esc(E.name) + "'s"} ${plural(b.mine.length, 'ship')} against ${esc(b.foe.name)} — replaying…`;
  const fr = $('arenaFrame'); if (!fr.getAttribute('src') || fr.getAttribute('src') === 'about:blank') { arenaReady = false; fr.src = 'lab.html#arena'; }
  if (arenaReady) fr.contentWindow.postMessage(msg, '*'); else arenaPending = msg;
}
window.addEventListener('message', e => {
  const d = e.data, fr = $('arenaFrame'); if (!d || !fr.contentWindow || e.source !== fr.contentWindow) return;
  if (d.type === 'ready') { arenaReady = true; if (arenaPending) { e.source.postMessage(arenaPending, '*'); arenaPending = null; } }
  else if (d.type === 'result') $('arenaNote').innerHTML = d.html + ' <span style="color:var(--muted)">Tap a ship for its card, tap it again to ride it. Detail and the frame rate are at the bottom.</span>';
  else if (d.type === 'error') $('arenaNote').textContent = d.text;
  else if (d.type === 'ship') { const el = $('shipInfo'); if (!d.html) { el.hidden = true; el.innerHTML = ''; } else { el.innerHTML = d.html; el.hidden = false; } }
});
$('shipInfo').addEventListener('click', e => { const a = e.target.closest('[data-sact]'); if (!a) return; const fr = $('arenaFrame'); if (fr.contentWindow) fr.contentWindow.postMessage({ type: 'shipAct', act: a.dataset.sact }, '*'); if (a.dataset.sact === 'close') $('shipInfo').hidden = true; });
$('arenaClose').onclick = () => { $('arenaWrap').hidden = true; $('arenaFrame').src = 'about:blank'; arenaReady = false; arenaPending = null; };   // the frame is dropped: it would go on drawing behind the game
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('arenaWrap').hidden) $('arenaClose').onclick(); });
$('eNew').onclick = () => { if (confirm('Start over in a new, random galaxy?')) startGame(String(Math.floor(Math.random() * 1e6))); };
$('eTetra').addEventListener('pointerup', save);

go('empire');
window.__forgeBooted = true;
