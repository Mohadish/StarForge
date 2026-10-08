// The four-cornered pyramid control: a ball inside a tetrahedron, drawn in 3D on a canvas.
//   drag the ball        move the focus (within what cohesion can pay for)
//   click a corner name  pull the ball one step toward that corner
//   drag empty space     rotate the pyramid to look at it from another side
import { CORNERS, posOf, weightsOf, limitMove } from './model.js';

export function createTetra(canvas, { labels, colors, getState, onChange }) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2 + 6, scale = Math.min(W, H) * 0.27;
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
    const { w, w0, reach } = getState();
    g.clearRect(0, 0, W, H);
    const C = CORNERS.map(scr), ball = scr(posOf(w)), start = scr(posOf(w0));
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
    // how far cohesion lets the ball travel this eon (a sphere, so a circle on screen)
    if (reach < 3) {
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
      g.beginPath(); g.arc(start.x, start.y, Math.max(2, reach * Math.sqrt(3) * scale), 0, 7); g.stroke(); g.setLineDash([]);
    }
    // the pull toward each corner
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = rgba(colors[i], 0.2 + 0.7 * w[i]); g.lineWidth = 1 + 7 * w[i];
      g.beginPath(); g.moveTo(ball.x, ball.y); g.lineTo(C[i].x, C[i].y); g.stroke();
    }
    // where the eon started
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(start.x, start.y, 6, 0, 7); g.stroke();
    if (Math.hypot(ball.x - start.x, ball.y - start.y) > 2) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(start.x, start.y); g.lineTo(ball.x, ball.y); g.stroke(); g.setLineDash([]); }
    // corners
    g.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      g.fillStyle = colors[i]; g.beginPath(); g.arc(C[i].x, C[i].y, 7, 0, 7); g.fill();
      const out = { x: C[i].x + (C[i].x - cx) * 0.16, y: C[i].y + (C[i].y - cy) * 0.16 };
      g.font = 'bold 13px sans-serif'; g.fillText(labels[i].toUpperCase(), out.x, out.y - 4);
      g.font = '12px sans-serif'; g.fillStyle = '#e8f0ff'; g.fillText(Math.round(w[i] * 100) + '%', out.x, out.y + 12);
    }
    // the ball, tinted by the mix
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < 4; i++) { const n = parseInt(colors[i].slice(1), 16); r += (n >> 16) * w[i]; gr += ((n >> 8) & 255) * w[i]; b += (n & 255) * w[i]; }
    g.shadowColor = `rgb(${r | 0},${gr | 0},${b | 0})`; g.shadowBlur = 18;
    g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`; g.beginPath(); g.arc(ball.x, ball.y, 11, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    canvas._hit = { C, ball };
  }

  function move(next) {
    const { w0, reach } = getState();
    onChange(limitMove(next, w0, reach));
    draw();
  }

  canvas.addEventListener('pointerdown', e => {
    const p = at(e), hit = canvas._hit; if (!hit) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId); last = p;
    if (Math.hypot(p.x - hit.ball.x, p.y - hit.ball.y) < 18) { mode = 'ball'; return; }
    const i = hit.C.findIndex(c => Math.hypot(p.x - (c.x + (c.x - cx) * 0.16), p.y - (c.y + (c.y - cy) * 0.16)) < 34 || Math.hypot(p.x - c.x, p.y - c.y) < 14);
    if (i >= 0) {                                      // pull one step toward that corner
      const { w } = getState(), P = posOf(w), V = CORNERS[i], d = Math.hypot(V[0] - P[0], V[1] - P[1], V[2] - P[2]) || 1, step = Math.min(d, 0.14);
      move(weightsOf(P.map((v, k) => v + (V[k] - v) * step / d)));
      mode = null; return;
    }
    mode = 'rotate';
  });
  canvas.addEventListener('pointermove', e => {
    const p = at(e);
    if (!mode) { const hit = canvas._hit; canvas.style.cursor = hit && Math.hypot(p.x - hit.ball.x, p.y - hit.ball.y) < 18 ? 'grab' : 'default'; return; }
    const dx = p.x - last.x, dy = p.y - last.y; last = p;
    if (mode === 'rotate') { yaw += dx * 0.01; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.01)); draw(); return; }
    const { w } = getState(), P = posOf(w), d = unrot([dx / scale, -dy / scale, 0]);
    move(weightsOf([P[0] + d[0], P[1] + d[1], P[2] + d[2]]));
  });
  const end = () => { mode = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  return { draw };
}
