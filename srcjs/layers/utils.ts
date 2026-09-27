import type { Layer } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { EncodingPatch } from '../components/views';
import type { EncodingsState, LayerState } from '../core/layer-state';

// What a builder keeps for one layer between rebuilds, by builder name.
type LayerCache = Record<string, object>;

export interface BuildCache {
  layerBuildCache?: Map<string, LayerCache>;
}

// What the builders read of the context the widget passes them.
export interface BuildContext {
  el: HTMLElement;
  map: MapLibreMap | null;
  cache: BuildCache;
}

export type LayerTree = Layer | null | undefined | LayerTree[];

function cloneEncodingValue<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice() as T;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) return value;
  return Object.assign({}, value);
}

function cloneEncodingMap(enc: EncodingPatch | EncodingsState | null | undefined): EncodingsState {
  const src = ((enc && typeof enc === 'object') ? enc : null) as Record<string, unknown> | null;
  if (!src) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) out[key] = cloneEncodingValue(src[key]);
  return out;
}

export function mergeEncodings(
  baseEnc: EncodingsState | null | undefined,
  patchEnc: EncodingPatch | EncodingsState | null | undefined
): EncodingsState {
  const out = cloneEncodingMap(baseEnc) as Record<string, unknown>;
  const patch = ((patchEnc && typeof patchEnc === 'object') ? patchEnc : null) as Record<string, unknown> | null;
  if (!patch) return out;
  for (const key of Object.keys(patch)) out[key] = cloneEncodingValue(patch[key]);
  return out;
}

function layerCacheKey(st: LayerState): string {
  if (!st || typeof st !== 'object') return '__layer__';
  return st.filterKey || st.id || '__layer__';
}

// B is what the calling builder keeps in its bucket.
export function getLayerBuildCache<B extends object = LayerCache>(
  ctx: BuildContext,
  st: LayerState,
  namespace?: string
): B {
  const cacheRoot = ctx && ctx.cache && typeof ctx.cache === 'object' ? ctx.cache : null;
  if (!cacheRoot) return {} as B;

  const byLayer = cacheRoot.layerBuildCache || (cacheRoot.layerBuildCache = new Map());
  const key = layerCacheKey(st);
  let layerCache = byLayer.get(key);
  if (!layerCache || typeof layerCache !== 'object') {
    layerCache = {};
    byLayer.set(key, layerCache);
  }

  if (!namespace) return layerCache as B;

  let bucket = layerCache[namespace];
  if (!bucket || typeof bucket !== 'object') {
    bucket = {};
    layerCache[namespace] = bucket;
  }
  return bucket as B;
}

export function flattenLayers(L: LayerTree): Layer[] {
  // Deck.gl expects a flat layer array. Some builders may return nested arrays.
  if (L == null) return [];
  if (Array.isArray(L)) {
    const out: Layer[] = [];
    for (const x of L) {
      const fx = flattenLayers(x);
      for (const y of fx) out.push(y);
    }
    return out;
  }
  return [L];
}

export function swapOverlayLayers(
  current: readonly Layer[] | null | undefined,
  replacements: Map<string, Layer[]>
): Layer[] {
  const swapped: Layer[] = [];
  const inserted = new Set<string>();
  const keys = Array.from(replacements.keys());

  // Deterministic matching: if layer ids overlap as prefixes (e.g. "roads" and "roads_major"),
  // always match the longest id first so sublayers swap correctly.
  const matchKeys = keys.slice().sort((a, b) => b.length - a.length);

  for (const old of (current || [])) {
    const oid = old && old.id;
    let match: string | null = null;

    if (typeof oid === 'string') {
      for (const k of matchKeys) {
        if (oid === k || oid.startsWith(k + '-')) { match = k; break; }
      }
    }

    if (match) {
      if (!inserted.has(match)) {
        const reps = replacements.get(match) || [];
        for (const nl of reps) swapped.push(nl);
        inserted.add(match);
      }
    } else {
      swapped.push(old);
    }
  }

  // Append any replacements that didn't correspond to an existing overlay layer id.
  for (const k of keys) {
    if (inserted.has(k)) continue;
    const reps = replacements.get(k) || [];
    for (const nl of reps) swapped.push(nl);
  }

  return swapped;
}
