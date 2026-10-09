// THE PAINTER page: one canvas. The ship is painted — ribbon, onion rings, spine, greebles, engines — and
// a double-tap on it opens its outline right there (the editor lives on the same canvas, see shapeedit.js):
// drag the points, double-tap to add or remove, pick the symmetry, name it, save it. Everything follows
// the volume; the sliders are offsets to dial in and report back.
import { TEMPLATES, hullOf, hullDef, setUserHulls, areaOf, bboxOf, HULL_VOLUME } from './hull.js';
import { STYLES, loadStyle } from './styles.js';
import { paintHull, RECIPE, autoRibbonPct, autoEngines, pct } from './paint.js';
import { createShapeEditor, GW, GH } from './shapeedit.js';
import { readLocal, loadLibrary, saveLibrary, libraryCode as codeOf } from './library.js';
import { renderStrip, createDialog, createMenu, saveFlow } from './hullui.js';

const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the library (library.js): the browser's copy at once, the page's own database when there is one (a published page) —
// that one survives republishes and devices, and is what the lab next door reads
let HULLS = readLocal(), durable = false;
setUserHulls(HULLS);
const saveHulls = () => { setUserHulls(HULLS); saveLibrary(HULLS).then(kept => { durable = kept; libNote(); }); };
const libNote = () => { const el = $('libNote'); if (el) el.textContent = durable ? `${HULLS.length} kept in the page's store — safe across devices and republishes` : `${HULLS.length} kept in this browser only`; };
loadLibrary().then(r => { durable = r.durable; if (r.durable) { HULLS = r.list; setUserHulls(HULLS); refreshHulls(); syncEditBar(); } libNote(); });

let img = null, decoImg = null, turretImg = null, style = STYLES.greeble1, sel = 'dart', last = null, lock = null;
// a style's sheets: the plating, and when it has them the decorations and the turrets
const loadBoth = async st => { const [a, b, c] = await Promise.all([loadStyle(st), st.deco ? Promise.all(st.deco.sheets.map(s => loadStyle({ sheet: s }).catch(() => null))) : null, st.turrets ? loadStyle({ sheet: st.turrets.sheet }).catch(() => null) : null]); img = a; decoImg = b; turretImg = c; };   // decoImg: every decoration sheet of the style, in order
// a raw outline (hull units) scaled so its area matches the volume, about its own centre — what hullOf does for a saved one
const scaleInfo = (poly, volume) => { const a0 = areaOf(poly) || 1, b = bboxOf(poly); return { s: Math.sqrt(Math.max(volume / HULL_VOLUME, 0.5) / a0), cx: (b.minx + b.maxx) / 2, cy: (b.miny + b.maxy) / 2 }; };
const vol = () => +$('vol').value;

