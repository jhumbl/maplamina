(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};

  // Global controls host:
  // - standalone containers per control group (like legends)
  // - optional global panel container (single host item)
  //
  // This module is intentionally "dumb": it only manages DOM mounting targets.

  const safeId = root.utils.safeId;

  function ensureDockItem(el, corner, key, opts) {
    const dock = root.dock;
    const order = opts && Number.isFinite(opts.order) ? opts.order : 10;
    const className = opts && opts.className ? opts.className : '';

    if (dock && typeof dock.ensureItem === 'function') {
      return dock.ensureItem(el, corner, key, { className, order });
    }

    // Fallback (no dock): mount directly under widget root.
    let host = el.querySelector(`:scope > [data-ml-dock-fallback="${key}"]`);
    if (!host) {
      host = document.createElement('div');
      host.dataset.mlDockFallback = key;
      if (className) host.className = className;
      el.appendChild(host);
    } else if (className) {
      host.className = className;
    }
    return host;
  }

  function removeDockItem(el, corner, key) {
    const dock = root.dock;
    if (dock && typeof dock.removeItem === 'function') {
      try { dock.removeItem(el, corner, key); } catch (_) {}
      return;
    }
    const node = el.querySelector(`:scope > [data-ml-dock-fallback="${key}"]`);
    if (node) { try { node.remove(); } catch (_) {} }
  }

  function standaloneKey(groupId) {
    return `controls-${safeId(groupId)}`;
  }

  function ensureStandaloneGroup(el, groupId, opts) {
    opts = opts || {};
    const corner = opts.corner || 'topleft';
    const key = standaloneKey(groupId);
    const order = Number.isFinite(opts.order) ? opts.order : 20;
    const className = opts.className || 'ml-layer-panel ml-control-standalone';

    const host = ensureDockItem(el, corner, key, { className, order });
    host.dataset.mfControlGroup = groupId;
    host.dataset.mfControlKind = 'standalone';
    return host;
  }

  function removeStandaloneGroup(el, groupId, opts) {
    opts = opts || {};
    const corner = opts.corner || 'topleft';
    removeDockItem(el, corner, standaloneKey(groupId));
  }

  function ensurePanelHost(el, opts) {
    opts = opts || {};
    const corner = opts.corner || 'topleft';
    const key = opts.key || 'controls-panel';
    const order = Number.isFinite(opts.order) ? opts.order : 10;
    const className = opts.className || 'ml-layer-panel ml-control-panel';

    const host = ensureDockItem(el, corner, key, { className, order });
    host.dataset.mfControlKind = 'panel';
    host.dataset.mfControlKey = key;
    return host;
  }

  function removePanelHost(el, opts) {
    opts = opts || {};
    const corner = opts.corner || 'topleft';
    const key = opts.key || 'controls-panel';
    removeDockItem(el, corner, key);
  }

  root.controls.host = {
    ensureStandaloneGroup,
    removeStandaloneGroup,
    ensurePanelHost,
    removePanelHost
  };
})(window);
