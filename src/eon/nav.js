// THE TOP BAR — the same on every page and always in sight (his ask, 2026-10-12: "all the options as one constant"):
// the Fleet Generator, the Battle Lab and the Painter (the ship designer). The hub (index.html) and the Eon prototype
// exist only on the full site, not inside a published page, so they join the bar when they answer.
// `mountNav(current)` puts the bar at the top of the page, sticky; `mountNav(current, { into })` puts the links inside
// a bar the page already has (the Eon prototype's, whose layout is a fixed-height screen).
const PAGES = [
  { id: 'fleet', href: 'fleet.html', label: '⚙ Fleet Generator', what: 'compose fleets, pit two against each other' },
  { id: 'lab', href: 'lab.html', label: '⚔ Battle Lab', what: 'random ships at one price, who wins, the challenger' },
  { id: 'paint', href: 'paint.html', label: '✎ Painter · ship designer', what: 'design a ship module by module and paint it' },
];
const SITE = [{ id: 'eon', href: 'eon.html', label: '◈ Eon (the 4X)', what: 'the game this is all for' }];
const CSS = `
.fnav { position: sticky; top: 0; z-index: 90; display: flex; align-items: center; gap: 4px; padding: 7px 16px; background: rgba(9,13,24,.96); border-bottom: 1px solid #1f2a44; backdrop-filter: blur(6px); overflow-x: auto; white-space: nowrap; scrollbar-width: none; font: 600 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif }
.fnav::-webkit-scrollbar { display: none }
.fnav .brand { color: #5fe3d0; letter-spacing: .16em; font-weight: 800; margin-right: 10px; text-decoration: none }
.fnav a.pg { color: #9eb3d8; text-decoration: none; padding: 5px 10px; border-radius: 8px; border: 1px solid transparent }
.fnav a.pg:hover { color: #e8f0ff; border-color: #1f2a44 }
.fnav a.pg[aria-current=page] { color: #e8f0ff; background: rgba(95,227,208,.14); border-color: rgba(95,227,208,.5) }
.fnav-in { display: flex; gap: 4px; align-items: center }
.fnav-in a.pg { color: #9eb3d8; text-decoration: none; padding: 4px 8px; border-radius: 7px; border: 1px solid #1f2a44; font: 600 12px system-ui, sans-serif; white-space: nowrap }
.fnav-in a.pg:hover { color: #e8f0ff }`;
const link = (p, current) => `<a class="pg" href="${p.href}" title="${p.what}"${p.id === current ? ' aria-current="page"' : ''}>${p.label}</a>`;
export function mountNav(current, { into = null } = {}) {
  if (document.querySelector('.fnav, .fnav-in')) return;
  if (!document.getElementById('fnavCss')) { const st = document.createElement('style'); st.id = 'fnavCss'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('nav');
  if (into) { el.className = 'fnav-in'; el.innerHTML = PAGES.map(p => link(p, current)).join(''); into.children[0] ? into.children[0].after(el) : into.prepend(el); }
  else {
    el.className = 'fnav'; el.innerHTML = `<span class="brand">FORGE</span>` + PAGES.map(p => link(p, current)).join('');
    document.body.prepend(el);
    const cs = getComputedStyle(document.body);                                   // span the body's own padding, edge to edge of its column
    el.style.margin = `-${cs.paddingTop} -${cs.paddingRight} 12px -${cs.paddingLeft}`;
  }
  // the full site's pages (not inside a published page): the hub behind the brand, the Eon prototype at the end
  fetch(SITE[0].href, { method: 'HEAD', cache: 'no-store' }).then(r => {
    if (!r.ok) return;
    el.insertAdjacentHTML('beforeend', SITE.map(p => link(p, current)).join(''));
    const b = el.querySelector('.brand'); if (b) b.outerHTML = `<a class="brand" href="index.html" title="all the tools">FORGE</a>`;
  }).catch(() => { /* a published page: the three tools are the whole site */ });
  return el;
}