// ---------------- the outline, on the canvas ----------------
// While the outline is being edited the ship is held still: the scale and centre are locked (refreshed between
// drags, never during one), so the point under the finger stays under the finger.
const ed = createShapeEditor($('out'), {
  frame() {
    const L = lock || currentLock(), cv = $('out');
    const toPx = ([gx, gy]) => [cv.width / 2 + (gx - GW / 2 - L.cx) * L.s * L.S, cv.height / 2 + (gy - GH / 2 - L.cy) * L.s * L.S];
    const fromPx = ([px, py]) => [(px - cv.width / 2) / (L.s * L.S) + L.cx + GW / 2, (py - cv.height / 2) / (L.s * L.S) + L.cy + GH / 2];
    return { toPx, fromPx };
  },
  changed(what) {
    if (what === 'start') { lock = currentLock(); $('editBar').hidden = false; $('editHint').hidden = true; syncEditBar(); }
    if (what === 'end') { lock = null; $('editBar').hidden = true; $('editHint').hidden = false; }
    if (what === 'dragstart') lock = lock || currentLock();
    if (what === 'edit' || what === 'dragend') lock = currentLock();
    if (what !== 'hover') repaint(); else repaint(true);
  },
});
function currentLock() {
  const f = ed.fullPoly(), p = f.length >= 3 ? f : hullOf(sel, vol()).poly, { s, cx, cy } = scaleInfo(p, vol());
  const cv = $('out'), b = bboxOf(p), W = cv.width || 960, H = cv.height || 540, margin = 0.16;
  const S = Math.min(W * (1 - 2 * margin) / ((b.maxx - b.minx) * s || 1), H * (1 - 2 * margin) / ((b.maxy - b.miny) * s || 1));
  return { s, cx, cy, S };
}
// what gets painted: the editor's outline at the volume (held to the lock while editing), or the chosen built-in
const poly = () => {
  const f = ed.fullPoly();
  if (f.length < 3 || !ed.valid()) return hullOf(sel, vol()).poly;
  const L = lock || scaleInfo(f, vol());
  return f.map(([x, y]) => [(x - L.cx) * L.s, (y - L.cy) * L.s]);
};
// the edit bar says WHICH silhouette is being edited (no name box: the name is asked for when a new one is saved)
const mineOf = id => HULLS.find(h => h.id === id) || null;
function syncEditBar() { const st = ed.state(), mine = mineOf(st.id); $('edWho').textContent = mine ? `Editing ${mine.name} (yours)` : `From ${(st.name || '').replace(/ II$/, '')} (built in) — Save makes a new one`; $('edSym').value = st.sym; $('edDelete').hidden = !mine; }

// ---------------- the library: the strip of thumbnails, the menu, the save dialog (hullui.js — the fleet generator shows the same) ----------------
const hdlg = createDialog(), hmenu = createMenu();
// the built-in shapes (the shipped pack among them, unless the library holds that very shape — then it is "yours"), then yours
const hullItems = () => { const ids = new Set(HULLS.map(h => h.id)); return [...Object.values(TEMPLATES).filter(t => (t.klass === 'starship' || t.klass === 'platform') && !ids.has(t.id)).map(h => ({ h, group: 'built' })), ...HULLS.map(h => ({ h, group: 'mine' }))]; };
function refreshHulls() {
  renderStrip($('hullStrip'), hullItems(), sel, {
    onPick: h => pickHull(h.id),
    onMenu: (x, y, h) => hmenu.open(x, y, [
      { label: 'Rename…', run: async () => { const name = await hdlg.rename(h); if (!name) return; h.name = name; if (ed.state().id === h.id) ed.state().name = name; saveHulls(); refreshHulls(); syncEditBar(); toast(`Renamed to “${name}”`); } },
      { label: 'Delete', run: () => deleteShape(h) },
    ]),
  });
}
// choosing a silhouette — also while editing: the editor takes the new outline at once
function pickHull(id) { sel = id; const h = mineOf(id) || hullDef(id); if (h) ed.load(h); lock = ed.editing ? currentLock() : null; syncEditBar(); refreshHulls(); repaint(); }
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').classList.remove('on'), 2200); }
// SAVE (hullui.js saveFlow): one of yours → overwrite it, or keep it as a new one, named; a built-in's child → a new one, named
function commitShape(id, name) {
  const h = ed.build(name); h.id = id || 'u' + Math.random().toString(36).slice(2, 9); h.name = name; h.klass = 'starship';   // id null = a NEW one, never the one it was started from; whatever that was (a platform, a dock), what is painted here is a ship — so the lab uses it
  const i = HULLS.findIndex(x => x.id === h.id); if (i >= 0) HULLS[i] = h; else HULLS.push(h);
  ed.state().id = h.id; ed.state().name = h.name; sel = h.id; saveHulls(); refreshHulls(); syncEditBar();
  toast(i >= 0 ? `Overwrote “${name}”` : `Saved “${name}” — it is in the game's library too`); return h;
}
async function saveShape() {
  if (!ed.valid()) { toast('Not a shape yet — it needs three points and some area.'); return; }
  const st = ed.state();
  await saveFlow(hdlg, { mine: mineOf(st.id), defaultName: st.name || 'My silhouette', taken: n => HULLS.some(x => x.name.toLowerCase() === n.toLowerCase() && x.id !== st.id), commit: commitShape });
}
// delete: asked in the page's own dialog (a published page swallows the browser's confirm box without a word)
async function deleteShape(h = mineOf(ed.state().id)) {
  if (!h || !(await hdlg.confirmDelete(h))) return;
  HULLS = HULLS.filter(x => x.id !== h.id); saveHulls(); toast(`Deleted “${h.name}”`); if (sel === h.id || ed.state().id === h.id) pickHull('dart'); else refreshHulls();
}

