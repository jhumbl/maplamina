(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.now !== 'function') {
    throw new Error("[maplamina] Missing core; ensure ml-core.js is loaded before ml-runtime-initial-render.js");
  }

  const mod = root.runtimeInitialRender = root.runtimeInitialRender || {};
  const viewsMod = core.require('views', 'ml-runtime-initial-render.js');
  const applyOrderedViewOps = viewsMod && viewsMod.applyOrderedViewOps;
  const collectPrimeViewEncodingKeys = viewsMod && viewsMod.collectPrimeViewEncodingKeys;

  function readGpuMeta(st) {
    const lp = root.layerProps;
    if (lp && typeof lp.gpuMeta === 'function') return lp.gpuMeta(st);
    const render = st && st.__render;
    const m = (render && typeof render === 'object') ? render.gpuMeta : null;
    if (!m || typeof m !== 'object') return { rangeDims: 0, categoryDims: 0 };
    return {
      rangeDims: Math.min(4, Math.max(0, m.rangeDims | 0)),
      categoryDims: Math.min(4, Math.max(0, m.categoryDims | 0))
    };
  }

  function readInitialTransitions(rt, layerId, transitionsForBuild) {
    try {
      if (typeof transitionsForBuild === 'function') {
        return transitionsForBuild(rt, layerId, {
          reason: 'initial',
          allowTransitions: false,
          motionEligible: false,
          invalidation: { initial: true, render: true, encodings: true, motionEligible: false }
        });
      }
    } catch (_) {}

    try {
      const lid = String(layerId || '');
      const t = (rt && rt._layerTransitions && typeof rt._layerTransitions.get === 'function')
        ? rt._layerTransitions.get(lid)
        : null;
      return (t && typeof t === 'object' && Object.keys(t).length) ? t : null;
    } catch (_) {}

    return null;
  }

  mod.renderInitial = async function renderInitial(opts) {
    if (!opts || typeof opts !== 'object') return { currentLayers: [] };

    const el = opts.el;
    const x = opts.x;
    const rt = opts.rt;
    const map = opts.map;
    const overlay = opts.overlay;
    const mfRuntimeMap = opts.mfRuntimeMap;
    const pickActiveViews = opts.pickActiveViews;
    const computeViewOpsByLayerV3 = opts.computeViewOpsByLayerV3;
    const initFiltersState = opts.initFiltersState;
    const buildFilterIndex = opts.buildFilterIndex;
    const getGPUFilterContribution = opts.getGPUFilterContribution || (root.filtersRuntime && root.filtersRuntime.getGPUFilterContribution);
    const mergeEncodings = opts.mergeEncodings;
    const runtimeAssembly = opts.runtimeAssembly || (root.runtime && root.runtime.assembly);
    const motionMod = root.runtime && root.runtime.motion;
    const primeRuntimeTransitions = opts.primeRuntimeTransitions || (motionMod && motionMod.primeRuntimeTransitions);
    const disableRuntimeTransitions = opts.disableRuntimeTransitions || (motionMod && motionMod.disableRuntimeTransitions);
    const transitionsForBuild = opts.transitionsForBuild || (motionMod && motionMod.transitionsForBuild);
    const ensureHudParts = opts.ensureHudParts;

    if (!el || !x || !rt || !overlay) return { currentLayers: opts.currentLayers || [] };
    if (!runtimeAssembly || typeof runtimeAssembly.buildRenderArtifacts !== 'function' || typeof runtimeAssembly.getLogicalLayer !== 'function') {
      throw new Error('[maplamina] Missing runtime assembly helpers required by ml-runtime-initial-render.js');
    }

    const buildRenderArtifacts = runtimeAssembly.buildRenderArtifacts;
    const getRenderState = runtimeAssembly.getRenderState;
    const getLogicalLayer = runtimeAssembly.getLogicalLayer;

    const assertV3 = root.spec && root.spec.assertV3Spec;
    if (typeof assertV3 !== 'function') {
      throw new Error('[maplamina] Missing MAPLAMINA.spec.assertV3Spec; ensure ml-spec.js is loaded/updated before runtime');
    }
    assertV3(x, 'runtimeInitialRender.renderInitial');

    rt._renderEpoch = (rt._renderEpoch || 0) + 1;
    try { rt._viewsPrev = {}; } catch (_) {}

    try {
      const s = rt._sched;
      if (s && s.raf) { cancelAnimationFrame(s.raf); s.raf = null; }
      if (s && s.layers && typeof s.layers.clear === 'function') s.layers.clear();
      if (s && s.rehydrate && typeof s.rehydrate.clear === 'function') s.rehydrate.clear();
      if (s && s.reasons && typeof s.reasons.clear === 'function') s.reasons.clear();
      if (s) {
        s.legends = false;
        s.controls = false;
        s.tooltip = false;
        s.next = null;
        s.chain = Promise.resolve();
      }
    } catch (_) {}

    try {
      if (rt.pruneTasks && rt.pruneTasks.size) {
        for (const id of rt.pruneTasks) core.cancelIdlePrune(id);
        rt.pruneTasks.clear();
      }
    } catch (_) {}

    try { rt.layers && rt.layers.clear && rt.layers.clear(); } catch (_) {}
    rt.specRef = x;

    try {
      if (mfRuntimeMap && typeof mfRuntimeMap.applyMapLibreControls === 'function') {
        mfRuntimeMap.applyMapLibreControls(map, x, rt);
      }
    } catch (_) {}

    const t0 = (opts.t0 != null) ? opts.t0 : core.now();
    const activeViews = (typeof pickActiveViews === 'function') ? pickActiveViews(rt, x) : {};
    const viewOps = (typeof computeViewOpsByLayerV3 === 'function') ? computeViewOpsByLayerV3(x, activeViews) : null;
    const viewOpsByLayer = viewOps && viewOps.opsByLayer ? viewOps.opsByLayer : new Map();

    if (typeof initFiltersState === 'function') initFiltersState(rt, x);
    rt._filterIndex = (typeof buildFilterIndex === 'function') ? buildFilterIndex(x) : null;

    const specs = x['.__layers'] || {};
    const ids = Object.keys(specs);
    const layers = [];

    for (const id of ids) {
      const st0 = specs[id];
      const ops = (viewOpsByLayer && typeof viewOpsByLayer.get === 'function') ? (viewOpsByLayer.get(id) || []) : [];
      const primeKeys = (typeof collectPrimeViewEncodingKeys === 'function') ? collectPrimeViewEncodingKeys(x, ops) : null;
      if (primeKeys && typeof primeRuntimeTransitions === 'function') {
        primeRuntimeTransitions(rt, id, st0 && st0.type, primeKeys);
      }
      if (typeof disableRuntimeTransitions === 'function') {
        disableRuntimeTransitions(rt, id);
      }
      const buildTransitions = readInitialTransitions(rt, id, transitionsForBuild);

      const result = await buildRenderArtifacts({
        entry: rt.layers.get(id),
        sourceState: st0,
        layerId: id,
        spec: x,
        rt,
        x,
        core,
        mergeEncodings,
        opsByLayer: viewOpsByLayer,
        applyOrderedViewOps,
        getGPUFilterContribution,
        transitions: buildTransitions,
        buildLayer: rt.buildLayer
      });

      if (!result) continue;
      if (result.entry && typeof result.entry === 'object') {
        if (!result.entry.runtime || typeof result.entry.runtime !== 'object') result.entry.runtime = {};
        result.entry.runtime.lastReason = 'initial';
        result.entry.runtime.lastMotionPolicy = {
          reason: 'initial',
          allowTransitions: false,
          motionEligible: false,
          invalidation: { initial: true, render: true, encodings: true, motionEligible: false }
        };
        result.entry.runtime.lastInvalidation = { initial: true, render: true, encodings: true, motionEligible: false };
      }
      layers.push(result.layer);
      rt.layers.set(id, result.entry);
    }

    const flatLayers = Array.isArray(layers) && layers.flat ? layers.flat(Infinity) : [].concat.apply([], layers);
    overlay.setProps({ layers: flatLayers });
    const currentLayers = flatLayers;

    try { root.controls && root.controls.panel && typeof root.controls.panel.sync === 'function' && root.controls.panel.sync(el, x); } catch (_) {}
    try { root.controls && root.controls.panel && typeof root.controls.panel.update === 'function' && root.controls.panel.update(el, x, rt, { reason: 'initial' }); } catch (_) {}

    try {
      const t1 = core.now();
      const parts = (typeof ensureHudParts === 'function') ? ensureHudParts(el) : null;
      if (parts && parts.summary) parts.summary.textContent = `layers: ${currentLayers.length} • build ${(t1 - t0).toFixed(1)}ms`;

      let totalRangeDims = 0;
      let totalCategoryDims = 0;
      const metaRows = [];
      const warnLines = [];

      for (const [layerId, entry] of rt.layers.entries()) {
        const stForMeta = getRenderState(entry) || getLogicalLayer(entry) || null;
        const m = readGpuMeta(stForMeta);

        totalRangeDims += (m.rangeDims || 0);
        totalCategoryDims += (m.categoryDims || 0);

        if (m.rangeDims || m.categoryDims) {
          metaRows.push(`<div class="ml-hud-gpu-row">gpu ${layerId}: range×${m.rangeDims || 0} • cat×${m.categoryDims || 0}</div>`);
        }

        const warnState = getRenderState(entry) || getLogicalLayer(entry) || null;
        const warns = (warnState && Array.isArray(warnState.__warns)) ? warnState.__warns : [];
        for (const w of warns) warnLines.push(`<div class="ml-hud-warn">⚠️ ${layerId}: ${w}</div>`);
      }

      if (parts && parts.gpu) parts.gpu.innerHTML = [
        `<div class="ml-hud-gpu-head">GPU filters: R=${totalRangeDims} C=${totalCategoryDims}</div>`,
        metaRows.length ? `<div class="ml-hud-gpu-rows">${metaRows.join('')}</div>` : ''
      ].join('');

      if (parts && parts.notes) parts.notes.innerHTML = warnLines.join('') || '';
    } catch (_) {}

    return { currentLayers };
  };
})(window);
