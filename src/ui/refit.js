// The "upgrade everything" dialog: pick the old part, untick units you want to leave alone,
// choose how fast. Now = 3× cost. Over N turns = cost × (1 + 1/N), a batch of units per turn.
import { $, fmt, esc, toast } from '../util.js';
import { CATS } from '../data/categories.js';
import { S, bp, commit, log } from '../core/state.js';
import { planRefit, orderRefit, replaceable } from '../core/refit.js';
import { row, card, plural } from './common.js';

const PLANET_KEYS = [['powerOut', 'Power made', ' MW'], ['civDraw', 'Power used', ' MW'], ['housing', 'Housing', ' M'], ['food', 'Food', ''], ['credits', 'Income', ' cr/turn'],
  ['production', 'Build capacity', ' cr/turn'], ['research', 'Research', ' RP/turn'], ['jobs', 'Jobs', ' M'], ['cells', 'Land', ' squares']];

export function openRefit(toId, fromId) {
  const to = bp(toId), cands = replaceable(S, toId);
  if (!to || !cands.length) { toast('Nothing uses an older part of this kind.'); return; }
  let from = cands.some(c => c.id === fromId) ? fromId : cands[0].id, T = 5;
  const off = new Set();
  const box = $('modalBox');
  $('modal').classList.remove('hidden');
  const close = () => { $('modal').classList.add('hidden'); box.innerHTML = ''; };
  const plan = () => { const all = planRefit(S, from, toId, null, T); return planRefit(S, from, toId, all.rows.map(r => r.inst.id).filter(id => !off.has(id)), T); };

  function render() {
    const p = plan(), f = bp(from), c = CATS[to.cat];
    const effect = r => {
      if (r.inst.kind === 'ship') return `mass ${fmt(r.before.mass)} → ${fmt(r.after.mass)} t · top ${fmt(r.before.top)} → ${fmt(r.after.top)} u/s`;
      const ch = PLANET_KEYS.filter(([k]) => Math.abs(r.after[k] - r.before[k]) > 0.05).map(([k, n, u]) => `${n} ${fmt(r.before[k])} → ${fmt(r.after[k])}${u}`);
      return ch.join(' · ') || 'no change in output';
    };
    const layout = r => r.mapBlocked ? '<b class="up">no room on the colony map — skipped</b>' : r.failed ? '<b class="up">no room — skipped</b>' : r.moved ? 'moved to fit' : 'fits in place';
    box.innerHTML = `
      <h2>Upgrade everything that uses an older ${c.one.toLowerCase()}</h2>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">Replace
        <select id="rfFrom">${cands.map(b => `<option value="${b.id}" ${b.id === from ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        with <b>${esc(to.name)}</b></div>
      ${card(row('Old', esc(c.short(f.v, f.s)) + ` · ${fmt(f.s.mass)} t · ${fmt(f.s.cost)} cr`) + row('New', esc(c.short(to.v, to.s)) + ` · ${fmt(to.s.mass)} t · ${fmt(to.s.cost)} cr`))}
      <h3>Designs — switch now</h3>
      <div class="tiny">${p.designs.length ? p.designs.map(d => esc(d.name)).join(', ') + ` — every new build uses ${esc(to.name)}.` : 'No saved design uses it.'}</div>
      <h3>Built units — refit</h3>
      ${p.rows.length ? `<table class="t"><tr><th></th><th>Unit</th><th>Refit cost</th><th>Layout</th><th>Effect</th></tr>
        ${p.rows.map(r => `<tr><td><input type="checkbox" data-inst="${r.inst.id}" ${off.has(r.inst.id) ? '' : 'checked'} ${r.failed ? 'disabled' : ''}></td>
          <td>${esc(r.inst.name)}<div class="tiny">${r.inst.kind}</div></td><td>${fmt(r.cost)} cr</td><td>${layout(r)}</td><td class="tiny">${effect(r)}</td></tr>`).join('')}</table>`
        : '<div class="tiny">Nothing built uses it.</div>'}
      <h3>How fast</h3>
      <input type="range" id="rfT" min="0" max="20" step="1" value="${T}">
      <div id="rfCost"></div>
      <div id="rfPlanet"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button id="rfCancel">Cancel</button><button class="go" id="rfGo">Order upgrade</button></div>`;
    renderCost();
    $('rfFrom').onchange = e => { from = e.target.value; off.clear(); render(); };
    for (const cb of box.querySelectorAll('[data-inst]')) cb.onchange = () => { cb.checked ? off.delete(cb.dataset.inst) : off.add(cb.dataset.inst); renderCost(); };
    $('rfT').oninput = e => { T = +e.target.value; renderCost(); };
    $('rfCancel').onclick = close;
    $('rfGo').onclick = order;
  }

  function renderCost() {
    const p = plan(), n = p.chosen.length;
    const how = T === 0 ? '<b>Right now</b> — every unit is refitted before the next turn. Rushing costs 3×.'
      : `<b>Over ${plural(T, 'turn')}</b> — ${n >= T ? `about ${plural(Math.round(n / T), 'unit')} per turn` : `one unit about every ${fmt(T / Math.max(1, n))} turns`}, paid as each is done. Units not refitted yet keep the old part.`;
    $('rfCost').innerHTML = `<div class="tiny" style="margin:4px 0 8px">${how}</div>` + card(
      row('Units to refit', n) + row('Base cost', fmt(p.base) + ' cr') + row('Speed premium', '×' + p.mult.toFixed(2)) +
      row('Total', fmt(p.total) + ' cr', T === 0 && p.total > S.credits ? 'up' : '') +
      row(T === 0 ? 'Paid now' : 'About per turn', fmt(T === 0 ? p.total : p.total / T) + ' cr') + row('You have', fmt(S.credits) + ' cr'));
    const sum = {};
    for (const r of p.chosen) if (r.inst.kind === 'structure') for (const [k] of PLANET_KEYS) sum[k] = (sum[k] || 0) + r.after[k] - r.before[k];
    const lines = PLANET_KEYS.filter(([k]) => Math.abs(sum[k] || 0) > 0.05).map(([k, n, u]) => `${n} ${sum[k] > 0 ? '+' : ''}${fmt(sum[k])}${u}`);
    $('rfPlanet').innerHTML = lines.length ? `<div class="tiny">Planet when done: ${lines.join(' · ')}</div>` : '';
  }

  function order() {
    const p = plan();
    if (!p.chosen.length && !p.designs.length) { toast('Nothing selected.'); return; }
    if (!orderRefit(S, p)) { toast(`Not enough credits: rushing needs ${fmt(p.total)} cr.`); return; }
    log(`Upgrade ordered: ${bp(from).name} → ${to.name} · ${plural(p.chosen.length, 'unit')} ${T === 0 ? 'refitted now' : 'over ' + plural(T, 'turn')} · ${plural(p.designs.length, 'design')} switched.`);
    commit(); close();
    toast(`Upgrade ordered: ${esc(bp(from).name)} → ${esc(to.name)}.`);
  }

  render();
}
