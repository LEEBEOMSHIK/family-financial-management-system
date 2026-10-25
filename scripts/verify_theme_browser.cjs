/* Local synthetic preview checks using Chrome DevTools; no npm dependency. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'var/design-verification');
const candidates = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'];
const executable = candidates.find(p => p && fs.existsSync(p));
if (!executable) throw Error('Set CHROME_PATH to a locally installed Chrome/Chromium executable');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'family-theme-check-'));
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const checks = [];

async function main() {
  const activePort = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(activePort); i++) await pause(100);
  if (!fs.existsSync(activePort)) throw Error('Chrome did not expose a debugging port');
  const port = fs.readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const response = JSON.parse(event.data);
    if (!pending.has(response.id)) return;
    const { resolve, reject, timer } = pending.get(response.id);
    clearTimeout(timer); pending.delete(response.id);
    if (response.error) reject(Error(JSON.stringify(response.error))); else resolve(response.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const theme = () => evaluate('document.documentElement.dataset.theme');
  const select = async (id, value) => {
    await evaluate(`(()=>{const c=document.getElementById(${JSON.stringify(id)});c.value=${JSON.stringify(value)};c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate("document.readyState==='complete' && !!document.querySelector('#flow-chart svg')")) return;
      await pause(50);
    }
    throw Error('Preview did not finish loading');
  };
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Page.navigate', { url: pathToFileURL(path.join(root, 'docs/design/preview.html')).href });
  await settle();
  assert.equal(await theme(), 'dark'); checks.push('initial system dark');
  await select('theme-preference', 'light');
  assert.equal(await theme(), 'light');
  await send('Page.reload'); await pause(100); await settle();
  assert.equal(await theme(), 'light'); checks.push('explicit light persists on reload');
  await select('theme-preference', 'system');
  assert.equal(await theme(), 'dark');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await pause(100);
  assert.equal(await theme(), 'light'); checks.push('system preference changes live');
  await select('period', 'quarter');
  assert.equal(await evaluate("document.getElementById('income').textContent"), '1,600,000원');
  await select('view-mode', 'admin');
  assert.equal(await evaluate("document.getElementById('management').hidden"), false);
  checks.push('period and management controls work with theme');
  for (const width of [1440, 375, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const mode of ['light', 'dark']) {
      await select('theme-preference', mode);
      await pause(60);
      const layout = await evaluate(`({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        body: getComputedStyle(document.body).backgroundColor,
        card: getComputedStyle(document.querySelector('.balance')).backgroundColor,
        select: getComputedStyle(document.getElementById('theme-preference')).backgroundColor
      })`);
      assert(layout.content <= layout.viewport, `Horizontal overflow at ${width}px/${mode}: ${JSON.stringify(layout)}`);
      assert.equal(layout.body, mode === 'dark' ? 'rgb(17, 22, 30)' : 'rgb(247, 248, 252)');
      assert.equal(layout.card, mode === 'dark' ? 'rgb(26, 34, 48)' : 'rgb(255, 255, 255)');
      assert.equal(layout.select, layout.card);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(output, `dashboard-${width}-${mode}.png`), Buffer.from(shot.data, 'base64'));
      checks.push(`${width}px ${mode}: no horizontal overflow, themed surfaces, screenshot`);
    }
  }
  await evaluate("document.getElementById('theme-preference').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement.id'), 'view-mode');
  checks.push('keyboard Tab reaches next control');
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks, output }, null, 2));
  await send('Browser.close');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  chrome.kill();
  await pause(500);
  // Only the unique temporary profile created by this run can be removed.
  try {
    const resolvedProfile = path.resolve(profile);
    assert.equal(path.dirname(resolvedProfile), path.resolve(os.tmpdir()));
    assert(path.basename(resolvedProfile).startsWith('family-theme-check-'));
    fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
  catch { console.error(`Temporary Chrome profile could not be removed: ${profile}`); }
});