// ---------------- painting ----------------
// EVERYTHING FOLLOWS THE VOLUME, from the settings HE LOCKED (2026-10-07): the outer ribbon starts at 47 % of its
// range on the smallest hull and loses 3 % per 500 of volume; rings tile edge to edge, swelling to 67 % of the half
// width at the core, the spine ribbon at 61 %; inner rings are drawn 1.75× fatter than their band; engines ×1.32 of
// their natural size (30 % of the half width), one per ~280 of volume, banking up in rows; greebles ×1.6.
// Two MASTER sliders move families together: PLATING (outer ribbon, core, spine, fatness) and FITTINGS (engines,
// greebles); the fine offsets under the flap add on top. The greeble SEED reshuffles the scatter and nothing else.
const DEF = RECIPE;                                                          // the locked values live in paint.js (the battle dresses ships from the same ones)
// ---------------- the weapons aboard, and their turrets ----------------
// Four kinds count (orbital bombardment is never shown): each has a count and a size (the gun's volume ratio, as in
// the game — a ×4 gun is twice as wide). The hard points come from the game's own rule (hull.js); the painter puts
// a turret MOUNT from the style's set under each and the page draws the TURRET on top: the style's own turret art
// where it has some (styles.js TURRETS — the sprite's body scaled to the mount, turning on its pivot), else the
// battle view's icons (a dark drum rimmed in the weapon's colour, a pale barrel). Beams and guns swing to the
// pointer; a launcher sits fixed facing forward, as in the game; a hangar is a bay (no art yet).
const WEAPONS = [['E', 'weapon_energy', 'beams', '#5fe3d0'], ['K', 'weapon_kinetic', 'guns', '#ffb347'], ['M', 'weapon_missile', 'missiles', '#ff8a6b'], ['H', 'hangar', 'hangars', '#ffe08a']];
const COLOR = Object.fromEntries(WEAPONS.map(w => [w[1], w[3]])), TCELL = { weapon_energy: 0, weapon_kinetic: 1, weapon_missile: 2 };
const guns = () => WEAPONS.map(([k, kind]) => ({ kind, n: Math.max(0, Math.min(12, Math.round(+$('n' + k).value || 0))), size: +$('s' + k).value || 1 })).filter(g => g.n > 0);
let aim = null;                                                           // where the turrets look (canvas px), or null = straight ahead
function drawTurrets(g) {
  if (!last?.hardpoints?.length || !$('turrets').checked) return;
  for (const h of last.hardpoints) {
    const tr = Math.max(2.5, h.r * 0.36), col = COLOR[h.kind] || '#fff', x = h.x, y = h.y;
    const swings = h.kind === 'weapon_energy' || h.kind === 'weapon_kinetic', a = swings && aim ? Math.atan2(aim[1] - y, aim[0] - x) : 0;
    if (h.kind === 'hangar') { g.strokeStyle = col; g.lineWidth = Math.max(1.5, tr * 0.3); g.beginPath(); g.arc(x, y, tr * 1.3, 0, 7); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(x, y, tr * 0.5, 0, 7); g.fill(); continue; }
    const T = turretImg && style.turrets ? style.turrets.cells[TCELL[h.kind]] : null;
    if (T) {                                                              // the style's own turret: its body as wide as the mount, turning on its pivot, a shadow under it so it sits ON the plating
      const [sx, sy, sw, sh, px, py, body] = T, k = 2 * h.r * (last._turret || 1) / body;
      g.save(); g.translate(x, y); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = h.r * 0.5; g.shadowOffsetY = h.r * 0.18; g.rotate(a);
      g.drawImage(turretImg, sx, sy, sw, sh, -px * k, -py * k, sw * k, sh * k); g.restore(); continue;
    }
    if (h.kind === 'weapon_missile') {                                      // a launcher: a wedge pointing forward
      g.fillStyle = col; g.beginPath(); g.moveTo(x + tr * 1.9, y); g.lineTo(x + Math.cos(2.3) * tr * 1.4, y + Math.sin(2.3) * tr * 1.4); g.lineTo(x + Math.cos(-2.3) * tr * 1.4, y + Math.sin(-2.3) * tr * 1.4); g.closePath(); g.fill();
      g.strokeStyle = '#0b1120'; g.lineWidth = 1; g.stroke(); continue;
    }
    const kin = h.kind === 'weapon_kinetic', len = tr * (kin ? 3.4 : 2.8);
    g.strokeStyle = '#e8eef8'; g.lineWidth = Math.max(1.2, tr * (kin ? 0.7 : 0.45)); g.lineCap = 'round';     // the barrel first, so the drum sits on its root
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); g.lineCap = 'butt';
    g.fillStyle = '#1b2233'; g.beginPath();
    if (kin) { g.save(); g.translate(x, y); g.rotate(a); g.rect(-tr, -tr, 2 * tr, 2 * tr); g.restore(); } else g.arc(x, y, tr, 0, 7);
    g.fill(); g.strokeStyle = col; g.lineWidth = Math.max(1, tr * 0.18); g.stroke();                              // the drum, rimmed in the weapon's colour
  }
}
const RIB = RECIPE.ribRange;                                                  // the range the ribbon per cent runs over (squares)
function repaint(overlayOnly = false) {
  if (!img) return;
  const cv = $('out'); const W = cv.clientWidth || 960; if (cv.width !== W) { cv.width = W; cv.height = Math.round(W * 9 / 16); lock = ed.editing ? currentLock() : null; }
  if (!(overlayOnly && last && last._snap)) {
    const v = vol(), ribA = autoRibbonPct(v), ribO = +$('ribOff').value, engO = +$('engOff').value, coreO = +$('coreOff').value, spineO = +$('spineOff').value, fatO = +$('fatOff').value, grO = +$('greebleOff').value, mtO = +$('mountOff').value, ttO = +$('turretOff').value;
    const mP = +$('mPlating').value, mF = +$('mFittings').value, kP = 1 + mP / 100, kF = 1 + mF / 100, seed = +$('seed').value;
    const ribbon = pct((ribA + ribO) * kP, RIB), centre = Math.max(0.1, (DEF.centre + coreO / 100) * kP), spineW = Math.max(0.1, (DEF.spine + spineO / 100) * kP), innerFat = Math.max(1, (DEF.fat + fatO / 100) * kP);
    const engineSize = Math.max(0.3, (DEF.engine + engO / 50) * kF), greebleSize = Math.max(0.3, (DEF.greeble + grO / 50) * kF), mountSize = Math.max(0.3, (DEF.mount + mtO / 50) * kF);
    const t0 = performance.now(), L = lock, G = guns();
    const wash = +$('wash').value / 100, lights = +$('lights').value / 100;
    last = paintHull(cv, poly(), img, style, { ribbon, centre, spineW, innerFat, engineSize, engineN: autoEngines(v), greebleSize, seed, wash, washA: $('washA').value, washB: $('washB').value, lights, lightColor: $('lightColor').value, guns: G, mountSize, glow: $('glow').checked, greebles: $('greebles').checked, innerOnTop: $('inner').checked, spine: $('spine').checked, engines: $('engines').checked, outline: $('outline').checked, base: $('base').value, baseColor: $('voids').checked ? '#ff00ff' : undefined, ...(L ? { px: L.S, center: [0, 0] } : {}) }, decoImg);
    last._snap = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);   // the painted ship, kept so a hover only redraws the overlay
    last._turret = Math.max(0.3, (DEF.turret + ttO / 50) * kF);                   // the turret art's body, × the mount
    const sgn = n => (n > 0 ? '+' : '') + n;
    const loadout = G.map(g => `${WEAPONS.find(w => w[1] === g.kind)[2]} ${g.n}×${g.size}`).join(', ') || 'none';
    $('turretV').textContent = `×${DEF.turret} ${sgn(ttO)} → ×${last._turret.toFixed(2)} of the mount${style.turrets ? '' : ' — this style has no turret art yet: icons'}`;
    $('mPlatingV').textContent = `${sgn(mP)} % → ribbon ${ribbon.toFixed(2)} sq · core ${Math.round(centre * 100)} % · spine ${Math.round(spineW * 100)} % · inner ×${innerFat.toFixed(2)}`;
    $('mFittingsV').textContent = `${sgn(mF)} % → engines ×${engineSize.toFixed(2)} (${last.engineSq} sq) · greebles ×${greebleSize.toFixed(2)} · mounts ×${mountSize.toFixed(2)}`;
    $('mountV').textContent = `×${DEF.mount} ${sgn(mtO)} → ×${mountSize.toFixed(2)} = ${last.mountSq} sq for a ×1 gun · ${last.hardpoints.length} hard point${last.hardpoints.length === 1 ? '' : 's'}${style.deco ? '' : ' — this style has no mounts yet'}`;
    $('gunsV').textContent = `${last.hardpoints.length} hard point${last.hardpoints.length === 1 ? '' : 's'}: ${loadout}`;
    $('seedV').textContent = String(seed); if (+$('seedN').value !== seed) $('seedN').value = seed;
    $('ribV').textContent = `auto ${Math.round(ribA)} % ${sgn(ribO)} → ${Math.round((ribA + ribO) * kP)} % = ${ribbon.toFixed(2)} sq`;
    $('engV').textContent = `×${DEF.engine} ${sgn(engO)} → ×${engineSize.toFixed(2)} = ${last.engineSq} sq · ${autoEngines(v)} wanted, ${last.engines} placed in ${last.engineRows} row${last.engineRows === 1 ? '' : 's'}`;
    $('coreV').textContent = `${Math.round(DEF.centre * 100)} % ${sgn(coreO)} → ${Math.round(centre * 100)} % of the half width = ${last.core} sq`;
    $('spineV').textContent = `${Math.round(DEF.spine * 100)} % ${sgn(spineO)} → ${Math.round(spineW * 100)} % of the half width = ${last.spine} sq`;
    $('fatV').textContent = `×${DEF.fat} ${sgn(fatO)} % → ×${innerFat.toFixed(2)} (outer ring and spine untouched)`;
    $('greebleV').textContent = `×${DEF.greeble} ${sgn(grO)} → ×${greebleSize.toFixed(2)} · ${last.greebles} placed${style.deco ? '' : ' — this style has no decorations yet'}`;
    $('info').textContent = `${last.rings} ring${last.rings === 1 ? '' : 's'} (${last.widths.join(' · ')} sq, core ${last.core}, spine ${last.spine}) · ${last.engines} engine${last.engines === 1 ? '' : 's'} · ${last.greebles} greebles · ${last.hardpoints.length} hard points (${loadout}) · hull ${last.squares} squares · ${last.px.toFixed(1)} px a square · ${Math.round(performance.now() - t0)} ms · settings to report: plating ${sgn(mP)}, fittings ${sgn(mF)}, seed ${seed}, wash ${Math.round(wash * 100)} ${$('washA').value}→${$('washB').value}, lights ${Math.round(lights * 100)} ${$('lightColor').value} · fine: ribbon ${sgn(ribO)}, engines ${sgn(engO)}, core ${sgn(coreO)}, spine ${sgn(spineO)}, fat ${sgn(fatO)}, greebles ${sgn(grO)}, mounts ${sgn(mtO)}, turrets ${sgn(ttO)}`;
    $('volv').textContent = $('vol').value;
  } else cv.getContext('2d').putImageData(last._snap, 0, 0);
  if (!ed.editing) drawTurrets(cv.getContext('2d'));
  ed.draw(cv.getContext('2d'));
}

