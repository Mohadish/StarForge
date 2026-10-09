// SILHOUETTE UI shared by the painter and the fleet generator (his ask: the same thing in both). A STRIP of
// thumbnails (the built-in shapes, then yours, then the ones that came with a fleet code), a small MENU on one of
// yours (rename / delete) and the DIALOG that saving goes through — overwrite the one you started from, or keep it
// as a new one with a name of its own; rename; delete; a code to copy. All of it lives in the page: a published
// page swallows the browser's own confirm / prompt boxes without a word, which is how "delete did nothing".
import { bboxOf } from './hull.js';

const CSS = `
.hstrip { display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 6px; margin-bottom: 8px; -webkit-overflow-scrolling: touch; scrollbar-width: thin }
.hthumb { flex: 0 0 auto; width: 88px; border: 1px solid var(--line, #1f2a44); border-radius: 8px; padding: 2px; background: #04070f; cursor: pointer; text-align: center; user-select: none; -webkit-user-select: none }
.hthumb.on { border-color: var(--accent, #5fe3d0); box-shadow: 0 0 0 1px var(--accent, #5fe3d0) inset }
.hthumb.mine { border-style: dashed } .hthumb.mine.on { border-style: solid }
.hthumb canvas { display: block; border-radius: 6px }
.hthumb .nm { font-size: 10px; color: var(--muted, #9eb3d8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 1px 2px }
.hstrip .hsep { flex: 0 0 auto; writing-mode: vertical-rl; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted, #9eb3d8); padding: 4px 2px; border-left: 1px solid var(--line, #1f2a44) }
.hmenu[hidden], .hdlg[hidden] { display: none }
.hmenu { position: fixed; z-index: 60; background: #0b1120; border: 1px solid var(--line, #1f2a44); border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; min-width: 150px; box-shadow: 0 10px 30px rgba(0,0,0,.55) }
.hmenu button { text-align: left; font-size: 13px }
.hdlg { position: fixed; inset: 0; z-index: 70; background: rgba(4,7,15,.6); display: flex; align-items: center; justify-content: center; padding: 16px }
.hdlg .box { background: var(--panel, #0e1422); border: 1px solid var(--good, #7ef3b0); border-radius: 12px; padding: 14px 16px; min-width: 280px; max-width: 92vw; color: var(--fg, #e8f0ff); font: 14px/1.45 var(--font, system-ui, sans-serif) }
.hdlg .ttl { font-weight: 700; margin-bottom: 8px }
.hdlg .choice, .hdlg .namerow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.hdlg .choice[hidden], .hdlg .namerow[hidden], .hdlg .del[hidden], .hdlg .ok[hidden] { display: none }
.hdlg .nm { width: 220px; background: #04070f; color: var(--fg, #e8f0ff); border: 1px solid var(--line, #1f2a44); border-radius: 8px; padding: 7px 9px; font: 13px var(--font, system-ui, sans-serif) }
.hdlg .foot { margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end }
.hdlg .del { border-color: var(--bad, #ff7979); color: var(--bad, #ff7979) }
`;
let styled = false;
const ensure = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };

