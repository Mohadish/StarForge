// THE TECHNOLOGIES AS HARDWARE (his ask, 2026-10-31: "the 3D icons we developed — they should be integrated in the research cards"):
// every technology's picture is its greeble DEVICE (greeblelab.js drawDevice) in the empire's style (S.look.style — one style for now),
// its lights and wash in the TIER's colour (techicons.js tierColor: a smooth hue by tier and quality). Each is drawn once per (device,
// seed, colour, style, form) and kept as an image; the page asks for one by key — an <img data-devk> gets its picture when the drawing
// is ready (a few a tick, so the tab never stalls). RIGHT-CLICK a picture: another shape of the same thing (reseed: a new seed kept in
// S.iconSeeds by the technology's family and tier, so its project, its card in the tree and the picker all show the same one).
import { stockOf, drawDevice } from './greeblelab.js';
import { tierColor, tierLevel } from './techicons.js';

// which device draws each research family, and the small icon (techicons.js) that names it on the card
export const FAM_DEVICE = { beam: 'beam', gun: 'gun', missile: 'missile', drones: 'drones', armor: 'armor', shield: 'shield', reactor: 'reactor', drive: 'drive', thruster: 'thruster', computer: 'computer', sensors: 'sensors',
  fab: 'labor', farms: 'farms', farms_cold: 'farms_cold', farms_hot: 'farms_hot', farms_rad: 'farms_rad', homes: 'homes', works: 'works', labs: 'labs' };
export const FAM_ICON = { beam: 'damage', gun: 'pierce', missile: 'damage', drones: 'evasion', armor: 'armor', shield: 'shield', reactor: 'power', drive: 'reach', thruster: 'speed', computer: 'computing', sensors: 'sensors',
  fab: 'factory', farms: 'food', farms_cold: 'cold', farms_hot: 'heat', farms_rad: 'radiation', homes: 'homes', works: 'works', labs: 'labs' };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const DRAW_W = 200;                                   // drawn at this width, shown smaller (sharp when the tree is zoomed in)
const IMG = new Map(), queue = [];
let STOCK = null, STOCK_ID = null, loading = false, busy = false;
// the colour of a technology at this tier and quality (null: past violet — black with white outlines)
export const techColor = (gen, q = 1) => tierColor(tierLevel(gen, q));
// its seed: the one you chose (right-click), else its own
export const seedOf = (S, fam, gen) => { const k = fam + ':' + gen, own = (S.iconSeeds || {})[k]; return own ?? hash(k) % 100000; };
export function reseed(S, fam, gen) { S.iconSeeds = { ...(S.iconSeeds || {}), [fam + ':' + gen]: Math.floor(Math.random() * 1e9) }; }
const styleOf = S => (S.look && S.look.style) || 'greeble1';
function ensureStock(style) {
  if (STOCK && STOCK_ID === style) return true; if (loading && STOCK_ID === style) return false;
  STOCK_ID = style; STOCK = null; loading = true;
  stockOf(style).then(s => { if (STOCK_ID !== style) return; STOCK = s; loading = false; pump(); }).catch(e => { loading = false; console.warn('techart: no stock for', style, e); });
  return false;
}
// every picture on the page still waiting whose drawing is ready gets it
function fill() { for (const im of document.querySelectorAll('img.tart[data-devk]:not(.ready)')) { const url = IMG.get(im.dataset.devk); if (url) { im.src = url; im.classList.add('ready'); } } }
// draw what is asked, one at a time between frames — never inside the call that asked (its <img> is not on the page yet)
function pump() {
  if (busy || !STOCK) return; busy = true;
  const step = () => {
    const job = queue.shift(); if (!job) { busy = false; fill(); return; }
    if (!IMG.has(job.key)) {
      let url = '';
      try { url = drawDevice(job.dev, STOCK, { seed: job.seed, color: job.color, look: job.look, width: DRAW_W }).toDataURL(); } catch (e) { console.warn('techart: could not draw', job.dev, e); }
      IMG.set(job.key, url);
    }
    fill(); setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
// a technology's picture: fam, its tier (gen) and quality (q: the colour), its form (look: a component's barrels and trait), the width shown
export function techArt(S, { fam, gen, q = 1, look = null, w = 110, cls = '' }) {
  const dev = FAM_DEVICE[fam] || 'reactor', color = techColor(gen, q), seed = seedOf(S, fam, gen), style = styleOf(S);
  const key = [dev, seed, color ?? 'black', style, look ? [look.trait, look.len, look.thick, look.barrels, look.tubes].join(',') : ''].join('|'), url = IMG.get(key);
  if (url == null && !queue.some(j => j.key === key)) { queue.push({ key, dev, seed, color, look }); if (ensureStock(style)) pump(); }
  return `<img class="tart${url ? ' ready' : ''}${cls ? ' ' + cls : ''}" data-devk="${key.replace(/"/g, '&quot;')}" data-devfam="${fam}" data-devgen="${gen}" src="${url || BLANK}" style="width:${w}px" alt="" title="right-click: another shape" draggable="false">`;
}
