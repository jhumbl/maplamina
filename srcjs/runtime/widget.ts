import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { destroy as destroyTooltips, init as initTooltips } from '../components/tooltips';
import { computeViewOpsByLayer as computeViewOpsByLayerV3 } from '../components/views';
import { clear as clearPanel } from '../controls/panel';
import { clearMemo } from '../core/assets';
import type { LayerState } from '../core/layer-state';
import { assertV3Spec, hashBbox, normalizeSpec, unionBboxFromSpec } from '../core/spec';
import type { Spec } from '../core/spec-types';
import { now } from '../core/utils';
import type { WidgetElement } from '../core/widget';
import { buildFilterIndex, getGPUFilterContribution, initFiltersState } from '../filters/runtime';
import { originNearView } from '../layers/props';
import { layers } from '../layers/registry';
import { flattenLayers, mergeEncodings, replaceBuiltLayers } from '../layers/utils';
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
  // The deck layers each layer id built, in spec order.
  let builtLayers = new Map<string, Layer[]>();
  let lastFitHash: string | null = null;

  function applyOverlayReplacements(replacements: Map<string, Layer[]>): void {
    const flat = replaceBuiltLayers(builtLayers, replacements);
    if (overlay) overlay.setProps({ layers: flat });
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
      el,
      map,
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
      destroyTooltips(el);

      const showHud = x?.map_options?.hud === true;
      if (!showHud) {
        destroyHud(el);
      }

      normalizeSpec(x);

      assertV3Spec(x, 'runtime.widget.renderValue');

      const t0 = now();
      const unionBbox = (x.map_options?.fit_bounds === false) ? null : unionBboxFromSpec(x);
      const desiredProjection = normProjection(x.map_options?.projection);
      const rt = ensureRuntime(el, runtimeDeps());

      const prevProjection = (rt && rt._projectionMgr) ? normProjection(rt._projectionMgr.desired) : null;
      if (map && prevProjection && prevProjection !== desiredProjection) {
        mfRuntimeMap.clearDeferredFit(rt, el);
        if (overlay) {
          overlay.setProps({ layers: [] });
          map && map.removeControl(overlay);
          overlay = null;
        }
        builtLayers = new Map();
        clearMapLibreControls(map, rt);
        resetProjectionManager(rt);
        map.remove();
        map = null;
        lastFitHash = null;
      }

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
          const next = new Map<string, Layer[]>();
          for (const [id, built] of builtLayers) {
            next.set(id, built.map((l) => {
              const o = l && l.props && l.props.coordinateOrigin;
              if (!Array.isArray(o)) return l;
              const near = originNearView(o, map);
              if (near === o) return l;
              moved = true;
              return l.clone({ coordinateOrigin: near as typeof o }) as Layer;
            }));
          }
          if (moved && overlay) overlay.setProps({ layers: replaceBuiltLayers(builtLayers, next) });
        });
      }
      initTooltips(el);

      const built = await renderInitial({
        el,
        x,
        rt,
        map,
        overlay,
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
      if (built) builtLayers = built;
    },

    resize: function(w, h) {
      if (map) map.resize();
    },

    destroy: function() {
      destroyTooltips(el);
      destroyHud(el);
      clearPanel(el);

      const rt = el.__mfRuntime;
      mfRuntimeMap.clearDeferredFit(rt, el);

      if (overlay) {
        overlay.setProps({ layers: [] });
        map && map.removeControl(overlay);
        overlay = null;
      }

      destroyDock(el);

      clearMapLibreControls(map, el.__mfRuntime);
      resetProjectionManager(el.__mfRuntime);

      if (map) {
        map.remove();
        map = null;
      }

      if (el.__mfRuntime) { el.__mfRuntime.layers?.clear?.(); el.__mfRuntime = null; }
      clearMemo();
      el.__mfCtxCache?.layerBuildCache?.clear?.();
      delete el.__mfCtxCache;
      builtLayers = new Map();
      lastFitHash = null;
    }
  };
}
