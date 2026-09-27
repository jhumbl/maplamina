import { getIndexers } from './data';
import type { AccessorInfo } from './data';
import type {
  ColorEncodingKey,
  LayerState,
  NumericColumnKey,
  RgbaTuple,
  TypedArray
} from './layer-state';
import { isFiniteNumber, isTA, pushWarn } from './utils';

export type ColorAccessor = (d: unknown, info?: AccessorInfo | null) => RgbaTuple;
export type NumericAccessor = (d: unknown, info?: AccessorInfo | null) => number;

export function colorAccessorFrom(
  st: LayerState,
  key: ColorEncodingKey,
  fallbackRGBA: RgbaTuple,
  idxMap?: TypedArray | null
): ColorAccessor {
  const base = st.base_encodings || {};
  const cols = st.data_columns || {};

  const { indexForArray, pickPartIndex } = getIndexers(st, idxMap);

  const useBaseOpacity = (key !== 'lineColor');

  let opacityScalar = 1;
  let opacityValues: TypedArray | unknown[] | null = null;
  if (useBaseOpacity && base.opacity && base.opacity.value != null) {
    const v = base.opacity.value_array || base.opacity.value;
    if (Array.isArray(v) || isTA(v)) {
      opacityValues = v;
    } else if (isFiniteNumber(v)) {
      opacityScalar = v;
    }
  }

  if (opacityValues && !isTA(opacityValues)) {
    pushWarn(st, 'base.opacity.value_array is not typed; using scalar opacity=1');
    opacityValues = null; opacityScalar = 1;
  }
  const opacityArray = isTA(opacityValues) ? opacityValues : null;

  const getOpacity = useBaseOpacity
    ? (partIdx: number) => {
        const i = opacityArray ? indexForArray(opacityArray, partIdx) : 0;
        const o = opacityArray ? opacityArray[i] : opacityScalar;
        return Number.isFinite(o) ? Math.max(0, Math.min(1, o)) : 1;
      }
    : () => 1;

  const safeRGBA = (r: number, g: number, b: number, a: number): RgbaTuple => [r >>> 0, g >>> 0, b >>> 0, a >>> 0];

  // Base dict color
  const baseEnc = base[key];
  if (baseEnc && baseEnc.encoding === 'dict') {
    const dict = baseEnc.dict_array, codes = baseEnc.codes_array;
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

  // Base constant color
  if (baseEnc && baseEnc.value != null) {
    const v = baseEnc.value;
    if (Array.isArray(v) && v.length === 4) {
      return (d, info) => {
        const p = pickPartIndex(d, info);
        return safeRGBA(v[0], v[1], v[2], Math.round(v[3] * getOpacity(p)));
      };
    }
    return () => v;
  }

  // Layer scale stored as a column dict
  const col = cols[key];
  if (col && col.dict_array && col.codes_array) {
    const dict = col.dict_array, codes = col.codes_array;
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

export function numericAccessorFrom(
  st: LayerState,
  key: NumericColumnKey,
  fallback: number,
  idxMap?: TypedArray | null
): NumericAccessor {
  const base = st.base_encodings || {};
  const cols = st.data_columns || {};

  const { indexForArray, pickPartIndex } = getIndexers(st, idxMap);

  const fb = Number.isFinite(fallback) ? fallback : 1;

  const isArrLike = (v: unknown): v is ArrayLike<number> => Array.isArray(v) || isTA(v);
  const readArr = (arr: ArrayLike<number>, partIdx: number) => {
    if (!arr || !arr.length) return fb;
    const ii = indexForArray(arr, partIdx);
    const v = arr[ii];
    return Number.isFinite(v) ? v : fb;
  };

  // Base value or base value_array
  const baseEnc = base[key];
  if (baseEnc && baseEnc.value != null) {
    const v = baseEnc.value_array || baseEnc.value;
    if (isArrLike(v)) return (d, info) => readArr(v, pickPartIndex(d, info));
    if (isFiniteNumber(v)) return () => v;
    return () => fb;
  }

  // Column array
  const col = cols[key];
  if (col && isArrLike(col.array)) {
    const arr = col.array;
    return (d, info) => readArr(arr, pickPartIndex(d, info));
  }

  return () => fb;
}
