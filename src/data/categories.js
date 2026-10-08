// Every kind of part is DATA. To add a new kind, add an entry here — no other code needs to know.
//   group    military / shared / civilian — only a label for the menus; any part fits in any ship or structure.
//   wants    what the player asks for, in real units.
//            `mult` wants are efficiency multipliers on a natural need (power draw, workers): lower = costs more.
//            `less` wants are "lower is better" (start-up time, recharge delay).
//   base     mass (t), build cost (cr) and research (RP) of the Standard part.
//   natural  the part's natural power / worker need, before the efficiency multipliers.
//   contrib  what one part adds to an assembly (ship or structure).
//   short    one-line summary for part cards.  gets = plain-language lines on the research screen.
import { fmt } from '../util.js';
import { DRAG, TURN_K } from '../core/physics.js';

export const GROUPS = [
  { id: 'military', name: 'Military' },
  { id: 'shared', name: 'Both' },
  { id: 'civilian', name: 'Civilian' },
];

const POWER = (label = 'Power draw') => ({ k: 'pw', label, mult: 'power', unit: 'MW', min: 0.4, max: 2.5, step: 0.05, std: 1, exp: 0.8 });
const WORKERS = { k: 'wk', label: 'Workers needed', mult: 'workers', unit: 'M workers', min: 0.2, max: 2.5, step: 0.05, std: 1, exp: 0.7 };
const needs = s => ['Full output needs', `${fmt(s.workers)} M workers and ${fmt(s.power)} MW`];

