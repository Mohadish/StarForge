// The trinity. B = how much you asked for (the Standard part is exactly 1).
// The dot (w = small / cheap / quick) decides where B lands; the three multipliers always multiply to 1,
// so pushing one corner down always pushes the other two up.
import { CATS } from '../data/categories.js';

export const CENTER = [1 / 3, 1 / 3, 1 / 3];
export const stdWants = cat => Object.fromEntries(CATS[cat].wants.map(q => [q.k, q.std]));
export const lookupFor = S => id => S.blueprints.find(b => b.id === id);

export function evalBlueprint(cat, v, w) {
  const c = CATS[cat];
  let B = 1;
  for (const q of c.wants) {
    const x = Math.max(v[q.k] ?? q.std, 1e-3);
    if (q.mult) B *= Math.pow(1 / x, q.exp);
    else if (q.less) B *= 0.1 + 0.9 * Math.pow(q.std / x, q.exp);
    else B *= 0.1 + 0.9 * Math.pow(x / q.std, q.exp);
  }
  const m = w.map(wi => Math.pow(4, (1 / 3 - wi) * 3));
  const nat = c.natural ? c.natural(v) : {};
  return {
    B, m,
    mass: c.base.mass * Math.pow(B, 0.8) * m[0],
    cost: c.base.cost * B * m[1],
    rp: c.base.rp * Math.pow(B, 1.25) * m[2],
    natPower: nat.power || 0,
    natWorkers: nat.workers || 0,
    power: (nat.power || 0) * (v.pw ?? 1),
    workers: (nat.workers || 0) * (v.wk ?? 1),
  };
}
