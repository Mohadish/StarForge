// THE WORLD PLAYED BY AIs (his ask, 2026-10-16: "start with two AIs — two empires, maybe even three — the same start; the battle
// is for galaxy domination"). One galaxy, two or three empires (src/eon/world.js), each with the head of src/eon/ai.js — the same
// head the game runs for the empires a human is not playing. Every order is an ACTION per empire and the whole world is a log
// the game's Replay bar plays back exactly, with a switch to look through any empire's eyes:
//   node tools/play/world.mjs <seed> [empires=3] [maxEons=600] [stars=50]  →  tools/play/out/world-<seed>.json  (or world-<seed>-<empires>x<stars>.json when not the plain 3 × 50)
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { peopleWord } from '../../src/eon/model.js';
import { galaxyOf, GALAXY } from '../../src/eon/galaxy.js';
import { createWorld, worldEndEon, living, MAX_EMPIRES } from '../../src/eon/world.js';
import { makeBrain } from '../../src/eon/ai.js';
import { REPLAY_VERSION } from '../../src/eon/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedText = process.argv[2] || '7', N = Math.max(2, Math.min(MAX_EMPIRES, +(process.argv[3] || 3))), MAX_EONS = +(process.argv[4] || 600), STARS = +(process.argv[5] || GALAXY.count);
const galaxy = galaxyOf(STARS), W = createWorld(seedText, N, { galaxy });
const outName = N === 3 && STARS === GALAXY.count ? `world-${seedText}` : `world-${seedText}-${N}x${STARS}`;
const log = { version: REPLAY_VERSION, kind: 'world', seedText, n: N, galaxy, player: 'tools/play/world.mjs', empires: W.empires.map(S => ({ name: S.name, home: S.homeSys, actions: [] })), eons: [], notes: [], events: [] };
const note = (S, text) => { log.notes.push({ eon: W.eon, empire: S.empire, text }); console.log(`  eon ${W.eon} ${S.name.padEnd(6)} ${text}`); };
const onAct = (S, a) => log.empires[S.empire].actions.push({ eon: W.eon, ...a });

const brains = W.empires.map(S => makeBrain(W, S, { note, onAct }));
console.log(`seed "${seedText}": ${N} empires on ${W.empires[0].systems.length} stars (radius ${galaxy.radius}) — ${W.empires.map(S => `${S.name} at ${S.systems.find(s => s.id === S.homeSys).name}`).join(', ')}`);
for (let eon = 0; eon < MAX_EONS; eon++) {
  for (const S of living(W)) brains[S.empire].plan();
  const before = log.events.length; for (const e of W.events) if (e.eon === W.eon && !log.events.includes(e)) log.events.push(e);   // invasions land inside the eon
  const { rep } = worldEndEon(W);
  for (const r of rep) log.events.push({ eon: W.eon - 1, kind: r.kind, text: r.text });
  for (const e of log.events.slice(before)) console.log(`  eon ${e.eon} ⚔ ${e.text}`);
  for (const S of living(W)) brains[S.empire].after();
  log.eons.push({ eon: W.eon, empires: W.empires.map(S => S.dead ? null : ({ people: Math.round(S.places.find(p => p.id === S.homePlace).colony.people * 10) / 10, reserves: Math.round(S.reserves || 0), cohesion: Math.round(S.cohesion), ships: S.ships.length, colonies: S.places.filter(p => p.colony).length })) });
  if (W.winner != null) { console.log(`  eon ${W.eon - 1}: ${W.empires[W.winner].name} holds the galaxy`); break; }
  const live = living(W); if (live.every(S => brains[S.empire].stuck() && W.eon - brains[S.empire].stuck() > 200)) { console.log(`  eon ${W.eon}: every empire has been out of reach of the others for 200 eons — a stalemate`); break; }
  if (eon === MAX_EONS - 1) console.log('  out of eons');
}
const summary = `seed "${seedText}", ${N} empires: ${W.eon - 1} eons · ` + W.empires.map((S, i) => { const b = brains[i].B; return `${S.name}: ${S.dead ? 'FALLEN' : `${S.places.filter(p => p.colony).length} colonies, home ${peopleWord(S.places.find(p => p.id === S.homePlace).colony.people)}`} · ${b.settled} settled, ${b.taken} taken (${b.invasions} landings), ${b.lost} ships lost`; }).join(' | ') + (W.winner != null ? ` · ${W.empires[W.winner].name} holds the galaxy` : ' · no winner') + ` · ${log.events.length} events`;
log.summary = summary; console.log(summary);
fs.mkdirSync(join(here, 'out'), { recursive: true });
fs.writeFileSync(join(here, 'out', `${outName}.json`), JSON.stringify(log));
console.log(`written tools/play/out/${outName}.json`);
