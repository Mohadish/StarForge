// FRESH (his report, 2026-10-18: "loading the game on GitHub Pages did not give me the newest version"): GitHub Pages lets a browser
// keep every file for ten minutes, so right after a push the page can run old files — or a mix of old and new, where the new ones
// fail to load. After the page has loaded, this asks the server, file by file (a cheap "has it changed?" request), whether anything
// it ran is out of date; if so the newer files are fetched into the cache and the page reloads once, fresh. Only on a web server
// (not the desktop app, not a local preview, which never cache); never twice in a row.
const KEY = 'forge.fresh.reloaded';
async function check() {
  if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  let last = 0; try { last = +sessionStorage.getItem(KEY) || 0; } catch (e) { /* no storage: still check */ }
  if (Date.now() - last < 60000) return;                                   // just reloaded for this: do not loop
  const urls = [...new Set([location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name)])]
    .filter(u => u.startsWith(location.origin) && /\.(js|css|html|json)(\?|$)/.test(new URL(u).pathname + (new URL(u).search ? '?' : '')));
  const tag = r => (r.headers.get('etag') || '') + '|' + (r.headers.get('last-modified') || '');
  const stale = await Promise.all(urls.map(async u => {
    try {
      const kept = await fetch(u, { cache: 'force-cache' });               // what the browser holds
      const now = await fetch(u, { cache: 'no-cache' });                   // what the server has (and the browser now holds)
      return kept.ok && now.ok && tag(kept) !== tag(now);
    } catch (e) { return false; }
  }));
  if (!stale.some(Boolean)) return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
  location.reload();
}
addEventListener('load', () => setTimeout(check, 1500));
