(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-data.js");
  }

  const assets = core.require('assets', 'ml-data.js');
  const utils  = core.require('utils',  'ml-data.js');
  const { resolveRefOrHref } = assets;
  const { isTA, pushWarn }   = utils;

  // --- Declarative geometry hydration spec -----------------------------------
  const HYDRATE_GEOM = {
    circle: { position: { dtype: 'f32', sizeKey: 'size' } },
    icon:   { position: { dtype: 'f32', sizeKey: 'size' } },
    marker: { position: { dtype: 'f32', sizeKey: 'size' } },
    line: {
      path: {
        positions:   { dtype: 'f32', sizeKey: 'size', out: 'positions_array' },
        path_starts: { dtype: 'u32',                    out: 'path_starts_array' }
      }
    },
    polygon: {
      polygon: {
        positions:   { dtype: 'f32', out: 'positions_array' },
        ring_starts: { dtype: 'u32', out: 'ring_starts_array' },
        poly_starts: { dtype: 'u32', out: 'poly_starts_array' }
      }
    }
  };

  async function hydrateGeometryBySpec(st, cols, spec) {
    if (!spec) return;
    const toTA = (arr, dt) => {
      if (!arr) return null;
      if (ArrayBuffer.isView(arr)) return arr;
      switch (dt) {
        case 'f32': return new Float32Array(arr);
        case 'u32': return new Uint32Array(arr);
        case 'u8':  return new Uint8Array(arr);
        default:    return new Float32Array(arr);
      }
    };

    for (const [groupKey, group] of Object.entries(spec)) {
      const tgt = cols[groupKey];
      if (!tgt) continue;

      if ('dtype' in group) {
        const o = await resolveRefOrHref(st, tgt);
        if (o && o.array) {
          tgt.array = toTA(o.array, group.dtype);
          if (group.sizeKey && (tgt.size == null) && o.size) tgt.size = o.size;
        }
        continue;
      }

      for (const [fieldKey, field] of Object.entries(group)) {
        const src = tgt[fieldKey];
        if (!src) continue;
        const o = await resolveRefOrHref(st, src);
        const outName = field.out || (fieldKey + '_array');
        if (o && o.array) {
          tgt[outName] = toTA(o.array, field.dtype);
          if (field.sizeKey && (tgt.size == null) && o.size) tgt.size = o.size;
        }
      }
    }
  }

  function getIndexers(st, idxMapOverride) {
  const idx =
    idxMapOverride ||
    st?.data_columns?.feature_index_array ||
    (st?.data_columns?.feature_index && st.data_columns.feature_index.array) ||
    null;

  const hasIdx = !!(idx && ArrayBuffer.isView(idx) && idx.length);
  const nParts = hasIdx ? (idx.length >>> 0) : 0;

  // Detect whether feature_index is 0-based (0..n-1) or 1-based (1..n).
  let base = 0;
  if (hasIdx) {
    let min = Infinity;
    const n = Math.min(nParts, 64);
    for (let i = 0; i < n; i++) {
      const v = idx[i];
      if (Number.isFinite(v)) {
        const vv = (v >>> 0);
        if (vv < min) min = vv;
      }
    }
    base = (min === 0) ? 0 : 1;
  }

  const rowIndex = hasIdx
    ? (partIdx) => {
        const p = (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;
        if (p >= nParts) return 0;
        const v = idx[p];
        if (!Number.isFinite(v)) return 0;
        let r = (v >>> 0);
        if (base === 1) {
          if (r === 0) return 0;
          r = (r - 1) >>> 0;
        }
        return r;
      }
    : (partIdx) => (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;

  // Choose correct index for a typed array that may be per-part (length === nParts)
  // or per-row (length !== nParts, use rowIndex mapping if available).
  const indexForArray = (arr, partIdx) => {
    const p = (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;
    if (!arr || !ArrayBuffer.isView(arr)) return hasIdx ? rowIndex(p) : p;
    if (hasIdx && nParts && arr.length === nParts) return p;
    return hasIdx ? rowIndex(p) : p;
  };

  // Defensive extractor for deck.gl accessors. Returns a 0-based part index.
  const pickPartIndex = (d, info) => {
    if (d && typeof d === 'object') {
      const src = d.__source;
      if (src && Number.isFinite(src.index)) return (src.index >>> 0);
      if (Number.isFinite(d.i)) return (d.i >>> 0);
    }
    const ix = (info && Number.isFinite(info.index)) ? info.index
      : ((typeof d === 'number' && Number.isFinite(d)) ? d : NaN);
    return Number.isFinite(ix) ? (ix >>> 0) : 0;
  };

  return { idxMap: idx, hasIdxMap: hasIdx, nParts, base, rowIndex, indexForArray, pickPartIndex };
}

  async function resolveColumnsAndViews(st) {
    const cols = st.data_columns || {};
    const base = st.base_encodings = st.base_encodings || {};

    function toTypedArray(arr, dtype = 'f32') {
      if (!arr) return null;
      if (ArrayBuffer.isView(arr)) return arr;
      switch (dtype) {
        case 'f32': return new Float32Array(arr);
        case 'u32': return new Uint32Array(arr);
        case 'u8':  return new Uint8Array(arr);
        default:    return new Float32Array(arr);
      }
    }

    async function hydrateNumeric(target, key, dtype = 'f32', sizeFallback) {
      const src = target[key];
      if (!src) return;

      if (src.array && ArrayBuffer.isView(src.array)) return;

      if (Array.isArray(src.values)) {
        src.array = toTypedArray(src.values, dtype);
        delete src.values;
        return;
      }

      if (src.ref || src.href ||
          (src.value && (src.value.ref || src.value.href)) ||
          (src.values && (src.values.ref || src.values.href))) {
        const o = await resolveRefOrHref(st, src);
        if (!o) return;
        if (sizeFallback && src.size == null && o.size) src.size = o.size;
        src.array = toTypedArray(o.array, dtype);
      }
    }

    async function hydrateColorDict(obj) {
      if (!obj || obj.encoding !== 'dict') return;

      if (obj.dict_array && ArrayBuffer.isView(obj.dict_array) &&
          obj.codes_array && ArrayBuffer.isView(obj.codes_array)) {
        return;
      }

      const d = await resolveRefOrHref(st, obj.dict_rgba || obj.dict);
      const c = await resolveRefOrHref(st, obj.codes);
      obj.dict_array  = obj.dict_array  || (d && (ArrayBuffer.isView(d.array) ? d.array : new Uint8Array(d.array)));
      obj.codes_array = obj.codes_array || (c && (ArrayBuffer.isView(c.array) ? c.array : new Uint32Array(c.array)));
    }

    await hydrateGeometryBySpec(st, cols, HYDRATE_GEOM[st.type]);

    if (cols.feature_index && (
        cols.feature_index.ref || cols.feature_index.href ||
        (cols.feature_index.values && (cols.feature_index.values.ref || cols.feature_index.values.href)) ||
        (cols.feature_index.value && (cols.feature_index.value.ref || cols.feature_index.value.href))
      )) {
      const o = await resolveRefOrHref(st, cols.feature_index);
      cols.feature_index_array = o && (ArrayBuffer.isView(o.array) ? o.array : new Uint32Array(o.array));
    }

    if (cols.radius)    await hydrateNumeric(cols, 'radius', 'f32');
    if (cols.lineWidth) await hydrateNumeric(cols, 'lineWidth', 'f32');
    if (cols.size)      await hydrateNumeric(cols, 'size', 'f32');
    // removed: cols.elevation hydration

    await Promise.all([hydrateColorDict(cols.fillColor), hydrateColorDict(cols.lineColor)]);

    async function hydrateBaseNumeric(name, dtype = 'f32') {
      const e = base[name];
      if (!e) return;
      if (e.value && ArrayBuffer.isView(e.value)) {
        e.value_array = e.value;
        return;
      }
      if (e.value_array && ArrayBuffer.isView(e.value_array)) return;
      if (e.value == null || typeof e.value !== 'object') return;
      const o = await resolveRefOrHref(st, e.value);
      e.value_array = toTypedArray(o && o.array, dtype);
    }

    await Promise.all([
      hydrateBaseNumeric('radius'),
      hydrateBaseNumeric('lineWidth'),
      hydrateBaseNumeric('opacity'),
      hydrateBaseNumeric('size')
      // removed: hydrateBaseNumeric('elevation')
    ]);

    async function hydrateBaseColor(name) {
      const e = base[name];
      if (!e || e.encoding !== 'dict') return;
      const d = await resolveRefOrHref(st, e.dict_rgba || e.dict);
      const c = await resolveRefOrHref(st, e.codes);
      e.dict_array  = toTypedArray(d && d.array, 'u8');
      e.codes_array = toTypedArray(c && c.array, 'u32');
    }

    await Promise.all([hydrateBaseColor('fillColor'), hydrateBaseColor('lineColor')]);

    // v3-only: per-view encodings are applied as patches into base_encodings upstream.

    st.data_columns   = cols;
    st.base_encodings = base;
    return st;
  }

  async function resolveActiveOnly(st) {
    // v3-only: active view patches are already merged into base_encodings upstream.
    await resolveColumnsAndViews(st);
  }

  function resolveRemainingViewsIdle(st) {
    const ric = window.requestIdleCallback || (cb => setTimeout(cb, 0));
    ric(async () => {
      try {
        await resolveColumnsAndViews(st);
        root.assets?.pruneEmbeddedBlobsIdle?.(st);
      } catch (e) {
        console.warn('[maplamina] deferred hydration error', e);
      }
    });
  }

  root.data = { HYDRATE_GEOM, hydrateGeometryBySpec, getIndexers, resolveColumnsAndViews, resolveActiveOnly, resolveRemainingViewsIdle };
})(window);
