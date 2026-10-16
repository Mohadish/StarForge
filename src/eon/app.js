// The eon screens: Empire (focus + research attention), Galaxy (the seeded map of star systems),
// Star system (the places of one system, colonies, ships), Design (modules as pieces on a board).
import { $, clamp, fmt, signed, esc } from '../util.js';
import { DOMAINS } from '../data/properties.js';
import { XS, X_INFO, T, CENTER, FIELD_IDS, newState, compute, endEon, uid, isIntegrated, giveAttention, sendShip, recallShip, settle, starEons, sysDistance,
  LY, VOY, SCALE, shipRange, forecast, fleetRange, sendFleet, lyBetween, peopleWord, upgrade, hostileIn, hostileWord, hostileWorth } from './model.js';
import { KINDS, KIND_IDS, CLASS_NAME, GANTRY, GUN, PRESETS, applyPreset, allCapsules, designStats, isRelevant, dockFit, reachBand, fitModule, autoFit, traverseOf } from './modules.js';
import { GALAXY, STARS } from './galaxy.js';
import { createTetra } from './tetra.js';
import { drawHull } from './hullview.js';
import { hullDef, hullsFor, setUserHulls, bboxOf, areaOf, HULL_VOLUME, fieldBubble } from './hull.js';
import { createHullEditor } from './hulledit.js';
import { mountNav } from './nav.js';
import { lookOf as fleetLook, lookFromColors, styleChoices, spriteOf, thumbOf } from './skins.js';
import { shipFromDesign, designFromStacks, archetype } from './battle.js';
import { createChipEditor, CIVIL, vsLayers } from './chipeditor.js';
import { chipsOfDesign } from './shipcode.js';
import { createShapeEditor, GW, GH } from './shapeedit.js';
import { createDialog, saveFlow } from './hullui.js';
import { paintHull, recipeWith, RECIPE } from './paint.js';
import { STYLES, loadStyle } from './styles.js';
import { buildPlan, planCode } from './fleetplan.js';
mountNav('eon', { into: document.getElementById('topbar') });

const KEY = 'forge.eon.v8';
const HULL_KEY = 'forge.eon.hulls.v1';       // the player's own silhouettes live outside the game: a new game keeps them
let S = load();
let tab = 'empire', newIds = new Set();
let curDesign = S.designs[0]?.id || null, selMod = null, openBt = new Set(), note = '', noteT = null, FIT = null;
let HULLS = loadHulls(); setUserHulls(HULLS);
let selSys = S.homeSys, selPlace = 'home', hoverPlace = null, DS = null, LAST = null;
let gSel = S.homeSys, gHover = null, gHoverFleet = false, gField = null, seedDraft = null;
let gView = { z: 1, x: 0, y: 0 }, gMode = 'system';   // the galaxy map's zoom and pan (the wheel; a middle- or right-drag) · what the panel shows at the chosen star: the system, or your fleet there (its icon)
// FLEETS, Master of Orion's way (his ask, 2026-10-15): your ships at a star are STACKS by design — "Corvette ×30" — each with a
// count to send. Pick some, then click where they go: a star on the galaxy map (only ships that can cross between stars are
// offered there), a place on the system map. At most MAX_SHIP_DESIGNS ship designs (structures do not count).
const MAX_SHIP_DESIGNS = 12;
let picks = new Map(), pickScope = null, sendTo = null;   // design id → how many of it are picked · { kind: 'galaxy', sys } | { kind: 'system', place } · the destination clicked (a system, or a place)
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
    const lk = cv.dataset.foe ? fleetLook(cv.dataset.foe) : myLook(), key = ship.design.id + '|' + lk.key;
    const draw = img => { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); const q = Math.min(cv.width / img.width, cv.height / img.height); g.drawImage(img, (cv.width - img.width * q) / 2, (cv.height - img.height * q) / 2, img.width * q, img.height * q); };
    const had = thumbCache.get(key); if (had) { draw(had); continue; }
    thumbOf(ship, lk, 120).then(img => { if (!img) return; thumbCache.set(key, img); if (cv.isConnected) draw(img); });
  }
}
// stacks: ships at rest grouped by design, the freshest first inside each
function groupsOf(list) {
  const m = new Map();
  for (const s of list) { const k = s.u.design.id; let g = m.get(k); if (!g) { g = { key: k, name: s.u.name, ships: [], t: s.t, klass: s.u.klass }; m.set(k, g); } g.ships.push(s); }
  for (const g of m.values()) { g.ships.sort((a, b) => (b.u.st ?? 100) - (a.u.st ?? 100)); g.range = Math.min(...g.ships.map(s => s.range || 0)); }
  return [...m.values()].sort((a, b) => b.t.cost - a.t.cost);
}
const canLeave = s => s.u.klass === 'starship' && !s.t.underDriven;
const picked = groups => groups.flatMap(g => g.ships.slice(0, Math.min(g.ships.length, picks.get(g.key) || 0)));
const pickCount = () => [...picks.values()].reduce((a, n) => a + n, 0);
function setScope(scope) {
  const same = pickScope && pickScope.kind === scope.kind && pickScope.sys === scope.sys && pickScope.place === scope.place;
  if (!same) { picks = new Map(); sendTo = null; } pickScope = scope;
}
// the stacks of the current scope (what the send buttons act on)
function scopeGroups(c) {
  if (!pickScope) return [];
  if (pickScope.kind === 'galaxy') return groupsOf(c.ships.filter(s => !s.u.dest && placeOf(s.u.at)?.sys === pickScope.sys && canLeave(s)));
  return groupsOf(c.ships.filter(s => !s.u.dest && s.u.at === pickScope.place));
}
function stackRow(g, { send = true, settleAt = null, foe = null } = {}) {
  const n = picks.get(g.key) || 0, total = g.ships.length, tid = (foe ? 'f' : 'm') + g.key;
  thumbShips.set(tid, foe ? g.ship : paintedShip(g.ships[0].u.design, LAST.caps));
  let line;
  if (foe) line = `${esc(g.ship.arch ? g.ship.arch.label : '')} · worth ${fmt(g.ship.cost)} each · ${fmt(g.ship.dps)} dmg/s`;
  else {
    const sts = g.ships.map(s => s.u.st ?? 100), lo = Math.min(...sts), hi = Math.max(...sts), people = g.ships.reduce((a, s) => a + (s.u.people || 0), 0);
    line = [`worth ${fmt(g.t.cost)} each`, g.t.dps ? `${fmt(g.t.dps)} dmg/s` : '', g.t.research ? `lab ${fmt(g.t.research)}` : '', g.klass === 'starship' && !g.t.underDriven ? `reach ${g.range.toFixed(1)} ly` : g.klass === 'starship' ? '<b class="up">drive too small to leave</b>' : 'thrusters only',
      `stamina ${Math.round(lo) === Math.round(hi) ? Math.round(lo) : `${Math.round(lo)}–${Math.round(hi)}`} %${lo < 100 ? ' (coming back while they rest)' : ''}`, people ? `${peopleWord(people)} people aboard` : ''].filter(Boolean).join(' · ');
  }
  const settler = !foe && settleAt && g.ships.find(s => s.u.people > 0);
  return `<div class="shiprow"><div class="n"><span style="display:flex;align-items:center;gap:8px"><canvas data-thumb="${tid}" ${foe ? `data-foe="${esc(foe)}"` : ''} width="96" height="56" style="width:64px;height:38px;border-radius:6px;background:#04070f;flex:none"></canvas><b>${esc(g.name)}</b><b style="color:var(--time)">×${total}</b></span>
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
      const d = lyBetween(S, pickScope.sys, sendTo), f = forecast(R, d, c.warp, 0, st), foe = hostileIn(S, sendTo);
      h += `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)">To <b>${esc(sysOf(sendTo).name)}</b>: ${d.toFixed(1)} ly · ${plural(f.eons, 'eon')} · <b>${Math.round(f.chance * 100)} %</b>${f.chance < 1 ? ` · in at ~${Math.round(f.expected)} %${f.lost ? ' — some could be lost' : ` (worst ${Math.round(f.worst)} %)`}` : ''}${foe ? ` · <b class="up">⚔ ${esc(hostileWord(foe))}</b>` : ''}
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
    return `<div class="shiprow"><div class="n"><span>${names} → ${esc(to.name)}${V && to.kind !== 'star' ? ` (${esc(sysOf(to.sys).name)})` : ''} <span class="tiny">· ${plural(u.eta, 'eon')}</span></span><button class="x" data-recall="${u.id}" title="${V ? 'the fleet turns round: the way back counts on the same voyage' : 'they stay where they are'}">call back</button></div>${V ? `<div class="tiny">${V.left.toFixed(1)} ly to go · stamina ${Math.round(lo)} %${V.travelled > V.range ? ` · <b class="up">${(V.travelled - V.range).toFixed(1)} ly past its reach — crawling, wearing</b>` : ''}${V.back ? ' · turned back' : ''}</div>` : ''}</div>`;
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

