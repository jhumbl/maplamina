(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function gpuMeta(st) {
    const lp = root.layerProps;
    if (lp && typeof lp.gpuMeta === 'function') return lp.gpuMeta(st);
    return { rangeDims: 0, categoryDims: 0 };
  }

  function attachGPUFiltering(layerProps, st) {
    const lp = root.layerProps;
    if (lp && typeof lp.attachGPUFiltering === 'function') {
      return lp.attachGPUFiltering(layerProps, st);
    }
    return layerProps;
  }

  root.filterAdapter = Object.assign(root.filterAdapter || {}, {
    attachGPUFiltering,
    gpuMeta
  });
})(window);
