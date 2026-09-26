(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};

  // Registry for control handlers, keyed by controlSpec.type.
  const _handlers = new Map();

  function normType(t) {
    return (t == null) ? '' : String(t).trim().toLowerCase();
  }

  function normalizeHandler(h) {
    // Allowed:
    //  - function (render)
    //  - { render: fn, update?: fn }
    if (typeof h === 'function') return { render: h, update: null };
    if (h && typeof h === 'object') {
      const r = h.render;
      const u = h.update;
      if (typeof r !== 'function') {
        throw new Error('[maplamina] controls.registry.register requires a function or {render: fn, update?: fn}');
      }
      return { render: r, update: (typeof u === 'function') ? u : null };
    }
    throw new Error('[maplamina] controls.registry.register requires a function or {render: fn, update?: fn}');
  }

  function register(type, handler) {
    const key = normType(type);
    if (!key) throw new Error('[maplamina] controls.registry.register requires a type');
    const h = normalizeHandler(handler);
    _handlers.set(key, h);
  }

  function getHandler(type) {
    const key = normType(type);
    return key ? (_handlers.get(key) || null) : null;
  }

  root.controls.registry = Object.assign(root.controls.registry || {}, { register, getHandler });
})(window);
