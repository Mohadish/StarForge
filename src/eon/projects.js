// THE RESEARCH TAB (his design, 2026-10-23 — research.js holds the rules): on the left the nine fields, each with the research flowing
// through it (the planets' research icons, no numbers to set) and where it comes from; in the middle the BOARD — every project under
// way is a node, fed by a channel from each field of its recipe (as wide as the research it pulls, dim where the field has little
// to give); "＋ New research project" in its corner opens the picker: what the ADVISORS suggest, or your own pick by category. A
// project's INFLUENCE (the share of the empire's research it takes) is set on its node; what no project takes flows by itself.
// The breakthroughs found stay in the background (their capsules still work); a new one shows up as an advisor's suggestion.
import { FAMILIES, CATEGORIES, FIELD_COL, advisors, qualityOf, needOf, nameOf, generationOf, startProject, setInfluence, dropProject, benefitsOf, textOf, CHANNEL_ICON, giftOf, expectOf, sameAs, techTree, roman } from './research.js';
import { techArt, reseed, techColor, FAM_ICON } from './techart.js';
import { weaponSvg, isWeaponLook } from './weaponart.js';
import { traitWords, sWord, chanceWord, rareWords } from './traits.js';
import { explored } from './model.js';
import { icon, ICON_COLOR, componentIcon } from './techicons.js';
import { KINDS } from './modules.js';   // placeholder icons (his call 2026-10-23: the icon generator comes later)

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const $ = id => document.getElementById(id);
let ctx = null, hooks = { save: () => {}, refresh: () => {} }, pick = null, hiFam = null;   // pick: the picker's state { goal, fam } or null (closed)
// THE TREE's view (his ask, 2026-10-31): how far it is zoomed (the wheel), and the card opened in full (a click, at any scale) —
// { tech: 'fam:gen' } or { node: i }. Under MINI the cards are the simple ones: the picture, the name, the capsules, the icon
let zoom = 1, popup = null;
const ZOOM = { min: 0.35, max: 1.6, mini: 0.8 };
export function initResearch(h) { hooks = { ...hooks, ...h }; }
const pct = v => Math.round(v * 100) + ' %';
const eonWord = e => !isFinite(e) ? 'never' : `${e} eon${e === 1 ? '' : 's'}`;
const icons = v => { const n = Math.min(24, Math.round(v / 2)); return n ? Array.from({ length: n }, (_, i) => i % 2 ? '🧪' : '🔬').join('') : v > 0.05 ? '<span style="opacity:.5">🔬</span>' : ''; };
const richWord = p => p >= 0.5 ? '<b style="color:#7ef3b0">rich</b>' : p >= 0.25 ? '<b style="color:#ffd26a">fair</b>' : '<b style="color:#ff7979">poor</b>';
const qClass = q => q >= 1 ? 'down' : q < 0.8 ? 'up' : '';
// THE PARAGRAPH (his ask 2026-10-23): the technology in words, every number in it carried by its icon — read it, or just look at the
// icons. ben: [{ icon, pct }] in the family's order; boosts: the names of the finds it is built on
const token = (ic, pct, ic2 = null) => `<span class="bnf" style="--bc:${ICON_COLOR[ic2 || ic] || '#ccc'}">${icon(ic, { size: 15 })}${ic2 ? icon(ic2, { size: 15 }) : ''}<b>+${pct} %</b></span>`;   // ic2: where it counts (❄ cold worlds…)
export function paragraph(fam, gen, ben, boosts = [], gift = []) {   // gift: the focus's (research.js giftOf) — what comes with it
  const html = esc(textOf(fam, gen)).replace(/\{(\d)\}/g, (m, i) => ben[+i] ? token(ben[+i].icon, ben[+i].pct, ben[+i].icon2) : '');
  return `<p class="pjdesc">${html}${boosts.length ? ` <span class="pjfind">✦ Built on ${boosts.map(esc).join(', ')}.</span>` : ''}${gift.length ? ` <span class="pjgift">Your focus adds: ${gift.map(g => `${token(g.icon, g.pct)} ${esc(g.word)}`).join(' · ')}.</span>` : ''}</p>`;
}
// the designer's chip for each kind of component ([its name, true when it is a system the design sizes itself])
const CHIP_WORD = { weapon_energy: ['Beam'], weapon_kinetic: ['Gun'], weapon_missile: ['Missile'], hangar: ['Drones'], armor: ['Armoured'], shield: ['Shielded'], thruster: ['Thrusters'], reactor: ['Reactor', true], stardrive: ['Star drive', true], weapon_system: ['Weapons computer', true] };
// a finished project in the eon's report: its name and its paragraph with the numbers it came out with
// the benefits a finished project came out with, as the paragraph's icons and numbers
const benOf = (F, pcts) => F.adapt ? [{ icon: 'food', icon2: CHANNEL_ICON[F.adapt], pct: pcts[0] }] : F.level ? [{ icon: CHANNEL_ICON[F.level], pct: pcts[0] }] : Object.keys(F.channels).map((ch, i) => ({ icon: CHANNEL_ICON[ch], pct: pcts[i] }));
export function researchDoneHtml(r) {
  const F = FAMILIES[r.fam]; if (!F) return esc(r.name || '');
  const ben = benOf(F, r.pcts);
  // a ship family makes a COMPONENT (2026-10-24): where to find it — the designer's chip — and that the built ships keep theirs
  const where = `in Design, ${CHIP_WORD[F.module] && CHIP_WORD[F.module][1] ? `click the <b>${CHIP_WORD[F.module][0]}</b> chip in the ship's tray` : `tap the <b>${(CHIP_WORD[F.module] || [F.name])[0]}</b> chip`} and pick it. New ships only: the ones already built keep theirs.`;
  // THE REVEAL (his ask, 2026-10-24): a component is its own thing — its name, its physical form, its character
  if (F.module && r.traits) {
    const art = r.look && isWeaponLook(r.look) ? weaponSvg(r.look, { w: 150, h: 80 }) : componentIcon({ id: r.model, kind: F.module, gen: r.gen }, { color: (KINDS[F.module] || {}).color, size: 44 });
    const rw = r.rare ? rareWords(r.fam, r.rare) : null, rare = rw ? `<div class="pjrare">★ Something extraordinary — <b style="color:${rw.col}">${esc(rw.adj)}</b>: it ${esc(rw.good)}</div>` : '';
    return `<b>Research done: ${F.icon} ${esc(r.name)}</b> <span class="tiny">— a new ${esc(F.name.toLowerCase())} of its own</span><div class="pjreveal">${art}<div class="pjexpect">${rare}${traitLines(r.fam, r.traits)}</div></div>${r.gift && r.gift.length ? `<div class="pjgift">Your focus adds: ${r.gift.map(g => `${token(g.icon, g.pct)} ${esc(g.word)}`).join(' · ')}.</div>` : ''}<div class="pjfind">To fit it: ${where}</div>`;
  }
  const comp = F.module && r.model ? `<div class="pjfind">${componentIcon({ id: r.model, kind: F.module, gen: r.gen }, { color: (KINDS[F.module] || {}).color, size: 20 })} A new ${esc(F.name.toLowerCase())} to fit: <b>${esc(r.name)}</b> — ${where}</div>` : '';
  return `<b>Research done: ${F.icon} ${esc(r.name)}</b>${paragraph(r.fam, r.gen, ben, r.boosts || [], r.gift || [])}${comp}`;
}

