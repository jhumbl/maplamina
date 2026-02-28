(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.now !== 'function') {
    throw new Error("[maplamina] Missing core; ensure ml-core.js is loaded before ml-runtime-initial-render.js");
  }

  const mod = root.runtimeInitialRender = root.runtimeInitialRender || {};

  // Stage 2: move the heavy initial render pass out of ml-runtime-widget.js
  // Responsibilities:
  // - render-boundary reset (epoch bump + cancel pending schedulers)
  // - clear per-render caches (layers, prune tasks)
  // - apply maplibre controls (map_options.controls)
  // - compute active views + per-layer view ops
  // - init filters + build membership index
  // - hydrate layers, apply active view patches, apply GPU filtering
  // - build deck.gl layers and set overlay props
  // - sync control panel + update HUD
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
    const applyGPUFilteringFromControls = opts.applyGPUFilteringFromControls;

    const mergeEncodings = opts.mergeEncodings;
    const primeRuntimeTransitions = opts.primeRuntimeTransitions;

    const ensureHudParts = opts.ensureHudParts;

    if (!el || !x || !rt || !overlay) return { currentLayers: opts.currentLayers || [] };

    // v3-only contract: validate spec shape early (no legacy support).
    const assertV3 = root.spec && root.spec.assertV3Spec;
    if (typeof assertV3 !== 'function') {
      throw new Error('[maplamina] Missing MAPLAMINA.spec.assertV3Spec; ensure ml-spec.js is loaded/updated before runtime');
    }
    assertV3(x, 'runtimeInitialRender.renderInitial');


    // ---- render-boundary reset (Shiny/reactivity safety) ----
    rt._renderEpoch = (rt._renderEpoch || 0) + 1;
    try { rt._viewsPrev = {}; } catch (_) {}

    // Cancel any pending scheduled flush (scheduler)
    try {
      const s = rt._sched;
      if (s && s.raf) { cancelAnimationFrame(s.raf); s.raf = null; }
      if (s && s.layers && typeof s.layers.clear === 'function') s.layers.clear();
      if (s && s.rehydrate && typeof s.rehydrate.clear === 'function') s.rehydrate.clear();
      if (s && s.live && typeof s.live.clear === 'function') s.live.clear();
      if (s) { s.legends = false; s.controls = false; s.tooltip = false; s.next = null; s.chain = Promise.resolve(); }
    } catch (_) {}

    // Cancel any outstanding idle-prune tasks from the previous render
    try {
      if (rt.pruneTasks && rt.pruneTasks.size) {
        for (const id of rt.pruneTasks) { core.cancelIdlePrune(id); }
        rt.pruneTasks.clear();
      }
    } catch (_) {}

    // Drop hydrated layer cache; we'll repopulate below
    try { rt.layers && rt.layers.clear && rt.layers.clear(); } catch (_) {}

    rt.specRef = x;

    // MapLibre controls (map_options.controls)
    try {
      if (mfRuntimeMap && typeof mfRuntimeMap.applyMapLibreControls === 'function') {
        mfRuntimeMap.applyMapLibreControls(map, x, rt);
      }
    } catch (_) {}

    const t0 = (opts.t0 != null) ? opts.t0 : core.now();

    // ---- views + filters prep ----
    const activeViews = (typeof pickActiveViews === 'function') ? pickActiveViews(rt, x) : {};
    const viewOps = (typeof computeViewOpsByLayerV3 === 'function') ? computeViewOpsByLayerV3(x, activeViews) : null;
    const viewOpsByLayer = viewOps && viewOps.opsByLayer ? viewOps.opsByLayer : new Map();

    // Initialize filters state + build per-layer membership index
    if (typeof initFiltersState === 'function') initFiltersState(rt, x);
    rt._filterIndex = (typeof buildFilterIndex === 'function') ? buildFilterIndex(x) : null;

    // ---- hydrate + build deck.gl layers ----
    const specs = x['.__layers'] || {};
    const ids = Object.keys(specs);
    const layers = [];

    for (const id of ids) {
      const st0 = specs[id];

      // Apply active view ops on top of base_encodings.
      // Also ignore legacy per-layer views/filters/panel fields.
      let st = Object.assign({}, st0);
      st.id = st.id || id;

      // Prime transitions on initial render by unioning touched encodings across all views
      // for the member components. Prevents first-ever switch snapping.
      let __enc = (typeof mergeEncodings === 'function') ? mergeEncodings(st.base_encodings, null) : (st.base_encodings || {});
      const __ops = (viewOpsByLayer && typeof viewOpsByLayer.get === 'function') ? (viewOpsByLayer.get(id) || []) : [];
      const __compsViews = (x && x['.__components'] && x['.__components'].views) || {};

      if (Array.isArray(__ops) && __ops.length) {
        let __prime = null;
        for (const op of __ops) {
          try {
            const comp = (__compsViews && op && op.cid) ? __compsViews[op.cid] : null;
            const views = (comp && comp.views && typeof comp.views === 'object') ? comp.views : null;
            if (!views) continue;
            for (const vn of Object.keys(views)) {
              const enc = views[vn] && views[vn].encodings;
              if (!enc || typeof enc !== 'object') continue;
              __prime = __prime || {};
              for (const k of Object.keys(enc)) __prime[k] = 1;
            }
          } catch (_) {}
        }
        if (__prime && typeof primeRuntimeTransitions === 'function') {
          primeRuntimeTransitions(rt, id, st.type, __prime);
        }

        for (const op of __ops) {
          const patch = op && op.encPatch;
          if (patch && typeof patch === 'object' && typeof mergeEncodings === 'function') {
            __enc = mergeEncodings(__enc, patch);
          }
        }
      }

      st.base_encodings = __enc;

      await core.resolveActiveOnly(st);

      // Keep filters applied while switching views
      if (typeof applyGPUFilteringFromControls === 'function') {
        st = await applyGPUFilteringFromControls(st, st.id, x, rt);
      }

      const pruneId = core.pruneEmbeddedBlobsIdle(st);
      if (rt.pruneTasks) rt.pruneTasks.add(pruneId);
      rt.layers.set(st.id, { stHydrated: st, layer: null });

      // Attach any runtime-injected transitions (if present)
      st.__transitions = (rt._layerTransitions && rt._layerTransitions.get(id)) || null;

      const L = rt.buildLayer(st);
      layers.push(L);

      const entry = rt.layers.get(st.id);
      if (entry) entry.layer = L;

      core.resolveRemainingViewsIdle(st);
    }

    const flatLayers = Array.isArray(layers) && layers.flat ? layers.flat(Infinity) : [].concat.apply([], layers);
    overlay.setProps({ layers: flatLayers });
    const currentLayers = flatLayers;

    // Mount controls from .__controls and optional .__panel
    try { root.controls && root.controls.panel && typeof root.controls.panel.sync === 'function' && root.controls.panel.sync(el, x); } catch (_) {}

    // HUD summary + GPU filters meta
    try {
      const t1 = core.now();
      const parts = (typeof ensureHudParts === 'function') ? ensureHudParts(el) : null;
      if (parts && parts.summary) parts.summary.textContent = `layers: ${currentLayers.length} • build ${(t1 - t0).toFixed(1)}ms`;

      let totalRangeDims = 0;
      let totalCategoryDims = 0;
      const metaRows = [];
      const warnLines = [];

      for (const [layerId, entry] of rt.layers.entries()) {
        const stForMeta =
          entry?.stHydrated ||
          (x && x['.__layers'] ? x['.__layers'][layerId] : null);

        const m = root.filterAdapter && typeof root.filterAdapter.gpuMeta === 'function'
          ? root.filterAdapter.gpuMeta(stForMeta)
          : { rangeDims: 0, categoryDims: 0 };

        totalRangeDims += (m.rangeDims || 0);
        totalCategoryDims += (m.categoryDims || 0);

        if (m.rangeDims || m.categoryDims) {
          metaRows.push(
            `<div class="ml-hud-gpu-row">gpu ${layerId}: range×${m.rangeDims || 0} • cat×${m.categoryDims || 0}</div>`
          );
        }

        const warns = (entry?.stHydrated && Array.isArray(entry.stHydrated.__warns)) ? entry.stHydrated.__warns : [];
        for (const w of warns) {
          warnLines.push(`<div class="ml-hud-warn">⚠️ ${layerId}: ${w}</div>`);
        }
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
