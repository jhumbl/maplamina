import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { destroy as destroyTooltips, init as initTooltips } from '../components/tooltips';
import { computeViewOpsByLayer as computeViewOpsByLayerV3 } from '../components/views';
import { clear as clearPanel } from '../controls/panel';
import { cancelIdlePrune, clearMemo } from '../core/assets';
import type { LayerState } from '../core/layer-state';
import { assertV3Spec, hashBbox, normalizeSpec, unionBboxFromSpec } from '../core/spec';
import type { Spec } from '../core/spec-types';
import { now } from '../core/utils';
import type { WidgetElement } from '../core/widget';
import { buildFilterIndex, getGPUFilterContribution, initFiltersState } from '../filters/runtime';
import { originNearView } from '../layers/props';
import { layers } from '../layers/registry';
import { flattenLayers, mergeEncodings, swapOverlayLayers } from '../layers/utils';
import { ensureRuntime, pickActiveViews } from './api';
import type { RuntimeDeps } from './api';
import * as mfRuntimeAssembly from './assembly';
import { destroy as destroyDock } from './dock';
import { destroy as destroyHud, ensureParts as ensureHudParts } from './hud';
import { renderInitial } from './initial-render';
import * as mfRuntimeMap from './map';
import {
  injectMotionTransitions,
  primeRuntimeTransitions,
  syncJobTransitions,
  transitionsForBuild
} from './motion';

type HookedMap = MapLibreMap & { __mfOriginHook?: boolean };

export interface WidgetInstance {
  renderValue(x: unknown): Promise<void>;
  resize(width: number, height: number): void;
  destroy(): void;
}

export function create(el: WidgetElement, width: number, height: number): WidgetInstance {
  let map: HookedMap | null = null, overlay: MapboxOverlay | null = null;
  let currentLayers: Layer[] = [];
  let lastFitHash: string | null = null;

  function applyOverlayReplacements(replacements: Map<string, Layer[]>): Layer[] {
    const swapped = swapOverlayLayers(currentLayers || [], replacements);
    if (overlay) overlay.setProps({ layers: swapped });
    currentLayers = swapped;
    return swapped;
  }

  const normProjection = mfRuntimeMap.normProjection;
  const ensureMap = mfRuntimeMap.ensureMap;
  const ensureMapProjection = mfRuntimeMap.ensureMapProjection;
  const ensureOverlay = mfRuntimeMap.ensureOverlay;
  const clearMapLibreControls = mfRuntimeMap.clearMapLibreControls;
  const resetProjectionManager = mfRuntimeMap.resetProjectionManager;

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
      cache: cacheRoot
    };
  }

  function buildLayer(st: LayerState): Layer | Layer[] | null {
    const fn = layers.get(st.type);
    const ctx = makeCtx();
    return typeof fn === 'function' ? fn(st, ctx) : null;
  }

  function runtimeDeps(): RuntimeDeps {
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
        transitionsForBuild
      }
    };
  }

  return {
    // x is the spec as R emits it; normalizeSpec() replaces its empty top-level lists in place.
    renderValue: async function(x: Spec) {
      try { destroyTooltips(el); } catch (_) {}

      const showHud = x?.map_options?.hud === true;
      if (!showHud) {
        try { destroyHud(el); } catch (_) {}
      }

      normalizeSpec(x);

      assertV3Spec(x, 'runtime.widget.renderValue');

      const t0 = now();
      const unionBbox = (x.map_options?.fit_bounds === false) ? null : unionBboxFromSpec(x);
      const desiredProjection = normProjection(x.map_options?.projection);
      const rt = ensureRuntime(el, runtimeDeps());

      try {
        const prevProjection = (rt && rt._projectionMgr) ? normProjection(rt._projectionMgr.desired) : null;
        if (map && prevProjection && prevProjection !== desiredProjection) {
          try { mfRuntimeMap.clearDeferredFit(rt, el); } catch (_) {}
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
        await projReady;
      }

      overlay = ensureOverlay({ el, map, overlay });
      el.__mfGetMap = () => map;
      if (!map.__mfOriginHook) {
        map.__mfOriginHook = true;
        map.on('move', () => {
          let moved = false;
          const next = (currentLayers || []).map((l) => {
            const o = l && l.props && l.props.coordinateOrigin;
            if (!Array.isArray(o)) return l;
            const near = originNearView(o, map);
            if (near === o) return l;
            moved = true;
            return l.clone({ coordinateOrigin: near as typeof o }) as Layer;
          });
          if (moved && overlay) { currentLayers = next; overlay.setProps({ layers: next }); }
        });
      }
      initTooltips(el);

      const out = await renderInitial({
        el,
        x,
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
      try { destroyTooltips(el); } catch (_) {}
      try { destroyHud(el); } catch (_) {}
      try { clearPanel(el); } catch (_) {}

      const rt = el.__mfRuntime;
      try { mfRuntimeMap.clearDeferredFit(rt, el); } catch (_) {}
      if (rt && rt.pruneTasks && rt.pruneTasks.size) {
        for (const id of rt.pruneTasks) cancelIdlePrune(id);
        rt.pruneTasks.clear();
      }

      if (overlay) {
        try { overlay.setProps({ layers: [] }); } catch (_) {}
        try { map && map.removeControl(overlay); } catch (_) {}
        overlay = null;
      }

      try {
        destroyDock(el);
      } catch (_) {}

      try { clearMapLibreControls(map, el.__mfRuntime); } catch (_) {}
      try { resetProjectionManager(el.__mfRuntime); } catch (_) {}

      if (map) {
        try { map.remove(); } catch (_) {}
        map = null;
      }

      if (el.__mfRuntime) { el.__mfRuntime.layers?.clear?.(); el.__mfRuntime = null; }
      clearMemo();
      el.__mfCtxCache?.layerBuildCache?.clear?.();
      delete el.__mfCtxCache;
      currentLayers = [];
      lastFitHash = null;
    }
  };
}
