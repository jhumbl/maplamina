(function (global) {
  'use strict';

  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.hud = root.hud || {};

  // Stage 5.1: extracted HUD DOM wiring from ml-runtime-widget.js.
  // This module is intentionally UI-only. The runtime/widget decides *what* to display.

  root.hud.ensureParts = function ensureParts(el) {
    if (!el) return null;

    const dock = root.dock;

    let host = null;
    try {
      if (dock && typeof dock.ensureItem === 'function') {
        host = dock.ensureItem(el, 'bottomright', 'hud', { className: 'ml-hud-host', order: 90 });
      }
    } catch (_) {}

    const mount = host || el;

    let hud = mount.querySelector('.ml-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'ml-hud';
      mount.appendChild(hud);
    }

    // Store a direct reference for cleanup (avoid querying the dock host).
    try { el.__mfHudNode = hud; } catch (_) {}

    let summary = hud.querySelector('.ml-hud-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'ml-hud-summary';
      hud.appendChild(summary);
    }

    let gpu = hud.querySelector('.ml-hud-gpu');
    if (!gpu) {
      gpu = document.createElement('div');
      gpu.className = 'ml-hud-gpu';
      gpu.style.marginTop = '4px';
      hud.appendChild(gpu);
    }

    let notes = hud.querySelector('.ml-hud-notes');
    if (!notes) {
      notes = document.createElement('div');
      notes.className = 'ml-hud-notes';
      notes.style.marginTop = '4px';
      hud.appendChild(notes);
    }

    return { hud, summary, gpu, notes };
  };

  root.hud.destroy = function destroy(el) {
    if (!el) return;

    // Prefer the explicit node reference captured in ensureParts().
    let hud = null;
    try { hud = el.__mfHudNode || null; } catch (_) {}
    if (!hud) {
      try { hud = el.querySelector('.ml-hud'); } catch (_) {}
    }

    if (hud && hud.parentNode) {
      try { hud.parentNode.removeChild(hud); } catch (_) {}
    }

    try { el.__mfHudNode = null; } catch (_) {}

    // Best-effort: if the dock host exists and is now empty, remove it.
    try {
      const host = el.querySelector('.ml-hud-host');
      if (host && host.parentNode && !host.querySelector('.ml-hud')) {
        host.parentNode.removeChild(host);
      }
    } catch (_) {}
  };
})(window);
