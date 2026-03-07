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

  // utils
  if (typeof core.now !== 'function') core.now = wrap('utils', 'now');
  if (typeof core.isTA !== 'function') core.isTA = wrap('utils', 'isTA');
  if (typeof core.pushWarn !== 'function') core.pushWarn = wrap('utils', 'pushWarn');
  if (typeof core.assertTA !== 'function') core.assertTA = wrap('utils', 'assertTA');
  if (typeof core.stablePairTA !== 'function') core.stablePairTA = wrap('utils', 'stablePairTA');

  // assets
  if (typeof core.depUrl !== 'function') core.depUrl = wrap('assets', 'depUrl');
  if (typeof core.fetchArray !== 'function') core.fetchArray = wrap('assets', 'fetchArray');
  if (typeof core.resolveRefOrHref !== 'function') core.resolveRefOrHref = wrap('assets', 'resolveRefOrHref');
  if (typeof core.pruneEmbeddedBlobs !== 'function') core.pruneEmbeddedBlobs = wrap('assets', 'pruneEmbeddedBlobs');
  if (typeof core.pruneEmbeddedBlobsIdle !== 'function') core.pruneEmbeddedBlobsIdle = wrap('assets', 'pruneEmbeddedBlobsIdle');
  if (typeof core.cancelIdlePrune !== 'function') core.cancelIdlePrune = wrap('assets', 'cancelIdlePrune');

  // data
  if (typeof core.resolveColumnsAndViews !== 'function') core.resolveColumnsAndViews = wrap('data', 'resolveColumnsAndViews');
  if (typeof core.resolveActiveOnly !== 'function') core.resolveActiveOnly = wrap('data', 'resolveActiveOnly');
  if (typeof core.resolveRemainingViewsIdle !== 'function') core.resolveRemainingViewsIdle = wrap('data', 'resolveRemainingViewsIdle');

  // encodings
  if (typeof core.colorAccessorFrom !== 'function') core.colorAccessorFrom = wrap('encodings', 'colorAccessorFrom');
  if (typeof core.numericAccessorFrom !== 'function') core.numericAccessorFrom = wrap('encodings', 'numericAccessorFrom');

  // layer props
  if (typeof core.buildUpdateTriggersFromEncodings !== 'function') core.buildUpdateTriggersFromEncodings = wrap('layerProps', 'buildUpdateTriggersFromEncodings');
  if (typeof core.composeLayerProps !== 'function') core.composeLayerProps = wrap('layerProps', 'composeLayerProps');

  // builders (optional direct access)
  if (typeof core.buildScatterplotLayer !== 'function') core.buildScatterplotLayer = wrap('layerBuilders', 'buildScatterplotLayer');
  if (typeof core.buildPathLayer !== 'function') core.buildPathLayer = wrap('layerBuilders', 'buildPathLayer');
  if (typeof core.buildPolygonLayer !== 'function') core.buildPolygonLayer = wrap('layerBuilders', 'buildPolygonLayer');
  if (typeof core.buildIconLayer !== 'function') core.buildIconLayer = wrap('layerBuilders', 'buildIconLayer');
  if (typeof core.buildMarkerLayer !== 'function') core.buildMarkerLayer = wrap('layerBuilders', 'buildMarkerLayer');
})(window);
