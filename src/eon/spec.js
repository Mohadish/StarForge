// A DESIGN'S FULL SPEC as HTML (his ask, 2026-10-16/17: "a pop-up with its full spec, exactly what it is"): the same figures the
// Design tab's summary shows — build, hull, power, firepower, travel, civilian — and the modules as fitted. The game (app.js)
// and the battle lab (lab.js, inside the arena) both use it, so one ship reads the same everywhere. Takes a designStats()
// result; what only the game knows (the reach between stars, the people a habitat carries) comes in through `opts`. No DOM.
import { fmt, esc } from '../util.js';
import { PRESETS, CLASS_NAME, KINDS } from './modules.js';
import { vsLayers, CHIPS, CIVIL, CHIPC } from './chipeditor.js';
import { chipsOfDesign } from './shipcode.js';
// a design AS DESIGNED (his ask, 2026-10-20: "I want to see the chips, the way it looked at the design table, compressed"): its chip
// piles as the table shows them — then the ship's own systems (reactor, star drive, weapons computer), grey, as the table's auto chips.
// Shared by the game's ship pop-up and the arena's right-click card (2026-10-21).
export function chipStripHtml(d) {
  const chips = d.chips && d.chips.length ? d.chips.filter(c => !c.off) : chipsOfDesign(d, 1);
  const nameOf = c => c.kind === 'fast' ? 'Thrusters' : ([...CHIPS.weapon, ...CHIPS.trait, ...CIVIL.trait].find(x => x[0] === c.kind) || [])[1] || c.kind;
  const roleOf = r => (PRESETS[r] && PRESETS[r].name) || r;
  const piles = chips.map(c => `<span class="stack mini" style="--c:${CHIPC[c.kind] || '#ffd26a'}"><b>${esc(nameOf(c))}</b>${c.h > 1 ? `<i class="hh">×${c.h}</i>` : ''}${c.role ? `<small>${esc(roleOf(c.role))}</small>` : ''}${c.caps && c.caps.length ? `<span class="tuned" title="breakthrough capsules on it">✦${c.caps.length}</span>` : ''}</span>`);
  const autos = (d.modules || []).filter(m => ['reactor', 'stardrive', 'weapon_system'].includes(m.kind)).map(m => `<span class="stack mini auto" style="--c:#9eb3d8" title="sized by the design table to what the chips need"><b>${esc(KINDS[m.kind].name)}</b>${m.k != null && m.k !== 1 ? `<small>size ${m.k}</small>` : ''}${(m.n || 1) > 1 ? `<i class="hh">×${m.n}</i>` : ''}</span>`);
  return `<div class="cstrip">${piles.join('')}${autos.join('')}${!piles.length && !autos.length ? '<span class="tiny">nothing fitted</span>' : ''}</div>`;
}