// a small picture of an outline: the polygon filled, fitted into w × hgt (drawn at 2×, so it stays crisp)
export function thumbOf(h, w = 84, hgt = 48) {
  const c = document.createElement('canvas'); c.width = w * 2; c.height = hgt * 2; c.style.width = w + 'px'; c.style.height = hgt + 'px';
  const g = c.getContext('2d'), b = bboxOf(h.poly), s = Math.min((w * 2 - 10) / ((b.maxx - b.minx) || 1), (hgt * 2 - 10) / ((b.maxy - b.miny) || 1)), cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
  g.beginPath(); h.poly.forEach(([x, y], i) => { const X = w + (x - cx) * s, Y = hgt + (y - cy) * s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
  g.fillStyle = 'rgba(95,227,208,.28)'; g.fill('evenodd'); g.strokeStyle = 'rgba(232,240,255,.85)'; g.lineWidth = 2; g.stroke();
  return c;
}
// the strip. items: [{ h, group }] in order, group = 'built' | 'mine' | 'fleet' (a divider where the group changes);
// sel = the lit one's id; onPick(h, group) on a tap; onMenu(x, y, h) on a right-click or a long press on one of yours
export function renderStrip(el, items, sel, { onPick, onMenu } = {}) {
  ensure(); el.classList.add('hstrip'); el.innerHTML = ''; let last = null;
  for (const { h, group } of items) {
    if (last && group !== last) { const sep = document.createElement('div'); sep.className = 'hsep'; sep.textContent = group === 'mine' ? 'yours' : group === 'fleet' ? 'this fleet' : ''; el.appendChild(sep); }
    last = group;
    const t = document.createElement('div'); t.className = 'hthumb' + (h.id === sel ? ' on' : '') + (group === 'mine' ? ' mine' : ''); t.dataset.id = h.id; t.title = h.name + (group === 'mine' ? ' — yours' : group === 'fleet' ? ' — came with this fleet' : ' — built in');
    t.appendChild(thumbOf(h)); const n = document.createElement('div'); n.className = 'nm'; n.textContent = h.name; t.appendChild(n);
    t.onclick = () => onPick && onPick(h, group);
    if (onMenu && group === 'mine') {
      t.oncontextmenu = e => { e.preventDefault(); onMenu(e.clientX, e.clientY, h); };
      let hold = 0; const cancel = () => { clearTimeout(hold); hold = 0; };
      t.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; cancel(); hold = setTimeout(() => { hold = 0; onMenu(e.clientX, e.clientY, h); }, 550); });
      t.addEventListener('pointerup', cancel); t.addEventListener('pointermove', cancel); t.addEventListener('pointercancel', cancel);
    }
    el.appendChild(t);
  }
  const on = el.querySelector('.hthumb.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// a small menu at a spot: items [{ label, run }]
export function createMenu() {
  ensure(); const m = document.createElement('div'); m.className = 'hmenu'; m.hidden = true; document.body.appendChild(m);
  document.addEventListener('click', e => { if (!e.target.closest('.hmenu')) m.hidden = true; });
  return {
    open(x, y, items) { m.innerHTML = ''; for (const it of items) { const b = document.createElement('button'); b.textContent = it.label; b.onclick = () => { m.hidden = true; it.run(); }; m.appendChild(b); } m.hidden = false; m.style.left = Math.max(4, Math.min(x, innerWidth - 170)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - 40 * items.length - 20)) + 'px'; },
    close() { m.hidden = true; },
  };
}
// the dialog: every call resolves with what was chosen, or null when cancelled
export function createDialog() {
  ensure(); const d = document.createElement('div'); d.className = 'hdlg'; d.hidden = true;
  d.innerHTML = `<div class="box"><div class="ttl"></div><div class="choice"><button class="go over">Overwrite it</button><button class="new">Save as a new silhouette…</button></div><div class="namerow"><label class="tiny">Name <input class="nm" type="text"></label><button class="go ok">Save</button></div><div class="foot"><button class="x del" hidden>Delete it</button><button class="x cancel">Cancel</button></div></div>`;
  document.body.appendChild(d);
  const q = c => d.querySelector('.' + c); let resolve = null;
  const show = (mode, title, value) => new Promise(res => {
    if (resolve) resolve(null); resolve = res;
    q('ttl').textContent = title; q('choice').hidden = mode !== 'ask'; q('namerow').hidden = !(mode === 'name' || mode === 'code'); q('del').hidden = mode !== 'delete'; q('ok').hidden = mode === 'code'; q('nm').readOnly = mode === 'code'; q('nm').value = value || '';
    d.hidden = false; if (mode === 'name' || mode === 'code') { q('nm').focus(); q('nm').select(); }
  });
  const done = v => { d.hidden = true; const r = resolve; resolve = null; if (r) r(v); };
  q('over').onclick = () => done('over'); q('new').onclick = () => done('new'); q('cancel').onclick = () => done(null); q('del').onclick = () => done(true);
  q('ok').onclick = () => { const v = q('nm').value.trim(); if (!v) { q('nm').focus(); return; } done(v); };
  q('nm').addEventListener('keydown', e => { if (e.key === 'Enter') q('ok').click(); if (e.key === 'Escape') done(null); });
  d.addEventListener('click', e => { if (e.target === d) done(null); });
  return {
    ask: h => show('ask', `Save “${h.name}”`),                                                              // → 'over' | 'new' | null
    name: (def, title = 'A new silhouette') => show('name', title, def),                                    // → a name | null
    rename: h => show('name', `Rename “${h.name}”`, h.name),
    confirmDelete: (h, note = 'Designs using it fall back to a built-in one.') => show('delete', `Delete “${h.name}”? ${note}`),   // → true | null
    code: c => show('code', "The library as a code — copy it, paste it into the lab's Silhouettes box", c),
  };
}
// SAVE, the one way: one of yours → overwrite it, or keep it as a new one (named); anything else → a new one (named).
// `taken(name)` says a different shape already has that name (asked again); `commit(id | null, name)` does the saving
// and returns the hull. Resolves with the saved hull, or null when cancelled.
export async function saveFlow(dlg, { mine, defaultName, taken, commit, what = 'silhouette' }) {
  if (mine) { const c = await dlg.ask(mine); if (!c) return null; if (c === 'over') return commit(mine.id, mine.name); }
  let def = defaultName || `My ${what}`, title = `A new ${what}`;
  for (;;) { const name = await dlg.name(def, title); if (!name) return null; if (taken && taken(name)) { def = name; title = `There is already a “${name}” — another name?`; continue; } return commit(null, name); }
}