function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && (s.version === 8 || s.version === 9)) return upgrade(s); } catch (e) { /* new game */ } return newState(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
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
  for (const { u } of c.ships) if (!u.dest) at(placeOf(u.at).sys).ships++;
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
    ${row('Reserves', `${fmt(S.reserves || 0)} · excess +${fmt(c.income)} − upkeep ${fmt(c.upkeep.total)} <span class="tiny">(military ${fmt(c.upkeep.military)} · social ${fmt(c.upkeep.social)} · research ${fmt(c.upkeep.research)})</span> = <b class="${c.net < 0 ? 'up' : 'down'}">${c.net < 0 ? '−' : '+'}${fmt(Math.abs(c.net))}</b>${c.shortNext > 0.005 ? ` · <b class="up">${Math.round(c.shortNext * 100)} % will go unpaid</b>` : ''}${c.unpaid > 0.005 ? ` · <b class="up">last eon ${Math.round(c.unpaid * 100)} % unpaid: the fleet wears, people grumble, research slows</b>` : ''}`, c.net < 0 ? 'up' : '')}</div>`;

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
  G.cx += gView.x; G.cy += gView.y; G.k = Math.max(20, Math.min(G.w, G.h) / 2 - 34) / GALAXY.radius * gView.z; G.pos = {}; G.fleet = {};
  for (const s of S.systems) G.pos[s.id] = { x: G.cx + s.x * G.k, y: G.cy + s.y * G.k };
  cv._geo = G;
  g.clearRect(0, 0, G.w, G.h);
  // the disc
  const R = G.k * GALAXY.radius * 1.07, gr = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, R);
  gr.addColorStop(0, 'rgba(150,170,255,.11)'); gr.addColorStop(0.7, 'rgba(120,140,255,.04)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(G.cx, G.cy, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(170,210,255,.12)'; g.setLineDash([2, 6]); g.beginPath(); g.arc(G.cx, G.cy, R * 0.98, 0, 7); g.stroke(); g.setLineDash([]);
  // the REACH of your best starship resting at the chosen star (STAR TRAVEL): its range, then a ring a light year apart —
  // green 90 %, yellow 70 %, orange 40 %, red 10 %
  const reachR = ringR(gSel);
  if (reachR > 0 && G.pos[gSel]) {
    const p = G.pos[gSel], cols = ['#4da3ff', '#7ef3b0', '#ffd26a', '#ffb347', '#ff7979'];
    cols.forEach((col, i) => { g.strokeStyle = col; g.globalAlpha = i ? 0.55 : 0.8; g.lineWidth = i ? 1 : 1.6; g.setLineDash(i ? [3, 5] : []); g.beginPath(); g.arc(p.x, p.y, (reachR + i) * LY * G.k, 0, 7); g.stroke(); });
    g.globalAlpha = 1; g.lineWidth = 1; g.setLineDash([]);
  }
  // picked ships, and the star they would go to
  if (sendTo && pickScope?.kind === 'galaxy' && G.pos[pickScope.sys] && G.pos[sendTo]) { const a = G.pos[pickScope.sys], b = G.pos[sendTo]; g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
  // derelicts, where they broke down
  for (const w of S.derelicts || []) { const a = G.pos[w.A], b = G.pos[w.B]; if (!a || !b) continue; const x = a.x + (b.x - a.x) * w.pos, y = a.y + (b.y - a.y) * w.pos; g.strokeStyle = '#8a93a8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); g.lineWidth = 1; }
  // ships crossing between stars
  for (const { u } of c.ships) {
    if (!u.dest) continue;
    const V = u.voy, a = V ? G.pos[V.A] : G.pos[placeOf(u.at).sys], b = V ? G.pos[V.B] : G.pos[placeOf(u.dest).sys]; if (!a || !b || a === b) continue;
    const k = V ? clamp(V.pos ?? 0, 0.02, 1) : clamp(1 - u.eta / (u.trip || u.eta || 1), 0.06, 1), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(126,243,176,.5)'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#7ef3b0'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
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
    if (here?.colonies) { g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, size + 4, 0, 7); g.stroke(); g.lineWidth = 1; }
    if (here?.ships) {                                 // YOUR FLEET here: a big triangle by the star — click it for the fleet, the star for the system (his ask, 2026-10-15)
      const x = p.x + size + 15, y = p.y - size - 7, on = gMode === 'fleet' && s.id === gSel; G.fleet[s.id] = { x, y };
      g.fillStyle = on ? '#fff' : '#7ef3b0'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath(); g.fill();
      if (on || (s.id === gHover && gHoverFleet)) { g.strokeStyle = on ? '#7ef3b0' : 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y + 1, 13, 0, 7); g.stroke(); g.lineWidth = 1; }
      g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.fillStyle = on ? '#fff' : '#7ef3b0'; g.fillText(String(here.ships), x + 12, y + 5); g.textAlign = 'center';
    }
    const onStar = s.id === gSel && gMode !== 'fleet';   // the white ring: on the star in system mode, on the fleet icon in fleet mode
    if (onStar || (s.id === gHover && !gHoverFleet)) { g.strokeStyle = onStar ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, size + 8, 0, 7); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = s.home || here ? '#e8f0ff' : '#8598bb'; g.font = (s.home || here ? 'bold ' : '') + '10px sans-serif';
    g.fillText(s.home ? s.name + ' · home' : s.name, p.x, p.y + size + 13);
  }
  g.textAlign = 'left';
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
function sysBlurb(s) {
  const here = placesIn(s.id), best = here.flatMap(pl => FIELD_IDS.map(f => [pl.mult[f] * pl.fresh[f], f, pl])).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return `<b>${esc(s.name)}</b> — ${STARS[s.type].name} · ${here.length > 1 ? `${plural(here.length - 1, 'place')} around it, ${here.filter(p => p.landable).length} can be settled` : 'nothing circles it'}<br>
    the most to learn: ${best.map(b => `${DOMAINS[b[1]].name} ${pct(b[0])} at ${esc(b[2].name)}`).join(' · ')}`;
}
$('gMap').addEventListener('mousemove', e => {
  const f = fleetAt(e), id = f || sysAt(e); if (id === gHover && !!f === gHoverFleet) return;
  gHover = id; gHoverFleet = !!f; $('gMap').style.cursor = id ? 'pointer' : 'default';
  $('gHover').innerHTML = f ? `<b>Your fleet at ${esc(sysOf(f).name)}</b> — ${LAST ? plural(presence(LAST).get(f)?.ships || 0, 'ship') : ''}. Click it for the fleet; click the star for the system.` : id ? sysBlurb(sysOf(id)) : '';
  if (LAST) drawGalaxy(LAST);
});
// a click: the fleet icon → the fleet panel; a star → the system (or, with ships picked, where they go). You are on one or the other.
$('gMap').addEventListener('click', e => {
  const f = fleetAt(e), id = f || sysAt(e); if (!id) return;
  if (!f && pickCount() && pickScope?.kind === 'galaxy' && id !== pickScope.sys) { sendTo = id; return refresh(); }
  gSel = id; gMode = f ? 'fleet' : 'system'; refresh();
});
$('gMap').addEventListener('dblclick', e => { if (fleetAt(e)) return; const id = sysAt(e); if (id) openSystem(id); });
// ZOOM with the wheel, about the mouse; PAN with a middle- or right-drag (his ask, 2026-10-15)
{
  const cv = $('gMap'); let pan = null;
  cv.addEventListener('pointerdown', e => { if (e.button !== 1 && e.button !== 2) return; pan = { x: e.clientX, y: e.clientY, vx: gView.x, vy: gView.y }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!pan) return; gView.x = pan.vx + e.clientX - pan.x; gView.y = pan.vy + e.clientY - pan.y; if (LAST) drawGalaxy(LAST); });
  const stop = () => { pan = null; }; cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
  cv.addEventListener('contextmenu', e => e.preventDefault());
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
    <div style="display:flex;gap:6px;margin:6px 0 4px;align-items:center"><span class="tiny">Seed</span><input type="text" id="gSeed" value="${esc(seedDraft ?? S.seedText ?? S.seed)}" style="flex:1;min-width:0"><button data-randseed title="put a random seed in the box">Random</button><button class="go" data-newseed>New game from this seed</button></div>
    <h3>Show where a field is rich</h3>
    <div>${FIELD_IDS.map(f => `<button class="x ${gField === f ? 'go' : ''}" data-gfield="${f}" style="margin:0 4px 4px 0">${DOMAINS[f].name}</button>`).join('')}</div>
    <div class="tiny">${gField ? `The bigger the purple halo, the more ${DOMAINS[gField].name} there is to find in that system. Click the field again to switch it off.` : 'Pick a field and the map marks the systems worth going to for it.'}</div>`;
  let h;
  if (gMode === 'fleet') h = `<h2 style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">Your fleet at ${esc(s.name)} <button class="x" data-gsys title="the system itself">◂ the system</button></h2>
    <div class="tiny" style="margin-bottom:6px">${plural(mine.ships, 'ship')} resting here.${H ? ` <b class="up">⚔ ${esc(hostileWord(H))} holds this system</b> — they fight at the end of the eon.` : ''}</div>
    ${galaxyFleetPanel(c, s, true)}
    <div class="tiny" style="margin-top:8px">Pick how many of each to send (+ / all), click the star they go to, then Send. Click the star here instead for the system itself.</div>`;
  else h = `<h2 style="margin-top:14px">${esc(s.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${STARS[s.type].name}${s.home ? ' · your home' : ''}</span></h2>
    <div class="tiny" style="margin-bottom:6px">${s.home ? 'Where your people come from.' : `${(d / LY).toFixed(1)} light years from Home — about ${plural(starEons(d, c.warp), 'eon')} for a plain star drive.`}${have ? ` You have ${have} here.` : ''}</div>${H ? `<div class="note" style="margin:4px 0 6px">⚔ <b>${esc(hostileWord(H))}</b> holds this system. Ships of yours that come to rest here fight it at the end of the eon — every eon, until one side is gone or yours leave.</div>` : ''}
    ${mine && mine.ships ? `<button class="go" data-gfleet style="margin:2px 0 6px" title="the ships of yours resting here, as stacks to send">⯈ Your fleet here — ${plural(mine.ships, 'ship')}</button>` : ''}
    ${galaxyFleetPanel(c, s, false)}
    ${here.map(pl => `<div class="shiprow" data-gplace="${pl.id}" style="cursor:pointer"><div class="n"><span><i class="dot" style="background:${lookOf(pl).color}"></i>${esc(pl.name)}${pl.cool ? ' <span title="a remarkable place" style="color:var(--time)">✦</span>' : ''}</span><span class="tiny">${KIND_WORD[pl.kind]}${pl.colony ? ' · settled' : pl.landable ? ' · can be settled' : ' · orbit only'}</span></div>
      <div class="tiny">${topFields(pl).filter(x => x[2] > 0.06).map(x => `${DOMAINS[x[0]].name} <b>${pct(x[1])}</b>`).join(' · ')}</div></div>`).join('')}
    <button class="go" data-opensys="${s.id}" style="margin-top:4px">Open the ${esc(s.name)} system ▸</button>
    <div class="tiny" style="margin-top:8px">Click a star to look at it; double-click to open it. A green ring is a colony of yours, the big green triangle your fleet (click it for the fleet), a grey × a derelict, a red dashed ring a hostile fleet (⚔ its worth — the further from home, the stronger). Wheel to zoom, drag with the middle or right button to move about${gView.z !== 1 || gView.x || gView.y ? ' · <button class="x" data-greset>whole galaxy</button>' : ''}.${ringR(s.id) ? ` <b>The coloured rings</b> are the reach of your best ship here (${ringR(s.id).toFixed(1)} light years): inside the <span style="color:#4da3ff">blue</span> one a crossing is a stroll; past it a ship crawls and wears — <span style="color:#7ef3b0">green</span> 90 %, <span style="color:#ffd26a">yellow</span> 70 %, <span style="color:#ffb347">orange</span> 40 %, <span style="color:#ff7979">red</span> 10 %; beyond the red, few arrive.` : ''}</div>`;
  $('gPanel').innerHTML = top + h; fillThumbs($('gPanel'));
}
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
function startGame(text) {
  const seedText = String(text).trim() || '7';
  leaveOutline();
  S = newState(seedOf(seedText)); S.seedText = seedText;
  curDesign = S.designs[0]?.id || null; selMod = null; chipsFor = null; gMode = 'system'; gView = { z: 1, x: 0, y: 0 }; selSys = gSel = S.homeSys; selPlace = 'home'; newIds = new Set(); seedDraft = null;
  save(); refresh();
}

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
  const G = mapGeo(cv), g = cv.getContext('2d'), here = placesIn(selSys), sys = sysOf(selSys);
  g.clearRect(0, 0, G.w, G.h);
  g.strokeStyle = 'rgba(170,210,255,.09)';
  for (const r of new Set(here.filter(p => p.r > 0).map(p => p.r))) { g.beginPath(); g.arc(G.cx, G.cy, r * G.R, 0, 7); g.stroke(); }
  // ships under way inside this system (a crossing to another star is drawn on the galaxy map)
  for (const u of S.ships) {
    const a = G.pos[u.at], b = u.dest && G.pos[u.dest]; if (!a || !b) continue;
    const k = Math.max(0.12, 1 - u.eta / (u.trip || T.travel[u.klass] || 1)), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(126,243,176,.45)'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#7ef3b0'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  g.textAlign = 'center';
  for (const pl of here) {
    const p = G.pos[pl.id], { color, size } = lookOf(pl), st = c.studied.find(s => s.pl.id === pl.id);
    if (pl.kind === 'star') { const gr = g.createRadialGradient(p.x, p.y, 3, p.x, p.y, size * 2.2); gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.45, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, size * 2.2, 0, 7); g.fill(); }
    else if (pl.kind === 'anomaly') { g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4); g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color; g.fillRect(-size, -size, size * 2, size * 2); g.restore(); }
    else { g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, size, 0, 7); g.fill(); }
    if (pl.colony) { g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, size + 5, 0, 7); g.stroke(); }
    if (pl.id === selPlace || pl.id === hoverPlace) { g.strokeStyle = pl.id === selPlace ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, size + 10, 0, 7); g.stroke(); }
    g.lineWidth = 1;
    if (st && st.power > 0) { g.fillStyle = '#5fe3d0'; g.beginPath(); g.arc(p.x + size + 6, p.y - size - 4, 4, 0, 7); g.fill(); }       // someone is studying it
    g.fillStyle = pl.colony ? '#e8f0ff' : '#9eb3d8'; g.font = (pl.colony ? 'bold ' : '') + '12px sans-serif';
    g.fillText(pl.name, p.x, p.y - (pl.kind === 'star' ? size * 1.9 : size) - 12);
    const parked = S.ships.filter(u => !u.dest && u.at === pl.id);
    parked.slice(0, 6).forEach((u, i) => { const x = p.x - (Math.min(parked.length, 6) - 1) * 6 + i * 12, y = p.y + size + 12; g.fillStyle = u.klass === 'starship' ? '#7ef3b0' : '#ffb347'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.fill(); });
  }
  g.textAlign = 'left';
  g.fillStyle = '#9eb3d8'; g.font = 'bold 12px sans-serif'; g.fillText(`${sys.name.toUpperCase()} SYSTEM`, 14, G.h - 28);
  g.font = '11px sans-serif'; g.fillText(`${STARS[sys.type].name} · ${sys.home ? 'your home' : `${plural(starEons(sysDistance(S, S.homeSys, sys.id), c.warp), 'eon')} from Home by star drive`}`, 14, G.h - 12);
  cv._geo = G;
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
$('sMap').addEventListener('click', e => { const id = placeAt(e); if (!id) return; if (pickCount() && pickScope?.kind === 'system' && id !== pickScope.place) { sendTo = id; return refresh(); } selPlace = id; refresh(); });   // ships picked: a click on another place is where they go

