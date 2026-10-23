// THE LITTLE ICONS FOR THE TEXT (his ask, 2026-10-23: "this visual flavour is really important for these kinds of games"): one
// line-drawn symbol per kind of benefit — damage, range, shields, food, cold… — as inline SVG, so a line of text like "⚔ +18 %
// damage" carries a crisp, coloured mark at any size. 24 × 24 drawing, stroked in currentColor (the caller's colour), some shapes
// lightly filled. icon(name, { color, size }) → an <svg> string; ICON_COLOR gives each its usual colour.
const P = (d, o = '') => `<path d="${d}"${o}/>`, C = (cx, cy, r, o = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${o}/>`, F = ' fill="currentColor" fill-opacity=".25"', S = ' fill="currentColor" stroke="none"';
const gear = (cx, cy, r, n = 8) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a0 = (i / (n * 2)) * Math.PI * 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2, R = i % 2 ? r * 0.78 : r; d += `${i ? 'L' : 'M'}${(cx + R * Math.cos(a0)).toFixed(2)} ${(cy + R * Math.sin(a0)).toFixed(2)}L${(cx + R * Math.cos(a1)).toFixed(2)} ${(cy + R * Math.sin(a1)).toFixed(2)}`; } return d + 'Z'; };
const trefoil = (cx, cy) => { let d = ''; for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 3, a0 = a - 0.5, a1 = a + 0.5, r0 = 3, r1 = 9; d += `M${(cx + r0 * Math.cos(a0)).toFixed(2)} ${(cy + r0 * Math.sin(a0)).toFixed(2)}L${(cx + r1 * Math.cos(a0)).toFixed(2)} ${(cy + r1 * Math.sin(a0)).toFixed(2)}A${r1} ${r1} 0 0 1 ${(cx + r1 * Math.cos(a1)).toFixed(2)} ${(cy + r1 * Math.sin(a1)).toFixed(2)}L${(cx + r0 * Math.cos(a1)).toFixed(2)} ${(cy + r0 * Math.sin(a1)).toFixed(2)}Z`; } return d; };
const SHIELD = 'M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z';
export const ICONS = {
  damage:   P('M12 2l2.2 5.6L20 6l-3.4 4.9L22 13l-5.8 1.1L17 20l-5-3.3L7 20l.8-5.9L2 13l5.4-2.1L4 6l5.8 1.6z', F),
  range:    C(17, 12, 4) + C(17, 12, 1.3, S) + P('M2 12h9M8 9l3 3-3 3'),
  rate:     C(12, 13.5, 7.5) + P('M12 13.5V9.5M10 2.5h4M12 2.5V6M18.3 6.7l1.6-1.6'),
  accuracy: C(12, 12, 7) + P('M12 2v5M12 17v5M2 12h5M17 12h5') + C(12, 12, 1.5, S),
  shield:   P(SHIELD, F),
  recovery: P(SHIELD) + P('M12 8v7M8.5 11.5h7'),
  drain:    P(SHIELD) + P('M13 6.5l-3.2 5.2h3l-1.3 5.3 3.4-6.2h-3z', S),
  armor:    P('M3 7l9-4 9 4-9 4z', F) + P('M3 12l9 4 9-4M3 17l9 4 9-4'),
  pierce:   P('M3 12l9 4 9-4M3 17l9 4 9-4') + P('M12 2v13M9 12l3 3 3-3'),
  hull:     P('M2 14l4-4h9l7 3.5L15 17H6z', F) + P('M9 10V7h4l2 3'),
  speed:    P('M9 12h11M15 7l5 5-5 5M3 8h6M4 12h3M3 16h6'),
  reach:    P('M3 20c4-9 9-14 15-16', ' stroke-dasharray="2 2.6"') + P('M19 1.6l1.1 2.5 2.6.3-2 1.8.6 2.6-2.3-1.4-2.3 1.4.6-2.6-2-1.8 2.6-.3z', S),
  evasion:  P('M3 18l5-6 4 4 6-9M14 7h4v4'),
  power:    P('M13 2L5 13h6l-1 9 8-11h-6z', F),
  storage:  `<rect x="3" y="7" width="16" height="10" rx="2"/>` + P('M21 10v4M7 10v4M11 10v4'),
  sensors:  P('M5 16a8 8 0 0 0 11-11z', F) + P('M10.5 10.5L18 3M16 3h2v2M7 21h7M10.5 16v5'),
  computing:`<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"${S}/>` + P('M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4'),
  food:     P('M12 22V7') + P('M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zm0 0c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2-1-3.5-2.5-3.5-4.5 2 .5 3.5 2 3.5 4.5zm0 0c2-1 3.5-2.5 3.5-4.5-2 .5-3.5 2-3.5 4.5zM12 18c-2-1-3.5-2.5-3.5-4.5 2 .5 3.5 2 3.5 4.5zm0 0c2-1 3.5-2.5 3.5-4.5-2 .5-3.5 2-3.5 4.5z', F),
  homes:    P('M3 11l9-7 9 7M5 9.5V20h14V9.5', F) + P('M10 20v-5h4v5'),
  works:    P(gear(12, 12, 9.5), F) + C(12, 12, 3),
  labs:     P('M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3') + P('M7 15.5h10l1.6 2.9a1 1 0 0 1-.9 1.6H6.3a1 1 0 0 1-.9-1.6z', S),
  cold:     P('M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.6l3 2.4 3-2.4M9 20.4l3-2.4 3 2.4M3.4 10.6l3.6-.6-1.4-3.4M20.6 13.4l-3.6.6 1.4 3.4M3.4 13.4l3.6.6-1.4 3.4M20.6 10.6l-3.6-.6 1.4-3.4'),
  heat:     P('M12 22c4 0 7-3 7-7 0-4-3-6-4-10-1 2-2 3-3 3 0-2-1-4-3-6 0 4-4 6-4 12 0 5 3 8 7 8z', F),
  radiation:P(trefoil(12, 12), F) + C(12, 12, 1.6, S),
  water:    P('M12 3c3 4.5 6 8 6 11.5a6 6 0 0 1-12 0C6 11 9 7.5 12 3z', F),
  cost:     P('M3 12.5l9.5-9.5H21v8.5L11.5 21z', F) + C(16.5, 7.5, 1.4, S),
  upkeep:   P('M20.5 6.5a4.5 4.5 0 0 1-6 4.2L7 18.2a2 2 0 1 1-2.8-2.8l7.5-7.5A4.5 4.5 0 0 1 17 2.6l-2.6 2.6.9 2.6 2.6.9z', F),
  growth:   C(8, 7, 3) + P('M3 20c0-4 2.5-6.5 5-6.5s5 2.5 5 6.5M17 20V9M14 12l3-3 3 3'),
  emp:      C(12, 12, 9.5, ' stroke-dasharray="3 2.5"') + P('M13 5.5l-3.6 6h3.2l-1.4 6.5 4-7.2h-3.3z', S),
  heatsink: P('M5 20V8M9 20V5M13 20V8M17 20V5M3 20h17'),
};
export const ICON_COLOR = {
  damage: '#ff6b5b', range: '#ffb347', rate: '#ffd84f', accuracy: '#ffd84f', shield: '#6db7ff', recovery: '#6db7ff', drain: '#b06bff', armor: '#c9a27a', pierce: '#ff9f43',
  hull: '#c9cfdb', speed: '#5fe0b4', reach: '#7fd8ff', evasion: '#5fe0b4', power: '#ffd84f', storage: '#ffd84f', sensors: '#7fd8ff', computing: '#4fa3ff',
  food: '#8fd16a', homes: '#f5a3c7', works: '#ffb347', labs: '#4fa3ff', cold: '#bfe6ff', heat: '#ff7a59', radiation: '#d7ff4f', water: '#4fa3ff', cost: '#ffd26a', upkeep: '#c9cfdb', growth: '#8fd16a', emp: '#b06bff', heatsink: '#ff7a59',
};
export function icon(name, { color = ICON_COLOR[name] || 'currentColor', size = 18, title = '' } = {}) {
  const body = ICONS[name]; if (!body) return '';
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${color};vertical-align:-0.2em">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}
// a benefit as a chip: the icon, the number, the word ("⚔ +18 % damage")
export const benefit = (name, pct, word, { big = false } = {}) => `<span class="bnf${big ? ' big' : ''}" style="--bc:${ICON_COLOR[name] || '#ccc'}">${icon(name, { size: big ? 22 : 16 })}<b>${pct > 0 ? '+' : ''}${pct} %</b> ${word}</span>`;
