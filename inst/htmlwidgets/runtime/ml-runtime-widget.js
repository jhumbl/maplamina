(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  root.runtime.widget = root.runtime.widget || {};

  root.runtime.widget.create = function(el, width, height) {
    const root = window.MAPLAMINA;
    const { core, dock } = root;

    const mfSpec = window.MAPLAMINA.spec || {};
    const mfLayerUtils = window.MAPLAMINA.layerUtils || {};
    const { unionBboxFromSpec, hashBbox } = mfSpec;
    const { mergeEncodings, flattenLayers, swapOverlayLayers } = mfLayerUtils;

    const computeViewOpsByLayerV3 = core.requireFn('views', 'computeViewOpsByLayer', 'ml-runtime-widget.js');
    const renderInitial = core.requireFn('runtimeInitialRender', 'renderInitial', 'ml-runtime-widget.js');

    let map = null, overlay = null;
    let currentLayers = [];
    let lastFitHash = null;

    const mfRuntimeApi = (root.runtime && root.runtime.api) ? root.runtime.api : null;
    if (!mfRuntimeApi) throw new Error('[maplamina] Missing MAPLAMINA.runtime.api; ensure ml-runtime-api.js is loaded before ml-runtime-widget.js');
    const pickActiveViews = mfRuntimeApi.pickActiveViews;
    const ensureRuntime = mfRuntimeApi.ensureRuntime;
    if (typeof pickActiveViews !== 'function') throw new Error('[maplamina] Missing function runtime.api.pickActiveViews');
    if (typeof ensureRuntime !== 'function') throw new Error('[maplamina] Missing function runtime.api.ensureRuntime');

    const mfMotion = (root.runtime && root.runtime.motion) ? root.runtime.motion : null;
    const mfRuntimeAssembly = (root.runtime && root.runtime.assembly) ? root.runtime.assembly : null;
    if (!mfMotion) throw new Error('[maplamina] Missing MAPLAMINA.runtime.motion; ensure ml-runtime-motion.js is loaded before ml-runtime-widget.js');
    if (!mfRuntimeAssembly) throw new Error('[maplamina] Missing MAPLAMINA.runtime.assembly; ensure ml-runtime-assembly.js is loaded before ml-runtime-widget.js');
    const primeRuntimeTransitions = mfMotion.primeRuntimeTransitions;
    const injectMotionTransitions = mfMotion.injectMotionTransitions;
    const syncJobTransitions = mfMotion.syncJobTransitions;
    const transitionsForBuild = mfMotion.transitionsForBuild;
    if (typeof primeRuntimeTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.primeRuntimeTransitions');
    if (typeof injectMotionTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.injectMotionTransitions');
    if (typeof syncJobTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.syncJobTransitions');
    if (typeof transitionsForBuild !== 'function') throw new Error('[maplamina] Missing function runtime.motion.transitionsForBuild');

    function applyOverlayReplacements(replacements) {
      const swapped = swapOverlayLayers(currentLayers || [], replacements);
      if (overlay) overlay.setProps({ layers: swapped });
      currentLayers = swapped;
      return swapped;
    }

    const initFiltersState = core.requireFn('filtersRuntime', 'initFiltersState', 'ml-runtime-widget.js');
    const buildFilterIndex = core.requireFn('filtersRuntime', 'buildFilterIndex', 'ml-runtime-widget.js');
    const getGPUFilterContribution = core.requireFn('filtersRuntime', 'getGPUFilterContribution', 'ml-runtime-widget.js');

    const mfRuntimeMap = (root.runtime && root.runtime.map) ? root.runtime.map : null;
    if (!mfRuntimeMap) throw new Error('[maplamina] Missing MAPLAMINA.runtime.map; ensure ml-runtime-map.js is loaded before ml-runtime-widget.js');
    const normProjection = mfRuntimeMap.normProjection;
    const ensureMap = mfRuntimeMap.ensureMap;
    const ensureMapProjection = mfRuntimeMap.ensureMapProjection;
    const ensureOverlay = mfRuntimeMap.ensureOverlay;
    const clearMapLibreControls = mfRuntimeMap.clearMapLibreControls;
    const resetProjectionManager = mfRuntimeMap.resetProjectionManager;
    if (typeof normProjection !== 'function') throw new Error('[maplamina] Missing function runtime.map.normProjection');
    if (typeof ensureMap !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureMap');
    if (typeof ensureMapProjection !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureMapProjection');
    if (typeof ensureOverlay !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureOverlay');
    if (typeof clearMapLibreControls !== 'function') throw new Error('[maplamina] Missing function runtime.map.clearMapLibreControls');
    if (typeof resetProjectionManager !== 'function') throw new Error('[maplamina] Missing function runtime.map.resetProjectionManager');

    function makeCtx() {
      const cacheRoot = el.__mfCtxCache || (el.__mfCtxCache = {});
      if (!(cacheRoot.layerBuildCache instanceof Map)) cacheRoot.layerBuildCache = new Map();

      return {
        id: el.id || null,
        el,
        width,
        height,
        map,
        overlay,
        utils: MAPLAMINA.utils,
        assets: MAPLAMINA.assets,
        data: MAPLAMINA.data,
        encodings: MAPLAMINA.encodings,
        views: MAPLAMINA.views,
        transitions: MAPLAMINA.transitions,
        tooltips: MAPLAMINA.tooltips,
        filters: MAPLAMINA.filters,
        filterCore: MAPLAMINA.filterCore,
        controls: MAPLAMINA.controls,
        cache: cacheRoot
      };
    }

    function buildLayer(st) {
      const fn = MAPLAMINA.layers && MAPLAMINA.layers.get(st.type);
      const ctx = makeCtx();
      return typeof fn === 'function' ? fn(st, ctx) : null;
    }

    function runtimeDeps() {
      return {
        buildLayer,
        computeViewOpsByLayerV3,
        initFiltersState,
        pipelineDeps: {
          runtimeAssembly: mfRuntimeAssembly,
          el,
          getOverlay: () => overlay,
          applyOverlayReplacements,
          pickActiveViews,
          computeViewOpsByLayerV3,
          mergeEncodings,
          flattenLayers,
          getGPUFilterContribution,
          injectMotionTransitions,
          syncJobTransitions,
          transitionsForBuild,
          core
        }
      };
    }

    const ensureHudParts = core.requireFn('hud', 'ensureParts', 'ml-runtime-widget.js');
    const destroyHud = core.requireFn('hud', 'destroy', 'ml-runtime-widget.js');

    return {
      renderValue: async function(x) {
        try { MAPLAMINA?.tooltips?.destroy?.(el); } catch (_) {}
        try {
          const oldStack = el.querySelector('.ml-view-switcher-stack');
          if (oldStack && oldStack.parentNode) oldStack.parentNode.removeChild(oldStack);
        } catch (_) {}
        try { MAPLAMINA?.controls?.panel?.removeLegacyLayerUI?.(el); } catch (_) {}

        const showHud = x?.map_options?.hud === true;
        if (!showHud) {
          try { destroyHud(el); } catch (_) {}
        }

        try {
          if (x && typeof x === 'object') {
            const hasV3Keys = Object.keys(x).some(k => typeof k === 'string' && k.startsWith('.__'));
            if (hasV3Keys) {
              if (!x['.__layers'] || typeof x['.__layers'] !== 'object' || Array.isArray(x['.__layers'])) x['.__layers'] = {};
              if (!x['.__components'] || typeof x['.__components'] !== 'object' || Array.isArray(x['.__components'])) x['.__components'] = {};
              if (!x['.__controls'] || typeof x['.__controls'] !== 'object' || Array.isArray(x['.__controls'])) x['.__controls'] = {};
            }
          }
        } catch (_) {}

        if (!mfSpec || typeof mfSpec.assertV3Spec !== 'function') {
          throw new Error('[maplamina] Missing MAPLAMINA.spec.assertV3Spec; ensure ml-spec.js is loaded/updated before ml-runtime-widget.js');
        }
        mfSpec.assertV3Spec(x, 'runtime.widget.renderValue');

        const t0 = core.now();
        const unionBbox = (x.map_options?.fit_bounds === false) ? null : unionBboxFromSpec(x);
        const desiredProjection = normProjection(x.map_options?.projection);
        const rt = ensureRuntime(el, runtimeDeps());

        try {
          const prevProjection = (rt && rt._projectionMgr) ? normProjection(rt._projectionMgr.desired) : null;
          if (map && prevProjection && prevProjection !== desiredProjection) {
            try { mfRuntimeMap?.clearDeferredFit?.(rt, el); } catch (_) {}
            if (overlay) {
              try { overlay.setProps({ layers: [] }); } catch (_) {}
              try { map && map.removeControl(overlay); } catch (_) {}
              overlay = null;
            }
            currentLayers = [];
            try { clearMapLibreControls(map, rt); } catch (_) {}
            try { resetProjectionManager(rt); } catch (_) {}
            try { map.remove(); } catch (_) {}
            map = null;
            lastFitHash = null;
          }
        } catch (_) {}

        const em = ensureMap({
          el,
          rt,
          map,
          style: x.map_options?.style,
          dragRotate: x.map_options?.dragRotate,
          initialBbox: unionBbox,
          doFit: x.map_options?.fit_bounds,
          hashBbox,
          lastFitHash
        });
        map = em.map || map;
        if (Object.prototype.hasOwnProperty.call(em, 'lastFitHash')) lastFitHash = em.lastFitHash;

        const projReady = ensureMapProjection(map, rt, desiredProjection);
        if (desiredProjection === 'globe') {
          try { await projReady; } catch (_) {}
        }

        overlay = ensureOverlay({ el, map, overlay });
        el.__mfGetMap = () => map;
        MAPLAMINA?.tooltips?.init?.(el);

        const out = await renderInitial({
          el,
          x,
          core,
          rt,
          map,
          overlay,
          currentLayers,
          t0,
          mfRuntimeMap,
          pickActiveViews,
          computeViewOpsByLayerV3,
          initFiltersState,
          buildFilterIndex,
          getGPUFilterContribution,
          mergeEncodings,
          runtimeAssembly: mfRuntimeAssembly,
          primeRuntimeTransitions,
          ensureHudParts: showHud ? ensureHudParts : null
        });
        if (out && Array.isArray(out.currentLayers)) currentLayers = out.currentLayers;
      },

      resize: function(w, h) {
        if (typeof w === 'number') width = w;
        if (typeof h === 'number') height = h;
        if (map) map.resize();
      },

      destroy: function() {
        try { MAPLAMINA?.tooltips?.destroy?.(el); } catch (_) {}
        try { destroyHud(el); } catch (_) {}
        try { MAPLAMINA?.controls?.panel?.clear?.(el); } catch (_) {}

        const rt = el.__mfRuntime;
        try { mfRuntimeMap?.clearDeferredFit?.(rt, el); } catch (_) {}
        if (rt && rt.pruneTasks && rt.pruneTasks.size) {
          for (const id of rt.pruneTasks) core.cancelIdlePrune(id);
          rt.pruneTasks.clear();
        }

        if (overlay) {
          try { overlay.setProps({ layers: [] }); } catch (_) {}
          try { map && map.removeControl(overlay); } catch (_) {}
          overlay = null;
        }

        try {
          if (dock && typeof dock.destroy === 'function') dock.destroy(el);
        } catch (_) {
          const stack = el.querySelector('.ml-layer-panel-stack');
          if (stack && stack.parentNode) stack.parentNode.removeChild(stack);
          const legacy = el.querySelector('.ml-view-switcher-stack');
          if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
        }

        try { clearMapLibreControls(map, el.__mfRuntime); } catch (_) {}
        try { resetProjectionManager(el.__mfRuntime); } catch (_) {}

        if (map) {
          try { map.remove(); } catch (_) {}
          map = null;
        }

        if (el.__mfRuntime) { el.__mfRuntime.layers?.clear?.(); el.__mfRuntime = null; }
        try { el.__mfCtxCache?.layerBuildCache?.clear?.(); } catch (_) {}
        try { delete el.__mfCtxCache; } catch (_) {}
        currentLayers = [];
        lastFitHash = null;
      }
    };
  };
})(window);