const PT = [{ x: 100, y: 16 }, { x: 22, y: 134 }, { x: 178, y: 134 }];   // industry / research / social
function renderSystem(c) {
  if (!sysOf(selSys)) selSys = S.homeSys;
  if (placeOf(selPlace)?.sys !== selSys) selPlace = sysOf(selSys).star;
  drawMap(c);
  const pl = placeOf(selPlace), st = c.studied.find(s => s.pl.id === pl.id), pc = c.colonies.find(x => x.pl.id === pl.id), mine = presence(c);
  const byHome = [...S.systems].map(s => [s, sysDistance(S, S.homeSys, s.id)]).sort((a, b) => a[1] - b[1]);
  let h = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><span class="tiny">System</span><select data-syspick style="flex:1">${byHome.map(([s]) => `<option value="${s.id}" ${s.id === selSys ? 'selected' : ''}>${mine.has(s.id) ? '● ' : ''}${esc(s.name)} — ${STARS[s.type].name}</option>`).join('')}</select><button data-tab="galaxy">Galaxy map</button></div>
    ${hostileIn(S, pl.sys) ? `<div class="note" style="margin-bottom:8px">⚔ <b>${esc(hostileWord(hostileIn(S, pl.sys)))}</b> holds this system. Your ships resting anywhere in it fight it at the end of the eon.</div>` : ''}<h2>${esc(pl.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${KIND_WORD[pl.kind]}${pl.colony ? ' · settled' : pl.landable ? ' · not settled' : ' · orbit only'}</span></h2><div class="tiny" style="margin-bottom:8px">${esc(pl.colony ? pl.note.replace(', never settled', '') : pl.note)}</div>`;

  // what there is to learn here
  const tf = topFields(pl), strong = tf.filter(x => x[2] > 0.06), weak = tf.length - strong.length;
  h += `<h3>What there is to learn here</h3>` + strong.map(([f, now, base]) => `<div class="potrow"><span>${DOMAINS[f].name}</span><div class="potbar"><div style="width:${now * 100}%"></div></div><span class="tiny">${pct(now)}${now < base - 0.005 ? ` <span title="it was ${pct(base)} before you took finds from it">worn</span>` : ''}</span></div>`).join('')
    + `<div class="tiny">The other ${weak} fields: about 5% each.</div>`;
  const who = [];
  if (st.onGround > 0) who.push(`${fmt(st.onGround)} research on the ground`);
  if (st.inOrbit > 0) who.push(`${fmt(st.inOrbit)} from orbit (counts ${T.orbit * 100}%)`);
  if (pl.kind === 'star' && (c.sysResearch[pl.sys] || 0) - st.inOrbit > 0) who.push(`every other lab in this system, at ${T.starShare * 100}%`);
  h += `<div class="${who.length ? 'okbox' : 'note'}" style="margin-top:6px">${who.length ? 'Being studied: ' + who.join(' · ') + '.' : `Nobody is studying it, so it adds nothing to your research. ${pl.landable ? 'Settle it, or park a ship with a lab in orbit.' : 'Park a ship or a station with a lab in orbit.'}`}</div>`;

  // the colony
  if (pc) {
    const P = pc.P, w = P.split, mx = w[0] * PT[0].x + w[1] * PT[1].x + w[2] * PT[2].x, my = w[0] * PT[0].y + w[1] * PT[1].y + w[2] * PT[2].y;
    const queue = pc.queue.filter(q => !q.gone).map(q => `<div class="dcard" style="cursor:default"><div class="n"><span>${esc(q.d.name)}</span><span>${!q.noDock && q.need > 1e-6 && (S.reserves || 0) >= q.need ? `<button class="x" data-buynow="${q.item.id}" data-planet="${pl.id}" title="pay what is left from the reserves">⚡ Buy now (${fmt(q.need)})</button> ` : ''}<button class="x" data-unq="${q.item.id}" data-planet="${pl.id}">✕</button></span></div>
      <div class="prog"><div style="width:${100 * Math.min(1, (q.item.progress + q.spend) / q.cost)}%;background:var(--cost)"></div></div>
      <div class="tiny">${q.noDock ? '<b class="up">waiting — there is no space dock here to put it together in</b>' : `${fmt(q.item.progress)} / ${fmt(q.cost)} · ${q.finishes ? '<b class="down">finished this eon</b>' : q.joining ? `paid for — joining the sections, ${plural(q.joinLeft, 'eon')} left` : Number.isFinite(q.eta) ? 'ready in ' + plural(q.eta, 'eon') : 'nobody in industry'}`}${q.sections > 1 ? ` · <b class="up">too big for the ${q.fit.w} × ${q.fit.h} gantry: built in ${q.sections} sections, ${extraCost(q.fit)}</b>` : ''}${q.ds.klass !== 'structure' && q.ds.housing > 0 ? ` · takes ${peopleWord(Math.max(0, Math.min(q.ds.housing * SCALE.shipHousing, P.people - 5)))} people aboard` : ''}</div></div>`).join('');
    const slips = pc.gantries.slice().sort((a, b) => b.w * b.h - a.w * a.h);
    const surf = surfaceCounts(pc);
    h += `<h3>The colony</h3>
      <canvas id="sSurface" class="surface" title="the colony from above: city blocks (one per ${surf.per} M people), farm plots (one per ${SURF.farm} food), its structures as their outlines"></canvas>
      <div class="tiny" style="margin-bottom:6px">${surf.blocks} city block${surf.blocks === 1 ? '' : 's'} of ${surf.per} M${pc.full ? ' — <b class="up">up to the room\'s edge</b>' : ''} · ${pc.water ? `<span style="color:${surf.have >= surf.need ? 'var(--good)' : 'var(--bad)'}">${surf.have} of ${surf.need} farm plots</span> (${fmt(pc.food)} food for ${fmt(pc.eat)} eaten)` : '<b class="up">no water — no farms</b>'} · ${pc.factories} factor${pc.factories === 1 ? 'y' : 'ies'}${pc.newFactories ? ` <b class="down">+${pc.newFactories}</b>` : ''} · ${plural(P.structures.length, 'structure')}${pc.toReserves > 0 ? ` · <b class="down">+${fmt(pc.toReserves)} to the reserves</b>` : ''}</div>
      <div class="tiny">${peopleWord(P.people)} people of ${peopleWord(pc.housing)} room <b class="${pc.dPeople < 0 ? 'up' : 'down'}">${pc.dPeople < 0 ? '−' : '+'}${peopleWord(Math.abs(pc.dPeople))}</b>${pc.houses > 0.05 ? ` · room <b class="down">+${peopleWord(pc.houses)}</b> built by the social share` : pc.full ? (pc.housing >= pc.roomCap - 1e-6 ? ' · <b class="up">the world is full</b>' : ' · <b class="up">room is full — more social people build more</b>') : ''}${!pc.water ? ' · <b class="up">no water: the settlers live on their stores — no growth</b>' : ''} · happiness ${Math.round(P.happiness)} · food ${signed(pc.surplus)}${pc.needI > 0 ? ` · sustain ${fmt(pc.needI)} industry / ${fmt(pc.needR)} research${pc.short > 0.005 ? ` <b class="up">${Math.round(pc.short * 100)} % short — unrest</b>` : ' ✓'}` : ''}${pc.pol.industry + pc.pol.social + pc.pol.research > 1 ? ` · pollution: <span title="an industrial world: people sicken">industrial ${Math.round(pc.pol.industry)}</span> · <span title="a soft society: industry and research slacken">docile ${Math.round(pc.pol.social)}</span> · <span title="a bookish society: the social share slackens">aloof ${Math.round(pc.pol.research)}</span> — a share held past half builds its own up; ease off and it clears` : ''}</div>
      <svg class="ptri" data-planet="${pl.id}" width="200" height="150" viewBox="0 0 200 150">
        <polygon points="100,16 22,134 178,134" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.35)"/>
        <text x="100" y="11" text-anchor="middle" fill="#ffb347" font-size="10" font-weight="700">INDUSTRY</text>
        <text x="2" y="147" text-anchor="start" fill="#5fe3d0" font-size="10" font-weight="700">RESEARCH</text>
        <text x="198" y="147" text-anchor="end" fill="#f5a3c7" font-size="10" font-weight="700">SOCIAL</text>
        <circle r="8" cx="${mx}" cy="${my}"/></svg>
      <div class="fx three">
        <div style="border-color:#ffb347"><span>Industry</span><b>${fmt(pc.industry)}</b>${fmt(pc.people.industry)} people</div>
        <div style="border-color:#5fe3d0"><span>Research</span><b>${fmt(pc.research)}</b>${fmt(pc.people.research)} people</div>
        <div style="border-color:#f5a3c7"><span>Social</span><b>${fmt(pc.social)}</b>${fmt(pc.people.social)} people</div></div>
      <div class="tiny" style="margin-top:6px">${slips.length ? `Space dock: gantry <b>${slips.map(s => `${s.w} × ${s.h}`).join(', ')}</b>. A ship or platform that fits inside is built whole; a bigger one is built in sections and costs more.` : '<b class="up">No space dock here</b> — ships and platforms cannot be built until there is one. Structures need none.'}</div>
      <h3>Build queue</h3>${queue || '<div class="tiny">Empty.</div>'}
      <div style="display:flex;gap:6px;margin-top:4px"><select data-addsel="${pl.id}" style="flex:1">${S.designs.map(d => { const t = designStats(S, d, c.caps).t; return `<option value="${d.id}">${esc(d.name)} — ${CLASS_NAME[t.klass].toLowerCase()}, ${fmt(t.cost)}</option>`; }).join('')}</select><button data-add="${pl.id}">Build</button></div>
      <h3>Structures</h3>${P.structures.map(u => `<span class="chip" style="border-color:var(--line)">${esc(u.name)}</span>`).join('') || '<span class="tiny">none</span>'}`;
  }

  // ships, as STACKS by design (FLEETS): pick how many, then click a place on the map — or, for ships that can, a star (▸)
  if (!pickScope || pickScope.kind !== 'system' || pickScope.place !== pl.id) setScope({ kind: 'system', place: pl.id });
  const groups = groupsOf(c.ships.filter(s => !s.u.dest && s.u.at === pl.id));
  const coming = c.ships.filter(s => s.u.dest === pl.id), leaving = c.ships.filter(s => s.u.dest && s.u.at === pl.id && s.u.dest !== pl.id);
  h += `<h3>In orbit here</h3>` + (groups.map(g => stackRow(g, { settleAt: pl.landable && !pl.colony ? pl : null })).join('') || '<div class="tiny">Nothing.</div>') + sendBar(c, groups);
  if (coming.length) h += `<h3>On the way here</h3>` + movingLines(coming);
  if (leaving.length) h += `<h3>Leaving</h3>` + movingLines(leaving);
  if (!pc && pl.landable) h += `<div class="tiny" style="margin-top:8px">To settle ${esc(pl.name)}: build a ship that has a habitat (the people go aboard when it is built), send it here, and press Settle. The ship becomes the colony's first building.</div>`;
  $('sPanel').innerHTML = h; fillThumbs($('sPanel'));
  if (pc && $('sSurface')) drawSurface($('sSurface'), pc);
}
// THE SURFACE (his ask, 2026-10-16): the colony from above, in the system panel — city blocks that multiply with its people (one
// per SURF.block million; a huge city counts more a block), farm plots that follow its FOOD (a plot per SURF.farm units: the ones
// its people need, green when the food is there and red when it is short — so the fields tell the food story), and its
// structures as their outlines, no more. Everything sits on a sunflower spiral: what is there stays put, new blocks grow at the rim.
const SURF = { block: 5, farm: 4, gold: 2.399963 };
function surfaceCounts(pc) {
  let per = SURF.block; while (pc.P.people / per > 240) per *= 2;
  const blocks = Math.max(1, Math.ceil(pc.P.people / per)), roomBlocks = Math.max(blocks, Math.ceil(pc.housing / per));
  const need = Math.max(1, Math.ceil(pc.eat / SURF.farm)), have = Math.max(0, Math.round(pc.food / SURF.farm));
  return { per, blocks, roomBlocks, need, have };
}
function drawSurface(cv, pc) {
  const W = cv.clientWidth || 300, H = 240; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
  const g = cv.getContext('2d'), P = pc.P, { per, blocks, roomBlocks, need, have } = surfaceCounts(pc), col = lookOf(pc.pl).color;
  g.fillStyle = '#04070f'; g.fillRect(0, 0, W, H); g.fillStyle = col; g.globalAlpha = 0.09; g.fillRect(0, 0, W, H); g.globalAlpha = 1;   // the ground, in the world's tint
  const cx = W * 0.4, cy = H / 2, spot = (i, step, r0) => { const r = r0 + step * Math.sqrt(i), a = i * SURF.gold; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  // the city, and its ROOM (the housing) as a dashed ring where the blocks would end
  const step = 6.5, rRoom = step * Math.sqrt(roomBlocks) + 4;
  g.strokeStyle = pc.full ? 'rgba(255,121,121,.6)' : 'rgba(255,255,255,.28)'; g.setLineDash([3, 4]); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rRoom, 0, 7); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < blocks; i++) { const [x, y] = spot(i, step, 0); g.fillStyle = 'rgba(232,240,255,.16)'; g.fillRect(x - 2.5, y - 2.5, 5, 5); g.strokeStyle = '#e8f0ff'; g.strokeRect(x - 2.5, y - 2.5, 5, 5); }
  // the farms, round the city: fed plots green, the ones it is short of red and dashed, spare ones faint — none without water
  const plots = pc.water ? Math.max(need, have) : 0, fstep = 11;
  for (let i = 0; i < plots; i++) {
    const [x, y] = spot(i, fstep, rRoom + 12), fed = i < have, spare = i >= need;
    g.setLineDash(fed ? [] : [2, 2]); g.strokeStyle = fed ? (spare ? 'rgba(126,243,176,.45)' : '#7ef3b0') : '#ff7979'; g.fillStyle = fed ? `rgba(126,243,176,${spare ? 0.06 : 0.16})` : 'rgba(255,121,121,.08)';
    g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4, y - 4, 8, 8);
  }
  g.setLineDash([]);
  if (!pc.water) { g.fillStyle = '#ff7979'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillText('no water — no farms', cx, H - 10); g.textAlign = 'left'; }
  // the factories: scattered round the city's rim (his call: not a quarter of their own), a small orange square each, growing outward
  const fac = Math.min(pc.factories, 400);
  for (let i = 0; i < fac; i++) { const [x, y] = spot(blocks + i * 1.7, step, 2); g.fillStyle = 'rgba(255,179,71,.2)'; g.fillRect(x - 2.5, y - 2.5, 5, 5); g.strokeStyle = '#ffb347'; g.lineWidth = 1; g.strokeRect(x - 2.5, y - 2.5, 5, 5); }
  // the structures: their outlines in a column at the right, the biggest first, a landed ship dashed
  const sts = P.structures.map(u => { const t = designStats(S, u.design, LAST.caps).t; return { u, hull: t.hull, dock: t.dock }; }).sort((a, b) => b.hull.area - a.hull.area);
  const colX = W * 0.86, slotH = Math.min(44, (H - 16) / Math.max(1, sts.length)); let y0 = 8 + slotH / 2;
  for (const { u, hull, dock } of sts) {
    const k = Math.min(48 / hull.bw, (slotH - 14) / hull.bh), b = hull.box, mx = (b.minx + b.maxx) / 2, my = (b.miny + b.maxy) / 2;
    g.beginPath(); hull.poly.forEach(([x, y], i) => i ? g.lineTo(colX + (x - mx) * k, y0 + (y - my) * k) : g.moveTo(colX + (x - mx) * k, y0 + (y - my) * k)); g.closePath();
    g.setLineDash(u.landed ? [3, 2] : []); g.strokeStyle = dock ? '#e8c56b' : '#ffb347'; g.fillStyle = dock ? 'rgba(232,197,107,.12)' : 'rgba(255,179,71,.12)'; g.fill(); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#9eb3d8'; g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText(u.name.length > 14 ? u.name.slice(0, 13) + '…' : u.name, colX, y0 + (slotH - 14) / 2 + 9);
    y0 += slotH;
  }
  g.textAlign = 'left';
}

