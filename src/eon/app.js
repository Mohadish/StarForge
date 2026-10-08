// The eon screens: Empire (focus + research attention), Galaxy (the seeded map of star systems),
// Star system (the places of one system, colonies, ships), Design (modules as pieces on a board).
import { $, clamp, fmt, signed, esc } from '../util.js';
import { DOMAINS } from '../data/properties.js';
import { XS, X_INFO, T, FIELD_IDS, newState, compute, endEon, uid, isIntegrated, cloneDesign, giveAttention, sendShip, recallShip, settle, starEons, sysDistance } from './model.js';
import { KINDS, KIND_IDS, CLASS_NAME, GANTRY, GUN, PRESETS, applyPreset, allCapsules, designStats, isRelevant, dockFit, reachBand, fitModule, autoFit, traverseOf } from './modules.js';
import { GALAXY, STARS } from './galaxy.js';
import { createTetra } from './tetra.js';
import { drawHull } from './hullview.js';
import { hullDef, hullsFor, setUserHulls, bboxOf } from './hull.js';
import { createHullEditor } from './hulledit.js';

const KEY = 'forge.eon.v8';
const HULL_KEY = 'forge.eon.hulls.v1';       // the player's own silhouettes live outside the game: a new game keeps them
let S = load();
let tab = 'empire', newIds = new Set();
let curDesign = S.designs[0]?.id || null, selMod = null, openBt = new Set(), note = '', noteT = null, FIT = null;
let HULLS = loadHulls(); setUserHulls(HULLS);
let selSys = S.homeSys, selPlace = 'home', hoverPlace = null, DS = null, LAST = null;
let gSel = S.homeSys, gHover = null, gField = null, seedDraft = null;

function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.version === 8) return s; } catch (e) { /* new game */ } return newState(); }
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
const reach = () => S.cohesion / T.focusCost;
const tetra = createTetra($('eTetra'), {
  labels: XS.map(x => X_INFO[x].name), colors: XS.map(xColor),
  getState: () => ({ w: S.focus, w0: S.focusStart, reach: reach() }),
  onChange: w => { S.focus = w; const c = compute(S); renderEmpire(c, true); renderTop(c); },
});

function renderTop(c) {
  const cell = (label, val, sub = '', neg = false) => `<div class="r"><span>${label}</span><b>${val}</b>${sub ? ` <small class="${neg ? 'neg' : ''}">${sub}</small>` : ''}</div>`;
  const dPeople = c.colonies.reduce((a, p) => a + p.dPeople, 0), dCoh = c.cohesionGain - c.moveCost;
  $('eStats').innerHTML = cell('Eon', S.eon) + cell('People', fmt(c.people), signed(dPeople), dPeople < 0)
    + cell('Research', fmt(c.research)) + cell('Cohesion', fmt(S.cohesion), signed(dCoh), dCoh < 0)
    + cell('Focus steady', plural(S.steady || 0, 'eon')) + cell('Between stars', fmt(T.starSpeed * c.warp) + '/eon');
}

const starRow = v => { const n = Math.round(v); return `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(10 - n)}</i></span>`; };

