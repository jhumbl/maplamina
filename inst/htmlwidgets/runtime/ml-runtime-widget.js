(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  root.runtime.widget = root.runtime.widget || {};

  // Stage 4: maplamina widget implementation (was previously in maplamina.js)
  root.runtime.widget.create = function (el, width, height) {
    const root = window.MAPLAMINA;
    const { core, dock } = root;

// Stage 1 refactor: shared spec + layer utilities
const mfSpec = window.MAPLAMINA.spec || {};
const mfSpecControls = mfSpec.controls || {};
const mfLayerUtils = window.MAPLAMINA.layerUtils || {};
const { unionBboxFromSpec, hashBbox } = mfSpec;
const {
  getControlGroups,
  getControlSpec,
  getControlGroupsByType,
  pickControlGroupByType,
  getViewsControlSpec,
  getFiltersControlGroup
} = mfSpecControls;
const { mergeEncodings, stripLegacyFields, flattenLayers, swapOverlayLayers } = mfLayerUtils;

// Stage 2 refactor: views + motion helpers
const mfViews = core.require('views', 'ml-runtime-widget.js');
const computeViewOpsByLayerV3 = core.requireFn('views', 'computeViewOpsByLayer', 'ml-runtime-widget.js');
const deckPropsTouchedByEncodingPatch = core.requireFn('layerProps', 'deckPropsTouchedByEncodingPatch', 'ml-runtime-widget.js');

// Stage 2: initial render extracted
const renderInitial = core.requireFn('runtimeInitialRender', 'renderInitial', 'ml-runtime-widget.js');

    let map = null, overlay = null, lastSpec = null;
    let currentLayers = [];
    let lastFitHash = null; // track camera bbox we last applied for this widget

        // Stage 5.2: runtime API + motion extracted into ml-runtime-api.js / ml-runtime-motion.js
    const mfRuntimeApi = (root.runtime && root.runtime.api) ? root.runtime.api : null;
    if (!mfRuntimeApi) throw new Error('[maplamina] Missing MAPLAMINA.runtime.api; ensure ml-runtime-api.js is loaded before ml-runtime-widget.js');
    const pickActiveViews = mfRuntimeApi.pickActiveViews;
    const ensureRuntime = mfRuntimeApi.ensureRuntime;
    if (typeof pickActiveViews !== 'function') throw new Error('[maplamina] Missing function runtime.api.pickActiveViews');
    if (typeof ensureRuntime !== 'function') throw new Error('[maplamina] Missing function runtime.api.ensureRuntime');

    const mfMotion = (root.runtime && root.runtime.motion) ? root.runtime.motion : null;
    if (!mfMotion) throw new Error('[maplamina] Missing MAPLAMINA.runtime.motion; ensure ml-runtime-motion.js is loaded before ml-runtime-widget.js');
    const disableRuntimeTransitions = mfMotion.disableRuntimeTransitions;
    const primeRuntimeTransitions = mfMotion.primeRuntimeTransitions;
    const injectMotionTransitions = mfMotion.injectMotionTransitions;
    if (typeof disableRuntimeTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.disableRuntimeTransitions');
    if (typeof primeRuntimeTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.primeRuntimeTransitions');
    if (typeof injectMotionTransitions !== 'function') throw new Error('[maplamina] Missing function runtime.motion.injectMotionTransitions');

// ---- small shared helpers (pure refactor) ----
    function applyOverlayReplacements(replacements) {
      const swapped = swapOverlayLayers(currentLayers || [], replacements);
      if (overlay) overlay.setProps({ layers: swapped });
      currentLayers = swapped;
      return swapped;
    }

                // ===== Milestone 5: filters runtime (.__controls.filters + .__components.{select,range}) =====
    // Stage 3 refactor: moved init/build/apply into ml-filters-runtime.js (runtime helpers).
    const mfFiltersRuntime = core.require('filtersRuntime', 'ml-runtime-widget.js');
    const initFiltersState = core.requireFn('filtersRuntime', 'initFiltersState', 'ml-runtime-widget.js');
    const buildFilterIndex = core.requireFn('filtersRuntime', 'buildFilterIndex', 'ml-runtime-widget.js');
    const applyGPUFilteringFromControls = core.requireFn('filtersRuntime', 'applyGPUFilteringFromControls', 'ml-runtime-widget.js');

    // --- Map/overlay/projection/controls ---
// Stage 5.3: moved to ml-runtime-map.js (MAPLAMINA.runtime.map.*).
const mfRuntimeMap = (root.runtime && root.runtime.map) ? root.runtime.map : null;
if (!mfRuntimeMap) throw new Error('[maplamina] Missing MAPLAMINA.runtime.map; ensure ml-runtime-map.js is loaded before ml-runtime-widget.js');
const normProjection = mfRuntimeMap.normProjection;
const ensureMap = mfRuntimeMap.ensureMap;
const ensureMapProjection = mfRuntimeMap.ensureMapProjection;
const ensureOverlay = mfRuntimeMap.ensureOverlay;
const applyMapLibreControls = mfRuntimeMap.applyMapLibreControls;
const clearMapLibreControls = mfRuntimeMap.clearMapLibreControls;
const resetProjectionManager = mfRuntimeMap.resetProjectionManager;
if (typeof normProjection !== 'function') throw new Error('[maplamina] Missing function runtime.map.normProjection');
if (typeof ensureMap !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureMap');
if (typeof ensureMapProjection !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureMapProjection');
if (typeof ensureOverlay !== 'function') throw new Error('[maplamina] Missing function runtime.map.ensureOverlay');
if (typeof applyMapLibreControls !== 'function') throw new Error('[maplamina] Missing function runtime.map.applyMapLibreControls');
if (typeof clearMapLibreControls !== 'function') throw new Error('[maplamina] Missing function runtime.map.clearMapLibreControls');
if (typeof resetProjectionManager !== 'function') throw new Error('[maplamina] Missing function runtime.map.resetProjectionManager');
function makeCtx() {
      const cache = el.__mfCtxCache || (el.__mfCtxCache = {
        resolvedRefs: new Map(),
        binaryDataByLayerId: new Map(),
        layersById: new Map()
      });

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
        filterAdapter: MAPLAMINA.filterAdapter,
        controls: MAPLAMINA.controls,
        cache
      };
    }

    
    // Stage 5.2: buildLayer stays widget-scoped (needs makeCtx), but runtime creation moved to ml-runtime-api.js
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
          el,
          getOverlay: () => overlay,
          applyOverlayReplacements,
          pickActiveViews,
          computeViewOpsByLayerV3,
          mergeEncodings,
          flattenLayers,
          applyGPUFilteringFromControls,
          disableRuntimeTransitions,
          injectMotionTransitions,
          core
        }
      };
    }
// --- HUD ---
// Stage 5.3: moved to ml-hud.js (MAPLAMINA.hud.*).
const ensureHudParts = core.requireFn('hud', 'ensureParts', 'ml-runtime-widget.js');
const destroyHud = core.requireFn('hud', 'destroy', 'ml-runtime-widget.js');
    return {
      renderValue: async function(x) {
        try { MAPLAMINA?.tooltips?.destroy?.(el); } catch(_) {}

        try {
          const oldStack = el.querySelector('.ml-view-switcher-stack');
          if (oldStack && oldStack.parentNode) oldStack.parentNode.removeChild(oldStack);
        } catch (_) {}

        // Milestone 3: global controls mounting (panel + standalone).
        // Remove any legacy per-layer UI without touching v3 control containers.
        try { MAPLAMINA?.controls?.panel?.removeLegacyLayerUI?.(el); } catch (_) {}

lastSpec = x;
// v3 normalization: some specs (e.g. legend-only) may omit empty buckets.
// If the input is already in v3 namespace (has any ".__" keys), coerce
// missing buckets to empty objects so v3 assertions and downstream code work.
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
// v3-only contract: fail fast if the spec is not in v3 shape.
if (!mfSpec || typeof mfSpec.assertV3Spec !== 'function') {
  throw new Error('[maplamina] Missing MAPLAMINA.spec.assertV3Spec; ensure ml-spec.js is loaded/updated before ml-runtime-widget.js');
}
mfSpec.assertV3Spec(x, 'runtime.widget.renderValue');

const t0 = core.now();
const unionBbox = (x.map_options?.fit_bounds === false) ? null : unionBboxFromSpec(x);

// Projection (map_options.projection)
const desiredProjection = normProjection(x.map_options?.projection);

// Ensure runtime early so we can track projection across renders.
const rt = ensureRuntime(el, runtimeDeps());

// MVP safety: do not switch projections under an existing deck.gl overlay.
// If projection changes across renders, hard-reset the map + overlay.
try {
  const prevProjection = (rt && rt._projectionMgr) ? normProjection(rt._projectionMgr.desired) : null;
  if (map && prevProjection && prevProjection !== desiredProjection) {
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


// Apply projection on style.load (and immediately if style is already loaded).
// For globe, wait for the first successful apply before attaching the overlay.
const projReady = ensureMapProjection(map, rt, desiredProjection);
if (desiredProjection === 'globe') {
  try { await projReady; } catch (_) {}
}

overlay = ensureOverlay({ el, map, overlay });


        el.__mfGetMap = () => map;
        MAPLAMINA?.tooltips?.init?.(el);
        // Pass 1: render-boundary reset (Shiny/reactivity safety)
        // Delegated to runtimeInitialRender.renderInitial (Stage 2).
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
          applyGPUFilteringFromControls,
          mergeEncodings,
          stripLegacyFields,
          primeRuntimeTransitions,
          ensureHudParts
        });
        if (out && Array.isArray(out.currentLayers)) currentLayers = out.currentLayers;

      },

      resize: function(w, h) {
        if (typeof w === 'number') width = w;
        if (typeof h === 'number') height = h;
        if (map) map.resize();
      },
      destroy: function () {
        try { MAPLAMINA?.tooltips?.destroy?.(el); } catch (_) {}
        try { destroyHud(el); } catch (_) {}

        // Remove v3 controls (panel + standalone) and any legacy per-layer panels
        try { MAPLAMINA?.controls?.panel?.clear?.(el); } catch (_) {}

        const rt = el.__mfRuntime;
        if (rt && rt.pruneTasks && rt.pruneTasks.size) {
          for (const id of rt.pruneTasks) { core.cancelIdlePrune(id); }
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
          // Best-effort fallback cleanup
          const stack = el.querySelector('.ml-layer-panel-stack');
          if (stack && stack.parentNode) stack.parentNode.removeChild(stack);
          const legacy = el.querySelector('.ml-view-switcher-stack');
          if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
        }

        // Remove MapLibre controls added via map_options.controls
        try { clearMapLibreControls(map, el.__mfRuntime); } catch (_) {}

        // Detach projection handler (if any)
        try { resetProjectionManager(el.__mfRuntime); } catch (_) {}

        if (map) {
          try { map.remove(); } catch (_) {}
          map = null;
        }

        if (el.__mfRuntime) { el.__mfRuntime.layers?.clear?.(); el.__mfRuntime = null; }

        lastSpec = null; currentLayers = []; lastFitHash = null;
      }
    };
  };
})(window);