export const CATS = {
  weapon: {
    id: 'weapon', name: 'Weapon', one: 'Laser', group: 'military', color: '#ff8a6b', aspect: 3,
    base: { mass: 30, cost: 120, rp: 200 },
    wants: [
      { k: 'dmg', label: 'Damage per shot', unit: 'HP', min: 0, max: 300, step: 1, std: 40, exp: 1.2 },
      { k: 'rate', label: 'Fire rate', unit: 'shots / s', min: 0.1, max: 5, step: 0.1, std: 1, exp: 1.0, dec: 1 },
      { k: 'range', label: 'Range', unit: 'u', min: 50, max: 1000, step: 10, std: 400, exp: 1.5 },
      POWER(),
    ],
    natural: v => ({ power: 0.9 * v.dmg * v.rate * Math.sqrt(v.range / 400) }),
    contrib: (v, s) => ({ weapon: { dmg: v.dmg, rate: v.rate, range: v.range, draw: s.power, arc: 70 } }),
    short: (v, s) => `${v.dmg} HP × ${v.rate.toFixed(1)}/s · ${v.range} u · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Damage per second', fmt(v.dmg * v.rate) + ' HP/s'],
      ['Energy per shot', fmt(s.power / Math.max(v.rate, 0.01)) + ' MJ'],
      ['Reach', v.range + ' u — the battle arena is 1200 u wide'],
      ['Strips a 900-HP ship in', v.dmg * v.rate > 0 ? fmt(900 / (v.dmg * v.rate)) + ' s of firing' : 'never'],
      ['Aim', 'fixed forward, 70° cone — the ship must turn to aim'],
    ],
  },

  reactor: {
    id: 'reactor', name: 'Reactor', one: 'Reactor', group: 'shared', color: '#6db7ff', aspect: 1,
    base: { mass: 40, cost: 200, rp: 240 },
    wants: [
      { k: 'out', label: 'Power output', unit: 'MW', min: 0, max: 1000, step: 5, std: 150, exp: 1.1 },
      { k: 'buf', label: 'Energy buffer', unit: 'MJ', min: 0, max: 3000, step: 10, std: 200, exp: 0.5 },
      { k: 'ramp', label: 'Cold start to full power', unit: 's', min: 0.5, max: 12, step: 0.5, std: 4, exp: 0.5, less: true, dec: 1 },
    ],
    contrib: v => ({ powerOut: v.out, buffer: v.buf, ramp: v.ramp }),
    short: v => `${v.out} MW · buffer ${v.buf} MJ · start ${v.ramp} s`,
    gets: v => [
      ['On a ship', 'runs ' + fmt(v.out / 36) + ' Standard lasers at once (36 MW each)'],
      ['On a planet', 'powers ' + fmt(v.out / 30) + ' Standard mines or labs (30 MW each)'],
      ['Buffer', 'covers a 50 MW shortfall for ' + fmt(v.buf / 50) + ' s (battle only)'],
      ['At battle start', 'reaches full power after ' + v.ramp + ' s'],
    ],
  },

  engine: {
    id: 'engine', name: 'Engine', one: 'Engine', group: 'military', color: '#7ef3b0', aspect: 1.6,
    base: { mass: 45, cost: 160, rp: 200 },
    wants: [
      { k: 'thrust', label: 'Main thrust', unit: 'kN', min: 0, max: 40000, step: 100, std: 6000, exp: 1.0 },
      { k: 'turn', label: 'Turning thrust', unit: 'kN', min: 0, max: 20000, step: 100, std: 3000, exp: 0.9 },
      POWER(),
    ],
    natural: v => ({ power: 0.005 * v.thrust + 0.004 * v.turn }),
    contrib: (v, s) => ({ thrust: v.thrust, turn: v.turn, engineDraw: s.power }),
    short: (v, s) => `${fmt(v.thrust)} kN · turn ${fmt(v.turn)} kN · ${fmt(s.power)} MW`,
    gets: v => {
      const f = m => `accel ${fmt(v.thrust / m)} u/s² · top ${fmt(v.thrust / m / DRAG)} u/s · 90° turn ${v.turn > 0 ? fmt(90 / (v.turn / m * TURN_K)) + ' s' : 'never'}`;
      return [['On a 200 t ship', f(200)], ['On a 400 t ship', f(400)], ['On an 800 t ship', f(800)], ['Note', 'the same engine gets weaker with every tonne you add']];
    },
  },

  shield: {
    id: 'shield', name: 'Shield', one: 'Shield', group: 'military', color: '#cf89ff', aspect: 1,
    base: { mass: 25, cost: 180, rp: 260 },
    wants: [
      { k: 'cap', label: 'Capacity', unit: 'HP', min: 0, max: 2000, step: 10, std: 200, exp: 1.1 },
      { k: 'regen', label: 'Recharge rate', unit: 'HP / s', min: 0, max: 100, step: 1, std: 10, exp: 1.2 },
      { k: 'delay', label: 'Delay after a hit', unit: 's', min: 0.5, max: 10, step: 0.5, std: 4, exp: 0.7, less: true, dec: 1 },
      POWER('Power draw while recharging'),
    ],
    natural: v => ({ power: 0.04 * v.cap + 1.5 * v.regen }),
    contrib: (v, s) => ({ shield: { cap: v.cap, regen: v.regen, delay: v.delay, draw: s.power } }),
    short: (v, s) => `${v.cap} HP · +${v.regen}/s after ${v.delay} s · ${fmt(s.power)} MW`,
    gets: v => [
      ['Soaks', fmt(v.cap / 40) + ' Standard laser shots (40 HP)'],
      ['Empty to full', v.regen > 0 ? fmt(v.delay + v.cap / v.regen) + ' s without being hit' : 'never recharges'],
      ['Under steady fire', v.regen > 0 ? 'only recharges if nothing hits for ' + v.delay + ' s' : '—'],
    ],
  },

  armor: {
    id: 'armor', name: 'Armor', one: 'Armor', group: 'shared', color: '#c9d4e8', perU: true,
    base: { mass: 0.8, cost: 3, rp: 220 },
    wants: [
      { k: 'hp', label: 'Protection', unit: 'HP per u of outline', min: 0, max: 80, step: 1, std: 10, exp: 1.2 },
      { k: 'dr', label: 'Shrugs off per hit', unit: 'HP', min: 0, max: 25, step: 0.5, std: 3, exp: 1.3, dec: 1 },
    ],
    contrib: () => ({}),
    short: v => `${v.hp} HP/u · shrugs ${v.dr}`,
    gets: (v, s) => [
      ['On a small ship (50 u outline)', fmt(v.hp * 50) + ' HP · ' + fmt(s.mass * 50) + ' t · ' + fmt(s.cost * 50) + ' cr'],
      ['On a big ship (120 u outline)', fmt(v.hp * 120) + ' HP · ' + fmt(s.mass * 120) + ' t · ' + fmt(s.cost * 120) + ' cr'],
      ['A 40-HP laser shot does', fmt(Math.max(40 - v.dr, 6)) + ' HP to it'],
      ['A 12-HP rapid shot does', fmt(Math.max(12 - v.dr, 1.8)) + ' HP to it'],
      ['Note', 'armor is paid per u of outline — a bigger ship or structure needs more of it'],
    ],
  },

  habitat: {
    id: 'habitat', name: 'Habitat', one: 'Habitat', group: 'civilian', color: '#f5a3c7', aspect: 1.5,
    base: { mass: 60, cost: 150, rp: 160 },
    wants: [
      { k: 'cap', label: 'Housing', unit: 'M people', min: 0, max: 40, step: 0.5, std: 4, exp: 1.0, dec: 1 },
      POWER('Life-support power'),
    ],
    natural: v => ({ power: 3 * v.cap }),
    contrib: (v, s) => ({ housing: v.cap, civDraw: s.power }),
    short: (v, s) => `houses ${fmt(v.cap)} M · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Houses', fmt(v.cap) + ' M people'],
      ['Life support', fmt(s.power) + ' MW'],
      ['To feed them', fmt(v.cap / 4) + ' Standard farms (4 M each)'],
      ['Note', 'people only grow into free housing, and only while food is left over'],
    ],
  },

  farm: {
    id: 'farm', name: 'Farm', one: 'Farm', group: 'civilian', color: '#c8e36f', aspect: 2,
    base: { mass: 40, cost: 100, rp: 160 },
    wants: [
      { k: 'out', label: 'Food', unit: 'M people fed / turn', min: 0, max: 40, step: 0.5, std: 4, exp: 1.1, dec: 1 },
      WORKERS, POWER(),
    ],
    natural: v => ({ power: 1 * v.out, workers: 0.25 * v.out }),
    contrib: (v, s) => ({ food: v.out, jobs: s.workers, civDraw: s.power }),
    short: (v, s) => `feeds ${fmt(v.out)} M · ${fmt(s.workers)} M workers · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Feeds', fmt(v.out) + ' M people every turn'],
      ['Spare food', 'every 1 spare food grows the population by 0.25 M per turn'],
      needs(s),
    ],
  },

  mine: {
    id: 'mine', name: 'Mine', one: 'Mine', group: 'civilian', color: '#d9a35b', aspect: 1,
    base: { mass: 50, cost: 150, rp: 200 },
    wants: [
      { k: 'out', label: 'Output', unit: 'cr / turn', min: 0, max: 500, step: 5, std: 50, exp: 1.1 },
      WORKERS, POWER(),
    ],
    natural: v => ({ power: 0.6 * v.out, workers: 0.03 * v.out }),
    contrib: (v, s) => ({ credits: v.out, jobs: s.workers, civDraw: s.power }),
    short: (v, s) => `+${fmt(v.out)} cr/turn · ${fmt(s.workers)} M workers · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Income', '+' + fmt(v.out) + ' cr per turn (credits = resources)'],
      ['Pays for a ~900 cr Frigate every', v.out > 0 ? fmt(900 / v.out) + ' turns' : 'never'],
      needs(s),
    ],
  },

  factory: {
    id: 'factory', name: 'Factory', one: 'Factory', group: 'civilian', color: '#ffb347', aspect: 1.5,
    base: { mass: 60, cost: 200, rp: 220 },
    wants: [
      { k: 'out', label: 'Build capacity', unit: 'cr of work / turn', min: 0, max: 1000, step: 10, std: 100, exp: 1.1 },
      WORKERS, POWER(),
    ],
    natural: v => ({ power: 0.4 * v.out, workers: 0.015 * v.out }),
    contrib: (v, s) => ({ production: v.out, jobs: s.workers, civDraw: s.power }),
    short: (v, s) => `builds ${fmt(v.out)} cr/turn · ${fmt(s.workers)} M workers · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Builds', fmt(v.out) + ' cr worth of ships and structures per turn'],
      ['A ~900 cr Frigate takes', v.out > 0 ? fmt(900 / v.out) + ' turns — if you have the credits' : 'forever'],
      needs(s),
    ],
  },

  lab: {
    id: 'lab', name: 'Lab', one: 'Lab', group: 'civilian', color: '#5fe3d0', aspect: 1,
    base: { mass: 35, cost: 200, rp: 240 },
    wants: [
      { k: 'out', label: 'Research', unit: 'RP / turn', min: 0, max: 200, step: 1, std: 20, exp: 1.2 },
      WORKERS, POWER(),
    ],
    natural: v => ({ power: 1.5 * v.out, workers: 0.05 * v.out }),
    contrib: (v, s) => ({ research: v.out, jobs: s.workers, civDraw: s.power }),
    short: (v, s) => `+${fmt(v.out)} RP/turn · ${fmt(s.workers)} M workers · ${fmt(s.power)} MW`,
    gets: (v, s) => [
      ['Research', '+' + fmt(v.out) + ' RP per turn'],
      ['A Standard laser (200 RP) with this lab alone', v.out > 0 ? fmt(200 / v.out) + ' turns' : 'never'],
      needs(s),
    ],
  },
};