export const ICON = { cost: '⚒', volume: '⬢', hp: '✚', shield: '⛨', cover: '◍', power: '⚡', runs: '▲', speed: '➶', evasion: '↯', drive: '✦', stars: '✧', dock: '▭', house: '⌂', research: '⚗', industry: '⛭', social: '☺', upkeep: '⟳', gantry: '▦', fire: '◎', reach: '⟶', damage: '✸' };
const pct = v => Math.round(v * 100) + '%', num = (v, dec) => dec ? v.toFixed(dec) : fmt(v), plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const peopleWordDefault = v => v >= 1 ? `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 0 : 1)} M` : v > 0 ? `${Math.max(1, Math.round(v * 1000))} k` : '0';
export const specBox = (icon, label, val, bad) => `<div class="${bad ? 'bad' : ''}"><i>${icon}</i><span>${label}</span><b>${val}</b></div>`;
export const specSec = (title, boxes) => boxes ? `<div class="sec"><h3>${title}</h3><div class="sum">${boxes}</div></div>` : '';
// the modules as fitted, one line: kind × n, its role, its dial, the capsules on it
export const modulesLine = ds => ds.mods.map(m => `${esc(m.K.name)}${m.n > 1 ? ' ×' + m.n : ''}${m.mod.preset ? ' · ' + esc((PRESETS[m.mod.preset] && PRESETS[m.mod.preset].name) || m.mod.preset) : ''}${m.mod.k != null && m.mod.k !== 1 ? ' · size ' + m.mod.k : ''}${(m.mod.caps || []).length ? ' · ' + plural(m.mod.caps.length, 'capsule') : ''}`).join(' · ') || 'no modules';
// opts: reach (a string for the "Between stars" box, the game's), shipHousing (a ship's habitat share of a world's), peopleWord
export function designSpecHtml(ds, opts = {}) {
  const t = ds.t, isShip = t.klass !== 'structure', box = specBox, sec = specSec, people = opts.peopleWord || peopleWordDefault, shipHousing = opts.shipHousing ?? 1 / 1000;
  let build = box(ICON.cost, 'Cost to build', fmt(t.cost)) + box(ICON.volume, 'Volume', `${fmt(t.volume)} · ${plural(t.squares, 'square')}`);
  if (t.upkeep) build += box(ICON.upkeep, 'Upkeep', '−' + fmt(t.upkeep) + ' industry/eon');
  let hull = box(ICON.hp, 'Hull', `${fmt(t.hp)} HP`);
  if (t.armor) hull += box('▣', 'Armour', `${fmt(t.armor)} HP · shrugs ${t.deflect.toFixed(1)}/hit`);
  if (t.hullRepair) hull += box(ICON.upkeep, 'Repairs in battle', `${t.hullRepair.toFixed(1)} hull/s`);
  if (t.shieldRaw) hull += box(ICON.shield, 'Shield', `${fmt(t.shield)} · +${fmt(t.shieldRec)}/s`) + box(ICON.cover, 'Shield covers', pct(t.cover) + ' of the hull', t.cover < 0.999);
  let power = box(ICON.power, 'Power', `${fmt(t.powerOut)} made / ${fmt(t.powerUse)} used`, t.powerFactor < 1);
  if (t.powerFactor < 1) power += box(ICON.runs, 'Runs at', pct(t.powerFactor), true);
  if (t.mounts || t.mountsUsed) power += box(ICON.fire, 'Weapons computer', `${num(t.mountsUsed, 1)} of ${num(t.mounts, 1)} mounts${t.fireFactor < 1 ? ` · guns fire at ${pct(t.fireFactor)}` : ''}`, t.fireFactor < 1);
  let fire = '';
  if (t.weapons || t.drones || t.missiles) {
    const L = { shield: 0, through: 0, armor: 0, hull: 0 };
    for (const x of ds.mods) if (x.K.mount && !x.K.hangar && !x.K.orbital) { const v = x.v, aim = Math.min(98, v.accuracy + t.bonus), l = vsLayers(v.damage * t.powerFactor * t.fireFactor, v.rate * aim / 100 * x.n, x.mod.preset, x.kind); for (const q in L) L[q] += l[q]; }
    fire = box(ICON.damage, 'Damage', `${fmt(t.dps)} dmg/s`) + box(ICON.shield, 'Against a shield', `${fmt(L.shield)}${L.through > 0.05 ? ` (+${fmt(L.through)} through it)` : ''}`) + box('▣', 'Against armour', fmt(L.armor)) + box(ICON.hp, 'Against the hull', fmt(L.hull))
      + (t.missiles ? box(ICON.speed, 'Missiles', t.missiles) : '') + (t.drones ? box(ICON.gantry, 'Drones', `${t.drones}, ${t.airCap} in the air at once`, !t.airCap) : '');
  }
  let travel = '';
  if (isShip) travel += box(ICON.speed, 'Battle speed', fmt(t.speed) + ' u/s') + box(ICON.speed, 'Turns', `${Math.round(t.turn)}°/s`) + box(ICON.evasion, 'Evasion', Math.round(t.evasion) + '%');
  if (t.klass === 'starship') travel += box(ICON.drive, 'Star drive', `moves ${fmt(t.lift)} of ${fmt(t.volume)} volume ${t.underDriven ? '✗' : '✓'}`, t.underDriven) + (opts.reach ? box(ICON.stars, 'Between stars', opts.reach, !!opts.reachBad) : '');
  let civ = '';
  if (t.housing) civ += box(ICON.house, isShip ? 'Carries' : 'Houses', people(t.housing * (isShip ? shipHousing : 1)) + ' people');
  if (t.research) civ += box(ICON.research, isShip ? 'Lab (studies where parked)' : 'Research', '+' + fmt(t.research));
  if (t.industry) civ += box(ICON.industry, 'Industry', '+' + fmt(t.industry) + '/eon');
  if (t.social) civ += box(ICON.social, 'Social', '+' + fmt(t.social) + '/eon');
  if (t.dock) civ += box(ICON.gantry, 'Gantry', t.gantries.map(s => `${s.w} × ${s.h}`).join(', '));
  return sec('Build', build) + sec('Hull', hull) + sec('Power', power) + sec('Firepower', fire) + sec('Travel', travel) + sec('Civilian', civ);
}
export const classWord = klass => CLASS_NAME[klass] || klass;
