(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  root.layers = root.layers || new Map();

  function registerLayer(type, builderFn) {
    if (!type || typeof builderFn !== 'function') return;
    root.layers.set(type, builderFn);
  }

  function getLayerBuilder(type) {
    return root.layers.get(type);
  }

  // Register built-ins (builder signature: (st, ctx?) => Layer|Layer[] )
  registerLayer('circle',  (st, ctx) => root.layerBuilders.buildScatterplotLayer(st, ctx));
  registerLayer('line',    (st, ctx) => root.layerBuilders.buildPathLayer(st, ctx));
  registerLayer('polygon', (st, ctx) => root.layerBuilders.buildPolygonLayer(st, ctx));
  registerLayer('icon',    (st, ctx) => root.layerBuilders.buildIconLayer(st, ctx));
  registerLayer('marker',  (st, ctx) => root.layerBuilders.buildMarkerLayer(st, ctx));

  // Optional convenience methods for extension authors
  try {
    // root.layers is a Map; attaching properties is safe and keeps the public surface small.
    root.layers.register = registerLayer;
    root.layers.getBuilder = getLayerBuilder;
  } catch (_) {}
})(window);
