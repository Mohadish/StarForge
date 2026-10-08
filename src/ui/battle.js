// Battle test: a ship design (or a built ship) against a reference opponent. Nothing is lost here.
// Energy is throughput: the reactor makes X MW, every system draws from it, shortfalls slow everything.
import { $, clamp, fmt, esc } from '../util.js';
import { CATS } from '../data/categories.js';
import { S, bp } from '../core/state.js';
import { assemblyStats, partDims } from '../core/assembly.js';
import { CELL_U, DRAG, TURN_K } from '../core/physics.js';
import { ENEMIES } from '../data/enemies.js';
import { row, card } from './common.js';

const ARENA = { w: 1200, h: 720 };
const L = id => bp(id);
let enemyId = 'warden', pick = null, speed = 1, B = null, raf = 0, last = 0;

const TPL = `
<div class="page" style="grid-template-columns:260px 1fr">
  <section>
    <h2>Your ship</h2><select id="btShip" style="width:100%"></select>
    <div class="tiny" id="btShipInfo" style="margin:6px 0 10px"></div>
    <h2>Opponent</h2><div id="btEnemies"></div>
    <div style="display:flex;gap:6px;margin:8px 0"><button class="go" id="btRun">Run battle</button><button id="btSpd">speed ×1</button></div>
    <h2>Result</h2><div id="btResult" class="tiny">—</div>
  </section>
  <section style="padding:6px"><canvas id="btCv" width="1000" height="600" style="width:100%"></canvas></section>
</div>`;

export function mount(el) {
  el.innerHTML = TPL;
  $('btShip').onchange = e => { pick = e.target.value; B = null; renderPick(); };
  $('btRun').onclick = start;
  $('btSpd').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('btSpd').textContent = 'speed ×' + speed; };
  el.addEventListener('click', e => { const t = e.target.closest('[data-enemy]'); if (t) { enemyId = t.dataset.enemy; B = null; renderEnemies(); } });
  $('btSpd').textContent = 'speed ×' + speed;
  refresh();
  last = performance.now();
  const loop = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; for (let i = 0; i < speed; i++) step(dt); draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
export function refresh() { if (!$('btShip')) return; renderPick(); renderEnemies(); }

function options() {
  return [...S.designs.filter(d => d.kind === 'ship').map(d => ({ key: 'd:' + d.id, name: 'Design: ' + d.name, asm: d })),
          ...S.instances.filter(i => i.kind === 'ship').map(i => ({ key: 'i:' + i.id, name: 'Built: ' + i.name, asm: i }))];
}
function chosen() { const o = options(); return o.find(x => x.key === pick) || o[0] || null; }
function renderPick() {
  const o = options(), c = chosen();
  if (c) pick = c.key;
  $('btShip').innerHTML = o.map(x => `<option value="${x.key}" ${c && x.key === c.key ? 'selected' : ''}>${esc(x.name)}</option>`).join('') || '<option>no ship designs</option>';
  if (!c) { $('btShipInfo').textContent = 'Design a ship in the Shipyard first.'; return; }
  const t = assemblyStats(c.asm, L);
  $('btShipInfo').innerHTML = `${fmt(t.mass)} t · top ${fmt(t.top)} u/s · turn ${fmt(t.turnRate)} °/s<br>${fmt(t.dps)} HP/s · reach ${t.maxRange} u · ${fmt(t.totalHP)} HP`;
}
function renderEnemies() {
  $('btEnemies').innerHTML = Object.entries(ENEMIES).map(([id, e]) => `<div class="bp ${enemyId === id ? 'sel' : ''}" data-enemy="${id}" style="border-left-color:${e.color}"><div class="n"><span>${e.name}</span></div>
    <div class="tiny">${e.note}</div><div class="tiny">${e.mass} t · top ${fmt(e.thrust / e.mass / DRAG)} u/s · ${fmt(e.weapons.reduce((a, w) => a + w.dmg * w.rate, 0))} HP/s at ${e.weapons[0].range} u · ${e.shield.cap + e.armorHP + e.structHP} HP</div></div>`).join('');
}

