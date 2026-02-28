(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  const core0 = root.core;
  if (!core0 || typeof core0.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-runtime-pipeline.js");
  }

  const utils0 = core0.require('utils', 'ml-runtime-pipeline.js');
  if (!utils0 || typeof utils0.normText !== 'function') {
    throw new Error("[maplamina] Missing function utils.normText required by ml-runtime-pipeline.js");
  }

  // IMPORTANT: preserve canonical utils.normText semantics (trim only, no lowercasing).
  // Many ids (layer ids, view ids, component ids) are case-sensitive in the authored spec.
  const normText = utils0.normText;

  const views0 = core0.require('views', 'ml-runtime-pipeline.js');
  if (!views0 || typeof views0.unionEncodingKeys !== 'function') {
    throw new Error("[maplamina] Missing function views.unionEncodingKeys required by ml-runtime-pipeline.js");
  }
  const unionEncodingKeysV3 = views0.unionEncodingKeys;

  function attach(rt, deps) {
    if (!rt || typeof rt !== 'object') return;

    // Always refresh deps (hot reload / re-render safety)
    rt._mfPipelineDeps = (deps && typeof deps === 'object') ? deps : (rt._mfPipelineDeps || {});

    if (rt.__mfPipelineAttached) return;
    rt.__mfPipelineAttached = true;

    rt._flushSnapshot = async function(job) {
      const deps = (this && this._mfPipelineDeps && typeof this._mfPipelineDeps === 'object') ? this._mfPipelineDeps : {};

      // Resolve dependencies (captured from the widget closure)
      const el = deps.el;
      const overlay = (typeof deps.getOverlay === 'function') ? deps.getOverlay() : null;

      const core = deps.core || root.core;
      if (!core) return;

      const applyOverlayReplacements = (typeof deps.applyOverlayReplacements === 'function') ? deps.applyOverlayReplacements : (() => null);
      const pickActiveViews = (typeof deps.pickActiveViews === 'function') ? deps.pickActiveViews : (() => ({}));
      const computeViewOpsByLayerV3 = (typeof deps.computeViewOpsByLayerV3 === 'function') ? deps.computeViewOpsByLayerV3 : (() => ({ controlledByGroup: new Map(), opsByLayer: new Map(), activeByLayer: new Map() }));

      const mergeEncodings = deps.mergeEncodings || (root.layerUtils && root.layerUtils.mergeEncodings);
      const flattenLayers = deps.flattenLayers || (root.layerUtils && root.layerUtils.flattenLayers);

      const applyGPUFilteringFromControls = (typeof deps.applyGPUFilteringFromControls === 'function') ? deps.applyGPUFilteringFromControls : (async (st) => st);

      const disableRuntimeTransitions = (typeof deps.disableRuntimeTransitions === 'function') ? deps.disableRuntimeTransitions : (() => null);
      const injectMotionTransitions = (typeof deps.injectMotionTransitions === 'function') ? deps.injectMotionTransitions : (() => null);

        const x = this.specRef;
        const epoch = job && job.renderEpoch;
        const spec0 = job && job.specRef;
        if (!x || !overlay) return;
        // Pass 1: skip stale flushes after a re-render / spec swap
        if (this._renderEpoch !== epoch || this.specRef !== spec0) return;
        const dirtyRehydrate = new Set((job && job.rehydrate) ? job.rehydrate.map(normText).filter(Boolean) : []);
        const dirtyLayers    = new Set((job && job.layers) ? job.layers.map(normText).filter(Boolean) : []);
        // Dominance: rehydrate > layers
        for (const lid of dirtyRehydrate) { dirtyLayers.delete(lid); }
        const doLegends = !!(job && job.legends);
        const doControls = !!(job && job.controls);
        const allowViewsMotion = !!(job && (job.allowMotionViews || normText(job.reason) === 'views'));
        // Stage 2: only 'views' updates may arm/retain motion transitions.
        // Any other update path (filters, clearTransitions, resize/spec rebuilds, etc.)
        // must rebuild with transitions disabled to avoid accidental animations.
        if (dirtyLayers.size) disableRuntimeTransitions(this, Array.from(dirtyLayers));
        if (!allowViewsMotion && dirtyRehydrate.size) disableRuntimeTransitions(this, Array.from(dirtyRehydrate));
        if (!dirtyRehydrate.size && !dirtyLayers.size && !doLegends && !doControls) return;
        const replacements = new Map();

        // --- Rehydrate layers (views/spec-driven) ---
        if (dirtyRehydrate.size) {
          // Ensure defaults for all view groups
          const activeViews = pickActiveViews(this, x);
          const viewOps = computeViewOpsByLayerV3(x, activeViews);
          const opsByLayer = viewOps && viewOps.opsByLayer ? viewOps.opsByLayer : new Map();

          for (const layerId of dirtyRehydrate) {
            if (this._renderEpoch !== epoch || this.specRef !== spec0) return;
            const st0 = x && x['.__layers'] ? x['.__layers'][layerId] : null;
            if (!st0) continue;
            let st = Object.assign({}, st0);
            st.id = st.id || layerId;
                        // Stage 2 (no animation): apply views per-component ops in deterministic order.
            // Do NOT merge patches ahead of time; last op wins for overlapping encodings.
            // IMPORTANT: a view may omit a property to fall back to the layer's base value.
            // Those "revert-to-base" changes must still count as touched for transitions, otherwise they will snap.
            let __enc = mergeEncodings(st.base_encodings, null);
            const __ops = (opsByLayer && typeof opsByLayer.get === 'function') ? (opsByLayer.get(layerId) || []) : [];
            const __compsViews = (x && x['.__components'] && x['.__components'].views) || {};
            const __prevByGroup = (this && this._viewsPrev && typeof this._viewsPrev === 'object') ? this._viewsPrev : {};
            if (Array.isArray(__ops) && __ops.length) {
              for (const op of __ops) {
                const patch = op && op.encPatch;                // Determine touched keys as union(prevViewKeys, nextViewKeys) so omitted keys still animate back to base.
                let touch = null;
                try {
                  const comp = (__compsViews && op && op.cid) ? __compsViews[op.cid] : null;
                  const views = (comp && comp.views && typeof comp.views === 'object') ? comp.views : null;

                  const prevName = (op && op.groupId) ? normText(__prevByGroup[op.groupId]) : null;
                  const prevEnc = (views && prevName && views[prevName] && views[prevName].encodings) || null;

                  const nextEnc = (patch && typeof patch === 'object')
                    ? patch
                    : (views && op && op.activeView && views[op.activeView] && views[op.activeView].encodings) || null;

                  touch = unionEncodingKeysV3(prevEnc, nextEnc);
                } catch (_) {}

                if (allowViewsMotion) {
                  if (touch) {
                    injectMotionTransitions(this, layerId, st.type, touch, op.motion);
                  } else if (patch && typeof patch === 'object') {
                    // Fallback: original behavior
                    injectMotionTransitions(this, layerId, st.type, patch, op.motion);
                  }
                }

                if (patch && typeof patch === 'object') {
                  __enc = mergeEncodings(__enc, patch);
                }
              }
            }
            st.base_encodings = __enc;
            await core.resolveActiveOnly(st);
            st = await applyGPUFilteringFromControls(st, st.id, x, this);
            const pruneId = core.pruneEmbeddedBlobsIdle(st);
            if (this.pruneTasks) this.pruneTasks.add(pruneId);
            // Stage 3: attach runtime-injected transitions (if any) to this layer build.
            // IMPORTANT: this is runtime-only (st.__transitions) and does NOT violate the v3 spec invariant.
            st.__transitions = (this._layerTransitions && this._layerTransitions.get(layerId)) || null;
            const L = this.buildLayer(st);
            const arr = flattenLayers(L);
            replacements.set(layerId, arr);
            const entry = this.layers.get(st.id) || {};
            entry.stHydrated = st;
            entry.layer = L;
            this.layers.set(st.id, entry);
            core.resolveRemainingViewsIdle(st);
          }
        }

        // --- Rebuild layers from hydrated spec (filters-driven) ---
        for (const layerId of dirtyLayers) {
          if (this._renderEpoch !== epoch || this.specRef !== spec0) return;
          const E = this.layers.get(layerId);
          if (!E || !E.stHydrated) continue;
          let st = Object.assign({}, E.stHydrated);
          st.id = st.id || layerId;
          st = await applyGPUFilteringFromControls(st, layerId, x, this);
          // Stage 3: persist any runtime transitions across filter rebuilds (sticky in Stage 3).
          st.__transitions = (this._layerTransitions && this._layerTransitions.get(layerId)) || null;
          const L = this.buildLayer(st);
          const arr = flattenLayers(L);
          replacements.set(layerId, arr);
          E.stHydrated = st;
          E.layer = L;
          this.layers.set(layerId, E);
        }

        if (replacements.size) {
          // Pass 1: guard against stale async updates after a re-render
          if (this._renderEpoch !== epoch || this.specRef !== spec0 || !overlay) return;
          applyOverlayReplacements(replacements);
        }


// Clear one-shot previous views captured for this batch of view updates
try {
  if (dirtyRehydrate && dirtyRehydrate.size && this._viewsPrev && typeof this._viewsPrev === 'object') {
    this._viewsPrev = {};
  }
} catch (_) {}

if (doLegends) {
          try { root.legends && typeof root.legends.applyVisibility === 'function' && root.legends.applyVisibility(el, x); } catch (_) {}
        }

        // Stage 2: control updates (e.g. summaries) can run without re-mounting.
        if (doControls) {
          try {
            root.controls && root.controls.panel && typeof root.controls.panel.update === 'function'
              && root.controls.panel.update(el, x, this, job);
          } catch (_) {}
        }

        // Future: job.tooltip hooks can be handled here without adding new schedulers.
    };
  }

  root.runtime.pipeline = { attach };
})(window);
