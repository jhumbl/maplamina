(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-filters.js");
  }


  function getSelect() {
    const mod = root.filterSelect;
    if (!mod) throw new Error("[maplamina] Missing module 'filterSelect' required by ml-filters.js (select UI)");
    if (typeof mod.ensureSelectUI !== 'function') throw new Error("[maplamina] Missing function filterSelect.ensureSelectUI required by ml-filters.js");
    return mod;
  }
  function getRange() {
    const mod = root.filterRange;
    if (!mod) throw new Error("[maplamina] Missing module 'filterRange' required by ml-filters.js (range UI)");
    if (typeof mod.ensureRangeUI !== 'function') throw new Error("[maplamina] Missing function filterRange.ensureRangeUI required by ml-filters.js");
    return mod;
  }


  function ensureFilterUI(el, layerId, spec, onChange, panelMeta){
    if (!spec || !spec.type) return;
    if (spec.type === 'select') return getSelect().ensureSelectUI(el, layerId, spec, onChange, panelMeta);
    if (spec.type === 'range')  return getRange().ensureRangeUI(el, layerId, spec, onChange, panelMeta);
  }

  // (v3) GPU filtering is driven by .__controls.filters in maplamina.js.
  // Legacy per-layer GPU wiring removed.

  root.filters = { ensureFilterUI };
})(window);
