/* Shared early theme initialization. No account or financial data is stored. */
(function () {
  'use strict';
  const storageKey = 'family-ledger-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let control = null;
  let storage = null;
  let preference = 'system';
  const connected = new WeakSet();

  function normalize(value) {
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  try {
    storage = window.localStorage;
    preference = normalize(storage.getItem(storageKey));
  } catch (_) {
    // Privacy settings and file URLs may deny storage; in-memory choice still works.
  }

  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-preference', preference);
    if (control) control.value = preference;
  }

  function connectControl() {
    control = document.getElementById('theme-preference');
    if (!control) return;
    control.value = preference;
    if (connected.has(control)) return;
    connected.add(control);
    const selectedControl = control;
    selectedControl.addEventListener('change', function () {
      preference = normalize(selectedControl.value);
      apply();
      try { if (storage) storage.setItem(storageKey, preference); } catch (_) { /* Session only. */ }
    });
  }

  // React pages mount their selector after session loading; the static preview uses DOM ready.
  window.familyTheme = { connectControl: connectControl };

  // Runs from a blocking script in <head>, before stylesheet loading/body paint.
  apply();
  media.addEventListener('change', function () {
    if (preference === 'system') apply();
  });
  window.addEventListener('storage', function (event) {
    if (!storage || event.storageArea !== storage) return;
    if (event.key !== storageKey && event.key !== null) return;
    preference = normalize(event.newValue);
    apply();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectControl, { once: true });
  } else {
    connectControl();
  }
}());
