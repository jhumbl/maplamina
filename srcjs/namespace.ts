// Publishes the modules on window.MAPLAMINA under the names the widget scripts read.

import { resolveIcon } from './components/icons';
import { applyVisibility, buildLegendCard } from './components/legends';
import * as tooltips from './components/tooltips';
import { applyOrderedViewOps, collectPrimeViewEncodingKeys, computeViewOpsByLayer } from './components/views';
import {
  cancelIdlePrune,
  clearMemo,
  depUrl,
  fetchArray,
  pruneEmbeddedBlobs,
  pruneEmbeddedBlobsIdle,
  resolveRefOrHref
} from './core/assets';
import {
  HYDRATE_GEOM,
  getIndexers,
  hydrateGeometryBySpec,
  resolveActiveOnly,
  resolveColumnsAndViews,
  resolveRemainingViewsIdle
} from './core/data';
import { colorAccessorFrom, numericAccessorFrom } from './core/encodings';
import type { LayerState } from './core/layer-state';
import { ensureFiltersContainer, getElState, publishFilterState, seedSelectionSet } from './filters/core';
import { ensureFilterUI } from './filters/filters';
import { ensureRangeUI } from './filters/range';
import { mount } from './filters/range-slider';
import { buildFilterIndex, getGPUFilterContribution, initFiltersState } from './filters/runtime';
import { AUTO_DROPDOWN_AT, ensureSelectUI } from './filters/select';
import { buildScatterplotLayer } from './layers/circle';
import { buildIconLayer } from './layers/icon';
import { buildPathLayer } from './layers/line';
import { buildMarkerLayer } from './layers/marker';
import { buildPolygonLayer } from './layers/polygon';
import { composeLayerProps, deckPropsTouchedByEncodingPatch, gpuMeta, originNearView } from './layers/props';
import { layers } from './layers/registry';
import { flattenLayers, getLayerBuildCache, mergeEncodings, swapOverlayLayers } from './layers/utils';
import {
  assertV3Spec,
  getControlGroupIdsOrdered,
  getControlGroups,
  getControlGroupsByType,
  getControlSpec,
  getPanelSpec,
  hashBbox,
  normPlainObject,
  normalizeSpec,
  stableStringify,
  unionBboxFromSpec
} from './core/spec';
import {
  asArray,
  assertTA,
  domKey,
  escapeHtml,
  formatNumber,
  hash32,
  isTA,
  normText,
  now,
  pushWarn,
  safeId,
  stablePairTA,
  widgetKey
} from './core/utils';

export interface WidgetInstance {
  renderValue(x: unknown): Promise<void>;
  resize(width: number, height: number): void;
  destroy(): void;
}

const modules = {
  utils: {
    isTA, escapeHtml, pushWarn, assertTA, now, asArray, normText, safeId, widgetKey, hash32, domKey,
    stablePairTA, formatNumber
  },
  spec: {
    unionBboxFromSpec,
    hashBbox,
    normPlainObject,
    stableStringify,
    normalizeSpec,
    assertV3Spec,
    controls: {
      getControlGroups,
      getPanelSpec,
      getControlGroupIdsOrdered,
      getControlSpec,
      getControlGroupsByType
    }
  },
  assets: {
    depUrl, fetchArray, clearMemo, resolveRefOrHref, pruneEmbeddedBlobs, pruneEmbeddedBlobsIdle, cancelIdlePrune
  },
  data: {
    HYDRATE_GEOM, hydrateGeometryBySpec, getIndexers, resolveColumnsAndViews, resolveActiveOnly,
    resolveRemainingViewsIdle
  },
  encodings: { colorAccessorFrom, numericAccessorFrom },
  views: { collectPrimeViewEncodingKeys, applyOrderedViewOps, computeViewOpsByLayer },
  icons: { resolveIcon },
  tooltips: {
    prime: tooltips.prime,
    buildGetTemplate: tooltips.buildGetTemplate,
    buildOnClickPopup: tooltips.buildOnClickPopup,
    register: tooltips.register,
    dispatch: tooltips.dispatch,
    init: tooltips.init,
    destroy: tooltips.destroy,
    handleHover: tooltips.handleHover,
    handleOverlayClick: tooltips.handleOverlayClick
  },
  legends: { applyVisibility, buildLegendCard },
  filterCore: { getElState, ensureFiltersContainer, seedSelectionSet, publishFilterState },
  filterSelect: { ensureSelectUI, AUTO_DROPDOWN_AT },
  filtersRuntime: { initFiltersState, buildFilterIndex, getGPUFilterContribution },
  rangeSlider: { mount },
  filterRange: { ensureRangeUI },
  filters: { ensureFilterUI },
  layerUtils: { mergeEncodings, getLayerBuildCache, flattenLayers, swapOverlayLayers },
  layerProps: { composeLayerProps, originNearView, deckPropsTouchedByEncodingPatch, gpuMeta },
  layerBuilders: {
    buildScatterplotLayer, buildPathLayer, buildPolygonLayer, buildIconLayer, buildMarkerLayer
  },
  layers
};

export interface Namespace {
  core: {
    require(name: string, from?: string): object;
    requireFn(modName: string, fnName: string, from?: string): Function;
  };
  utils: typeof modules.utils;
  spec: typeof modules.spec;
  assets: typeof modules.assets;
  data: typeof modules.data;
  encodings: typeof modules.encodings;
  views: typeof modules.views;
  icons: typeof modules.icons;
  tooltips: typeof modules.tooltips;
  legends: typeof modules.legends;
  filterCore: typeof modules.filterCore;
  filterSelect: typeof modules.filterSelect;
  filtersRuntime: typeof modules.filtersRuntime;
  rangeSlider: typeof modules.rangeSlider;
  filterRange: typeof modules.filterRange;
  filters: typeof modules.filters;
  layerUtils: typeof modules.layerUtils;
  layerProps: typeof modules.layerProps;
  layerBuilders: typeof modules.layerBuilders;
  layers: typeof modules.layers;
  controls: Record<string, unknown>;
  runtime?: {
    assembly?: {
      readRenderField?(st: LayerState, key: string): unknown;
    };
    widget?: {
      create?(el: HTMLElement, width: number, height: number): WidgetInstance;
    };
  };
}

const root = (window.MAPLAMINA || {}) as Namespace;
window.MAPLAMINA = root;

root.controls = root.controls || {};

function requireModule(name: string, from?: string): object {
  const mod = (root as unknown as Record<string, unknown>)[name];
  if (mod && typeof mod === 'object') return mod;
  throw new Error(
    `[maplamina] Missing module '${name}' required by ${from || 'unknown'}; check script load order.`
  );
}

function requireFn(modName: string, fnName: string, from?: string): Function {
  const fn = (requireModule(modName, from) as Record<string, unknown>)[fnName];
  if (typeof fn === 'function') return fn;
  throw new Error(
    `[maplamina] Missing function '${modName}.${fnName}' required by ${from || 'unknown'}; check script load order.`
  );
}

root.core = { require: requireModule, requireFn };
Object.assign(root, modules);
