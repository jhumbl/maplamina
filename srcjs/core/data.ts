import { pruneEmbeddedBlobsIdle, resolveRefOrHref } from './assets';
import type {
  ColorColumnState,
  ColorEncodingKey,
  DataColumnsState,
  LayerState,
  RefNode,
  TypedArray
} from './layer-state';
import type { BlobDtype, LayerType } from './spec-types';
import { isFiniteNumber, isTA } from './utils';

interface GeomField {
  readonly dtype: BlobDtype;
  readonly sizeKey?: 'size';
  readonly out?: string;
}

type GeomGroup = GeomField | Readonly<Record<string, GeomField>>;
type GeomSpec = Readonly<Record<string, GeomGroup>>;

// A geometry column while it is hydrated: refs are read and arrays written by key.
type GeomTarget = RefNode & Record<string, unknown>;

// --- Declarative geometry hydration spec -----------------------------------
const HYDRATE_GEOM: Readonly<Record<LayerType, GeomSpec>> = {
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

function isGeomField(group: GeomGroup): group is GeomField {
  return 'dtype' in group;
}

function toTypedArray(arr: TypedArray | ArrayLike<number>, dtype?: string): TypedArray;
function toTypedArray(arr: TypedArray | ArrayLike<number> | null | undefined, dtype?: string): TypedArray | null;
function toTypedArray(arr: TypedArray | ArrayLike<number> | null | undefined, dtype = 'f32'): TypedArray | null {
  if (!arr) return null;
  if (isTA(arr)) return arr;
  switch (dtype) {
    case 'f32': return new Float32Array(arr);
    case 'u32': return new Uint32Array(arr);
    case 'u8':  return new Uint8Array(arr);
    default:    return new Float32Array(arr);
  }
}

async function hydrateGeometryBySpec(
  st: LayerState,
  cols: DataColumnsState,
  spec: GeomSpec | undefined
): Promise<void> {
  if (!spec) return;
  const targets = cols as Record<string, GeomTarget | undefined>;

  for (const [groupKey, group] of Object.entries(spec)) {
    const tgt = targets[groupKey];
    if (!tgt) continue;

    if (isGeomField(group)) {
      const o = await resolveRefOrHref(st, tgt);
      if (o && o.array) {
        tgt.array = toTypedArray(o.array, group.dtype);
        if (group.sizeKey && (tgt.size == null) && o.size) tgt.size = o.size;
      }
      continue;
    }

    for (const [fieldKey, field] of Object.entries(group)) {
      const src = tgt[fieldKey] as RefNode | undefined;
      if (!src) continue;
      const o = await resolveRefOrHref(st, src);
      const outName = field.out || (fieldKey + '_array');
      if (o && o.array) {
        tgt[outName] = toTypedArray(o.array, field.dtype);
        if (field.sizeKey && (tgt.size == null) && o.size) tgt.size = o.size;
      }
    }
  }
}

export interface AccessorInfo {
  readonly index?: number;
}

export interface Indexers {
  idxMap: TypedArray | null;
  hasIdxMap: boolean;
  nParts: number;
  rowIndex(partIdx: number): number;
  indexForArray(arr: ArrayLike<number> | null | undefined, partIdx: number): number;
  pickPartIndex(d: unknown, info?: AccessorInfo | null): number;
}

export function getIndexers(st: LayerState | null | undefined, idxMapOverride?: TypedArray | null): Indexers {
  const idx =
    idxMapOverride ||
    st?.data_columns?.feature_index_array ||
    null;

  const hasIdx = !!(idx && ArrayBuffer.isView(idx) && idx.length);
  const nParts = (idx && hasIdx) ? (idx.length >>> 0) : 0;

  // feature_index is the 0-based u32 blob the collectors emit (part -> row).
  const rowIndex = (idx && hasIdx)
    ? (partIdx: number) => {
        const p = (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;
        if (p >= nParts) return 0;
        const v = idx[p];
        return Number.isFinite(v) ? (v >>> 0) : 0;
      }
    : (partIdx: number) => (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;

  // Choose correct index for a typed array that may be per-part (length === nParts)
  // or per-row (length !== nParts, use rowIndex mapping if available).
  const indexForArray = (arr: ArrayLike<number> | null | undefined, partIdx: number) => {
    const p = (Number.isFinite(partIdx) && partIdx >= 0) ? (partIdx >>> 0) : 0;
    if (!arr || !ArrayBuffer.isView(arr)) return hasIdx ? rowIndex(p) : p;
    if (hasIdx && nParts && arr.length === nParts) return p;
    return hasIdx ? rowIndex(p) : p;
  };

  // Defensive extractor for deck.gl accessors. Returns a 0-based part index.
  const pickPartIndex = (d: unknown, info?: AccessorInfo | null) => {
    if (d && typeof d === 'object') {
      const o = d as { __source?: { index?: unknown }; i?: unknown };
      const src = o.__source;
      if (src && isFiniteNumber(src.index)) return (src.index >>> 0);
      if (isFiniteNumber(o.i)) return (o.i >>> 0);
    }
    const ix = (info && isFiniteNumber(info.index)) ? info.index
      : ((typeof d === 'number' && Number.isFinite(d)) ? d : NaN);
    return Number.isFinite(ix) ? (ix >>> 0) : 0;
  };

  return { idxMap: idx, hasIdxMap: hasIdx, nParts, rowIndex, indexForArray, pickPartIndex };
}

function hasRef(node: RefNode): boolean {
  const { value, values } = node;
  return !!(node.ref || node.href ||
    (value && (value.ref || value.href)) ||
    (values && (values.ref || values.href)));
}

async function resolveColumnsAndViews(st: LayerState): Promise<LayerState> {
  const cols = st.data_columns || {};
  const base = st.base_encodings = st.base_encodings || {};

  async function hydrateNumeric(
    target: DataColumnsState,
    key: 'radius' | 'lineWidth' | 'size',
    dtype = 'f32',
    sizeFallback?: boolean
  ): Promise<void> {
    const src = target[key];
    if (!src) return;

    if (src.array && ArrayBuffer.isView(src.array)) return;

    if (Array.isArray(src.values)) {
      src.array = toTypedArray(src.values, dtype);
      delete src.values;
      return;
    }

    if (hasRef(src)) {
      const o = await resolveRefOrHref(st, src);
      if (!o) return;
      if (sizeFallback && src.size == null && o.size) src.size = o.size;
      src.array = toTypedArray(o.array, dtype);
    }
  }

  async function hydrateColorDict(obj: ColorColumnState | undefined): Promise<void> {
    if (!obj || obj.encoding !== 'dict') return;

    if (obj.dict_array && ArrayBuffer.isView(obj.dict_array) &&
        obj.codes_array && ArrayBuffer.isView(obj.codes_array)) {
      return;
    }

    const d = await resolveRefOrHref(st, obj.dict_rgba || obj.dict);
    const c = await resolveRefOrHref(st, obj.codes);
    obj.dict_array  = obj.dict_array  || (d && (isTA(d.array) ? d.array : new Uint8Array(d.array)));
    obj.codes_array = obj.codes_array || (c && (isTA(c.array) ? c.array : new Uint32Array(c.array)));
  }

  await hydrateGeometryBySpec(st, cols, HYDRATE_GEOM[st.type]);

  if (cols.feature_index && hasRef(cols.feature_index)) {
    const o = await resolveRefOrHref(st, cols.feature_index);
    cols.feature_index_array = o && (isTA(o.array) ? o.array : new Uint32Array(o.array));
  }

  if (cols.radius)    await hydrateNumeric(cols, 'radius', 'f32');
  if (cols.lineWidth) await hydrateNumeric(cols, 'lineWidth', 'f32');
  if (cols.size)      await hydrateNumeric(cols, 'size', 'f32');
  // removed: cols.elevation hydration

  await Promise.all([hydrateColorDict(cols.fillColor), hydrateColorDict(cols.lineColor)]);

  async function hydrateBaseNumeric(
    name: 'radius' | 'lineWidth' | 'opacity' | 'size',
    dtype = 'f32'
  ): Promise<void> {
    const e = base[name];
    if (!e) return;
    if (e.value && isTA(e.value)) {
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

  async function hydrateBaseColor(name: ColorEncodingKey): Promise<void> {
    const e = base[name];
    if (!e || e.encoding !== 'dict') return;
    const d = await resolveRefOrHref(st, e.dict_rgba || e.dict);
    const c = await resolveRefOrHref(st, e.codes);
    e.dict_array  = toTypedArray(d && d.array, 'u8');
    e.codes_array = toTypedArray(c && c.array, 'u32');
  }

  await Promise.all([hydrateBaseColor('fillColor'), hydrateBaseColor('lineColor')]);

  // Per-view encodings are applied as patches into base_encodings upstream.

  st.data_columns   = cols;
  st.base_encodings = base;
  return st;
}

export async function resolveActiveOnly(st: LayerState): Promise<void> {
  // Active view patches are already merged into base_encodings upstream.
  await resolveColumnsAndViews(st);
}

export function resolveRemainingViewsIdle(st: LayerState): void {
  const ric: (cb: () => void) => number = globalThis.requestIdleCallback || ((cb) => setTimeout(cb, 0));
  ric(async () => {
    try {
      await resolveColumnsAndViews(st);
      pruneEmbeddedBlobsIdle(st);
    } catch (e) {
      console.warn('[maplamina] deferred hydration error', e);
    }
  });
}
