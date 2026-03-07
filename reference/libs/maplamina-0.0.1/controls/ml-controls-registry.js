(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};

  // Simple registry for control handlers, keyed by controlSpec.type.
  // Back-compat: existing code can still register a render function.
  // New in Stage 2: handlers may also provide an `update` hook.
  // Mirrors ml-layer-registry pattern, but for UI controls.
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

  // Back-compat: return render function.
  function get(type) {
    const key = normType(type);
    const h = key ? (_handlers.get(key) || null) : null;
    return (h && typeof h.render === 'function') ? h.render : null;
  }

  // New: return full handler {render, update}.
  function getHandler(type) {
    const key = normType(type);
    return key ? (_handlers.get(key) || null) : null;
  }

  root.controls.registry = Object.assign(root.controls.registry || {}, { register, get, getHandler });
})(window);
