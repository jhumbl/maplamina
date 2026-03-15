(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function cloneEncodingValue(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice();
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) return value;
    return Object.assign({}, value);
  }

  function cloneEncodingMap(enc) {
    const src = (enc && typeof enc === 'object') ? enc : null;
    if (!src) return {};
    const out = {};
    for (const key of Object.keys(src)) out[key] = cloneEncodingValue(src[key]);
    return out;
  }

  function mergeEncodings(baseEnc, patchEnc) {
    const out = cloneEncodingMap(baseEnc);
    const patch = (patchEnc && typeof patchEnc === 'object') ? patchEnc : null;
    if (!patch) return out;
    for (const key of Object.keys(patch)) out[key] = cloneEncodingValue(patch[key]);
    return out;
  }

  function layerCacheKey(st) {
    if (!st || typeof st !== 'object') return '__layer__';
    return st.filterKey || st.id || '__layer__';
  }

  function getLayerBuildCache(ctx, st, namespace) {
    const cacheRoot = ctx && ctx.cache && typeof ctx.cache === 'object' ? ctx.cache : null;
    if (!cacheRoot) return {};

    const byLayer = cacheRoot.layerBuildCache || (cacheRoot.layerBuildCache = new Map());
    const key = layerCacheKey(st);
    let layerCache = byLayer.get(key);
    if (!layerCache || typeof layerCache !== 'object') {
      layerCache = {};
      byLayer.set(key, layerCache);
    }

    if (!namespace) return layerCache;

    let bucket = layerCache[namespace];
    if (!bucket || typeof bucket !== 'object') {
      bucket = {};
      layerCache[namespace] = bucket;
    }
    return bucket;
  }

  function clearLayerBuildCache(ctx, st) {
    const byLayer = ctx && ctx.cache && ctx.cache.layerBuildCache;
    if (!(byLayer instanceof Map)) return;
    byLayer.delete(layerCacheKey(st));
  }

  function clearAllLayerBuildCaches(ctx) {
    const byLayer = ctx && ctx.cache && ctx.cache.layerBuildCache;
    if (byLayer instanceof Map) byLayer.clear();
  }

  function flattenLayers(L) {
    // Deck.gl expects a flat layer array. Some builders may return nested arrays.
    if (L == null) return [];
    if (Array.isArray(L)) {
      const out = [];
      for (const x of L) {
        const fx = flattenLayers(x);
        for (const y of fx) out.push(y);
      }
      return out;
    }
    return [L];
  }

  function swapOverlayLayers(current, replacements) {
    const swapped = [];
    const inserted = new Set();
    const keys = Array.from(replacements.keys());

    // Deterministic matching: if layer ids overlap as prefixes (e.g. "roads" and "roads_major"),
    // always match the longest id first so sublayers swap correctly.
    const matchKeys = keys.slice().sort((a, b) => b.length - a.length);

    for (const old of (current || [])) {
      const oid = old && old.id;
      let match = null;

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

  root.layerUtils = {
    mergeEncodings,
    layerCacheKey,
    getLayerBuildCache,
    clearLayerBuildCache,
    clearAllLayerBuildCaches,
    flattenLayers,
    swapOverlayLayers
  };
})(window);
