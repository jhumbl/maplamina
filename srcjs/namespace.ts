// Publishes the modules on window.MAPLAMINA under the names the widget scripts read.

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
  encodings: { colorAccessorFrom, numericAccessorFrom }
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
  layers: Map<string, unknown>;
  controls: Record<string, unknown>;
  layerBuilders: Record<string, unknown>;
  runtime?: {
    widget?: {
      create?(el: HTMLElement, width: number, height: number): WidgetInstance;
    };
  };
}

const root = (window.MAPLAMINA || {}) as Namespace;
window.MAPLAMINA = root;

root.layers = root.layers || new Map();
root.controls = root.controls || {};
root.layerBuilders = root.layerBuilders || {};

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
