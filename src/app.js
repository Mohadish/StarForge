// Boot: load the save, build the tabs, keep the top bar current, run End turn.
import { $, fmt, signed, toast, esc } from './util.js';
import { S, load, onChange, newGame, commit } from './core/state.js';
import { planetStats, endTurn } from './core/economy.js';
import { setGo } from './ui/nav.js';
import * as systemView from './ui/system.js';
import * as colonyView from './ui/colony.js';
import * as researchView from './ui/research.js';
import { shipyard, buildingDesigner } from './ui/yard.js';
import * as battleView from './ui/battle.js';
import { LAND } from './core/colonymap.js';

const VIEWS = {
  system: ['Star system', systemView],
  colony: ['Colony', colonyView],
  buildings: ['Building design', buildingDesigner],
  research: ['Research', researchView],
  yard: ['Shipyard', shipyard],
  battle: ['Battle test', battleView],
};
let current = null, cleanup = null;

function go(id) {
  if (!VIEWS[id]) id = 'colony';
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  current = id;
  try { localStorage.setItem('forge4x.tab', id); } catch (e) { /* ignore */ }
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === id);
  const host = document.createElement('div');
  host.className = 'host';
  $('view').replaceChildren(host);        // fresh element per screen: no leftover listeners
  cleanup = VIEWS[id][1].mount(host) || null;
  renderTopbar();
}
setGo(go);

function renderTopbar() {
  const p = planetStats(S), spare = p.foodOut - p.eat;
  const cell = (label, val, cls = '') => `<div class="r"><span>${label}</span><b class="${cls}">${val}</b></div>`;
  $('res').innerHTML = cell('Turn', S.turn)
    + cell('Credits', `${fmt(S.credits)} <small>${signed(p.creditsOut)}</small>`)
    + cell('Food', signed(spare), spare < 0 ? 'up' : '')
    + cell('People', `${fmt(p.pop)} / ${fmt(p.housing)} M`)
    + cell('Power', `${fmt(p.powerOut)} / ${fmt(p.powerDraw)} MW`, p.powerScale < 1 ? 'up' : '')
    + cell('Research', fmt(p.rpOut) + ' RP')
    + cell('Land', `${p.cells + p.plannedCells} / ${LAND}`);
}

$('endTurn').onclick = () => {
  const r = endTurn(S);
  commit();
  const lines = r.lines.slice(0, 6).map(l => esc(l.text)).join('<br>');
  toast(`<b>Turn ${r.turn} → ${S.turn}</b> · income ${signed(r.income)} cr · people ${signed(r.dPop)} M${lines ? '<br>' + lines : ''}`, 5000);
};
$('newGame').onclick = () => {
  if (!confirm('Start a new game? The current one is deleted.')) return;
  for (const [, v] of Object.values(VIEWS)) v.reset?.();
  newGame();
  go('colony');
};

load();
$('tabs').innerHTML = Object.entries(VIEWS).map(([id, [name]]) => `<button data-tab="${id}">${name}</button>`).join('');
$('tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); };
onChange(() => { renderTopbar(); VIEWS[current]?.[1].refresh?.(); });
let startTab = 'colony';
try { startTab = localStorage.getItem('forge4x.tab') || 'colony'; } catch (e) { /* ignore */ }
go(startTab);
window.__forgeBooted = true;
