(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  // Facade: preserve MAPLAMINA.core.* API while delegating implementation to modules.
  // IMPORTANT: ml-core.js is intentionally loaded early, before most modules.
  // Therefore we MUST NOT capture function references eagerly (root.data?.foo) because
  // those modules may not exist yet. Instead we expose thin wrappers that resolve
  // the backing implementation at call time.
  const core = root.core = root.core || {};

  // Centralised dependency helpers (Stage 3)
  core.require = core.require || function requireModule(name, from) {
    const mod = root[name];
    if (mod && typeof mod === 'object') return mod;
    throw new Error(
      `[maplamina] Missing module '${name}' required by ${from || 'unknown'}; check script load order.`
    );
  };

  core.requireFn = core.requireFn || function requireFn(modName, fnName, from) {
    const mod = core.require(modName, from);
    const fn = mod ? mod[fnName] : null;
    if (typeof fn === 'function') return fn;
    throw new Error(
      `[maplamina] Missing function '${modName}.${fnName}' required by ${from || 'unknown'}; check script load order.`
    );
  };

  function wrap(modName, fnName) {
    return function wrapped(...args) {
      return core.requireFn(modName, fnName, 'ml-core.js')(...args);
    };
  }

  core.now = wrap('utils', 'now');
  core.cancelIdlePrune = wrap('assets', 'cancelIdlePrune');
  core.resolveActiveOnly = wrap('data', 'resolveActiveOnly');
  core.resolveRemainingViewsIdle = wrap('data', 'resolveRemainingViewsIdle');
})(window);