// ---------------- wiring ----------------
$('style').innerHTML = Object.values(STYLES).filter(s => s.ribbon).map(s => `<option value="${s.id}">${esc(s.name)}${s.deco ? '' : ' · no greebles yet'}</option>`).join('');
$('style').onchange = async e => { style = STYLES[e.target.value]; await loadBoth(style); repaint(); };
for (const id of ['vol', 'mPlating', 'mFittings', 'seed', 'wash', 'lights', 'washA', 'washB', 'lightColor', 'ribOff', 'engOff', 'coreOff', 'spineOff', 'fatOff', 'greebleOff', 'mountOff', 'turretOff']) $(id).oninput = () => { if (id === 'vol' && ed.editing && !ed.dragging) lock = currentLock(); repaint(); };
$('seedN').onchange = e => { $('seed').value = Math.max(0, Math.min(999, Math.round(+e.target.value || 0))); repaint(); };
$('seedNext').onclick = () => { $('seed').value = (+$('seed').value + 1) % 1000; repaint(); };
for (const id of ['glow', 'greebles', 'inner', 'spine', 'engines', 'outline', 'base', 'voids', ...WEAPONS.flatMap(([k]) => ['n' + k, 's' + k])]) $(id).onchange = () => repaint();
$('turrets').onchange = () => repaint(true);
$('resetOff').onclick = () => { for (const id of ['mPlating', 'mFittings', 'ribOff', 'engOff', 'coreOff', 'spineOff', 'fatOff', 'greebleOff', 'mountOff', 'turretOff']) $(id).value = 0; repaint(); };
// the turrets follow the pointer over the ship (a finger too); off the canvas they face forward again
$('out').addEventListener('pointermove', e => { if (ed.editing || !last?.hardpoints?.length) return; const cv = $('out'), r = cv.getBoundingClientRect(); aim = [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; repaint(true); });
$('out').addEventListener('pointerleave', () => { if (aim) { aim = null; repaint(true); } });
$('png').onclick = () => { const was = ed.editing; if (was) ed.editing = false; aim = null; repaint(true); $('out').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `hull-${(ed.state().name || sel).replace(/\W+/g, '-')}-${vol()}.png`; a.click(); if (was) ed.editing = true; }); };
for (const [id, v] of [['s400', 250], ['s1000', 600], ['s3000', 1700], ['s6000', 3300]]) $(id).onclick = () => { $('vol').value = v; if (ed.editing) lock = currentLock(); repaint(); };
$('edDone').onclick = () => { ed.editing = false; };
$('edEdit').onclick = () => { ed.editing = true; };
$('edUndo').onclick = () => ed.undo();
$('edClear').onclick = () => ed.clear();
$('edSym').onchange = e => ed.setSym(e.target.value);
$('edSave').onclick = saveShape;
$('edDelete').onclick = () => deleteShape();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ed.editing) ed.editing = false; });
window.addEventListener('resize', () => repaint());
// ---------------- to the battle lab, with the library ----------------
// The lab lives NEXT TO this page (lab.html, same origin), so it reads the very same library. The library still goes
// along in the link as a code (harmless here, and it is what a lab somewhere else would need), and ⧉ copies the code
// to paste into any lab's Silhouettes box.
const LAB_URL = 'lab.html';
const libraryCode = () => codeOf(HULLS);
$('toLab').onclick = () => { location.href = LAB_URL + (HULLS.length ? '#hulls=' + libraryCode() : ''); };   // the same tab: a published page may not open new ones
$('libCode').onclick = async () => {
  if (!HULLS.length) { toast('No silhouettes saved yet — draw one and Save it first'); return; }
  const code = libraryCode();
  try { await navigator.clipboard.writeText(code); toast(`Library code copied (${HULLS.length} silhouette${HULLS.length === 1 ? '' : 's'}) — paste it into the lab's Silhouettes box`); }
  catch (e) { hdlg.code(code); }                                                     // no clipboard here: the code shown to copy by hand
};
refreshHulls();
loadBoth(style).then(() => { pickHull(sel); }).catch(e => { $('info').textContent = e.message; });
window.__forgeBooted = true;