// the forecast of something extraordinary (traits.js RARE): how likely — never what it will be
const rareHint = ex => { const w = ex && chanceWord(ex.rare); return w ? `<div class="pjrare">★ ${w[0].toUpperCase() + w.slice(1)} of something extraordinary — its fields are strong</div>` : ''; };
// a component's traits in words: what it is good at (green), its price (red), how strong
function traitLines(fam, traits, expect = false) {
  return traits.map(t => { const w = traitWords(fam, t); if (!w) return ''; return `<div><b style="color:${w.col || '#ffd26a'}">${esc(w.adj)}</b>${t.main ? '' : ' <span class="tiny">(a touch of it)</span>'} — <span class="tg">${esc(w.good)}</span>, <span class="tb">but ${esc(w.bad)}</span> <span class="tiny">· ${expect ? 'likely ' : ''}${sWord(t.s)}</span></div>`; }).join('');
}
// how good it would come out, in a word
const GRADE = q => q >= 1.2 ? ['excellent', '#7ef3b0'] : q >= 0.95 ? ['good', '#b6f08a'] : q >= 0.75 ? ['fair', '#ffd26a'] : ['poor', '#ff7979'];
const gradeHtml = q => { const [w, c] = GRADE(q); return `<span class="pjgrade" style="color:${c}" title="quality ${pct(q)}">${w}</span>`; };
// THE GOALS (his call, 2026-10-24: "you just say I want a new weapon — and the advisors tell you the best avenue, because you have a lot of
// good research on these topics"): what you want, then the ways to it ranked by your research, the advisors' pick first
const GOALS = [
  { id: 'weapon', name: 'A new weapon', fams: ['beam', 'gun', 'missile', 'drones'] },
  { id: 'defence', name: 'Protection & repair', fams: ['shield', 'armor', 'fab'] },
  { id: 'motion', name: 'Engines & power', fams: ['drive', 'thruster', 'reactor'] },
  { id: 'info', name: 'Computers & sensors', fams: ['computer', 'sensors'] },
  { id: 'civil', name: 'For the colonies', fams: ['farms', 'farms_cold', 'farms_hot', 'farms_rad', 'homes', 'works', 'labs'] },
];
const fieldName = (c, id) => (c.fields.find(f => f.id === id) || {}).name || id;
// WHERE TO LOOK for a field (the quest): the richest place you know of in it — a lab there (a lab ship, a colony) makes it count
function whereFor(S, c, f) {
  const studied = new Set((c.studied || []).filter(s => s.power > 0).map(s => s.pl.id));
  const best = S.places.filter(p => p.mult && explored(S, p.sys)).map(p => ({ p, v: (p.mult[f] || 0) * ((p.fresh || {})[f] ?? 1) })).filter(x => x.v > 0.2).sort((a, b) => b.v - a.v)[0];
  if (!best) return `no place you know of is rich in ${esc(fieldName(c, f).toLowerCase())} — explore further`;
  const sys = S.systems.find(s => s.id === best.p.sys);
  return `<b>${esc(best.p.name)}</b>${sys && sys.name !== best.p.name ? ` (${esc(sys.name)})` : ''} is rich in ${esc(fieldName(c, f).toLowerCase())}${studied.has(best.p.id) ? ' — you study it already' : ' — put a lab there (a lab ship, or a colony)'}`;
}
// why it would come out as it would: the strongest field of its recipe and where it comes from; the weakest and where to find more
function whyHtml(S, c, fam) {
  const { ch } = qualityOf(S, c.fields, fam), by = ch.slice().sort((a, b) => b.w * b.strength - a.w * a.strength), best = by[0], weak = ch.filter(x => x.w >= 0.2).sort((a, b) => a.strength - b.strength)[0];
  const from = f => ((c.fields.find(x => x.id === f) || {}).from || []).slice(0, 2).map(s => esc(s.label)).join(', ');
  let h = `<div class="pjwhere">Strong in <b>${esc(fieldName(c, best.id).toLowerCase())}</b> (${richWord(best.potential)}${from(best.id) ? `, from ${from(best.id)}` : ''})</div>`;
  if (weak && weak.id !== best.id && weak.strength < 1) h += `<div class="pjwhere">Short on <b>${esc(fieldName(c, weak.id).toLowerCase())}</b>: ${whereFor(S, c, weak.id)}</div>`;
  return h;
}
// one more of what you have: the same research makes the same thing — the other fields of its recipe would make something else
function dupHtml(S, c, fam, traits) {
  const m = sameAs(S, fam, traits); if (!m) return '';
  const others = Object.keys(FAMILIES[fam].recipe).filter(f => !traits.some(t => t.field === f)).map(f => `<b>${esc(fieldName(c, f).toLowerCase())}</b>`);
  return `<div class="pjwhere" style="color:#ffb347">Much like your <b>${esc(m.name)}</b> — the same research makes the same thing.${others.length ? ` For something different, study ${others.join(' or ')}.` : ''}</div>`;
}

