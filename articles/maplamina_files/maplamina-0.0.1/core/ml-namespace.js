(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  root.layers = root.layers || new Map();
  root.controls = root.controls || {};
  root.layerBuilders = root.layerBuilders || {};

  function requireModule(name, from) {
    const mod = root[name];
    if (mod && typeof mod === 'object') return mod;
    throw new Error(
      `[maplamina] Missing module '${name}' required by ${from || 'unknown'}; check script load order.`
    );
  }

  function requireFn(modName, fnName, from) {
    const fn = requireModule(modName, from)[fnName];
    if (typeof fn === 'function') return fn;
    throw new Error(
      `[maplamina] Missing function '${modName}.${fnName}' required by ${from || 'unknown'}; check script load order.`
    );
  }

  root.core = { require: requireModule, requireFn };
})(window);