function fighter(sp, x, y, h, isPlayer, parts) {
  const mass = sp.mass || 1;
  return { sp, parts, isPlayer, x, y, vx: 0, vy: 0, h, mass, accel: sp.thrust / mass, turnRate: sp.turn / mass * TURN_K,
    shield: sp.shield.cap, armor: sp.armorHP, struct: sp.structHP, buffer: sp.buffer, sinceHit: 99, scale: 1,
    weapons: sp.weapons.map(w => ({ ...w, charge: 0 })), maxRange: sp.weapons.reduce((a, w) => Math.max(a, w.range), 0), dealt: 0, starved: 0, shots: 0 };
}
function start() {
  const c = chosen();
  if (!c) { $('btResult').innerHTML = '<span class="up">Design a ship in the Shipyard first.</span>'; return; }
  const t = assemblyStats(c.asm, L);
  if (!t.parts) { $('btResult').innerHTML = '<span class="up">That design is empty.</span>'; return; }
  const e = ENEMIES[enemyId];
  B = { t: 0, over: null, beams: [], a: fighter(t, 250, ARENA.h / 2, 0, true, c.asm.parts), b: fighter(e, ARENA.w - 250, ARENA.h / 2, Math.PI, false, null) };
  $('btResult').textContent = 'fighting…';
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function hit(t, dmg) {
  t.sinceHit = 0;
  const s = Math.min(t.shield, dmg); t.shield -= s; dmg -= s;
  if (dmg <= 0) return;
  if (t.armor > 0) { const eff = Math.max(dmg - t.sp.dr, dmg * 0.15); t.armor -= eff; if (t.armor < 0) { t.struct += t.armor; t.armor = 0; } }
  else t.struct -= dmg;
}
function stepFighter(f, o, dt) {
  const sp = f.sp, dx = o.x - f.x, dy = o.y - f.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const want = f.maxRange ? f.maxRange * 0.85 : 300;
  let targetH = ang, throttle;
  if (sp.behavior === 'orbit' && dist < want * 1.15) { targetH = ang + 1.4; throttle = 1; } else throttle = dist > want ? 1 : dist < want * 0.6 ? -0.5 : 0;
  const out = sp.powerOut * clamp(B.t / Math.max(0.1, sp.ramp || 0.1), 0.2, 1), dh = wrap(targetH - f.h), turning = Math.abs(dh) > 0.02;
  const recharging = f.shield < sp.shield.cap && f.sinceHit > sp.shield.delay, inFight = dist < f.maxRange * 1.3;
  let demand = (sp.civDraw || 0) + sp.engineDraw * (Math.abs(throttle) * 0.75 + (turning ? 0.25 : 0)) + (recharging ? sp.shield.draw : sp.shield.draw * 0.1);
  for (const w of f.weapons) if (inFight && w.charge < w.draw / w.rate) demand += w.draw;
  let scale = 1;
  if (demand <= out) f.buffer = Math.min(sp.buffer, f.buffer + (out - demand) * dt);
  else { const need = (demand - out) * dt; if (f.buffer >= need) f.buffer -= need; else { scale = (out + f.buffer / dt) / demand; f.buffer = 0; } }
  f.scale = scale; if (scale < 0.98) f.starved += dt;
  const tr = f.turnRate * Math.PI / 180 * dt * scale;
  f.h = wrap(f.h + clamp(dh, -tr, tr));
  const acc = f.accel * throttle * scale;
  f.vx += Math.cos(f.h) * acc * dt; f.vy += Math.sin(f.h) * acc * dt; f.vx *= (1 - DRAG * dt); f.vy *= (1 - DRAG * dt);
  f.x = clamp(f.x + f.vx * dt, 30, ARENA.w - 30); f.y = clamp(f.y + f.vy * dt, 30, ARENA.h - 30);
  f.sinceHit += dt;
  if (recharging) f.shield = Math.min(sp.shield.cap, f.shield + sp.shield.regen * scale * dt);
  for (const w of f.weapons) {
    const E = w.draw / w.rate;
    if (inFight && w.charge < E) w.charge += w.draw * scale * dt;
    if (w.charge >= E && w.dmg > 0 && dist <= w.range && Math.abs(wrap(ang - f.h)) <= (w.arc / 2) * Math.PI / 180) {
      w.charge = 0; hit(o, w.dmg); f.dealt += w.dmg; f.shots++;
      B.beams.push({ x1: f.x, y1: f.y, x2: o.x, y2: o.y, life: 0.12, col: f.isPlayer ? '#a8f0ff' : sp.color });
    }
  }
}
function step(dt) {
  if (!B || B.over) return;
  B.t += dt; stepFighter(B.a, B.b, dt); stepFighter(B.b, B.a, dt);
  for (const b of B.beams) b.life -= dt;
  B.beams = B.beams.filter(b => b.life > 0);
  if (B.a.struct <= 0 || B.b.struct <= 0 || B.t > 150) {
    B.over = B.b.struct <= 0 && B.a.struct > 0 ? 'WIN' : B.a.struct <= 0 ? 'LOSE' : 'DRAW';
    const a = B.a, b = B.b, col = B.over === 'WIN' ? 'down' : B.over === 'LOSE' ? 'up' : '';
    const left = f => `${fmt(Math.max(0, f.shield))} / ${fmt(Math.max(0, f.armor))} / ${fmt(Math.max(0, f.struct))}`;
    $('btResult').innerHTML = `<div class="${col}" style="font-size:22px;font-weight:900">${B.over}</div><div>after ${B.t.toFixed(1)} s vs ${b.sp.name}</div>`
      + card(row('You dealt', `${fmt(a.dealt)} HP in ${a.shots} shots`) + row('You took', fmt(b.dealt) + ' HP') + row('Your shield / armor / structure', left(a))
      + row('Its shield / armor / structure', left(b)) + row('Time short of power', `${a.starved.toFixed(1)} s (${Math.round(100 * a.starved / B.t)}%)`, a.starved > 1 ? 'up' : ''));
  }
}

function draw() {
  const cv = $('btCv'); if (!cv) return;
  const g = cv.getContext('2d'), k = cv.width / ARENA.w;
  g.clearRect(0, 0, cv.width, cv.height);
  g.strokeStyle = 'rgba(130,180,230,.06)';
  for (let x = 0; x < ARENA.w; x += 100) { g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, ARENA.h * k); g.stroke(); }
  for (let y = 0; y < ARENA.h; y += 100) { g.beginPath(); g.moveTo(0, y * k); g.lineTo(ARENA.w * k, y * k); g.stroke(); }
  if (!B) { g.fillStyle = '#9eb3d8'; g.font = '14px sans-serif'; g.fillText('Pick your ship and an opponent, then press Run battle.', 30, 40); return; }
  for (const f of [B.a, B.b]) { g.strokeStyle = f.isPlayer ? 'rgba(126,243,176,.18)' : 'rgba(255,123,123,.18)'; g.beginPath(); g.arc(f.x * k, f.y * k, f.maxRange * k, 0, 7); g.stroke(); }
  for (const b of B.beams) { g.strokeStyle = b.col; g.lineWidth = 2.5; g.globalAlpha = b.life / 0.12; g.beginPath(); g.moveTo(b.x1 * k, b.y1 * k); g.lineTo(b.x2 * k, b.y2 * k); g.stroke(); g.globalAlpha = 1; g.lineWidth = 1; }
  for (const f of [B.a, B.b]) {
    g.save(); g.translate(f.x * k, f.y * k); g.rotate(f.h);
    if (f.parts) {
      const ex = 2.2 * k * CELL_U;
      let cx = 0, cy = 0, n = 0;
      for (const p of f.parts) { const d = partDims(p, L); cx += (p.x + d.w / 2) * d.w * d.h; cy += (p.y + d.h / 2) * d.w * d.h; n += d.w * d.h; }
      cx /= n || 1; cy /= n || 1;
      for (const p of f.parts) { const b = L(p.bp); if (!b) continue; const d = partDims(p, L); g.fillStyle = CATS[b.cat].color; g.fillRect((p.x - cx) * ex, (p.y - cy) * ex, d.w * ex - 0.5, d.h * ex - 0.5); }
    } else {
      const r = Math.sqrt(f.mass) * 1.5 * k;
      g.fillStyle = f.sp.color; g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.8, r * 0.7); g.lineTo(-r * 0.4, 0); g.lineTo(-r * 0.8, -r * 0.7); g.closePath(); g.fill();
    }
    g.restore();
    if (f.shield > 1) { g.strokeStyle = `rgba(207,137,255,${0.25 + 0.6 * f.shield / Math.max(1, f.sp.shield.cap)})`; g.lineWidth = 2; g.beginPath(); g.arc(f.x * k, f.y * k, (Math.sqrt(f.mass) * 1.9 + 6) * k, 0, 7); g.stroke(); g.lineWidth = 1; }
    const bx = f.x * k - 40, by = f.y * k - (Math.sqrt(f.mass) * 2 + 22) * k;
    [[f.shield, f.sp.shield.cap, '#cf89ff'], [f.armor, f.sp.armorHP, '#c9d4e8'], [f.struct, f.sp.structHP, '#7ef3b0']].forEach(([v, m, col], i) => {
      g.fillStyle = '#ffffff1c'; g.fillRect(bx, by + i * 6, 80, 4);
      if (m > 0) { g.fillStyle = col; g.fillRect(bx, by + i * 6, 80 * clamp(v / m, 0, 1), 4); }
    });
    g.fillStyle = '#e8f0ff'; g.font = '11px sans-serif'; g.fillText(f.isPlayer ? 'YOU' : f.sp.name, bx, by - 5);
    if (f.scale < 0.98) { g.fillStyle = '#ff7979'; g.fillText('LOW POWER ' + Math.round(f.scale * 100) + '%', bx + 34, by - 5); }
  }
  g.fillStyle = '#9eb3d8'; g.font = '12px sans-serif'; g.fillText('t = ' + B.t.toFixed(1) + ' s     bars: shield / armor / structure', 12, 18);
  if (B.over) { g.fillStyle = B.over === 'WIN' ? '#7ef3b0' : B.over === 'LOSE' ? '#ff7979' : '#ffd26a'; g.font = 'bold 44px sans-serif'; g.fillText(B.over, cv.width / 2 - 60, 60); }
}
