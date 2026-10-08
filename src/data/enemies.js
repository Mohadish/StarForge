// Reference opponents for the battle test. Same stat names as an assembly.
export const ENEMIES = {
  raider: {
    name: 'Raider', note: 'fast, circles you, weak rapid gun on a turret', color: '#ff9d7b', behavior: 'orbit',
    mass: 120, thrust: 5400, turn: 2400, engineDraw: 30, civDraw: 0, powerOut: 80, buffer: 100, ramp: 2,
    weapons: [{ dmg: 12, rate: 2.5, range: 260, draw: 25, arc: 360 }],
    shield: { cap: 80, regen: 8, delay: 3, draw: 12 }, armorHP: 150, dr: 1, structHP: 120,
  },
  warden: {
    name: 'Warden', note: 'all-rounder, two forward lasers', color: '#ff7b7b', behavior: 'hold',
    mass: 260, thrust: 6500, turn: 2600, engineDraw: 42, civDraw: 0, powerOut: 170, buffer: 200, ramp: 4,
    weapons: [{ dmg: 40, rate: 1, range: 400, draw: 36, arc: 70 }, { dmg: 40, rate: 1, range: 400, draw: 36, arc: 70 }],
    shield: { cap: 250, regen: 12, delay: 4, draw: 28 }, armorHP: 600, dr: 3, structHP: 260,
  },
  bastion: {
    name: 'Bastion', note: 'slow fortress, two long heavy guns on turrets', color: '#d86bff', behavior: 'hold',
    mass: 700, thrust: 7000, turn: 2300, engineDraw: 45, civDraw: 0, powerOut: 400, buffer: 400, ramp: 6,
    weapons: [{ dmg: 120, rate: 0.5, range: 650, draw: 70, arc: 360 }, { dmg: 120, rate: 0.5, range: 650, draw: 70, arc: 360 }],
    shield: { cap: 600, regen: 20, delay: 5, draw: 54 }, armorHP: 1800, dr: 8, structHP: 700,
  },
};
