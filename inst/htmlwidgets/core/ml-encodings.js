(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-encodings.js");
  }

  const utils = core.require('utils', 'ml-encodings.js');
  const dataMod = core.require('data', 'ml-encodings.js');
  if (!dataMod || typeof dataMod.getIndexers !== 'function') {
    throw new Error("[maplamina] Missing data.getIndexers; ensure ml-data.js is loaded before ml-encodings.js");
  }
  const { isTA, pushWarn } = utils;

  function colorAccessorFrom(st, key, fallbackRGBA, idxMap /* optional */) {
    const base = st.base_encodings || {};
    const cols = st.data_columns || {};

    const { indexForArray, pickPartIndex } = dataMod.getIndexers(st, idxMap);

    const useBaseOpacity = (key !== 'lineColor');

    let opacityScalar = 1;
    let opacityArray = null;
    if (useBaseOpacity && base.opacity && base.opacity.value != null) {
      const v = base.opacity.value_array || base.opacity.value;
      if (Array.isArray(v) || (v && ArrayBuffer.isView(v))) {
        opacityArray = v;
      } else if (Number.isFinite(v)) {
        opacityScalar = v;
      }
    }

    if (opacityArray && !isTA(opacityArray)) {
      pushWarn(st, 'base.opacity.value_array is not typed; using scalar opacity=1');
      opacityArray = null; opacityScalar = 1;
    }

    const getOpacity = useBaseOpacity
      ? (partIdx) => {
          const i = opacityArray ? indexForArray(opacityArray, partIdx) : 0;
          const o = opacityArray ? opacityArray[i] : opacityScalar;
          return Number.isFinite(o) ? Math.max(0, Math.min(1, o)) : 1;
        }
      : () => 1;

    const safeRGBA = (r, g, b, a) => [r >>> 0, g >>> 0, b >>> 0, a >>> 0];

    // Base dict color
    if (base[key] && base[key].encoding === 'dict') {
      const dict = base[key].dict_array, codes = base[key].codes_array;
      if (!isTA(dict) || !isTA(codes) || (dict.length % 4 !== 0)) {
        pushWarn(st, `base.${key} dict/codes not typed or misaligned; using fallback color`);
      } else {
        return (d, info) => {
          const p = pickPartIndex(d, info);
          const codeIdx = indexForArray(codes, p);
          const code = (codes[codeIdx] >>> 0);
          const off = code * 4;
          const a = Math.round(dict[off + 3] * getOpacity(p));
          return safeRGBA(dict[off], dict[off + 1], dict[off + 2], a);
        };
      }
    }

    // Column dict color
    if (cols[key] && cols[key].dict_array && cols[key].codes_array) {
      const dict = cols[key].dict_array, codes = cols[key].codes_array;
      if (!isTA(dict) || !isTA(codes) || (dict.length % 4 !== 0)) {
        pushWarn(st, `cols.${key} dict/codes not typed or misaligned; using fallback color`);
      } else {
        return (d, info) => {
          const p = pickPartIndex(d, info);
          const codeIdx = indexForArray(codes, p);
          const code = (codes[codeIdx] >>> 0);
          const off = code * 4;
          const a = Math.round(dict[off + 3] * getOpacity(p));
          return safeRGBA(dict[off], dict[off + 1], dict[off + 2], a);
        };
      }
    }

    // Scalar colors
    if (base[key] && base[key].value != null) {
      const v = base[key].value;
      if (Array.isArray(v) && v.length === 4) {
        return (d, info) => {
          const p = pickPartIndex(d, info);
          return safeRGBA(v[0], v[1], v[2], Math.round(v[3] * getOpacity(p)));
        };
      }
      return () => v;
    }

    if (fallbackRGBA && fallbackRGBA.length === 4) {
      return (d, info) => {
        const p = pickPartIndex(d, info);
        return safeRGBA(
          fallbackRGBA[0], fallbackRGBA[1], fallbackRGBA[2],
          Math.round(fallbackRGBA[3] * getOpacity(p))
        );
      };
    }
    return () => fallbackRGBA;
  }

  function numericAccessorFrom(st, key, fallback, idxMap /* optional */) {
    const base = st.base_encodings || {};
    const cols = st.data_columns || {};

    const { indexForArray, pickPartIndex } = dataMod.getIndexers(st, idxMap);

    const fb = Number.isFinite(fallback) ? fallback : 1;

    const isArrLike = (v) => Array.isArray(v) || (v && ArrayBuffer.isView(v));
    const readArr = (arr, partIdx) => {
      if (!arr || !arr.length) return fb;
      const ii = indexForArray(arr, partIdx);
      const v = arr[ii];
      return Number.isFinite(v) ? v : fb;
    };

    // Base value or base value_array
    if (base[key] && base[key].value != null) {
      const v = base[key].value_array || base[key].value;
      if (isArrLike(v)) return (d, info) => readArr(v, pickPartIndex(d, info));
      if (Number.isFinite(v)) return () => v;
      return () => fb;
    }

    // Column array
    if (cols[key] && isArrLike(cols[key].array)) {
      const arr = cols[key].array;
      return (d, info) => readArr(arr, pickPartIndex(d, info));
    }

    return () => fb;
  }

  root.encodings = root.encodings || {};
  root.encodings.colorAccessorFrom = colorAccessorFrom;
  root.encodings.numericAccessorFrom = numericAccessorFrom;
})(window);
