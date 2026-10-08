import { CATS } from '../data/categories.js';
import { fmt } from '../util.js';

export function bpLine(b) {
  const c = CATS[b.cat], u = c.perU ? '/u' : '';
  return `<div class="tiny">${c.short(b.v, b.s)}</div>`
    + `<div class="tiny"><b style="color:var(--size)">${fmt(b.s.mass)} t${u}</b> · <b style="color:var(--cost)">${fmt(b.s.cost)} cr${u}</b> · <b style="color:var(--time)">${fmt(b.s.rp)} RP</b></div>`;
}
export const row = (a, b, cls = '') => `<div class="row"><span>${a}</span><b class="${cls}">${b}</b></div>`;
export const card = h => `<div class="card">${h}</div>`;
export const warn = t => `<div class="warnbox">${t}</div>`;
export const ok = t => `<div class="okbox">${t}</div>`;
export const note = t => `<div class="note">${t}</div>`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
