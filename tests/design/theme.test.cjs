const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '../../apps/web/public/theme.js');
const key = 'family-ledger-theme';

// Browser boundaries only: execute the actual initialization/event code.
function browser({ stored = null, dark = false, blocked = false, writeBlocked = false } = {}) {
  const attributes = {};
  const events = {};
  const controlEvents = {};
  const control = { value: '', addEventListener: (type, fn) => { controlEvents[type] = fn; } };
  const media = { matches: dark, addEventListener: (_, fn) => { media.changed = fn; } };
  const data = new Map(stored === null ? [] : [[key, stored]]);
  const storage = {
    getItem: name => data.get(name) ?? null,
    setItem: (name, value) => { if (writeBlocked) throw Error('storage quota exceeded'); data.set(name, value); }
  };
  const document = {
    documentElement: { setAttribute: (name, value) => { attributes[name] = value; } },
    readyState: 'loading',
    getElementById: () => control,
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  const window = {
    document,
    matchMedia: () => media,
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  Object.defineProperty(window, 'localStorage', {
    get: () => { if (blocked) throw Error('storage blocked'); return storage; }
  });
  // Missing implementation is an assertion failure, not an import failure.
  if (fs.existsSync(scriptPath)) vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { window, document });
  return {
    attributes, data, storage,
    ready: () => events.DOMContentLoaded?.(),
    select: value => { control.value = value; controlEvents.change?.(); },
    preference: () => control.value,
    os: value => { media.matches = value; media.changed?.({ matches: value }); },
    sync: (newValue, storageArea = storage, eventKey = key) => events.storage?.({ key: eventKey, newValue, storageArea })
  };
}

test('applies system dark before DOM ready and follows later OS changes', () => {
  const page = browser({ dark: true });
  assert.equal(page.attributes['data-theme'], 'dark');
  page.ready();
  assert.equal(page.preference(), 'system');
  page.os(false);
  assert.equal(page.attributes['data-theme'], 'light');
});

test('remembers explicit choice across reload and ignores OS changes', () => {
  const page = browser(); page.ready(); page.select('dark');
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.equal(page.data.get(key), 'dark');
  page.os(false);
  assert.equal(page.attributes['data-theme'], 'dark');
  const reload = browser({ stored: page.data.get(key) }); reload.ready();
  assert.equal(reload.attributes['data-theme'], 'dark');
  assert.equal(reload.preference(), 'dark');
  reload.select('light'); reload.os(true);
  assert.equal(reload.attributes['data-theme'], 'light');
});

test('returning to system immediately uses the current OS preference', () => {
  const page = browser({ dark: true, stored: 'light' }); page.ready();
  page.select('system');
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.equal(page.data.get(key), 'system');
});

test('blocked storage does not break initial rendering or manual selection', () => {
  const page = browser({ dark: true, blocked: true }); page.ready();
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.doesNotThrow(() => page.select('light'));
  assert.equal(page.attributes['data-theme'], 'light');
});

test('invalid saved value falls back to system', () => {
  const page = browser({ stored: 'invalid', dark: true }); page.ready();
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.equal(page.preference(), 'system');
});

test('write failure keeps the new theme for this page without losing the saved preference', () => {
  const page = browser({ stored: 'dark', writeBlocked: true }); page.ready();
  assert.equal(page.attributes['data-theme'], 'dark');
  assert.doesNotThrow(() => page.select('light'));
  assert.equal(page.attributes['data-theme'], 'light');
  assert.equal(page.preference(), 'light');
  assert.equal(page.data.get(key), 'dark');
  page.os(true);
  assert.equal(page.attributes['data-theme'], 'light');
});

test('other tabs update the selector, deletion restores system', () => {
  const page = browser({ stored: 'dark', dark: false }); page.ready();
  page.sync('light');
  assert.equal(page.attributes['data-theme'], 'light');
  assert.equal(page.preference(), 'light');
  page.sync(null);
  assert.equal(page.preference(), 'system');
  page.os(true);
  assert.equal(page.attributes['data-theme'], 'dark');
});

test('unrelated storage events cannot change the theme', () => {
  const page = browser({ stored: 'dark' }); page.ready();
  page.sync('light', {}, key);
  page.sync('light', page.storage, 'unrelated-key');
  assert.equal(page.attributes['data-theme'], 'dark');
});

test('clearing storage in another tab restores system', () => {
  const page = browser({ stored: 'dark' }); page.ready();
  page.sync(null, page.storage, null);
  assert.equal(page.preference(), 'system');
  assert.equal(page.attributes['data-theme'], 'light');
});
