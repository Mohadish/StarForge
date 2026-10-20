// The four-cornered pyramid control: a ball inside a tetrahedron, drawn in 3D on a canvas.
//   drag the ball        move the focus (within what cohesion can pay for)
//   click a corner name  pull the ball one step toward that corner
//   double-click the ball   back to the centre — a quarter each (his ask, 2026-10-20)
//   click an edge        the middle of it: half and half of its two corners (his ask, 2026-10-20: "50 % food, 50 % housing")
//   drag empty space     rotate the pyramid to look at it from another side
import { CORNERS, CENTER, posOf, weightsOf, limitMove } from './tetramath.js';
// optional state (a colony's development focus, 2026-10-20): eff = where the wish lands once the fillet has cut the corners (a solid
// ball; the wish is then a hollow ring), caps = each corner's most it may have (the cut face drawn), off = corners out of reach

export function createTetra(canvas, { labels, colors, getState, onChange, onRelease = null }) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2 + 6, small = W < 400, scale = Math.min(W, H) * (small ? 0.22 : 0.27), F = small ? 11 : 13;   // a small canvas (a colony's): smaller letters
  // start almost along the axis through two opposite edges: all four corners sit apart, like the
  // corners of a square, with just enough tilt to read it as a solid
  let yaw = 0.3, pitch = 0.2, mode = null, last = null;

  const rot = p => {                                  // world → view
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = p[0] * cyw + p[2] * syw, z1 = -p[0] * syw + p[2] * cyw;
    return [x, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
  };
  const unrot = v => {                                // view → world
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp;
    return [v[0] * cyw - z1 * syw, y, v[0] * syw + z1 * cyw];
  };
  const scr = p => { const v = rot(p); return { x: cx + v[0] * scale, y: cy - v[1] * scale, z: v[2] }; };
  const at = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function draw() {
    const { w, w0, reach, eff = null, caps = null, off = null } = getState();
    g.clearRect(0, 0, W, H);
    const C = CORNERS.map(scr), wish = scr(posOf(w)), ball = eff ? scr(posOf(eff)) : wish, start = scr(posOf(w0)), shown = eff || w;
    // faces, very faint, back to front
    const faces = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].map(f => ({ f, z: (C[f[0]].z + C[f[1]].z + C[f[2]].z) / 3 })).sort((a, b) => a.z - b.z);
    for (const { f } of faces) {
      g.beginPath(); g.moveTo(C[f[0]].x, C[f[0]].y); g.lineTo(C[f[1]].x, C[f[1]].y); g.lineTo(C[f[2]].x, C[f[2]].y); g.closePath();
      g.fillStyle = 'rgba(140,180,240,.035)'; g.fill();
    }
    // edges: nearer ones brighter
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const z = (C[i].z + C[j].z) / 2, a = 0.22 + 0.3 * (z + 1.8) / 3.6;
      g.strokeStyle = `rgba(190,215,255,${a.toFixed(2)})`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(C[i].x, C[i].y); g.lineTo(C[j].x, C[j].y); g.stroke();
    }
    // THE CUTS: a corner capped below 100 % is sliced off — the face where its weight reaches the cap, tinted in its colour
    if (caps) for (let i = 0; i < 4; i++) { const c = caps[i]; if (!(c < 0.995)) continue; const P = [0, 1, 2, 3].filter(j => j !== i).map(j => scr(CORNERS[i].map((v, k) => c * v + (1 - c) * CORNERS[j][k])));
      g.beginPath(); g.moveTo(P[0].x, P[0].y); g.lineTo(P[1].x, P[1].y); g.lineTo(P[2].x, P[2].y); g.closePath(); g.fillStyle = rgba(colors[i], 0.16); g.fill(); g.setLineDash([3, 3]); g.strokeStyle = rgba(colors[i], 0.7); g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
    // how far cohesion lets the ball travel this eon (a sphere, so a circle on screen)
    if (reach < 3) {
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
      g.beginPath(); g.arc(start.x, start.y, Math.max(2, reach * Math.sqrt(3) * scale), 0, 7); g.stroke(); g.setLineDash([]);
    }
    // the pull toward each corner
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = rgba(colors[i], 0.2 + 0.7 * shown[i]); g.lineWidth = 1 + 7 * shown[i];
      g.beginPath(); g.moveTo(ball.x, ball.y); g.lineTo(C[i].x, C[i].y); g.stroke();
    }
    // where the eon started
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(start.x, start.y, 6, 0, 7); g.stroke();
    if (Math.hypot(ball.x - start.x, ball.y - start.y) > 2) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(start.x, start.y); g.lineTo(ball.x, ball.y); g.stroke(); g.setLineDash([]); }
    // corners
    g.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = off && off[i] ? 0.35 : 1; g.fillStyle = colors[i]; g.beginPath(); g.arc(C[i].x, C[i].y, 7, 0, 7); g.fill();
      // THE LABEL (his note, 2026-10-20: "the percentage sits right over the dot"): a two-line block wholly ABOVE the corner's dot when
      // the corner is in the upper half, wholly BELOW it in the lower half (flipped when it would leave the canvas), centred on the dot,
      // kept inside the canvas, the letters outlined dark so they read over the lines
      const name = labels[i].toUpperCase(), val = off && off[i] ? (typeof off[i] === 'string' ? off[i] : 'out') : Math.round(shown[i] * 100) + '%' + (caps && caps[i] < 0.995 ? ` · max ${Math.round(caps[i] * 100)}%` : '');
      g.font = `bold ${F}px sans-serif`; const w1 = g.measureText(name).width; g.font = `${F - 1}px sans-serif`; const w2 = g.measureText(val).width, bw = Math.max(w1, w2), bh = 2 * F + 2, gap = 10;
      let below = C[i].y > cy; if (below && C[i].y + gap + bh > H - 2) below = false; if (!below && C[i].y - gap - bh < 2) below = true;
      const top = below ? C[i].y + gap : C[i].y - gap - bh, tx = Math.max(bw / 2 + 3, Math.min(W - bw / 2 - 3, C[i].x));
      g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(6,10,20,.9)';
      g.font = `bold ${F}px sans-serif`; g.strokeText(name, tx, top + F - 1); g.fillStyle = colors[i]; g.fillText(name, tx, top + F - 1);
      g.font = `${F - 1}px sans-serif`; g.strokeText(val, tx, top + 2 * F + 1); g.fillStyle = '#e8f0ff'; g.fillText(val, tx, top + 2 * F + 1); g.lineWidth = 1; g.globalAlpha = 1;
    }
    // the ball, tinted by the mix
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < 4; i++) { const n = parseInt(colors[i].slice(1), 16); r += (n >> 16) * w[i]; gr += ((n >> 8) & 255) * w[i]; b += (n & 255) * w[i]; }
    g.shadowColor = `rgb(${r | 0},${gr | 0},${b | 0})`; g.shadowBlur = 18;
    g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`; g.beginPath(); g.arc(ball.x, ball.y, 11, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    if (eff && Math.hypot(wish.x - ball.x, wish.y - ball.y) > 2) { g.setLineDash([2, 3]); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(wish.x, wish.y); g.lineTo(ball.x, ball.y); g.stroke(); g.setLineDash([]); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(wish.x, wish.y, 8, 0, 7); g.stroke(); }   // the wish, held back by a cut
    canvas._hit = { C, ball: wish, eff: ball };
  }

  function move(next) {
    const { w0, reach } = getState();
    onChange(limitMove(next, w0, reach));
    draw();
  }
  // one step toward corner i (a corner's name, or the page's + button): at the cost of the other three
  function pull(i) {
    const { w } = getState(), P = posOf(w), V = CORNERS[i], d = Math.hypot(V[0] - P[0], V[1] - P[1], V[2] - P[2]) || 1, step = Math.min(d, 0.14);
    move(weightsOf(P.map((v, k) => v + (V[k] - v) * step / d)));
  }

  canvas.addEventListener('pointerdown', e => {
    const p = at(e), hit = canvas._hit; if (!hit) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId); last = p;
    if (Math.hypot(p.x - hit.ball.x, p.y - hit.ball.y) < 18 || Math.hypot(p.x - hit.eff.x, p.y - hit.eff.y) < 14) { mode = 'ball'; return; }
    const i = hit.C.findIndex(c => Math.hypot(p.x - (c.x + (c.x - cx) * 0.16), p.y - (c.y + (c.y - cy) * 0.16)) < 34 || Math.hypot(p.x - c.x, p.y - c.y) < 14);
    if (i >= 0) { pull(i); mode = null; return; }      // pull one step toward that corner
    const seg = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (seg(hit.C[a], hit.C[b]) < 7) { const w = [0, 0, 0, 0]; w[a] = 0.5; w[b] = 0.5; move(w); mode = null; if (onRelease) onRelease(); return; }   // an EDGE: half and half
    mode = 'rotate';
  });
  canvas.addEventListener('pointermove', e => {
    const p = at(e);
    if (!mode) { const hit = canvas._hit; canvas.style.cursor = hit && (Math.hypot(p.x - hit.ball.x, p.y - hit.ball.y) < 18 || Math.hypot(p.x - hit.eff.x, p.y - hit.eff.y) < 14) ? 'grab' : 'default'; return; }
    const dx = p.x - last.x, dy = p.y - last.y; last = p;
    if (mode === 'rotate') { yaw += dx * 0.01; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.01)); draw(); return; }
    const { w } = getState(), P = posOf(w), d = unrot([dx / scale, -dy / scale, 0]);
    move(weightsOf([P[0] + d[0], P[1] + d[1], P[2] + d[2]]));
  });
  const end = () => { if (mode === 'ball' && onRelease) onRelease(); mode = null; };
  canvas.addEventListener('dblclick', e => {           // DOUBLE-CLICK THE BALL: back to the centre (as far as a reach allows)
    const p = at(e), hit = canvas._hit; if (!hit) return;
    if (Math.hypot(p.x - hit.ball.x, p.y - hit.ball.y) < 20 || Math.hypot(p.x - hit.eff.x, p.y - hit.eff.y) < 16) { move(CENTER.slice()); if (onRelease) onRelease(); }
  });
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  return { draw, pull, to: w => move(w) };            // to(w): the page's reset — back to the centre, as far as the reach allows
}
