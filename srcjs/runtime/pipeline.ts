import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { applyVisibility } from '../components/legends';
import { applyOrderedViewOps } from '../components/views';
import type { ViewOp, computeViewOpsByLayer } from '../components/views';
import { update } from '../controls/panel';
import type { LayerState } from '../core/layer-state';
import type { Layer as SpecLayer } from '../core/spec-types';
import { normText } from '../core/utils';
import type { LayerEntry, WidgetElement, WidgetRuntime } from '../core/widget';
import * as filtersRuntime from '../filters/runtime';
import * as layerUtils from '../layers/utils';
import type { pickActiveViews } from './api';
import * as assembly from './assembly';
import type { MotionPolicy, injectMotionTransitions, syncJobTransitions, transitionsForBuild } from './motion';
import type { Invalidation } from './scheduler';

// What the widget hands to the pipeline.
export interface PipelineDeps {
  runtimeAssembly?: typeof assembly;
  el?: WidgetElement;
  getOverlay?: () => MapboxOverlay | null;
  applyOverlayReplacements?: (replacements: Map<string, Layer[]>) => Layer[];
  pickActiveViews?: typeof pickActiveViews;
  computeViewOpsByLayerV3?: typeof computeViewOpsByLayer;
  mergeEncodings?: typeof layerUtils.mergeEncodings;
  flattenLayers?: typeof layerUtils.flattenLayers;
  getGPUFilterContribution?: typeof filtersRuntime.getGPUFilterContribution;
  injectMotionTransitions?: typeof injectMotionTransitions;
  syncJobTransitions?: typeof syncJobTransitions;
  transitionsForBuild?: typeof transitionsForBuild;
}

interface RebuildOptions {
  layerId: string;
  sourceState?: SpecLayer | null;
  logical?: LayerState | null;
  withViews: boolean;
}

function setEntryRuntimeMeta(
  entry: LayerEntry,
  motionPolicy: MotionPolicy | null,
  invalidation: Invalidation | null,
  reason: string | null
): LayerEntry {
  if (!entry || typeof entry !== 'object') return entry;
  if (!entry.runtime || typeof entry.runtime !== 'object') entry.runtime = {};
  entry.runtime.lastReason = reason || (motionPolicy && motionPolicy.reason) || null;
  entry.runtime.lastMotionPolicy = motionPolicy || null;
  entry.runtime.lastInvalidation = invalidation || null;
  return entry;
}

export function attach(rt: WidgetRuntime | null | undefined, deps?: PipelineDeps | null): void {
  if (!rt || typeof rt !== 'object') return;

  rt._mfPipelineDeps = (deps && typeof deps === 'object') ? deps : (rt._mfPipelineDeps || {});
  if (rt.__mfPipelineAttached) return;
  rt.__mfPipelineAttached = true;

  rt._flushSnapshot = async function(job) {
    const deps: PipelineDeps = (this && this._mfPipelineDeps && typeof this._mfPipelineDeps === 'object') ? this._mfPipelineDeps : {};
    const el = deps.el;
    const overlay = (typeof deps.getOverlay === 'function') ? deps.getOverlay() : null;
    if (!overlay) return;

    const applyOverlayReplacements = deps.applyOverlayReplacements;
    const pickActiveViews = deps.pickActiveViews;
    const computeViewOpsByLayerV3 = deps.computeViewOpsByLayerV3;
    const mergeEncodings = deps.mergeEncodings || layerUtils.mergeEncodings;
    const flattenLayers = deps.flattenLayers || layerUtils.flattenLayers;
    const runtimeAssembly = deps.runtimeAssembly || assembly;
    const getGPUFilterContribution = deps.getGPUFilterContribution || filtersRuntime.getGPUFilterContribution;
    const injectMotionTransitions = deps.injectMotionTransitions;
    const syncJobTransitions = deps.syncJobTransitions;
    const transitionsForBuild = deps.transitionsForBuild;

    if (!runtimeAssembly || typeof runtimeAssembly.buildRenderArtifacts !== 'function' || typeof runtimeAssembly.getLogicalLayer !== 'function') {
      throw new Error('[maplamina] Missing runtime assembly helpers required by runtime/pipeline');
    }
    if (typeof applyOverlayReplacements !== 'function' || typeof pickActiveViews !== 'function' || typeof computeViewOpsByLayerV3 !== 'function') {
      throw new Error('[maplamina] Missing runtime pipeline dependencies required by runtime/pipeline');
    }
    if (typeof syncJobTransitions !== 'function' || typeof transitionsForBuild !== 'function') {
      throw new Error('[maplamina] Missing runtime motion helpers required by runtime/pipeline');
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

    const transitionTargets = Array.from(new Set(([] as string[]).concat(Array.from(dirtyLayers), Array.from(dirtyRehydrate))));
    const motionPolicy = syncJobTransitions(this, transitionTargets, job || { reason: null });
    const replacements = new Map<string, Layer[]>();

    let activeViews: Record<string, string> | null = null;
    let viewOpsByLayer = new Map<string, ViewOp[]>();
    if (dirtyRehydrate.size || dirtyLayers.size) {
      activeViews = pickActiveViews(this, x);
      const viewOps = computeViewOpsByLayerV3(x, activeViews);
      viewOpsByLayer = (viewOps && viewOps.opsByLayer) ? viewOps.opsByLayer : new Map();
    }

    const rebuildLayer = async ({ layerId, sourceState, logical, withViews }: RebuildOptions): Promise<void> => {
      // result.entry is the entry passed in: buildRenderArtifacts overwrites
      // entry.cache.lastRenderState in place.
      const layerType = (sourceState && sourceState.type) || (logical && logical.type) || null;
      const result = await buildRenderArtifacts({
        entry: this.layers.get(layerId),
        sourceState: sourceState || null,
        logical: logical || null,
        layerId,
        spec: x,
        rt: this,
        x,
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
        transitions: transitionsForBuild(this, layerId),
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
      const withViews = !!(viewOpsByLayer && typeof viewOpsByLayer.get === 'function' && Array.isArray(viewOpsByLayer.get(layerId)) && viewOpsByLayer.get(layerId)!.length);
      await rebuildLayer({ layerId, logical, withViews });
    }

    if (replacements.size) {
      if (this._renderEpoch !== epoch || this.specRef !== spec0 || !overlay) return;
      applyOverlayReplacements(replacements);
    }

    if (dirtyRehydrate.size && this._viewsPrev && typeof this._viewsPrev === 'object') this._viewsPrev = {};

    if (doLegends) {
      try { applyVisibility(el, x); } catch (e) { console.error(e); }
    }

    if (doControls) {
      try {
        update(el, x, this, job);
      } catch (e) { console.error(e); }
    }
  };
}
