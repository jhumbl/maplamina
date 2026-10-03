import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { applyOrderedViewOps, collectPrimeViewEncodingKeys } from '../components/views';
import type { ViewOp, computeViewOpsByLayer } from '../components/views';
import { sync, update } from '../controls/panel';
import { cancelIdlePrune } from '../core/assets';
import type { TransitionsMap } from '../core/layer-state';
import { assertV3Spec } from '../core/spec';
import type { Spec } from '../core/spec-types';
import { escapeHtml, now } from '../core/utils';
import type { WidgetElement, WidgetRuntime } from '../core/widget';
import * as filtersRuntime from '../filters/runtime';
import { gpuMeta } from '../layers/props';
import type { mergeEncodings } from '../layers/utils';
import type { pickActiveViews } from './api';
import * as assembly from './assembly';
import type { ensureParts } from './hud';
import type * as runtimeMap from './map';
import * as motion from './motion';

export interface RenderInitialOptions {
  el: WidgetElement;
  x: Spec;
  rt: WidgetRuntime | null;
  map: MapLibreMap | null;
  overlay: MapboxOverlay | null;
  currentLayers?: Layer[];
  t0?: number | null;
  mfRuntimeMap?: typeof runtimeMap | null;
  pickActiveViews?: typeof pickActiveViews;
  computeViewOpsByLayerV3?: typeof computeViewOpsByLayer;
  initFiltersState?: typeof filtersRuntime.initFiltersState;
  buildFilterIndex?: typeof filtersRuntime.buildFilterIndex;
  getGPUFilterContribution?: typeof filtersRuntime.getGPUFilterContribution;
  mergeEncodings?: typeof mergeEncodings;
  runtimeAssembly?: typeof assembly;
  primeRuntimeTransitions?: typeof motion.primeRuntimeTransitions;
  disableRuntimeTransitions?: typeof motion.disableRuntimeTransitions;
  transitionsForBuild?: typeof motion.transitionsForBuild;
  ensureHudParts?: typeof ensureParts | null;
}

function readInitialTransitions(
  rt: WidgetRuntime,
  layerId: string,
  transitionsForBuild: typeof motion.transitionsForBuild
): TransitionsMap | null {
  try {
    if (typeof transitionsForBuild === 'function') return transitionsForBuild(rt, layerId);
  } catch (_) {}

  const lid = String(layerId || '');
  const t = (rt && rt._layerTransitions && typeof rt._layerTransitions.get === 'function')
    ? rt._layerTransitions.get(lid)
    : null;
  return (t && typeof t === 'object' && Object.keys(t).length) ? t : null;

  return null;
}

export async function renderInitial(opts: RenderInitialOptions): Promise<{ currentLayers: Layer[] }> {
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
  const getGPUFilterContribution = opts.getGPUFilterContribution || filtersRuntime.getGPUFilterContribution;
  const mergeEncodings = opts.mergeEncodings;
  const runtimeAssembly = opts.runtimeAssembly || assembly;
  const primeRuntimeTransitions = opts.primeRuntimeTransitions || motion.primeRuntimeTransitions;
  const disableRuntimeTransitions = opts.disableRuntimeTransitions || motion.disableRuntimeTransitions;
  const transitionsForBuild = opts.transitionsForBuild || motion.transitionsForBuild;
  const ensureHudParts = opts.ensureHudParts;

  if (!el || !x || !rt || !overlay) return { currentLayers: opts.currentLayers || [] };
  if (!runtimeAssembly || typeof runtimeAssembly.buildRenderArtifacts !== 'function' || typeof runtimeAssembly.getLogicalLayer !== 'function') {
    throw new Error('[maplamina] Missing runtime assembly helpers required by runtime/initial-render');
  }

  const buildRenderArtifacts = runtimeAssembly.buildRenderArtifacts;
  const getRenderState = runtimeAssembly.getRenderState;
  const getLogicalLayer = runtimeAssembly.getLogicalLayer;

  assertV3Spec(x, 'runtimeInitialRender.renderInitial');

  rt._renderEpoch = (rt._renderEpoch || 0) + 1;
  rt._viewsPrev = {};

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

  if (rt.pruneTasks && rt.pruneTasks.size) {
    for (const id of rt.pruneTasks) cancelIdlePrune(id);
    rt.pruneTasks.clear();
  }

  rt.layers && rt.layers.clear && rt.layers.clear();
  rt.specRef = x;

  if (mfRuntimeMap && typeof mfRuntimeMap.applyMapLibreControls === 'function') {
    mfRuntimeMap.applyMapLibreControls(map, x, rt);
  }

  const t0 = (opts.t0 != null) ? opts.t0 : now();
  const activeViews = (typeof pickActiveViews === 'function') ? pickActiveViews(rt, x) : {};
  const viewOps = (typeof computeViewOpsByLayerV3 === 'function') ? computeViewOpsByLayerV3(x, activeViews) : null;
  const viewOpsByLayer = viewOps && viewOps.opsByLayer ? viewOps.opsByLayer : new Map<string, ViewOp[]>();

  if (typeof initFiltersState === 'function') initFiltersState(rt, x);
  rt._filterIndex = (typeof buildFilterIndex === 'function') ? buildFilterIndex(x) : null;

  const specs = x['.__layers'] || {};
  const ids = Object.keys(specs);
  const layers: (Layer | Layer[] | null)[] = [];

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

  // A builder may return null; deck.gl skips it.
  const flatLayers = (Array.isArray(layers) && layers.flat ? layers.flat(Infinity) : ([] as unknown[]).concat.apply([], layers)) as Layer[];
  overlay.setProps({ layers: flatLayers });
  const currentLayers = flatLayers;

  try { sync(el, x); } catch (_) {}
  try { update(el, x, rt, { reason: 'initial' }); } catch (_) {}

  try {
    const t1 = now();
    const parts = (typeof ensureHudParts === 'function') ? ensureHudParts(el) : null;
    if (parts && parts.summary) parts.summary.textContent = `layers: ${currentLayers.length} • build ${(t1 - t0).toFixed(1)}ms`;

    let totalRangeDims = 0;
    let totalCategoryDims = 0;
    const metaRows: string[] = [];
    const warnLines: string[] = [];

    for (const [layerId, entry] of rt.layers.entries()) {
      const stForMeta = getRenderState(entry) || getLogicalLayer(entry) || null;
      const m = gpuMeta(stForMeta);

      totalRangeDims += (m.rangeDims || 0);
      totalCategoryDims += (m.categoryDims || 0);

      if (m.rangeDims || m.categoryDims) {
        metaRows.push(`<div class="ml-hud-gpu-row">gpu ${escapeHtml(layerId)}: range×${m.rangeDims || 0} • cat×${m.categoryDims || 0}</div>`);
      }

      const warnState = getRenderState(entry) || getLogicalLayer(entry) || null;
      const warns = (warnState && Array.isArray(warnState.__warns)) ? warnState.__warns : [];
      for (const w of warns) warnLines.push(`<div class="ml-hud-warn">⚠️ ${escapeHtml(layerId)}: ${escapeHtml(w)}</div>`);
    }

    if (parts && parts.gpu) parts.gpu.innerHTML = [
      `<div class="ml-hud-gpu-head">GPU filters: R=${totalRangeDims} C=${totalCategoryDims}</div>`,
      metaRows.length ? `<div class="ml-hud-gpu-rows">${metaRows.join('')}</div>` : ''
    ].join('');

    if (parts && parts.notes) parts.notes.innerHTML = warnLines.join('') || '';
  } catch (_) {}

  return { currentLayers };
}
