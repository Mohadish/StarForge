// THE SILHOUETTE LIBRARY — where the player's own hull outlines are kept. No DOM here.
//
// Two stores. The browser's localStorage is the quick one: read at once, written on every save — but on a
// published page (a sandboxed frame, an iPad) it is partitioned and purged, and that is how shapes went
// missing. So on a published page the library also lives in the page's own DATABASE (the `db` capability:
// one document, `library/hulls`, holding the whole list), which survives republishes, devices and purges
// and is shared by every page of the artifact (painter and lab alike). The database is the truth when it
// answers; localStorage is the cache, and the seed the first time (so what was in the browser is carried in).
export const HULL_KEY = 'forge.eon.hulls.v1';
const DOC = 'library/hulls';
const ok = h => !!(h && h.id && Array.isArray(h.poly) && h.poly.length >= 3);

export function readLocal() { try { return (JSON.parse(localStorage.getItem(HULL_KEY) || '[]') || []).filter(ok); } catch (e) { return []; } }
export function writeLocal(list) { try { localStorage.setItem(HULL_KEY, JSON.stringify(list)); } catch (e) { /* fine */ } }

// the page's database, when this view can run it (a published page in the viewer); null elsewhere (localhost, the app)
let dbp = null;
const store = () => dbp || (dbp = (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') ? window.claude.use('db').catch(() => null) : Promise.resolve(null));
const body = list => ({ hulls: list, n: list.length, at: new Date().toISOString() });

// the library: localStorage at once (so the page can start), then the database's copy if there is one.
// Resolves { list, durable } — durable = the database answered and holds the list now. The first time the
// database is empty and the browser has shapes, they are written in; after that the database is the truth.
export async function loadLibrary() {
  const local = readLocal(), db = await store();
  if (!db) return { list: local, durable: false };
  try {
    const snap = await db.doc(DOC).get();
    if (snap.exists) { const list = ((snap.data() || {}).hulls || []).filter(ok); writeLocal(list); return { list, durable: true }; }
    if (local.length) await db.doc(DOC).set(body(local));
    return { list: local, durable: true };
  } catch (e) { console.warn('library: the page store did not answer', e); return { list: local, durable: false }; }
}
// keep the whole list: the browser now, the database when there is one. Resolves true when the database took it.
export async function saveLibrary(list) {
  writeLocal(list);
  const db = await store(); if (!db) return false;
  try { await db.doc(DOC).set(body(list)); return true; } catch (e) { console.warn('library: the page store refused the save', e); return false; }
}
// the library as a code to carry to another page (base64 JSON), and back
export const libraryCode = list => btoa(unescape(encodeURIComponent(JSON.stringify(list))));
export function decodeLibrary(code) { try { const list = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); return Array.isArray(list) ? list.filter(ok) : null; } catch (e) { return null; } }
// merge by id: theirs wins
export function mergeLibrary(mine, theirs) { const out = mine.slice(); let n = 0; for (const h of theirs) { if (!ok(h)) continue; const i = out.findIndex(x => x.id === h.id); if (i >= 0) out[i] = h; else out.push(h); n++; } return { list: out, n }; }
