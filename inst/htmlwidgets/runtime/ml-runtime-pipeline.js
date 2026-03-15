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
  const normText = utils0.normText;

  const views0 = core0.require('views', 'ml-runtime-pipeline.js');
  const applyOrderedViewOps = views0 && views0.applyOrderedViewOps;

  function setEntryRuntimeMeta(entry, motionPolicy, invalidation, reason) {
    if (!entry || typeof entry !== 'object') return entry;
    if (!entry.runtime || typeof entry.runtime !== 'object') entry.runtime = {};
    entry.runtime.lastReason = reason || (motionPolicy && motionPolicy.reason) || null;
    entry.runtime.lastMotionPolicy = motionPolicy || null;
    entry.runtime.lastInvalidation = invalidation || null;
    return entry;
  }

  function attach(rt, deps) {
    if (!rt || typeof rt !== 'object') return;

    rt._mfPipelineDeps = (deps && typeof deps === 'object') ? deps : (rt._mfPipelineDeps || {});
    if (rt.__mfPipelineAttached) return;
    rt.__mfPipelineAttached = true;

    rt._flushSnapshot = async function(job) {
      const deps = (this && this._mfPipelineDeps && typeof this._mfPipelineDeps === 'object') ? this._mfPipelineDeps : {};
      const el = deps.el;
      const overlay = (typeof deps.getOverlay === 'function') ? deps.getOverlay() : null;
      const core = deps.core || root.core;
      if (!core || !overlay) return;

      const applyOverlayReplacements = deps.applyOverlayReplacements;
      const pickActiveViews = deps.pickActiveViews;
      const computeViewOpsByLayerV3 = deps.computeViewOpsByLayerV3;
      const mergeEncodings = deps.mergeEncodings || (root.layerUtils && root.layerUtils.mergeEncodings);
      const flattenLayers = deps.flattenLayers || (root.layerUtils && root.layerUtils.flattenLayers);
      const runtimeAssembly = deps.runtimeAssembly || (root.runtime && root.runtime.assembly);
      const getGPUFilterContribution = deps.getGPUFilterContribution || (root.filtersRuntime && root.filtersRuntime.getGPUFilterContribution);
      const injectMotionTransitions = deps.injectMotionTransitions;
      const syncJobTransitions = deps.syncJobTransitions;
      const transitionsForBuild = deps.transitionsForBuild;

      if (!runtimeAssembly || typeof runtimeAssembly.buildRenderArtifacts !== 'function' || typeof runtimeAssembly.getLogicalLayer !== 'function') {
        throw new Error('[maplamina] Missing runtime assembly helpers required by ml-runtime-pipeline.js');
      }
      if (typeof applyOverlayReplacements !== 'function' || typeof pickActiveViews !== 'function' || typeof computeViewOpsByLayerV3 !== 'function') {
        throw new Error('[maplamina] Missing runtime pipeline dependencies required by ml-runtime-pipeline.js');
      }
      if (typeof syncJobTransitions !== 'function' || typeof transitionsForBuild !== 'function') {
        throw new Error('[maplamina] Missing runtime motion helpers required by ml-runtime-pipeline.js');
      }

      const buildRenderArtifacts = runtimeAssembly.buildRenderArtifacts;
      const getLogicalLayer = runtimeAssembly.getLogicalLayer;

      const x = this.specRef;
      const epoch = job && job.renderEpoch;
      const spec0 = job && job.specRef;
      if (!x) return;
      if (this._renderEpoch !== epoch || this.specRef !== spec0) return;

      const dirtyRehydrate = new Set((job && job.rehydrate) ? job.rehydrate.map(normText).filter(Boolean) : []);
      const dirtyLayers = new Set((job && job.layers) ? job.layers.map(normText).filter(Boolean) : []);
      for (const lid of dirtyRehydrate) dirtyLayers.delete(lid);

      const doLegends = !!(job && job.legends);
      const doControls = !!(job && job.controls);
      if (!dirtyRehydrate.size && !dirtyLayers.size && !doLegends && !doControls) return;

      const transitionTargets = Array.from(new Set([].concat(Array.from(dirtyLayers), Array.from(dirtyRehydrate))));
      const motionPolicy = syncJobTransitions(this, transitionTargets, job || { reason: null });
      const replacements = new Map();

      let activeViews = null;
      let viewOpsByLayer = new Map();
      if (dirtyRehydrate.size || dirtyLayers.size) {
        activeViews = pickActiveViews(this, x);
        const viewOps = computeViewOpsByLayerV3(x, activeViews);
        viewOpsByLayer = (viewOps && viewOps.opsByLayer) ? viewOps.opsByLayer : new Map();
      }

      const rebuildLayer = async ({ layerId, sourceState, logical, withViews }) => {
        // NOTE: if re-adding diagnostic logging here, beware that prevEntry and
        // result.entry are the same object — buildRenderArtifacts overwrites
        // entry.cache.lastRenderState in place. Snapshot any previous render state
        // *before* calling buildRenderArtifacts, not after.
        const layerViewOps = (viewOpsByLayer && typeof viewOpsByLayer.get === 'function' && Array.isArray(viewOpsByLayer.get(layerId)))
          ? viewOpsByLayer.get(layerId)
          : [];
        const layerType = (sourceState && sourceState.type) || (logical && logical.type) || null;
        const result = await buildRenderArtifacts({
          entry: this.layers.get(layerId),
          sourceState: sourceState || null,
          logical: logical || null,
          layerId,
          spec: x,
          rt: this,
          x,
          core,
          mergeEncodings,
          opsByLayer: withViews ? viewOpsByLayer : null,
          applyOrderedViewOps: withViews ? applyOrderedViewOps : null,
          prevByGroup: withViews ? ((this && this._viewsPrev && typeof this._viewsPrev === 'object') ? this._viewsPrev : {}) : null,
          onViewOp: withViews ? ((op, meta) => {
            if (!motionPolicy.allowTransitions || typeof injectMotionTransitions !== 'function') return;
            const touch = meta && meta.touch;
            const patch = meta && meta.patch;
            if (touch) injectMotionTransitions(this, layerId, layerType, touch, op.motion);
            else if (patch && typeof patch === 'object') injectMotionTransitions(this, layerId, layerType, patch, op.motion);
          }) : null,
          getGPUFilterContribution,
          transitions: transitionsForBuild(this, layerId, motionPolicy),
          buildLayer: this.buildLayer
        });

        if (!result) return;
        setEntryRuntimeMeta(result.entry, motionPolicy, (job && job.invalidation) || null, motionPolicy.reason || (job && job.reason) || null);
        replacements.set(layerId, flattenLayers(result.layer));
        this.layers.set(layerId, result.entry);
      };

      if (dirtyRehydrate.size) {
        for (const layerId of dirtyRehydrate) {
          if (this._renderEpoch !== epoch || this.specRef !== spec0) return;
          const st0 = x && x['.__layers'] ? x['.__layers'][layerId] : null;
          if (!st0) continue;
          await rebuildLayer({ layerId, sourceState: st0, withViews: true });
        }
      }

      for (const layerId of dirtyLayers) {
        if (this._renderEpoch !== epoch || this.specRef !== spec0) return;
        const entry = this.layers.get(layerId);
        const logical = getLogicalLayer(entry);
        if (!logical) continue;
        const withViews = !!(viewOpsByLayer && typeof viewOpsByLayer.get === 'function' && Array.isArray(viewOpsByLayer.get(layerId)) && viewOpsByLayer.get(layerId).length);
        await rebuildLayer({ layerId, logical, withViews });
      }

      if (replacements.size) {
        if (this._renderEpoch !== epoch || this.specRef !== spec0 || !overlay) return;
        applyOverlayReplacements(replacements);
      }

      try {
        if (dirtyRehydrate.size && this._viewsPrev && typeof this._viewsPrev === 'object') this._viewsPrev = {};
      } catch (_) {}

      if (doLegends) {
        try { root.legends && typeof root.legends.applyVisibility === 'function' && root.legends.applyVisibility(el, x); } catch (_) {}
      }

      if (doControls) {
        try {
          root.controls && root.controls.panel && typeof root.controls.panel.update === 'function'
            && root.controls.panel.update(el, x, this, job);
        } catch (_) {}
      }
    };
  }

  root.runtime.pipeline = { attach };
})(window);
