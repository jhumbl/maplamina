(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function validateGPUProps(st, meta) {
    const gpu = st && st.__gpuFiltering;
    if (!gpu) return { ok: true };

    const m = meta || gpuMeta(st);
    const cat = (m && m.categoryDims) | 0;
    const rng = (m && m.rangeDims) | 0;

    if (cat > 0) {
      if (typeof gpu.getFilterCategory !== 'function') return { ok: false, reason: 'getFilterCategory missing' };
      if (!gpu.filterCategories) return { ok: false, reason: 'filterCategories missing' };
    }
    if (rng > 0) {
      if (typeof gpu.getFilterValue !== 'function') return { ok: false, reason: 'getFilterValue missing' };
      if (gpu.filterRange == null) return { ok: false, reason: 'filterRange missing' };
    }
    return { ok: true };
  }

  // Public accessor (v3-only):
  // In v3, the runtime must precompute and attach `st.__gpuMeta = { rangeDims, categoryDims }`
  // when a layer participates in bound filters. We do not infer dims from legacy fields.
  function gpuMeta(st) {
    if (!st) return { rangeDims: 0, categoryDims: 0 };

    const m = st.__gpuMeta;
    if (m && typeof m === 'object') {
      const categoryDims = Math.min(4, Math.max(0, m.categoryDims | 0));
      const rangeDims    = Math.min(4, Math.max(0, m.rangeDims    | 0));
      return { rangeDims, categoryDims };
    }

    // No metadata => treat as not GPU-filtered.
    // Warn once per layer to aid debugging if runtime wiring is missing.
    if (!st.__mfWarnedNoGpuMeta) {
      try { console.warn('[maplamina][gpu] missing st.__gpuMeta for layer', st && st.id); } catch (_) {}
      st.__mfWarnedNoGpuMeta = true;
    }
    return { rangeDims: 0, categoryDims: 0 };
  }

  function attachGPUFiltering(layerProps, st) {
    // Gather centralized dims
    const meta = gpuMeta(st);
    const gpu = st && st.__gpuFiltering;
    if (!gpu) return layerProps; // nothing to attach

    const categoryDims = Math.min(4, Math.max(0, meta.categoryDims | 0));
    const rangeDims    = Math.min(4, Math.max(0, meta.rangeDims    | 0));
    if (categoryDims === 0 && rangeDims === 0) return layerProps;

    // Validate presence of accessors/props required by dims
    const valid = validateGPUProps(st, meta);
    if (!valid.ok) {
      console.warn('[maplamina][gpu] disabling filtering for layer', st && st.id, 'reason:', valid.reason);
      return layerProps;
    }

    // Build extension options once (sizes rarely change; if they do, a rebuild will recreate the layer)
    const extOpts = {};
    if (categoryDims > 0) extOpts.categorySize = categoryDims;
    if (rangeDims    > 0) extOpts.filterSize   = rangeDims;

    // Add DataFilterExtension only once
    // NOTE: avoid relying solely on constructor.name (can be minified/obscured in some builds).
    const existing = Array.isArray(layerProps.extensions) ? layerProps.extensions.slice() : [];
    const hasDFE = existing.some(e => {
      if (!e) return false;
      if (typeof deck !== 'undefined' && deck && deck.DataFilterExtension) {
        try { return e instanceof deck.DataFilterExtension; } catch (_) { /* ignore */ }
      }
      return e && e.constructor && e.constructor.name === 'DataFilterExtension';
    });
    if (!hasDFE) existing.push(new deck.DataFilterExtension(extOpts));
    layerProps.extensions = existing;

    // Wire props
    layerProps.filterEnabled = true;

    if (categoryDims > 0) {
      layerProps.getFilterCategory = gpu.getFilterCategory;
      // IMPORTANT: clone to force prop identity change on UI updates
      layerProps.filterCategories  = Array.isArray(gpu.filterCategories)
        ? gpu.filterCategories.slice()
        : gpu.filterCategories;
    }

    if (rangeDims > 0) {
      layerProps.getFilterValue = gpu.getFilterValue;
      // IMPORTANT: clone (supports 1D [min,max] or ND [[min,max],...])
      const r = gpu.filterRange;
      layerProps.filterRange = (Array.isArray(r) && Array.isArray(r[0]))
        ? r.map(x => x.slice())
        : (Array.isArray(r) ? r.slice() : r);
    }

    // ✅ Critical fix:
    // Force deck.gl to invalidate/recompute filter attributes when UI changes.
    // Without this, getFilterCategory/getFilterValue buffers can remain "stuck"
    // (e.g. at category 0) and non-first select options will hide everything.
    const ut0 = (layerProps.updateTriggers && typeof layerProps.updateTriggers === 'object')
      ? layerProps.updateTriggers
      : {};
    const ut = Object.assign({}, ut0);
    if (categoryDims > 0) ut.getFilterCategory = {
      cats: layerProps.filterCategories,
      disabled: gpu.__catDisabledKey
    };
    if (rangeDims > 0)    ut.getFilterValue    = layerProps.filterRange;
    layerProps.updateTriggers = ut;

    return layerProps;
  }

  root.filterAdapter = Object.assign(root.filterAdapter || {}, {
    attachGPUFiltering,
    gpuMeta
  });
})(window);
