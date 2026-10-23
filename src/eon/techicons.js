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
// THE COLONY'S DISTRICTS AS ICONS (his ask, 2026-10-23): a building per district, its kind's colour — strong when people are in it,
// faint when it stands empty — with who is in it on a badge: a person (bust) in a home, a hard hat on a farm, a works or a lab.
// fill 0..1: how full (a badge at half strength when partly); built < 1: a district still going up (dashed). Placeholders.
const BUILDING = {
  home:  'M3 11.5l7.5-6.5 7.5 6.5V20H3z',
  city:  'M2 20V9h4v11M7 20V5h5v15M13 20v-9h5v9',
  farm:  'M2 19c3-2.5 6-3.5 9-3.5s6 1 9 3.5M2 15.5c3-2 6-3 9-3s6 1 9 3M3 12c2.6-1.6 5.4-2.4 8-2.4s5.4.8 8 2.4',
  works: 'M2 20V11l5 3v-3l5 3v-3l5 3V5h3v15z',
  lab:   'M3 20v-3a8 8 0 0 1 16 0v3zM11 9V4M9 4h4',
};
const BADGE = {
  bust: c => `<circle cx="17" cy="17" r="6.6" fill="#0b1222"/><circle cx="17" cy="14.9" r="2" fill="${c}"/><path d="M13.3 21.2c.5-2.1 1.9-3.3 3.7-3.3s3.2 1.2 3.7 3.3" fill="${c}"/>`,
  hat:  c => `<circle cx="17" cy="17" r="6.6" fill="#0b1222"/><path d="M12.6 19.1h8.8" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M13.6 18.6a3.4 3.4 0 0 1 6.8 0z" fill="${c}"/><path d="M17 15.2v-1" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`,
};
// old: behind the newest tech — an amber ⬆ in the corner (refit: 0..1 while the builders refit it — the arrow white, the outline dashed)
export function slotIcon(kind, col, { fill = 0, built = 1, badge = null, badgeCol = '#fff', size = 20, title = '', old = false, refit = null } = {}) {
  const d = BUILDING[kind]; if (!d) return '';
  const solid = kind === 'farm' ? '' : ` fill="${col}" fill-opacity="${fill > 0.01 ? 0.85 : 0.22}"`, dash = built < 0.999 || refit != null ? ' stroke-dasharray="2 1.6"' : '';
  const b = badge && fill > 0.01 ? `<g opacity="${fill >= 0.999 ? 1 : 0.55}">${BADGE[badge](badgeCol)}</g>` : '';
  const up = old || refit != null ? `<circle cx="5.6" cy="5.6" r="4.8" fill="#0b1222" stroke="none"/><path d="M5.6 8.4V3.2M3.4 5.3l2.2-2.2 2.2 2.2" stroke="${refit != null ? '#fff' : '#ffb347'}" stroke-width="1.7"/>` : '';
  return `<svg class="slot" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${title ? `<title>${title}</title>` : ''}<path d="${d}"${solid}${dash}${kind === 'farm' ? ` stroke-opacity="${fill > 0.01 ? 1 : 0.4}"` : ''}/>${b}${up}</svg>`;
}
// a worker or a person on his own: a hard hat with no building (works past the jobs, at half), a head with nothing on it (does not work)
export function personIcon(kind, col, { size = 18, title = '' } = {}) {
  const body = kind === 'hat' ? `<path d="M5 15h14" stroke-width="2"/><path d="M6.5 14.5a5.5 5.5 0 0 1 11 0z" fill="${col}"/><path d="M12 9V7.6"/><path d="M8 18.5c1-1.6 2.4-2.3 4-2.3s3 .7 4 2.3"/>` : `<circle cx="12" cy="8.5" r="3.4" fill="${col}" fill-opacity=".35"/><path d="M5.5 20c.9-3.6 3.3-5.5 6.5-5.5s5.6 1.9 6.5 5.5" fill="${col}" fill-opacity=".35"/>`;
  return `<svg class="slot" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}
// a benefit as a chip: the icon, the number, the word ("⚔ +18 % damage")
export const benefit = (name, pct, word, { big = false } = {}) => `<span class="bnf${big ? ' big' : ''}" style="--bc:${ICON_COLOR[name] || '#ccc'}">${icon(name, { size: big ? 22 : 16 })}<b>${pct > 0 ? '+' : ''}${pct} %</b> ${word}</span>`;