let triDrag = null;
function moveTri(e) {
  const svg = document.querySelector(`.ptri[data-planet="${triDrag}"]`); if (!svg) return;
  const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * 200 / r.width, y = (e.clientY - r.top) * 150 / r.height;
  const [a, b, c] = PT, det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  let l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det, l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det, l3 = 1 - l1 - l2;
  l1 = clamp(l1, 0, 1); l2 = clamp(l2, 0, 1); l3 = clamp(l3, 0, 1);
  const t = l1 + l2 + l3 || 1;
  placeOf(triDrag).colony.split = [l1 / t, l2 / t, l3 / t];
  refresh();
}
document.addEventListener('pointerdown', e => { const s = e.target.closest('.ptri'); if (!s) return; triDrag = s.dataset.planet; e.preventDefault(); moveTri(e); });
addEventListener('pointermove', e => { if (triDrag) moveTri(e); });
addEventListener('pointerup', () => { if (triDrag) { triDrag = null; save(); } });
addEventListener('resize', () => { if (!LAST) return; if (tab === 'system') drawMap(LAST); if (tab === 'galaxy') drawGalaxy(LAST); });

function enqueue(placeId, designId) {
  const P = placeOf(placeId)?.colony, d = S.designs.find(x => x.id === designId);
  if (!P || !d) return;
  P.queue.push({ id: uid('q'), designId, progress: 0 });
  save(); refresh();
}

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
async function deleteHull(id) {
  const h = HULLS.find(x => x.id === id); if (!h || !(await hdlg.confirmDelete(h))) return;
  if (outEd.editing) { outDirty = false; outEd.editing = false; }
  HULLS = HULLS.filter(x => x.id !== id); saveHulls(); say(`Deleted “${h.name}”`);
}
$('dOutDel').onclick = () => { const st = outEd.state(); if (ownHull(st)) deleteHull(st.id); };
function commitOutline(name, asNew) {                // the outline becomes this design's silhouette: one of yours overwritten (unless asNew), anything else a new one
  const d = design(), st = outEd.state(), mine = ownHull(st), h = outEd.build(name || st.name);
  if (!mine || asNew) { h.id = 'u' + Math.random().toString(36).slice(2, 9); if (!name) h.name = d.name + ' outline'; } h.klass = DS.t.hullClass;
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
  const KL = { starship: 'a star drive: it crosses between stars', platform: 'thrusters only: a ship or a platform that moves inside its own system and cannot leave it', structure: 'no engine: built on the ground' };
  $('dKlass').innerHTML = [['starship', 'Starship'], ['platform', 'Platform · in-system'], ['structure', 'Structure']].map(([k, l]) => `<button class="${d.klass === k ? 'go' : 'x'}" data-dklass="${k}" style="flex:1" title="${KL[k]}">${l}</button>`).join('');

  DS = designStats(S, d, c.caps);
  const t = DS.t;
  const hasShield = DS.shields.length > 0, isShip = t.klass !== 'structure', nDes = shipDesignCount();
  const why = t.dock ? `a space dock: ships are put together inside its gantry${isShip ? ' — and with an engine it can move' : ''}`
    : { structure: 'no engine: it is built on the ground', platform: 'thrusters only: it crawls from place to place inside its own system and cannot leave it', starship: 'it has a star drive: next eon to any place in its system, and it can cross to other stars' }[t.klass];
  $('dClass').innerHTML = note ? `<span class="up">${esc(note)}</span>` : `${badgeOf(t)} <span class="tiny">${why} · ship designs <b class="${nDes >= MAX_SHIP_DESIGNS ? 'up' : ''}">${nDes} / ${MAX_SHIP_DESIGNS}</b></span>`;
  // which dock would build this — colony by colony, and the best of them as a size bar under the hull
  const fits = isShip ? c.colonies.map(p => ({ p, fit: dockFit(p.gantries, t.hull.area) })) : [];
  const best = isShip ? dockFit(c.colonies.flatMap(p => p.gantries), t.hull.area) : null, whole = fits.some(f => f.fit?.sections === 1);
  FIT = best && { area: t.hull.area, cap: best.cap, sections: best.sections, label: best.sections === 1 ? `${best.at} space dock: ${t.squares} of ${best.cap} squares — it fits` : `${best.at} space dock holds ${best.cap} squares: ${t.squares} → cut into ${best.sections} sections` };
  const cur = hullDef(DS.hull.id);
  $('dHullPick').innerHTML = `<span class="tiny">Silhouette</span>` + hullsFor(t.hullClass).map(h => `<button class="tpl ${DS.hull.id === h.id ? 'on' : ''}" data-hull="${h.id}" title="${esc(h.name)}${h.user ? ' (yours)' : ''}">${tplIcon(h, DS.hull.id === h.id)}</button>${chip && h.user ? `<button class="x" data-hulldel="${h.id}" title="delete “${esc(h.name)}”" style="padding:0 5px;margin-left:-3px">✕</button>` : ''}`).join('')
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
  renderTop(c);
  if (tab === 'empire') renderEmpire(c);
  if (tab === 'galaxy') renderGalaxy(c);
  if (tab === 'system') renderSystem(c);
  if (tab === 'design') renderDesign(c);
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
  if ((t = q('[data-newseed]'))) { const text = $('gSeed').value.trim() || '7'; if (confirm(`Start a new game in the galaxy of seed "${text}"? The game you are playing is lost.`)) startGame(text); return; }
  if ((t = q('[data-opensys]'))) return openSystem(t.dataset.opensys);
  if ((t = q('[data-gplace]'))) return openSystem(placeOf(t.dataset.gplace).sys, t.dataset.gplace);
  if ((t = q('[data-unq]'))) { const P = placeOf(t.dataset.planet).colony; P.queue = P.queue.filter(x => x.id !== t.dataset.unq); save(); return refresh(); }
  if ((t = q('[data-buynow]'))) {                      // BUY NOW: the rest of a queue item paid from the reserves (stored industry)
    const pc = LAST.colonies.find(x => x.pl.id === t.dataset.planet), qi = pc && pc.queue.find(x => x.item && x.item.id === t.dataset.buynow); if (!qi || qi.noDock) return;
    if ((S.reserves || 0) < qi.need - 1e-6) return say('Not enough in the reserves');
    S.reserves -= qi.need; qi.item.progress += qi.need; save(); return refresh();
  }
  if ((t = q('[data-add]'))) return enqueue(t.dataset.add, document.querySelector(`[data-addsel="${t.dataset.add}"]`).value);
  if ((t = q('[data-send]'))) { toastErr(sendShip(S, t.dataset.send, document.querySelector(`[data-dest="${t.dataset.send}"]`).value)); save(); return refresh(); }
  if ((t = q('[data-recall]'))) { recallShip(S, t.dataset.recall); save(); return refresh(); }
  if ((t = q('[data-gpick]'))) { const k = t.dataset.gpick, n = clamp((picks.get(k) || 0) + +t.dataset.d, 0, +t.dataset.max); if (n) picks.set(k, n); else picks.delete(k); return refresh(); }
  if ((t = q('[data-gall]'))) { const k = t.dataset.gall, max = +t.dataset.max; if ((picks.get(k) || 0) === max) picks.delete(k); else picks.set(k, max); return refresh(); }
  if ((t = q('[data-pclear]'))) { picks.clear(); sendTo = null; return refresh(); }
  if ((t = q('[data-pcancel]'))) { sendTo = null; return refresh(); }
  if ((t = q('[data-psend]'))) { const ships = picked(scopeGroups(LAST)), dest = pickScope.kind === 'galaxy' ? sysOf(sendTo).star : sendTo; toastErr(sendFleet(S, ships.map(x => x.u.id), dest)); picks.clear(); sendTo = null; save(); return refresh(); }
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
  if ((t = q('[data-settle]'))) { toastErr(settle(S, t.dataset.settle)); save(); return refresh(); }
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
addEventListener('keydown', e => {
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
$('dNew').onclick = () => { leaveOutline(); const full = shipDesignCount() >= MAX_SHIP_DESIGNS; const d = { id: uid('d'), name: 'New design', klass: full ? 'structure' : 'starship', modules: [], chips: full ? [] : [{ type: 'weapon', kind: 'weapon_energy', h: 1, role: null }], paint: { plating: 0, fittings: 0, seed: Math.floor(Math.random() * 1000) } }; S.designs.push(d); curDesign = d.id; selMod = null; chipsFor = null; save(); if (full) say(`${MAX_SHIP_DESIGNS} ship designs at most — this one is a structure; delete a ship design to make room`); else refresh(); };
$('dCopy').onclick = () => { const d = design(); if (!d) return; if ((d.klass || DS?.t.klass) !== 'structure' && shipDesignCount() >= MAX_SHIP_DESIGNS) return say(`${MAX_SHIP_DESIGNS} ship designs at most — delete one first (refits come later)`); leaveOutline(); const c = JSON.parse(JSON.stringify(d)); c.id = uid('d'); c.name = d.name + ' II'; for (const m of c.modules) m.id = uid('m'); S.designs.push(c); curDesign = c.id; selMod = null; chipsFor = null; save(); refresh(); };
$('dDel').onclick = () => { const d = design(); if (!d || !confirm(`Delete the design "${d.name}"? What is already built stays.`)) return; leaveOutline(); S.designs = S.designs.filter(x => x.id !== d.id); curDesign = S.designs[0]?.id || null; selMod = null; chipsFor = null; save(); refresh(); };
$('eEnd').onclick = () => { const rep = endEon(S); newIds = new Set(rep.filter(r => r.kind === 'breakthrough').map(r => r.id)); save(); refresh(); };
// WATCH A BATTLE (his ask, 2026-10-16): the lab's arena (lab.html#arena) in a frame over the game replays a fight this eon as it was
// fought — your ships' designs as they were (capsules and all, keep: true), each one's stamina, the hostile plan, the same dice; your
// side wears your coat, theirs the look drawn from its name. The frame answers with the result line and a tapped ship's card.
let arenaReady = false, arenaPending = null;
function watchBattle(id) {
  const b = (S.battles || []).find(x => x.id === id); if (!b) return say('That battle is gone from the record');
  const L = S.look || {}, hulls = {};
  for (const m of b.mine) { const h = hullDef(m.design.hull); if (h && h.user) { const { user, ...rec } = h; hulls[h.id] = rec; } }
  const pa = { name: 'Your fleet', style: L.style || styleChoices()[0].id, colA: L.colA || '#7fb3ff', colB: L.colB || '#ffb347', hulls, ships: b.mine.map(m => ({ design: m.design, keep: true, name: m.name, en0: m.en0, cost: 0, seed: 1, locked: true })) };
  const msg = { type: 'fight', a: planCode(pa), b: planCode(b.foe), seed: b.seed, techA: S.breakthroughs, techB: [] };
  $('arenaWrap').hidden = false; $('shipInfo').hidden = true; $('arenaNote').textContent = `Battle at ${esc(sysOf(b.sys)?.name || '?')}, eon ${b.eon} — your ${plural(b.mine.length, 'ship')} against ${esc(b.foe.name)} — replaying…`;
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