// THE FIELDS: the research flowing through each, where it comes from, what there is to find
function fieldsHtml(c) {
  const free = Math.round((1 - (c.diverted || 0)) * 100);
  return `<div class="tiny" style="margin-bottom:8px">The research flows by itself to what your labs look at — each planet's own sky and character, each lab ship where it is parked — and through the projects you start. ${free > 0 ? `<b>${free} %</b> of it flows freely (that is where the chance finds come from).` : 'All of it goes into projects.'} One icon ≈ 2 research an eon.</div>`
    + c.fields.map(f => {
      const from = (f.from || []).slice(0, 2).map(s => esc(s.label)).join(' · '), pulled = (c.projects || []).filter(p => p.F.recipe[f.id]);
      return `<div class="frow" data-field="${f.id}" style="--rc:${FIELD_COL[f.id]}"><div class="top"><span class="name"><i class="fdot" style="background:${FIELD_COL[f.id]}"></i>${esc(f.name)}</span><span class="tiny">${f.flow.toFixed(1)} an eon</span></div>
        <div class="ficons">${icons(f.flow) || '<span class="tiny">nothing flows here</span>'}</div>
        <div class="tiny">${from ? 'from ' + from : 'no lab looks this way'}${pulled.length ? ` · pulled by ${pulled.map(p => esc(p.name)).join(', ')}` : ''}</div>
        <div class="tiny">to find where you look: ${richWord(f.potential)}${c.fields && f.found ? '' : ''}</div></div>`;
    }).join('');
}
// THE CARDS OF THE TREE (his ask, 2026-10-31): a technology's colour is its tier's (techart.js techColor — past violet, black: a white
// rim); its picture the 3D device; the small icon in the corner names what it is
const tcol = (gen, q) => techColor(gen, q) || '#f2f4fa';
const coin = fam => `<span class="tcoin" title="${esc(FAMILIES[fam].name)}">${icon(FAM_ICON[fam] || 'power', { size: 15 })}</span>`;
const tierWord = gen => `tier ${roman(gen)}`;
const modelOf = (S, t) => t.model ? (S.models || []).find(m => m.id === t.model) || null : null;
// the CAPSULES: what it gives — a component its character (its traits' words, ★ the extraordinary first), the rest their numbers
function capsHtml(S, fam, t, expect = null) {
  const F = FAMILIES[fam];
  if (F.module) {
    const m = expect ? null : modelOf(S, t), traits = expect ? expect.traits : m ? m.traits || [] : [], rw = m && m.rare ? rareWords(fam, m.rare) : null;
    const caps = traits.map(tr => { const w = traitWords(fam, tr); return w ? `<span class="tcap" style="--bc:${w.col || '#ffd26a'}" title="${esc(w.good)} — but ${esc(w.bad)}">${expect ? '~' : ''}${esc(w.adj)}</span>` : ''; }).join('');
    return (rw ? `<span class="tcap rare" style="--bc:${rw.col}" title="${esc(rw.good)}">★ ${esc(rw.adj)}</span>` : '') + caps;
  }
  const ben = t.pcts ? benOf(F, t.pcts) : benefitsOf(S, null, fam, t.q ?? 1);
  return ben.map(b => token(b.icon, b.pct, b.icon2)).join('');
}
// a finished technology in the tree: the simple card (mini), the card, or the whole of it (the opened card)
function techCard(S, t, mini, full = false) {
  const F = FAMILIES[t.fam], m = modelOf(S, t), key = t.fam + ':' + t.gen, look = m && m.look ? m.look : null;
  const head = `${coin(t.fam)}<div class="ttop">${techArt(S, { fam: t.fam, gen: t.gen, q: t.q ?? 1, look, w: full ? 170 : mini ? 64 : 104 })}<div><div class="tname">${esc(t.name)}</div><div class="tiny">${mini ? tierWord(t.gen) : `${esc(F.name)} · ${tierWord(t.gen)}${t.eon != null ? ` · eon ${t.eon}` : ''}`}</div></div></div>`;
  const caps = `<div class="tcaps">${capsHtml(S, t.fam, t)}</div>`;
  if (mini) return `<div class="tcard done mini" data-tech="${key}" style="--tc:${tcol(t.gen, t.q)}">${head}${caps}</div>`;
  const rw = m && m.rare ? rareWords(t.fam, m.rare) : null;
  const body = F.module ? `${rw ? `<div class="pjrare">★ Something extraordinary — <b style="color:${rw.col}">${esc(rw.adj)}</b>: it ${esc(rw.good)}</div>` : ''}<div class="pjexpect">${m ? traitLines(t.fam, m.traits || []) : ''}</div>`
    : paragraph(t.fam, t.gen, t.pcts ? benOf(F, t.pcts) : benefitsOf(S, null, t.fam, t.q ?? 1));
  const more = full ? `<div class="tiny">${t.q != null ? `came out ${gradeHtml(t.q)} · ` : ''}${F.module ? `fitted on new designs — in Design, the <b>${esc((CHIP_WORD[F.module] || [F.name])[0])}</b> chip` : F.level || F.adapt ? 'in every colony' : `built into every ${esc(F.name.toLowerCase())}`}</div><div class="tiny muted">Right-click the picture: another shape of it.</div>` : '';
  return `<div class="tcard done${full ? ' full' : ''}" ${full ? 'data-techp' : 'data-tech'}="${key}" style="--tc:${tcol(t.gen, t.q)}">${head}${caps}${body}${more}</div>`;
}
// THE NODES: one per project under way — what it is, how far, how long, how good, its influence (pop: the opened copy)
function nodeHtml(pl, S, c, pop = false) {
  const ex = pl.F.module ? expectOf(S, c.fields, pl.fam, pl.p) : null;   // a component: what we expect of it — its form is found when it is done
  return `<div class="pjnode tcard going${pop ? ' full' : ''}" ${pop ? 'data-pjnodep' : 'data-pjnode'}="${pl.i}" style="--tc:${tcol(pl.gen, pl.q)}">${coin(pl.fam)}
    <div class="pjhead">${techArt(S, { fam: pl.fam, gen: pl.gen, q: pl.q, w: pop ? 150 : 96 })}<div><b class="tname">${esc(pl.name)}</b><div class="tiny">${esc(pl.F.name)} · ${tierWord(pl.gen)} · ${ex ? 'taking shape' : 'under way'}</div></div>${pop ? '' : `<button class="x" data-pjdrop="${pl.i}" title="drop it — what it has done is lost">✕</button>`}</div>
    ${ex ? `<div class="pjexpect"><div class="tiny">We expect:</div>${traitLines(pl.fam, ex.traits, true)}${rareHint(ex)}<div class="tiny">Its physical form is still unknown — the engineers are shaping it.</div>${dupHtml(S, c, pl.fam, ex.traits)}</div>` : paragraph(pl.fam, pl.gen, benefitsOf(S, null, pl.fam, pl.q), pl.boosts.map(b => b.name), giftOf(S))}
    <div class="pjbar"><i style="width:${Math.min(100, Math.round(pl.done * 100))}%"></i></div>
    <div class="tiny">${Math.round(pl.p.prog || 0)} of ${pl.need} · ${pl.gain > 0 ? `done in <b>${eonWord(pl.eons)}</b>` : '<b class="up">no research reaches it</b>'} · coming out ${gradeHtml(pl.q)}${pl.boosts.length ? ` · ${pl.boosts.length} find${pl.boosts.length > 1 ? 's' : ''} help` : ''}</div>
    <label class="pjinf"><span>influence</span><input type="range" min="0" max="100" step="5" value="${pl.p.inf || 0}" data-pjinf="${pl.i}"><b data-pjinfv="${pl.i}">${pl.p.inf || 0} %</b></label>${pop ? `<button class="tdrop" data-pjdrop="${pl.i}" title="what it has done is lost">Drop this project</button>` : ''}</div>`;
}
// a project under way, simple: the picture, the name, how far, what we expect
function nodeMini(pl, S, c) {
  const ex = pl.F.module ? expectOf(S, c.fields, pl.fam, pl.p) : null;
  return `<div class="pjnode tcard going mini" data-pjnode="${pl.i}" style="--tc:${tcol(pl.gen, pl.q)}">${coin(pl.fam)}<div class="ttop">${techArt(S, { fam: pl.fam, gen: pl.gen, q: pl.q, w: 64 })}<div><div class="tname">${esc(pl.name)}</div><div class="tiny">${tierWord(pl.gen)} · ${pl.gain > 0 ? eonWord(pl.eons) : 'stalled'}</div></div></div>
    <div class="pjbar"><i style="width:${Math.min(100, Math.round(pl.done * 100))}%"></i></div><div class="tcaps">${capsHtml(S, pl.fam, { q: pl.q }, ex)}</div></div>`;
}
// THE TREE (his ask, 2026-10-31: "the tree evolves from left to right… on top, columns of tiers"): a row per family that has something
// (developed, or under way), grouped by category; a column per tier — a family's generation; at least three
function treeHtml(S, c) {
  const techs = techTree(S), plans = c.projects || [], mini = zoom < ZOOM.mini, rows = [];
  for (const cat of CATEGORIES) { const fams = cat.fams.filter(f => FAMILIES[f] && (techs.some(t => t.fam === f) || plans.some(p => p.fam === f))); if (fams.length) rows.push({ cat, fams }); }
  if (!rows.length) return '';
  const n = Math.max(3, ...techs.map(t => t.gen), ...plans.map(p => p.gen));
  let h = `<div class="tgrid${mini ? ' mini' : ''}" style="grid-template-columns:var(--lab) repeat(${n},var(--col))"><div class="thead tl"></div>`;
  for (let g = 1; g <= n; g++) h += `<div class="thead" style="--tc:${tcol(g, 1)}">Tier ${roman(g)}</div>`;
  for (const { cat, fams } of rows) {
    h += `<div class="tcat" style="grid-column:1 / -1"><span>${esc(cat.name)}</span></div>`;
    for (const fam of fams) {
      const F = FAMILIES[fam]; h += `<div class="tfam" data-tfam="${fam}"><span class="pjicon">${F.icon}</span><b>${esc(F.name)}</b></div>`;
      for (let g = 1; g <= n; g++) {
        const t = techs.find(x => x.fam === fam && x.gen === g), p = plans.find(x => x.fam === fam && x.gen === g);
        h += `<div class="tcell">${t ? techCard(S, t, mini) : p ? (mini ? nodeMini(p, S, c) : nodeHtml(p, S, c)) : ''}</div>`;
      }
    }
  }
  return h + '</div>';
}
// the card opened in full, whatever the zoom
function popupHtml(S, c) {
  if (!popup) return '';
  if (popup.node != null) { const pl = (c.projects || []).find(p => p.i === popup.node); return pl ? `<button class="x tclose" data-tclose title="close (Esc)">✕</button>${nodeHtml(pl, S, c, true)}` : ''; }
  const [fam, g] = popup.tech.split(':'), t = techTree(S).find(x => x.fam === fam && x.gen === +g);
  return t ? `<button class="x tclose" data-tclose title="close (Esc)">✕</button>${techCard(S, t, false, true)}` : '';
}
// THE PICKER: the advisors' suggestions first, then your own pick — a category, then the thing
// top: the advisors' pick in this goal ({ fam, q }) — a way that would come out clearly worse says so (his call: "you can, but it will be less good")
function famCard(S, c, fam, why = null, star = false, top = null) {
  const F = FAMILIES[fam], { q, ch, boosts } = qualityOf(S, c.fields, fam);
  if (F.module) {                                    // a component: what we expect of it, why, where to look to do better — not its numbers
    const ex = expectOf(S, c.fields, fam), [gw] = GRADE(q);
    return `<div class="pjcard ${star ? 'star' : ''} ${pick && pick.fam === fam ? 'on' : ''}" data-pjsel="${fam}" style="--tc:${tcol(generationOf(S, fam), q)}">${star ? '<span class="pjstar">★ Your advisors\' pick — the best way with what you have</span>' : ''}<div class="pjhead"><span class="pjicon">${F.icon}</span><div><b>A new ${esc(F.name.toLowerCase())}</b><div class="tiny">${tierWord(generationOf(S, fam))} · would come out ${gradeHtml(q)}</div></div></div>
      ${why ? `<div class="tiny pjwhy">${esc(why)}</div>` : ''}
      <div class="pjform">${techArt(S, { fam, gen: generationOf(S, fam), q, w: 96 })}<div class="pjexpect"><div class="tiny">We expect:</div>${traitLines(fam, ex.traits, true)}${rareHint(ex)}</div></div>
      ${dupHtml(S, c, fam, ex.traits)}${whyHtml(S, c, fam)}${!star && top && q < top.q * 0.93 ? `<div class="pjwhere" style="color:#ffb347">Possible — but it would come out less well than a new ${esc(FAMILIES[top.fam].name.toLowerCase())}.</div>` : ''}
      <div class="tiny">${needOf(S, fam)} research · its physical form is found when it is done</div>
      <button class="go" data-pjstart="${fam}">Start</button></div>`;
  }
  return `<div class="pjcard ${star ? 'star' : ''} ${pick && pick.fam === fam ? 'on' : ''}" data-pjsel="${fam}" style="--tc:${tcol(generationOf(S, fam), q)}">${star ? '<span class="pjstar">★ Your advisors\' pick</span>' : ''}<div class="pjhead">${techArt(S, { fam, gen: generationOf(S, fam), q, w: 72 })}<div><b>${esc(nameOf(S, fam))}</b><div class="tiny">${esc(F.name)} · ${tierWord(generationOf(S, fam))} · would come out ${gradeHtml(q)}</div></div></div>
    ${why ? `<div class="tiny pjwhy">${esc(why)}</div>` : ''}
    <div class="pjrecipe">${ch.map(x => `<span title="strength ${x.strength.toFixed(2)} — to find where you look ${Math.round(x.potential * 100)} %, ${x.found} found${x.nb ? `, ${x.nb} new find${x.nb > 1 ? 's' : ''}` : ''}"><i class="fdot" style="background:${FIELD_COL[x.id]}"></i>${esc(c.fields.find(f => f.id === x.id)?.name || x.id)} ${Math.round(x.w * 100)} %</span>`).join('')}</div>
    ${paragraph(fam, generationOf(S, fam), benefitsOf(S, c.fields, fam, q), boosts.map(b => b.name), giftOf(S))}
    <div class="tiny">${needOf(S, fam)} research · ${F.adapt ? `every farm on a ${F.adapt === 'cold' ? 'cold' : F.adapt === 'heat' ? 'hot' : 'radiation-exposed'} world${S.adapt?.[F.adapt] ? ` (already ${Math.round(S.adapt[F.adapt] * 100)} % adapted)` : ''}` : F.level ? `every ${F.level === 'food' ? 'farm' : F.level === 'housing' ? 'home' : F.level === 'industry' ? 'works' : 'lab'} district` : `every ${esc(F.name.toLowerCase())} you have`}, from the day it is done</div>
    <button class="go" data-pjstart="${fam}">Start</button></div>`;
}
function pickerHtml(S, c) {
  const busy = new Set((S.projects || []).map(p => p.fam)), goal = GOALS.find(g => g.id === pick.goal) || null;
  let h = `<div class="pjpick"><div class="pjpickhead"><b>New research project</b><span style="flex:1"></span><button class="x" data-pjclose title="close (Esc)">✕</button></div>
    <h3>What do you want?</h3><div class="pjcats">${GOALS.map(g => `<button class="${g === goal ? 'on' : ''}" data-pjgoal="${g.id}">${esc(g.name)}</button>`).join('')}</div>`;
  if (goal) {                                        // the ways to it, the best with what you have first (his call: you may still pick another — it comes out less good)
    const free = goal.fams.filter(f => FAMILIES[f] && !busy.has(f)).sort((a, b) => qualityOf(S, c.fields, b).q - qualityOf(S, c.fields, a).q), top = free[0];
    if (top) h += `<div class="pjsay">Your advisors: “With the research you have, ${FAMILIES[top].module ? `a new ${esc(FAMILIES[top].name.toLowerCase())}` : esc(FAMILIES[top].name.toLowerCase())} is the best way to go.”</div>`;
    const tq = top ? { fam: top, q: qualityOf(S, c.fields, top).q } : null;
    h += `<div class="pjcards">${free.map((f, i) => famCard(S, c, f, null, i === 0, tq)).join('')}${goal.fams.filter(f => busy.has(f)).map(f => `<div class="pjcard busy"><div class="pjhead"><span class="pjicon">${FAMILIES[f].icon}</span><div><b>${esc(FAMILIES[f].name)}</b><div class="tiny">under way</div></div></div></div>`).join('')}</div>`;
  } else {
    const adv = advisors(S, c);
    h += `<h3>Or what presses — your advisors suggest</h3>${adv.length ? `<div class="pjcards">${adv.map(a => famCard(S, c, a.fam, a.why)).join('')}</div>` : '<div class="tiny">Nothing presses — say what you want above.</div>'}`;
  }
  return h + '</div>';
}
// the field rows a family pulls from light up (a hovered card or node)
function decorate() {
  const F = hiFam && FAMILIES[hiFam];
  for (const row of document.querySelectorAll('#eFields .frow[data-field]')) { const w = F ? F.recipe[row.dataset.field] : 0; row.classList.toggle('rec', !!w); let tag = row.querySelector('.rtag2');
    if (w && !tag) { tag = document.createElement('span'); tag.className = 'rtag2'; row.querySelector('.top .name')?.after(tag); } if (tag) { if (w) tag.textContent = `${Math.round(w * 100)} %`; else tag.remove(); } }
}
// THE CHANNELS: field row → node, as wide as the research the project pulls through that field, dimmer the less the field has to give
function drawFlow() {
  const board = $('rBoard'), svg = $('rFlow'); if (!board || !svg || !ctx || board.offsetParent === null) return;
  const B = board.getBoundingClientRect(), W = B.width, H = B.height, sec = $('rFieldsSec').getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const rows = new Map([...document.querySelectorAll('#eFields .frow[data-field]')].map(row => { const r = row.getBoundingClientRect(); return [row.dataset.field, { y: Math.max(8, Math.min(H - 8, r.top + r.height / 2 - B.top)), off: r.bottom < sec.top + 30 || r.top > sec.bottom - 10 }]; }));
  let out = '';
  const T = ($('rTree') || board).getBoundingClientRect(), tx0 = T.left - B.left + 8, tx1 = T.right - B.left - 8, ty0 = T.top - B.top + 8, ty1 = T.bottom - B.top - 8;   // a node scrolled out of the tree's view: the channel ends at its edge
  for (const [id, r] of rows) if (!(ctx.c.projects || []).some(p => p.F.recipe[id])) out += `<path d="M0 ${r.y} L22 ${r.y}" stroke="#5b6a8a" stroke-width="2" opacity="${r.off ? 0.1 : 0.3}" stroke-linecap="round"/>`;
  for (const pl of ctx.c.projects || []) {
    const node = document.querySelector(`#rTree [data-pjnode="${pl.i}"]`); if (!node) continue; const N = node.getBoundingClientRect(), nh = Math.min(N.height, Math.max(24, ty1 - ty0)), nx = Math.max(tx0, Math.min(tx1, N.left - B.left)), ny = Math.max(ty0, Math.min(ty1 - nh, N.top - B.top));
    const ids = Object.keys(pl.F.recipe).sort((a, b) => (rows.get(a)?.y ?? 0) - (rows.get(b)?.y ?? 0)), dim = hiFam && hiFam !== pl.fam;
    ids.forEach((id, k) => {
      const r = rows.get(id); if (!r) return; const x = pl.ch.find(c => c.id === id), w = pl.F.recipe[id], py = ny + 14 + (k + 0.5) * (nh - 28) / ids.length, col = FIELD_COL[id];
      const d = `M0 ${r.y} C${nx * 0.45} ${r.y} ${nx * 0.6} ${py} ${nx} ${py}`, wd = 2 + 16 * w * Math.sqrt((pl.p.inf || 0) / 100), lit = Math.max(0.25, Math.min(1, (x ? x.strength : 0.5) - 0.3));
      out += `<path d="${d}" stroke="${col}" stroke-width="${wd}" opacity="${(r.off ? 0.1 : 0.22) * (dim ? 0.4 : 1)}" fill="none" stroke-linecap="round"/>`;
      if (pl.done > 0) out += `<path d="${d}" pathLength="1" stroke="${col}" stroke-width="${wd}" stroke-dasharray="${Math.min(1, pl.done)} 1" opacity="${lit * (dim ? 0.4 : 0.9)}" fill="none" stroke-linecap="round"/>`;
      if (pl.gain > 0) out += `<path class="pjflow" d="${d}" pathLength="1" stroke="#fff" stroke-width="1.6" stroke-dasharray="0.015 0.035" opacity="${dim ? 0.2 : 0.5}" fill="none"/>`;
      out += `<circle cx="3" cy="${r.y}" r="3.5" fill="${col}"/><circle cx="${nx}" cy="${py}" r="4" fill="${col}"/>`;
    });
  }
  svg.innerHTML = out;
}
export function renderResearch(c, S) {
  ctx = { c, S }; const fl = $('eFields'), tree = $('rTreeIn'), pk = $('rPick'), card = $('rCard'); if (!fl || !tree) return;
  fl.innerHTML = fieldsHtml(c);
  const html = treeHtml(S, c); tree.innerHTML = html; tree.style.zoom = zoom;
  $('rEmpty').hidden = !!html || !!pick;
  if (card) { const ph = popupHtml(S, c); if (!ph) popup = null; card.hidden = !ph || !!pick; card.innerHTML = ph; }
  if (pk) { pk.hidden = !pick; if (pick) pk.innerHTML = pickerHtml(S, c); }
  decorate(); requestAnimationFrame(drawFlow);
}
const act = fn => { if (!ctx) return; const err = fn(ctx.S); if (err) return alert(err); hooks.save(); hooks.refresh(); };
// THE TREE's hands (his ask, 2026-10-31): the WHEEL zooms (round the pointer; past ZOOM.mini the cards turn simple), a DRAG on the tree
// moves it, a CLICK on a card opens all of it (any zoom), a RIGHT-CLICK on a picture draws another shape of it
let pan = null;
document.addEventListener('wheel', e => {
  const tree = e.target.closest?.('#rTree'); if (!tree || !ctx) return; e.preventDefault();
  const notch = Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100);   // a mouse notch = 12 %, a touchpad's small strokes less
  const z0 = zoom, z1 = Math.max(ZOOM.min, Math.min(ZOOM.max, z0 * Math.exp(-notch * 0.12))); if (Math.abs(z1 - z0) < 1e-4) return;
  const R = tree.getBoundingClientRect(), mx = e.clientX - R.left, my = e.clientY - R.top, ax = (tree.scrollLeft + mx) / z0, ay = (tree.scrollTop + my) / z0;
  zoom = z1; if ((z0 < ZOOM.mini) !== (z1 < ZOOM.mini)) renderResearch(ctx.c, ctx.S); else $('rTreeIn').style.zoom = z1;
  tree.scrollLeft = ax * z1 - mx; tree.scrollTop = ay * z1 - my; drawFlow();
}, { passive: false });
document.addEventListener('pointerdown', e => { const tree = e.button === 0 && e.target.closest?.('#rTree'); if (!tree || e.target.closest('input, button, label, select')) return; pan = { tree, x: e.clientX, y: e.clientY, sl: tree.scrollLeft, st: tree.scrollTop, moved: false }; });
document.addEventListener('pointermove', e => { if (!pan) return; const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!pan.moved && Math.hypot(dx, dy) < 5) return; pan.moved = true; pan.tree.classList.add('pan'); pan.tree.scrollLeft = pan.sl - dx; pan.tree.scrollTop = pan.st - dy; });
document.addEventListener('pointerup', () => { if (pan) { pan.tree.classList.remove('pan'); if (pan.moved) pan.justMoved = true; setTimeout(() => { pan = null; }, 0); } });
document.addEventListener('contextmenu', e => {
  const im = e.target.closest?.('img.tart[data-devfam]'); if (!im || !ctx) return; e.preventDefault(); e.stopPropagation();
  reseed(ctx.S, im.dataset.devfam, +im.dataset.devgen); hooks.save(); renderResearch(ctx.c, ctx.S);
}, true);
document.addEventListener('click', e => {
  if (!ctx) return;
  if (e.target.closest('[data-tclose]')) { popup = null; return renderResearch(ctx.c, ctx.S); }
  if (pan && pan.justMoved) return;                                                // the end of a drag, not a click
  if (e.target.closest('#rTree') && !e.target.closest('input, button, label, select')) {
    const k = e.target.closest('[data-tech], [data-pjnode]');
    if (k) { popup = k.dataset.tech ? { tech: k.dataset.tech } : { node: +k.dataset.pjnode }; return renderResearch(ctx.c, ctx.S); }
    if (popup) { popup = null; return renderResearch(ctx.c, ctx.S); }
  }
  const t = e.target.closest('[data-pjnew], [data-pjclose], [data-pjcat], [data-pjgoal], [data-pjstart], [data-pjdrop]'); if (!t) return;
  if (t.hasAttribute('data-pjnew')) { pick = { goal: null, fam: null }; return renderResearch(ctx.c, ctx.S); }
  if (t.dataset.pjgoal) { pick.goal = pick.goal === t.dataset.pjgoal ? null : t.dataset.pjgoal; return renderResearch(ctx.c, ctx.S); }
  if (t.hasAttribute('data-pjclose')) { pick = null; hiFam = null; return renderResearch(ctx.c, ctx.S); }
  if (t.dataset.pjcat) { pick.cat = t.dataset.pjcat; return renderResearch(ctx.c, ctx.S); }
  if (t.dataset.pjstart) { const fam = t.dataset.pjstart; pick = null; hiFam = null; return act(S => startProject(S, fam)); }
  if (t.dataset.pjdrop) { const i = +t.dataset.pjdrop, p = (ctx.c.projects || []).find(x => x.i === i); if (p && !confirm(`Drop ${p.name}? What it has done (${Math.round(p.p.prog || 0)} of ${p.need}) is lost.`)) return; return act(S => dropProject(S, i)); }
});
document.addEventListener('input', e => { const t = e.target; if (t.dataset?.pjinf == null) return; for (const v of document.querySelectorAll(`[data-pjinfv="${t.dataset.pjinf}"]`)) v.textContent = `${t.value} %`; });
document.addEventListener('change', e => { const t = e.target; if (t.dataset?.pjinf == null) return; const i = +t.dataset.pjinf, v = +t.value; act(S => setInfluence(S, i, v)); });
document.addEventListener('mouseover', e => { if (!ctx) return; const t = e.target.closest?.('[data-pjsel], [data-pjnode], [data-pjnodep], [data-tech], [data-techp], [data-tfam]'); const d = t ? t.dataset : {}, node = d.pjnode ?? d.pjnodep, fam = t ? (d.pjsel || d.tfam || (d.tech || d.techp || '').split(':')[0] || ctx.c.projects?.find(p => p.i === +node)?.fam || null) : null; if (fam !== hiFam) { hiFam = fam; decorate(); drawFlow(); } });
document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !ctx) return; if (pick) { pick = null; hiFam = null; renderResearch(ctx.c, ctx.S); } else if (popup) { popup = null; renderResearch(ctx.c, ctx.S); } });
document.addEventListener('scroll', e => { if (e.target && (e.target.id === 'rFieldsSec' || e.target.id === 'rTree' || e.target.id === 'rCard')) drawFlow(); }, true);
window.addEventListener('resize', () => drawFlow());
