// A fresh game: one Standard part of every kind already researched, a small colony and one Frigate.
import { CATS } from './categories.js';
import { stdWants, evalBlueprint, CENTER } from '../core/blueprint.js';
import { autoLayout } from '../core/assembly.js';
import { anchorAt } from '../core/colonymap.js';

// where the starting buildings stand on the colony map (top-left square)
const START_SPOTS = { d_hab: [3, 2], d_ind: [3, 7], d_lab: [17, 7] };

export function newGameState() {
  const blueprints = Object.keys(CATS).map(cat => {
    const b = { id: 'std_' + cat, cat, name: 'Standard ' + CATS[cat].one, v: stdWants(cat), w: [...CENTER], researched: true, progress: 0 };
    b.s = evalBlueprint(cat, b.v, b.w);
    return b;
  });
  const look = id => blueprints.find(b => b.id === id);
  const mk = (id, name, kind, cats, armor = false) => ({ id, name, kind, parts: autoLayout(cats.map(c => 'std_' + c), look), armor: armor ? 'std_armor' : null });
  const designs = [
    mk('d_hab', 'Hab Block', 'structure', ['habitat', 'farm', 'farm', 'habitat']),
    mk('d_ind', 'Industry Block', 'structure', ['mine', 'reactor', 'factory']),
    mk('d_lab', 'Science Lab', 'structure', ['lab']),
    mk('d_pow', 'Power Station', 'structure', ['reactor']),
    mk('d_frig', 'Frigate', 'ship', ['engine', 'reactor', 'shield', 'weapon'], true),
  ];
  const counters = {}, instances = [];
  for (const id of ['d_hab', 'd_ind', 'd_lab', 'd_frig']) {
    const d = designs.find(x => x.id === id);
    counters[id] = 1;
    const inst = { id: 'i_' + id.slice(2), designId: id, name: d.name + ' #1', kind: d.kind, parts: d.parts.map(p => ({ ...p })), armor: d.armor, builtTurn: 1 };
    if (START_SPOTS[id]) inst.map = anchorAt(inst.parts, look, ...START_SPOTS[id]);
    instances.push(inst);
  }
  return {
    version: 2, turn: 1, credits: 1500,
    colony: { name: 'Home', pop: 6, land: 400 },
    blueprints, designs, instances, counters,
    research: { queue: [] }, production: { queue: [] }, refits: [],
    log: [{ turn: 1, text: 'Colony founded on Home: 6 M people, a Hab Block, an Industry Block, a Science Lab and one Frigate.' }],
  };
}