function renderEmpire(c, skipTetra) {
  const left = S.cohesion - c.moveCost;
  $('eFocus').innerHTML = `<div class="fx">${XS.map((x, i) => `<div style="border-color:${xColor(x)}"><span style="color:${xColor(x)}">${X_INFO[x].name}</span><b>${pct(S.focus[i])}</b></div>`).join('')}</div>
    <div class="tiny" style="margin-top:6px">${c.moved ? `Moving the focus this far costs <b>${c.moveCost.toFixed(1)}</b> cohesion (you have ${fmt(S.cohesion)}, ${fmt(left)} left)${c.setback ? ` and loses ${plural(c.setback, 'step')} of research in every field` : ''}.` : `The focus has not moved this eon${S.steady ? ` (steady for ${plural(S.steady, 'eon')})` : ''}.`}
    The dashed circle is as far as your cohesion reaches.</div>`;
  const builds = c.colonies.flatMap(p => p.done.map(d => `${d.d.name} at ${p.pl.name}`));
  const on = c.fields.filter(f => f.points > 0).sort((a, b) => b.points - a.points).map(f => `${f.name} ${f.points}`).join(' · ');
  $('ePredict').innerHTML = `<div class="card">
    ${row('Attention on', on || '<span class="up">nothing — no field can advance</span>')}
    ${row('Built this eon', builds.length ? builds.join(', ') : 'nothing finishes')}
    ${row('Integration', `${c.speed.toFixed(1)}% per eon${c.moved ? ' — the focus moved' : ''}`)}
    ${row('Cohesion', `+${c.cohesionGain.toFixed(1)} earned${c.moveCost > 0.05 ? `, −${c.moveCost.toFixed(1)} spent on the focus` : ''}`)}</div>`;

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
  const icon = { breakthrough: '★', bad: '▼', integ: '◆', step: '›', move: '→' }, col = { breakthrough: 'var(--time)', bad: 'var(--bad)', integ: 'var(--good)' };
  if (S.report?.length) $('eReport').innerHTML = `<div class="rep">${S.report.map(r => `<div>${icon[r.kind] || '·'} <span style="color:${col[r.kind] || 'inherit'}">${esc(r.text)}</span></div>`).join('')}</div>`;
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
  G.k = (Math.min(G.w, G.h) / 2 - 34) / GALAXY.radius; G.pos = {};
  for (const s of S.systems) G.pos[s.id] = { x: G.cx + s.x * G.k, y: G.cy + s.y * G.k };
  cv._geo = G;
  g.clearRect(0, 0, G.w, G.h);
  // the disc
  const R = G.k * GALAXY.radius * 1.07, gr = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, R);
  gr.addColorStop(0, 'rgba(150,170,255,.11)'); gr.addColorStop(0.7, 'rgba(120,140,255,.04)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(G.cx, G.cy, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(170,210,255,.12)'; g.setLineDash([2, 6]); g.beginPath(); g.arc(G.cx, G.cy, R * 0.98, 0, 7); g.stroke(); g.setLineDash([]);
  // ships crossing between stars
  for (const { u } of c.ships) {
    if (!u.dest) continue;
    const a = G.pos[placeOf(u.at).sys], b = G.pos[placeOf(u.dest).sys]; if (a === b) continue;
    const k = clamp(1 - u.eta / (u.trip || u.eta || 1), 0.06, 1), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
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
    if (here?.colonies) { g.strokeStyle = '#7ef3b0'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, size + 4, 0, 7); g.stroke(); g.lineWidth = 1; }
    if (here?.ships) { const x = p.x + size + 9, y = p.y - size - 2; g.fillStyle = '#7ef3b0'; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y + 4); g.lineTo(x - 4, y + 4); g.fill(); }
    if (s.id === gSel || s.id === gHover) { g.strokeStyle = s.id === gSel ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, size + 8, 0, 7); g.stroke(); g.lineWidth = 1; }
    g.fillStyle = s.home || here ? '#e8f0ff' : '#8598bb'; g.font = (s.home || here ? 'bold ' : '') + '10px sans-serif';
    g.fillText(s.home ? s.name + ' · home' : s.name, p.x, p.y + size + 13);
  }
  g.textAlign = 'left';
}
function sysAt(e) {
  const cv = $('gMap'), G = cv._geo; if (!G) return null;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 17;
  for (const s of S.systems) { const p = G.pos[s.id], d = Math.hypot(mx - p.x, my - p.y); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
function sysBlurb(s) {
  const here = placesIn(s.id), best = here.flatMap(pl => FIELD_IDS.map(f => [pl.mult[f] * pl.fresh[f], f, pl])).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return `<b>${esc(s.name)}</b> — ${STARS[s.type].name} · ${here.length > 1 ? `${plural(here.length - 1, 'place')} around it, ${here.filter(p => p.landable).length} can be settled` : 'nothing circles it'}<br>
    the most to learn: ${best.map(b => `${DOMAINS[b[1]].name} ${pct(b[0])} at ${esc(b[2].name)}`).join(' · ')}`;
}
$('gMap').addEventListener('mousemove', e => {
  const id = sysAt(e); if (id === gHover) return;
  gHover = id; $('gMap').style.cursor = id ? 'pointer' : 'default';
  $('gHover').innerHTML = id ? sysBlurb(sysOf(id)) : '';
  if (LAST) drawGalaxy(LAST);
});
$('gMap').addEventListener('click', e => { const id = sysAt(e); if (id) { gSel = id; refresh(); } });
$('gMap').addEventListener('dblclick', e => { const id = sysAt(e); if (id) openSystem(id); });

function renderGalaxy(c) {
  drawGalaxy(c);
  const s = sysOf(gSel) || sysOf(S.homeSys), here = placesIn(s.id), mine = presence(c).get(s.id), d = sysDistance(S, S.homeSys, s.id);
  const have = mine ? [mine.colonies ? `${mine.colonies} ${mine.colonies === 1 ? 'colony' : 'colonies'}` : '', mine.ships ? plural(mine.ships, 'ship') : ''].filter(Boolean).join(' and ') : '';
  $('gPanel').innerHTML = `<h2>The galaxy</h2>
    <div class="tiny">${S.systems.length} star systems, all grown from one seed. The same seed always gives the same galaxy — any number or word will do.</div>
    <div style="display:flex;gap:6px;margin:6px 0 4px;align-items:center"><span class="tiny">Seed</span><input type="text" id="gSeed" value="${esc(seedDraft ?? S.seedText ?? S.seed)}" style="flex:1;min-width:0"><button data-randseed title="put a random seed in the box">Random</button><button class="go" data-newseed>New game from this seed</button></div>
    <h3>Show where a field is rich</h3>
    <div>${FIELD_IDS.map(f => `<button class="x ${gField === f ? 'go' : ''}" data-gfield="${f}" style="margin:0 4px 4px 0">${DOMAINS[f].name}</button>`).join('')}</div>
    <div class="tiny">${gField ? `The bigger the purple halo, the more ${DOMAINS[gField].name} there is to find in that system. Click the field again to switch it off.` : 'Pick a field and the map marks the systems worth going to for it.'}</div>
    <h2 style="margin-top:14px">${esc(s.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${STARS[s.type].name}${s.home ? ' · your home' : ''}</span></h2>
    <div class="tiny" style="margin-bottom:6px">${s.home ? 'Where your people come from.' : `${d.toFixed(0)} from Home — ${plural(starEons(d, c.warp), 'eon')} by star drive.`}${have ? ` You have ${have} here.` : ''}</div>
    ${here.map(pl => `<div class="shiprow" data-gplace="${pl.id}" style="cursor:pointer"><div class="n"><span><i class="dot" style="background:${lookOf(pl).color}"></i>${esc(pl.name)}${pl.cool ? ' <span title="a remarkable place" style="color:var(--time)">✦</span>' : ''}</span><span class="tiny">${KIND_WORD[pl.kind]}${pl.colony ? ' · settled' : pl.landable ? ' · can be settled' : ' · orbit only'}</span></div>
      <div class="tiny">${topFields(pl).filter(x => x[2] > 0.06).map(x => `${DOMAINS[x[0]].name} <b>${pct(x[1])}</b>`).join(' · ')}</div></div>`).join('')}
    <button class="go" data-opensys="${s.id}" style="margin-top:4px">Open the ${esc(s.name)} system ▸</button>
    <div class="tiny" style="margin-top:8px">Click a star to look at it; double-click to open it. A green ring is a colony of yours, a green triangle a ship.</div>`;
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
  S = newState(seedOf(seedText)); S.seedText = seedText;
  curDesign = S.designs[0]?.id || null; selMod = null; selSys = gSel = S.homeSys; selPlace = 'home'; newIds = new Set(); seedDraft = null;
  save(); refresh();
}

// =====================================================================
// STAR SYSTEM — the places of one system
// =====================================================================
function mapGeo(cv) {
  const G = fitCanvas(cv); G.R = Math.min(G.w, G.h) / 2 - 40; G.pos = {};
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
$('sMap').addEventListener('click', e => { const id = placeAt(e); if (id) { selPlace = id; refresh(); } });

const PT = [{ x: 100, y: 16 }, { x: 22, y: 134 }, { x: 178, y: 134 }];   // industry / research / social
function renderSystem(c) {
  if (!sysOf(selSys)) selSys = S.homeSys;
  if (placeOf(selPlace)?.sys !== selSys) selPlace = sysOf(selSys).star;
  drawMap(c);
  const pl = placeOf(selPlace), st = c.studied.find(s => s.pl.id === pl.id), pc = c.colonies.find(x => x.pl.id === pl.id), mine = presence(c);
  const byHome = [...S.systems].map(s => [s, sysDistance(S, S.homeSys, s.id)]).sort((a, b) => a[1] - b[1]);
  let h = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><span class="tiny">System</span><select data-syspick style="flex:1">${byHome.map(([s]) => `<option value="${s.id}" ${s.id === selSys ? 'selected' : ''}>${mine.has(s.id) ? '● ' : ''}${esc(s.name)} — ${STARS[s.type].name}</option>`).join('')}</select><button data-tab="galaxy">Galaxy map</button></div>
    <h2>${esc(pl.name)} <span class="tiny" style="text-transform:none;letter-spacing:0">· ${KIND_WORD[pl.kind]}${pl.colony ? ' · settled' : pl.landable ? ' · not settled' : ' · orbit only'}</span></h2><div class="tiny" style="margin-bottom:8px">${esc(pl.colony ? pl.note.replace(', never settled', '') : pl.note)}</div>`;

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
    const queue = pc.queue.filter(q => !q.gone).map(q => `<div class="dcard" style="cursor:default"><div class="n"><span>${esc(q.d.name)}</span><button class="x" data-unq="${q.item.id}" data-planet="${pl.id}">✕</button></div>
      <div class="prog"><div style="width:${100 * Math.min(1, (q.item.progress + q.spend) / q.cost)}%;background:var(--cost)"></div></div>
      <div class="tiny">${q.noDock ? '<b class="up">waiting — there is no space dock here to put it together in</b>' : `${fmt(q.item.progress)} / ${fmt(q.cost)} · ${q.finishes ? '<b class="down">finished this eon</b>' : q.joining ? `paid for — joining the sections, ${plural(q.joinLeft, 'eon')} left` : Number.isFinite(q.eta) ? 'ready in ' + plural(q.eta, 'eon') : 'nobody in industry'}`}${q.sections > 1 ? ` · <b class="up">too big for the ${q.fit.w} × ${q.fit.h} gantry: built in ${q.sections} sections, ${extraCost(q.fit)}</b>` : ''}${q.ds.klass !== 'structure' && q.ds.housing > 0 ? ` · takes ${fmt(Math.min(q.ds.housing, P.people - 5))} people aboard` : ''}</div></div>`).join('');
    const slips = pc.gantries.slice().sort((a, b) => b.w * b.h - a.w * a.h);
    h += `<h3>The colony</h3>
      <div class="tiny">${fmt(P.people)} people of ${fmt(pc.housing)} housing <b class="${pc.dPeople < 0 ? 'up' : 'down'}">${signed(pc.dPeople)}</b>${pc.full ? ' · <b class="up">housing is full — build habitats</b>' : ''} · happiness ${Math.round(P.happiness)} · food ${signed(pc.surplus)}</div>
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

  // ships
  const here = c.ships.filter(s => !s.u.dest && s.u.at === pl.id), coming = c.ships.filter(s => s.u.dest === pl.id), leaving = c.ships.filter(s => s.u.dest && s.u.at === pl.id);
  const local = placesIn(pl.sys).filter(p => p.id !== pl.id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const others = S.systems.filter(s => s.id !== pl.sys).map(s => [s, sysDistance(S, pl.sys, s.id)]).sort((a, b) => a[1] - b[1]);
  const dests = (u, t) => (local ? `<optgroup label="In this system — ${plural(T.travel[u.klass], 'eon')}">${local}</optgroup>` : '')
    + (u.klass === 'starship' ? `<optgroup label="Another star">${others.map(([s, d]) => `<option value="${s.star}">${esc(s.name)} — ${plural(starEons(d, c.warp), 'eon')}</option>`).join('')}</optgroup>` : '');
  const whereTo = u => { const to = placeOf(u.dest); return esc(to.name) + (to.sys !== pl.sys && to.kind !== 'star' ? ` (${esc(sysOf(to.sys).name)})` : ''); };
  h += `<h3>In orbit here</h3>` + (here.map(({ u, t }) => `<div class="shiprow"><div class="n"><span>${esc(u.name)}</span><span class="badge ${u.klass}">${CLASS_NAME[u.klass]}</span></div>
      <div class="tiny">${[t.research ? `lab ${fmt(t.research)}` : '', u.people ? `${fmt(u.people)} people aboard` : '', t.dps ? `${fmt(t.dps)} damage/s` : '', t.dock ? `dock, gantry ${t.gantries.map(s => `${s.w} × ${s.h}`).join(', ')}` : '', u.sections > 1 ? `built in ${u.sections} sections` : ''].filter(Boolean).join(' · ') || 'no lab, no people'} ·${u.klass === 'starship' ? (t.underDriven ? '<b class="up">star drive too small for its bulk: it cannot leave the system</b>' : 'next eon to any place in this system; other stars take longer') : `thrusters only: ${T.travel.platform} eons to any place in this system, and it cannot leave it`}</div>
      <div class="acts"><select data-dest="${u.id}">${dests(u, t)}</select><button data-send="${u.id}">Send</button>
        ${u.people > 0 && pl.landable && !pl.colony ? `<button class="go" data-settle="${u.id}">Settle ${esc(pl.name)}</button>` : ''}</div></div>`).join('') || '<div class="tiny">Nothing.</div>');
  if (coming.length) h += `<h3>On the way here</h3>` + coming.map(({ u }) => `<div class="shiprow"><div class="n"><span>${esc(u.name)}</span><span class="tiny">arrives in ${plural(u.eta, 'eon')}</span></div></div>`).join('');
  if (leaving.length) h += `<h3>Leaving</h3>` + leaving.map(({ u }) => `<div class="shiprow"><div class="n"><span>${esc(u.name)} → ${whereTo(u)} <span class="tiny">· ${plural(u.eta, 'eon')}</span></span><button class="x" data-recall="${u.id}">call back</button></div></div>`).join('');
  if (!pc && pl.landable) h += `<div class="tiny" style="margin-top:8px">To settle ${esc(pl.name)}: build a ship that has a habitat (the people go aboard when it is built), send it here, and press Settle. The ship becomes the colony's first building.</div>`;
  $('sPanel').innerHTML = h;
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
    ${sc ? `<div class="srow"><span>Size</span><b class="stepper"><button data-rk="-1">−</button>×${m.k}<button data-rk="1">+</button><button data-rfit title="the smallest size that covers what the rest of the design needs">fit</button></b><span class="tiny">×${sc.min} to ×${sc.max}: ${m.kind === 'reactor' ? 'output' : m.kind === 'stardrive' ? 'what it can move' : 'mounts'}, cost and bulk follow</span></div>` : ''}
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
  $('dSysAdd').innerHTML = KIND_IDS.filter(k => !isWeapon(k)).map(addBtn).join('');
  $('dWeapAdd').innerHTML = KIND_IDS.filter(isWeapon).map(addBtn).join('');
  if (!d) { DS = null; FIT = null; drawHull($('dHull'), null); for (const id of ['dHullPick', 'dSysList', 'dFire', 'dWeapList', 'dClass']) $(id).innerHTML = ''; $('dSummary').innerHTML = '<div class="tiny">No design open. Press ＋.</div>'; return; }
  if (document.activeElement !== $('dName')) $('dName').value = d.name;

  DS = designStats(S, d, c.caps);
  const t = DS.t;
  const hasShield = DS.shields.length > 0, isShip = t.klass !== 'structure';
  const why = t.dock ? `a space dock: ships are put together inside its gantry${isShip ? ' — and with an engine it can move' : ''}`
    : { structure: 'no engine: it is built on the ground', platform: 'thrusters only: it crawls from place to place inside its own system and cannot leave it', starship: 'it has a star drive: next eon to any place in its system, and it can cross to other stars' }[t.klass];
  $('dClass').innerHTML = note ? `<span class="up">${esc(note)}</span>` : `${badgeOf(t)} <span class="tiny">${why}</span>`;
  // which dock would build this — colony by colony, and the best of them as a size bar under the hull
  const fits = isShip ? c.colonies.map(p => ({ p, fit: dockFit(p.gantries, t.hull.area) })) : [];
  const best = isShip ? dockFit(c.colonies.flatMap(p => p.gantries), t.hull.area) : null, whole = fits.some(f => f.fit?.sections === 1);
  FIT = best && { area: t.hull.area, cap: best.cap, sections: best.sections, label: best.sections === 1 ? `${best.at} space dock: ${t.squares} of ${best.cap} squares — it fits` : `${best.at} space dock holds ${best.cap} squares: ${t.squares} → cut into ${best.sections} sections` };
  const cur = hullDef(DS.hull.id);
  $('dHullPick').innerHTML = `<span class="tiny">Silhouette</span>` + hullsFor(t.hullClass).map(h => `<button class="tpl ${DS.hull.id === h.id ? 'on' : ''}" data-hull="${h.id}" title="${esc(h.name)}${h.user ? ' (yours)' : ''}">${tplIcon(h, DS.hull.id === h.id)}</button>`).join('')
    + `<button class="x" data-hulldraw title="draw a new silhouette">✎ Draw…</button>${cur?.user ? `<button class="x" data-hulledit="${cur.id}" title="edit this silhouette">✎ edit</button>` : ''}`
    + `<span class="tiny">· ${plural(t.squares, 'square')} now · shape is looks, size is what the dock counts</span>`;
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
  let travel = '';
  if (isShip) travel += box(ICON.speed, 'Battle speed', fmt(t.speed) + ' u/s') + box(ICON.speed, 'Turns', `${Math.round(t.turn)}°/s — half a turn in ${Math.round(180 / Math.max(1, t.turn))} s`) + box(ICON.evasion, 'Evasion', Math.round(t.evasion) + '%');
  if (t.klass === 'starship') travel += box(ICON.drive, 'Star drive', `moves ${fmt(t.lift)} of ${fmt(t.volume)} volume ${t.underDriven ? '✗' : '✓'}`, t.underDriven) + box(ICON.stars, 'Between stars', `${fmt(T.starSpeed * c.warp)} per eon · the whole fleet`);
  let civ = '';
  if (t.housing) civ += box(ICON.house, isShip ? 'Carries' : 'Houses', fmt(t.housing) + ' people');
  if (t.research) civ += box(ICON.research, isShip ? 'Lab (studies where parked)' : 'Research', '+' + fmt(t.research));
  if (t.industry) civ += box(ICON.industry, 'Industry', '+' + fmt(t.industry) + '/eon');
  if (t.social) civ += box(ICON.social, 'Social', '+' + fmt(t.social) + '/eon');
  if (t.dock) civ += box(ICON.gantry, 'Gantry', t.gantries.map(s => `${s.w} × ${s.h}`).join(', ') + ` (${t.gantries.reduce((a, s) => a + s.w * s.h, 0)} squares)`);
  const warns = [], tips = [];
  if (t.powerFactor < 1) warns.push(`Not enough power: everything on it runs at ${pct(t.powerFactor)}. Turn the reactor up, add one, or use less.`);
  if (t.powerOut > t.powerUse * 1.6 && t.powerUse > 0) tips.push(`The reactor makes ${fmt(t.powerOut)} MW for ${fmt(t.powerUse)} needed — turn it down and the hull shrinks and gets cheaper.`);
  if (hasShield && t.cover < 0.999) warns.push(`The shields reach only ${pct(t.cover)} of the hull: the uncovered part takes hits bare, so the shield counts for ${pct(t.cover)} of its strength. Add another shield, or a bigger reach.`);
  if (t.underDriven) warns.push(`The star drive moves ${fmt(t.lift)} of volume and the hull is ${fmt(t.volume)}: it cannot leave the system. Turn the drive up (open it and press "fit to need"), or take something out.`);
  if (isShip && !best) warns.push('None of your colonies has a space dock, so this cannot be built anywhere. Build a Space dock first.');
  else if (isShip && !whole) warns.push(`Too big for any gantry you have (${t.squares} squares against ${best.cap}). The dock would cut it into ${best.sections} sections and build those: ${extraCost(best)}. Take something out, turn the reactor down, or build a dock with a bigger gantry.`);
  if (t.fireFactor < 1) warns.push(`The weapons computer runs ${num(t.mounts, 1)} mounts and the guns need ${num(t.mountsUsed, 1)}: they fire at ${pct(t.fireFactor)}. Turn it up, add one, or carry fewer guns.`);
  if (t.dock) tips.push(`Whatever fits inside the gantry is built whole. A bigger hull is cut into gantry-sized sections, and every extra section adds ${Math.round(Math.min(...t.gantries.map(s => s.overhead)))}% to its cost and ${plural(T.sectionEons, 'eon')} of joining to the build. The dock works for the colony it stands at${isShip ? ', or wherever it is parked' : ''}.`);
  if (isShip && t.housing) tips.push(`It carries people, so it is a colony ship: up to ${fmt(t.housing)} go aboard when it is built, and it can settle any world it can land on.`);
  if (isShip && t.research) tips.push('It has a lab: parked in orbit of a place, it studies that place.');
  const arm = DS.mods.find(m => m.kind === 'armor'); if (arm && arm.n > 1) tips.push(`Armour layers ring outward: ${arm.n} layers give ${arm.n}× the points for ${(arm.n + 0.2 * arm.n * (arm.n - 1)).toFixed(1)}× the bulk of one. Once the armour is gone, every hull point lost slows the ship and its guns.`);
  $('dSummary').innerHTML = (warns.length ? `<div class="probs"><b>Problems</b>${warns.map(w => `<div>⚠ ${w}</div>`).join('')}<div class="tiny" style="margin-top:4px">⚙ Auto-fit (top of the Systems column) sizes the reactor, the star drive and the weapons computer, and adds shields.</div></div>` : '')
    + sec('Build', build) + sec('Hull', hull) + sec('Power', power) + sec('Travel', travel) + sec('Civilian', civ)
    + (tips.length ? `<div class="notes tiny">${tips.map(w => `<div>· ${w}</div>`).join('')}</div>` : '');
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
function toastErr(msg) { if (msg) $('sHover').textContent = msg; }

document.addEventListener('click', e => {
  const q = s => e.target.closest(s);
  let t;
  if ((t = q('[data-tab]'))) return go(t.dataset.tab);
  if ((t = q('[data-att]'))) { giveAttention(S, t.dataset.att, +t.dataset.d); save(); return refresh(); }
  if ((t = q('[data-gfield]'))) { gField = gField === t.dataset.gfield ? null : t.dataset.gfield; return refresh(); }
  if ((t = q('[data-randseed]'))) { seedDraft = String(Math.floor(Math.random() * 1e6)); return refresh(); }
  if ((t = q('[data-newseed]'))) { const text = $('gSeed').value.trim() || '7'; if (confirm(`Start a new game in the galaxy of seed "${text}"? The game you are playing is lost.`)) startGame(text); return; }
  if ((t = q('[data-opensys]'))) return openSystem(t.dataset.opensys);
  if ((t = q('[data-gplace]'))) return openSystem(placeOf(t.dataset.gplace).sys, t.dataset.gplace);
  if ((t = q('[data-unq]'))) { const P = placeOf(t.dataset.planet).colony; P.queue = P.queue.filter(x => x.id !== t.dataset.unq); save(); return refresh(); }
  if ((t = q('[data-add]'))) return enqueue(t.dataset.add, document.querySelector(`[data-addsel="${t.dataset.add}"]`).value);
  if ((t = q('[data-send]'))) { toastErr(sendShip(S, t.dataset.send, document.querySelector(`[data-dest="${t.dataset.send}"]`).value)); save(); return refresh(); }
  if ((t = q('[data-recall]'))) { recallShip(S, t.dataset.recall); save(); return refresh(); }
  if ((t = q('[data-settle]'))) { toastErr(settle(S, t.dataset.settle)); save(); return refresh(); }
  if ((t = q('[data-hull]'))) { const d = design(); if (!d) return; d.hull = t.dataset.hull; save(); return refresh(); }
  if ((t = q('[data-hulldraw]'))) return hullEd.open({ klass: DS?.t.hullClass || 'starship' });
  if ((t = q('[data-hulledit]'))) return hullEd.open({ hull: t.dataset.hulledit });
  if ((t = q('[data-addmod]'))) { const d = design(); if (!d) return; const m = { id: uid('m'), kind: t.dataset.addmod, caps: [], n: 1 }; d.modules.push(m); selMod = m.id; save(); return refresh(); }
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
document.addEventListener('change', e => { if (e.target.id === 'dPick') { curDesign = e.target.value; selMod = null; return refresh(); }
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
$('dNew').onclick = () => { const d = { id: uid('d'), name: 'New design', modules: [] }; S.designs.push(d); curDesign = d.id; selMod = null; save(); refresh(); };
$('dCopy').onclick = () => { const d = design(); if (!d) return; const c = cloneDesign(d); c.id = uid('d'); c.name = d.name + ' II'; for (const m of c.modules) m.id = uid('m'); S.designs.push(c); curDesign = c.id; selMod = null; save(); refresh(); };
$('dDel').onclick = () => { const d = design(); if (!d || !confirm(`Delete the design "${d.name}"? What is already built stays.`)) return; S.designs = S.designs.filter(x => x.id !== d.id); curDesign = S.designs[0]?.id || null; selMod = null; save(); refresh(); };
$('eEnd').onclick = () => { const rep = endEon(S); newIds = new Set(rep.filter(r => r.kind === 'breakthrough').map(r => r.id)); save(); refresh(); };
$('eNew').onclick = () => { if (confirm('Start over in a new, random galaxy?')) startGame(String(Math.floor(Math.random() * 1e6))); };
$('eTetra').addEventListener('pointerup', save);

go('empire');
window.__forgeBooted = true;
