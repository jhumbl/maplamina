(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};

  // Simple registry for control renderers, keyed by controlSpec.type.
  // Mirrors ml-layer-registry pattern, but for UI controls.
  const _renderers = new Map();

  function normType(t) {
    return (t == null) ? '' : String(t).trim().toLowerCase();
  }

  function register(type, renderFn) {
    const key = normType(type);
    if (!key) throw new Error('[maplamina] controls.registry.register requires a type');
    if (typeof renderFn !== 'function') throw new Error('[maplamina] controls.registry.register requires a function');
    _renderers.set(key, renderFn);
  }

  function get(type) {
    const key = normType(type);
    return key ? (_renderers.get(key) || null) : null;
  }

  root.controls.registry = Object.assign(root.controls.registry || {}, { register, get });
})(window);
