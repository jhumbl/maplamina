(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  // Global singletons / registries
  root.layers = root.layers || new Map();
  root.controls = root.controls || {};
  root.layerBuilders = root.layerBuilders || {}; // optional direct exports

  // Optional build metadata
  root.__build = root.__build || { name: 'maplamina', refactor: '2026-01-15' };
})(window);
