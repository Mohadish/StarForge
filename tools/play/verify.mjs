// does a log REPLAY to the same game? The seed and the actions alone, through the game's own model, against the figures the
// player wrote down eon by eon: node tools/play/verify.mjs tools/play/out/7.json  — a world log (tools/play/world.mjs) the same way
import fs from 'fs';
import { newState, endEon } from '../../src/eon/model.js';
import { applyEon } from '../../src/eon/replay.js';
import { createWorld, worldEndEon, applyWorldEon } from '../../src/eon/world.js';

const file = process.argv[2]; if (!file) { console.error('which log?'); process.exit(1); }
const log = JSON.parse(fs.readFileSync(file, 'utf8'));
const seedOf = text => { const s = String(text).trim(); if (/^\d{1,9}$/.test(s)) return Number(s); let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
let bad = 0, refused = 0;
const check = (row, now, eon) => { const diff = Object.keys(now).filter(k => now[k] !== row[k]); if (diff.length) { bad++; if (bad <= 5) console.log(`eon ${eon}: differs in ${diff.map(k => `${k} ${row[k]} → ${now[k]}`).join(', ')}`); } };
if (log.kind === 'world') {
  const W = createWorld(log.seedText, log.empires.length, { galaxy: log.galaxy || null });
  for (const row of log.eons) {
    for (const S of W.empires) if (!S.dead) { const errs = applyWorldEon(W, S, log.empires[S.empire].actions, W.eon); refused += errs.length; for (const e of errs) console.log(`eon ${W.eon} ${S.name}: ${e.a.type} refused — ${e.err}`); }
    worldEndEon(W);
    W.empires.forEach((S, i) => { const r = row.empires[i]; if (!r) { if (!S.dead) { bad++; console.log(`eon ${row.eon}: ${S.name} should have fallen`); } return; } check(r, { people: Math.round(S.places.find(p => p.id === S.homePlace).colony.people * 10) / 10, reserves: Math.round(S.reserves || 0), cohesion: Math.round(S.cohesion), ships: S.ships.length, colonies: S.places.filter(p => p.colony).length }, `${row.eon} ${S.name}`); });
  }
} else {
  const S = newState(seedOf(log.seedText)); S.seedText = log.seedText;
  for (const row of log.eons) {
    const errs = applyEon(S, log.actions, S.eon); refused += errs.length; for (const e of errs) console.log(`eon ${S.eon}: ${e.a.type} refused — ${e.err}`);
    endEon(S);
    check(row, { people: Math.round(S.places.find(p => p.id === 'home').colony.people * 10) / 10, reserves: Math.round(S.reserves || 0), cohesion: Math.round(S.cohesion), ships: S.ships.length, hostiles: S.hostiles.length }, row.eon);
  }
}
console.log(`${log.eons.length} eons replayed · ${refused} actions refused · ${bad} eons differ · ${bad === 0 && refused === 0 ? 'EXACT' : 'NOT EXACT'}`);
process.exit(bad || refused ? 1 : 0);
