(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function mergeEncodings(baseEnc, patchEnc) {
    const base = (baseEnc && typeof baseEnc === 'object') ? baseEnc : {};
    const patch = (patchEnc && typeof patchEnc === 'object') ? patchEnc : null;
    if (!patch) return Object.assign({}, base);
    return Object.assign({}, base, patch);
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

  root.layerUtils = { mergeEncodings, flattenLayers, swapOverlayLayers };
})(window);
