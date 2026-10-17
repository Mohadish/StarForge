// THE WORLD PLAYED BY AIs (his ask, 2026-10-16: "start with two AIs — two empires, maybe even three — the same start; the battle
// is for galaxy domination"). One galaxy, two to five empires (src/eon/world.js), each with the head of src/eon/ai.js — the same
// head the game runs for the empires a human is not playing, and the same campaign loop (world.js campaignEon) the game's own
// "Simulate" uses. Every order is an ACTION per empire and the whole world is a log the game's Replay bar plays back exactly:
//   node tools/play/world.mjs <seed> [empires=3] [maxEons=600] [stars=50] [focus]  →  tools/play/out/world-<seed>.json  (or world-<seed>-<empires>x<stars>[-focus].json when not the plain 3 × 50)
//   focus: a comma list per empire of mid | expand | exploit | explore | exterm | default (his ask, 2026-10-17: each empire leaning its own way)
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { galaxyOf, GALAXY } from '../../src/eon/galaxy.js';
import { createWorld, living, MAX_EMPIRES, newLog, campaignEon, finishLog } from '../../src/eon/world.js';
import { makeBrain } from '../../src/eon/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedText = process.argv[2] || '7', N = Math.max(2, Math.min(MAX_EMPIRES, +(process.argv[3] || 3))), MAX_EONS = +(process.argv[4] || 600), STARS = +(process.argv[5] || GALAXY.count);
const FOCUS = process.argv[6] ? process.argv[6].split(',').map(s => s.trim()) : null;
const galaxy = galaxyOf(STARS), W = createWorld(seedText, N, { galaxy });
const outName = (N === 3 && STARS === GALAXY.count ? `world-${seedText}` : `world-${seedText}-${N}x${STARS}`) + (FOCUS ? '-focus' : '');
const log = newLog(W, { player: 'tools/play/world.mjs', focus: FOCUS });
const note = (S, text) => { log.notes.push({ eon: W.eon, empire: S.empire, text }); console.log(`  eon ${W.eon} ${S.name.padEnd(6)} ${text}`); };
const onAct = (S, a) => log.empires[S.empire].actions.push({ eon: W.eon, ...a });

const brains = W.empires.map((S, i) => makeBrain(W, S, { note, onAct, focus: FOCUS ? FOCUS[i] || 'default' : 'default' }));
console.log(`seed "${seedText}": ${N} empires on ${W.empires[0].systems.length} stars (radius ${galaxy.radius}) — ${W.empires.map(S => `${S.name} at ${S.systems.find(s => s.id === S.homeSys).name}`).join(', ')}`);
for (let eon = 0; eon < MAX_EONS; eon++) {
  const events = campaignEon(W, brains, log);
  for (const e of events) console.log(`  eon ${e.eon} ⚔ ${e.text}`);
  if (W.winner != null) { console.log(`  eon ${W.eon - 1}: ${W.empires[W.winner].name} holds the galaxy`); break; }
  const live = living(W); if (live.every(S => brains[S.empire].stuck() && W.eon - brains[S.empire].stuck() > 200)) { console.log(`  eon ${W.eon}: every empire has been out of reach of the others for 200 eons — a stalemate`); break; }
  if (eon === MAX_EONS - 1) console.log('  out of eons');
}
finishLog(W, log, brains); console.log(log.summary);
console.log(`battle history: ${log.battles.length} battles, median size ${Math.round(log.baseline.median)} · highlights: ${log.highlights.filter(h => h.kind === 'battle').map(h => `eon ${h.eon} ${h.where} (${h.nA + h.nB} ships, ${Math.round(h.size)})`).join(', ') || 'none'}`);
fs.mkdirSync(join(here, 'out'), { recursive: true });
fs.writeFileSync(join(here, 'out', `${outName}.json`), JSON.stringify(log));
console.log(`written tools/play/out/${outName}.json`);
