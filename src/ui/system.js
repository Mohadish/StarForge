// The star system. Only Home is settled for now; the other bodies are just there.
import { $, fmt, esc } from '../util.js';
import { S } from '../core/state.js';
import { planetStats } from '../core/economy.js';
import { go } from './nav.js';
import { row, card } from './common.js';

const BODIES = [
  { id: 'ember', name: 'Ember', r: 110, size: 7, color: '#d9825b', speed: 0.21, a0: 1.2, note: 'hot rocky world — not settled' },
  { id: 'home', name: 'Home', r: 195, size: 13, color: '#4fa3ff', speed: 0.12, a0: 0.3, note: 'your colony — click to open' },
  { id: 'belt', name: 'Asteroid belt', belt: true, r: 275, note: 'not surveyed' },
  { id: 'titan', name: 'Titan', r: 370, size: 22, color: '#c9a86b', speed: 0.05, a0: 3.9, note: 'gas giant — not settled' },
];
let raf = 0, hoverId = null;

const TPL = `
<div class="page" style="grid-template-columns:1fr 320px">
  <section style="padding:6px;position:relative"><canvas id="syCv" style="width:100%;height:100%"></canvas><div id="syHover" class="tiny" style="position:absolute;left:18px;top:14px"></div></section>
  <section><h2>Star system</h2><div id="sySide"></div></section>
</div>`;

export function mount(el) {
  el.innerHTML = TPL;
  const cv = $('syCv');
  cv.onmousemove = e => { hoverId = hit(cv, e); cv.style.cursor = hoverId === 'home' ? 'pointer' : 'default'; const b = BODIES.find(x => x.id === hoverId); $('syHover').innerHTML = b ? `<b>${b.name}</b> — ${b.note}` : ''; };
  cv.onclick = e => { if (hit(cv, e) === 'home') go('colony'); };
  const loop = t => { draw(t / 1000); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  refresh();
  return () => cancelAnimationFrame(raf);
}
export function refresh() {
  if (!$('sySide')) return;
  const p = planetStats(S), ships = S.instances.filter(i => i.kind === 'ship'), structs = S.instances.filter(i => i.kind === 'structure');
  $('sySide').innerHTML = card(`<div class="n" style="font-weight:800;margin-bottom:4px">Home</div>` + row('People', `${fmt(p.pop)} / ${fmt(p.housing)} M`) + row('Structures', structs.length)
      + row('Income', fmt(p.creditsOut) + ' cr / turn') + row('Research', fmt(p.rpOut) + ' RP / turn') + row('Ships in orbit', ships.length))
    + `<div class="tiny">${ships.map(s => esc(s.name)).join(', ') || 'No ships.'}</div>`
    + `<h2 style="margin-top:12px">Other bodies</h2><div class="tiny">Ember, the asteroid belt and Titan are not used yet.</div>`;
}

function layout(cv) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { cx: w / 2, cy: h / 2, k: Math.min(w, h) / 2 / 400 };
}
const pos = (b, L) => { const a = b.a0 + S.turn * b.speed; return { x: L.cx + Math.cos(a) * b.r * L.k, y: L.cy + Math.sin(a) * b.r * L.k }; };
function hit(cv, e) {
  const r = cv.getBoundingClientRect(), L = layout(cv), mx = e.clientX - r.left, my = e.clientY - r.top;
  for (const b of BODIES) {
    if (b.belt) { const d = Math.hypot(mx - L.cx, my - L.cy) / L.k; if (Math.abs(d - b.r) < 16) return b.id; continue; }
    const p = pos(b, L); if (Math.hypot(mx - p.x, my - p.y) < b.size * L.k + 8) return b.id;
  }
  return null;
}

function draw(time) {
  const cv = $('syCv'); if (!cv) return;
  const L = layout(cv), g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const grad = g.createRadialGradient(L.cx, L.cy, 4, L.cx, L.cy, 60 * L.k);
  grad.addColorStop(0, '#fff6c8'); grad.addColorStop(0.4, '#ffd06a'); grad.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(L.cx, L.cy, 60 * L.k, 0, 7); g.fill();
  for (const b of BODIES) {
    g.strokeStyle = b.id === hoverId ? 'rgba(170,210,255,.35)' : 'rgba(170,210,255,.10)';
    g.beginPath(); g.arc(L.cx, L.cy, b.r * L.k, 0, 7); g.stroke();
    if (b.belt) {
      g.fillStyle = '#8a8f9a';
      for (let i = 0; i < 160; i++) { const a = i * 2.399, rr = (b.r + ((i * 37) % 24) - 12) * L.k; g.fillRect(L.cx + Math.cos(a + time * 0.01) * rr, L.cy + Math.sin(a + time * 0.01) * rr, 1.6, 1.6); }
      continue;
    }
    const p = pos(b, L);
    g.fillStyle = b.color; g.beginPath(); g.arc(p.x, p.y, b.size * L.k, 0, 7); g.fill();
    g.fillStyle = b.id === 'home' ? '#e8f0ff' : '#9eb3d8'; g.font = (b.id === 'home' ? 'bold ' : '') + '12px sans-serif'; g.textAlign = 'center';
    g.fillText(b.name, p.x, p.y - b.size * L.k - 8);
    if (b.id === 'home') {
      g.strokeStyle = '#7ef3b0'; g.beginPath(); g.arc(p.x, p.y, b.size * L.k + 5, 0, 7); g.stroke();
      const ships = S.instances.filter(i => i.kind === 'ship');
      ships.forEach((s, i) => {
        const a = time * 0.6 + i * (Math.PI * 2 / ships.length), rr = b.size * L.k + 16 + (i % 3) * 5;
        const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr, h = a + Math.PI / 2;
        g.fillStyle = '#7ef3b0'; g.beginPath(); g.moveTo(x + Math.cos(h) * 5, y + Math.sin(h) * 5); g.lineTo(x + Math.cos(h + 2.5) * 4, y + Math.sin(h + 2.5) * 4); g.lineTo(x + Math.cos(h - 2.5) * 4, y + Math.sin(h - 2.5) * 4); g.fill();
      });
    }
  }
  g.textAlign = 'left';
}
