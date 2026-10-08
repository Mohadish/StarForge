// Electron shell. It only opens a window; the whole game is plain web code in this folder,
// served over app:// so ES modules and localStorage work exactly like on a web server.
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const ROOT = __dirname;
const SMOKE = !!process.env.FORGE_SMOKE;   // headless self-test: load, report errors, quit

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1280, minHeight: 760,
    backgroundColor: '#060a14', title: 'Forge 4X', autoHideMenuBar: true, show: !SMOKE,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // FORGE_PAGE picks the entry page: index.html = the map game, eon.html = the eon-loop prototype
  win.loadURL('app://game/' + (process.env.FORGE_PAGE || 'index.html'));
  if (SMOKE) smokeTest(win);
}

function smokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (e, ...a) => {
    const level = e.level ?? a[0], msg = e.message ?? a[1];
    if (level === 'error' || level === 3) errors.push(msg);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => errors.push(`load failed ${code} ${desc} ${url}`));
  win.webContents.on('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 2000));
    let result = {};
    try {
      result = await win.webContents.executeJavaScript(
        `({ booted: window.__forgeBooted === true, storage: (() => { try { localStorage.setItem('t', '1'); return localStorage.getItem('t') === '1'; } catch (e) { return String(e); } })() })`);
    } catch (err) { errors.push(String(err)); }
    console.log('FORGE_SMOKE ' + JSON.stringify({ ...result, errors }));
    app.exit(result.booted && !errors.length ? 0 : 1);
  });
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
