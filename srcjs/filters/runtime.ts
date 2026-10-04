import { resolveRefOrHref } from '../core/assets';
import { getIndexers } from '../core/data';
import type { AccessorInfo } from '../core/data';
import type { LayerState, ResolvedArray, TypedArray } from '../core/layer-state';
import { getControlGroupsByType, wireMap } from '../core/spec';
import type { RangeComponent, SelectComponent, Spec } from '../core/spec-types';
import { isFiniteNumber, normText } from '../core/utils';
import type { FilterIndex, FilterValue, FiltersState, RuntimeState, WidgetRuntime } from '../core/widget';

export interface GpuFiltering {
  filterCategories?: number[] | number[][];
  __catDisabledKey?: number | number[];
  getFilterCategory?: (d: unknown, info?: AccessorInfo | null) => number | number[];
  filterRange?: [number, number] | [number, number][];
  getFilterValue?: (d: unknown, info?: AccessorInfo | null) => number | number[];
}

export interface GpuMeta {
  categoryDims: number;
  rangeDims: number;
}

export interface FilterContribution {
  gpuFiltering: GpuFiltering;
  gpuMeta: GpuMeta;
  forceHidden: boolean;
}

// NA in a range column never passes the filter. The most negative float32 is used rather
// than -Infinity, which the GPU range test does not reliably place below the minimum.
const NA_RANGE_VALUE = -3.4028234663852886e38;

function ensureFiltersState(rt: WidgetRuntime | null | undefined): RuntimeState {
  if (!rt || typeof rt !== 'object') return { filters: {} };
  if (!rt.state || typeof rt.state !== 'object') rt.state = {};
  if (!rt.state.filters || typeof rt.state.filters !== 'object') rt.state.filters = {};
  return rt.state;
}

function uniqStrings(arr: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of (Array.isArray(arr) ? arr : [])) {
    const s = String(v);
    if (!s.length) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function coerceSelectDefaultValues(defVal: unknown, dict: readonly string[] | null): string[] {
  if (defVal == null) return [];
  const arr: unknown[] = Array.isArray(defVal) ? defVal : [defVal];
  const out: string[] = [];
  const hasDict = Array.isArray(dict) && dict.length;
  for (const v of arr) {
    if (v == null) continue;
    // If defaults are authored as indices, map through dict when available.
    if (typeof v === 'number' && Number.isFinite(v) && hasDict) {
      const dv = dict[v];
      if (dv != null) out.push(String(dv));
      continue;
    }
    const s = String(v);
    if (s.length) out.push(s);
  }
  return uniqStrings(out);
}

function coerceRangeDefault(defVal: unknown, dmin: number | null, dmax: number | null): [number, number] | null {
  let lo: number | null = null, hi: number | null = null;
  if (Array.isArray(defVal) && defVal.length >= 2) {
    lo = +defVal[0]; hi = +defVal[1];
  } else if (Number.isFinite(+(defVal as number))) {
    lo = +(defVal as number); hi = +(defVal as number);
  }
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi)) return null;
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  if (isFiniteNumber(dmin)) lo = Math.max(dmin, lo);
  if (isFiniteNumber(dmax)) hi = Math.min(dmax, hi);
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return [lo, hi];
}

export function initFiltersState(
  rt: WidgetRuntime | null | undefined,
  x: Spec,
  onlyGroupId?: unknown
): FiltersState {
  const state = ensureFiltersState(rt);
  const groups = getControlGroupsByType(x, 'filters');

  const compSelects = wireMap(x && x['.__components'] && x['.__components'].select);
  const compRanges  = wireMap(x && x['.__components'] && x['.__components'].range);

  // No filters controls -> clear state
  if (!groups.length) {
    state.filters = {};
    if (rt) {
      rt._filtersGroupIds = [];
      rt._defaultFiltersGroupId = null;
    }
    return state.filters;
  }

  // Determine default group (used for backward-compatible rt.setFilter(label, value))
  const pref = groups.find(g => normText(g.groupId) === 'filters') || groups[0];
  if (rt) {
    rt._defaultFiltersGroupId = pref ? normText(pref.groupId) : null;
    rt._filtersGroupIds = groups.map(g => normText(g.groupId)).filter(Boolean);
  }

  const gidOnly = (onlyGroupId != null) ? normText(onlyGroupId) : null;
  const prevAll = (state.filters && typeof state.filters === 'object') ? state.filters : {};
  const nextAll: FiltersState = gidOnly ? Object.assign({}, prevAll) : {};

  // Authored group order: panel sections first (if present), then insertion order in .__controls.
  // (See getControlGroupsByType in core/spec.ts).
  const list = groups;

  for (const g of list) {
    const gid = normText(g.groupId);
    if (!gid) continue;
    if (gidOnly && gid !== gidOnly) continue;

    const ctl = g && g.spec;
    const prev: Record<string, unknown> = (prevAll[gid] && typeof prevAll[gid] === 'object') ? prevAll[gid] : {};
    const next: Record<string, FilterValue> = {};

    if (!ctl || typeof ctl !== 'object') { nextAll[gid] = next; continue; }

    // Respect authored order when provided; otherwise preserve insertion order of keys.
    // Do NOT sort here (sorting breaks UI/author intent for filter declaration order).
    const order: readonly string[] = Array.isArray(ctl.order) ? ctl.order.slice() : Object.keys(ctl.controls || {});
    const defs = (ctl.controls && typeof ctl.controls === 'object') ? ctl.controls : {};

    for (const labelRaw of order) {
      const label = normText(labelRaw);
      if (!label) continue;

      const spec = defs[labelRaw] || defs[label];
      if (!spec || typeof spec !== 'object') continue;

      if (spec.type === 'select') {
        const hasPrev = Object.prototype.hasOwnProperty.call(prev, label);
        const p = prev[label];

        if (hasPrev) {
          if (p instanceof Set) next[label] = new Set(p);
          else next[label] = new Set();
          continue;
        }

        // Seed defaults on first render (when no prior state exists)
        const mergedDict = Array.isArray(spec.dict) ? spec.dict : null;
        let seed = coerceSelectDefaultValues(spec.default, mergedDict);

        if (!seed.length && Array.isArray(spec.members)) {
          const acc: string[] = [];
          for (const midRaw of spec.members) {
            const mid = normText(midRaw);
            const comp = compSelects[mid];
            if (!comp || comp.default == null) continue;
            const dct = mergedDict || (Array.isArray(comp.dict) ? comp.dict : null);
            acc.push(...coerceSelectDefaultValues(comp.default, dct));
          }
          seed = uniqStrings(acc);
        }

        next[label] = new Set(seed);
      } else if (spec.type === 'range') {
        const hasPrev = Object.prototype.hasOwnProperty.call(prev, label);
        const p = prev[label];

        // Domain fallback (when defaults/previous state missing or invalid)
        let dmin: number | null = null, dmax: number | null = null;
        if (spec.domain && Number.isFinite(+spec.domain.min) && Number.isFinite(+spec.domain.max)) {
          dmin = +spec.domain.min; dmax = +spec.domain.max;
        }

        if (hasPrev) {
          let lo: number | null = null, hi: number | null = null;
          if (Array.isArray(p) && p.length >= 2) { lo = +p[0]; hi = +p[1]; }
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            if (Number.isFinite(dmin) && Number.isFinite(dmax)) { lo = dmin; hi = dmax; }
          }
          if (!isFiniteNumber(lo)) lo = 0;
          if (!isFiniteNumber(hi)) hi = lo;
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
          next[label] = [lo, hi];
          continue;
        }

        // Seed defaults on first render (when no prior state exists)
        let seed = coerceRangeDefault(spec.default, dmin, dmax);

        if (!seed && Array.isArray(spec.members)) {
          for (const midRaw of spec.members) {
            const mid = normText(midRaw);
            const comp: RangeComponent = compRanges[mid];
            if (!comp || comp.default == null) continue;

            let cmin = dmin, cmax = dmax;
            if (!(Number.isFinite(cmin) && Number.isFinite(cmax))) {
              if (Number.isFinite(+comp.min) && Number.isFinite(+comp.max)) { cmin = +comp.min; cmax = +comp.max; }
            }

            seed = coerceRangeDefault(comp.default, cmin, cmax);
            if (seed) break;
          }
        }

        let lo: number | null = null, hi: number | null = null;
        if (seed && seed.length >= 2) { lo = +seed[0]; hi = +seed[1]; }
        else if (Number.isFinite(dmin) && Number.isFinite(dmax)) { lo = dmin; hi = dmax; }

        if (!isFiniteNumber(lo)) lo = 0;
        if (!isFiniteNumber(hi)) hi = lo;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        next[label] = [lo, hi];
      }
    }

    nextAll[gid] = next;
  }

  state.filters = nextAll;
  return nextAll;
}

export function buildFilterIndex(x: Spec): FilterIndex {
  const out: FilterIndex = { byLayer: new Map(), byKey: new Map(), byGroup: new Map(), groupIds: [] };
  const groups = getControlGroupsByType(x, 'filters');
  if (!groups.length) return out;

  const selects = wireMap(x && x['.__components'] && x['.__components'].select);
  const ranges  = wireMap(x && x['.__components'] && x['.__components'].range);

  // Authored group order: panel sections first (if present), then insertion order in .__controls.
  // (See getControlGroupsByType in core/spec.ts).
  const list = groups;

  for (const g of list) {
    const gid = normText(g.groupId);
    const ctl = g && g.spec;
    if (!gid || !ctl || typeof ctl !== 'object') continue;

    out.groupIds.push(gid);

    // Respect authored order when provided; otherwise preserve insertion order of keys.
    // Do NOT sort here (sorting breaks UI/author intent for filter declaration order).
    const order: readonly string[] = Array.isArray(ctl.order) ? ctl.order.slice() : Object.keys(ctl.controls || {});
    const defs = (ctl.controls && typeof ctl.controls === 'object') ? ctl.controls : {};

    for (const labelRaw of order) {
      const label = normText(labelRaw);
      if (!label) continue;

      const def = defs[labelRaw] || defs[label];
      if (!def || typeof def !== 'object') continue;

      const members: readonly string[] = Array.isArray(def.members) ? def.members : [];
      for (const midRaw of members) {
        const mid = normText(midRaw);
        if (!mid) continue;

        if (def.type === 'select') {
          const comp = selects[mid];
          const layerId = comp && comp.layer ? normText(comp.layer) : '';
          if (!layerId) continue;

          const entry = out.byLayer.get(layerId) || { select: [], range: [] };
          entry.select.push({ groupId: gid, label, id: mid, comp, def });
          out.byLayer.set(layerId, entry);

          const key = gid + '|' + label;
          const s = out.byKey.get(key) || new Set();
          s.add(layerId);
          out.byKey.set(key, s);

          const gs = out.byGroup.get(gid) || new Set();
          gs.add(layerId);
          out.byGroup.set(gid, gs);
        }

        if (def.type === 'range') {
          const comp = ranges[mid];
          const layerId = comp && comp.layer ? normText(comp.layer) : '';
          if (!layerId) continue;

          const entry = out.byLayer.get(layerId) || { select: [], range: [] };
          entry.range.push({ groupId: gid, label, id: mid, comp, def });
          out.byLayer.set(layerId, entry);

          const key = gid + '|' + label;
          const s = out.byKey.get(key) || new Set();
          s.add(layerId);
          out.byKey.set(key, s);

          const gs = out.byGroup.get(gid) || new Set();
          gs.add(layerId);
          out.byGroup.set(gid, gs);
        }
      }
    }
  }

  return out;
}

function retOneOrMany<T>(arr: T[]): T | T[] {
  return (Array.isArray(arr) && arr.length === 1) ? arr[0] : arr;
}

// A layer's filter dimensions as the current filter state resolves them, selects first.
// The GPU props and the summaries mask are both built from this list.
export interface SelectDim {
  kind: 'select';
  codes: TypedArray;
  allowed: number[] | 'disabled' | 'no match';
}

export interface RangeDim {
  kind: 'range';
  values: TypedArray;
  bounds: [number, number];
}

export type FilterDim = SelectDim | RangeDim;

export async function resolveFilterDims(
  st: LayerState,
  layerId: unknown,
  rt: WidgetRuntime | null | undefined
): Promise<FilterDim[]> {
  const lid = normText(layerId);
  const idx = rt && rt._filterIndex;
  const entry = (lid && idx && idx.byLayer) ? idx.byLayer.get(lid) : null;
  if (!entry) return [];

  const selDims = Array.isArray(entry.select) ? entry.select.slice(0, 4) : [];
  const rngDims = Array.isArray(entry.range)  ? entry.range.slice(0, 4)  : [];
  const stateAll: FiltersState = (rt && rt.state && rt.state.filters && typeof rt.state.filters === 'object') ? rt.state.filters : {};

  const dims: FilterDim[] = [];

  for (const dim of selDims) {
    const label = dim.label;
    const comp: Partial<SelectComponent> = dim.comp || {};
    const compDict = Array.isArray(comp.dict) ? comp.dict : [];

    let res: ResolvedArray | null = null;
    try {
      res = await resolveRefOrHref(st, comp.codes);
    } catch (_) { res = null; }
    const codes = res && res.array;
    if (!codes || !ArrayBuffer.isView(codes)) continue;

    const gid = dim.groupId;
    const groupState: Record<string, unknown> = (stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
    const sel = groupState[label];

    // An empty selection disables the dimension.
    let selected: Set<string> | null = null;
    if (sel instanceof Set && sel.size) selected = new Set(Array.from(sel, v => String(v)));
    if (!selected) {
      dims.push({ kind: 'select', codes, allowed: 'disabled' });
      continue;
    }

    const allowed: number[] = [];
    for (let i = 0; i < compDict.length; i++) {
      if (selected.has(String(compDict[i]))) allowed.push(i);
    }
    dims.push({ kind: 'select', codes, allowed: allowed.length ? allowed : 'no match' });
  }

  for (const dim of rngDims) {
    const label = dim.label;
    const comp: Partial<RangeComponent> = dim.comp || {};

    let res: ResolvedArray | null = null;
    try {
      res = await resolveRefOrHref(st, comp.values);
    } catch (_) { res = null; }
    const vals = res && res.array;
    if (!vals || !ArrayBuffer.isView(vals)) continue;

    const gid = dim.groupId;
    const groupState: Record<string, unknown> = (stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
    const r = groupState[label];
    let lo: number | null = null, hi: number | null = null;
    if (Array.isArray(r) && r.length >= 2) { lo = +r[0]; hi = +r[1]; }
    else {
      const cmin = comp.min as number, cmax = comp.max as number;
      lo = Number.isFinite(+cmin) ? +cmin : 0;
      hi = Number.isFinite(+cmax) ? +cmax : lo;
    }
    if (!isFiniteNumber(lo)) lo = 0;
    if (!isFiniteNumber(hi)) hi = lo;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }

    // The values are float32 and the GPU holds the bounds as float32.
    dims.push({ kind: 'range', values: vals, bounds: [Math.fround(lo), Math.fround(hi)] });
  }

  return dims;
}

export async function getGPUFilterContribution(
  st: LayerState,
  layerId: unknown,
  x: Spec,
  rt: WidgetRuntime | null | undefined
): Promise<FilterContribution | null> {
  void x;
  const dims = await resolveFilterDims(st, layerId, rt);
  if (!dims.length) return null;

  const cats: SelectDim[] = [];
  const rngs: RangeDim[] = [];
  for (const dim of dims) {
    if (dim.kind === 'select') cats.push(dim);
    else rngs.push(dim);
  }

  const { pickPartIndex: pickIndex, indexForArray } = getIndexers(st);

  const gpu: GpuFiltering = {};

  const catArrays = cats.map(d => d.codes);
  const catNoMatch = cats.map(d => d.allowed === 'no match');
  const catDisabled = cats.map(d => d.allowed === 'disabled');
  const rngArrays = rngs.map(d => d.values);
  const forceHidden = catNoMatch.includes(true);

  const categoryDims = cats.length;
  const rangeDims = rngs.length;
  const gpuMeta: GpuMeta = { categoryDims, rangeDims };

  if (categoryDims) {
    gpu.filterCategories = retOneOrMany(cats.map(d => Array.isArray(d.allowed) ? d.allowed : [0]));
    gpu.__catDisabledKey = retOneOrMany(catDisabled.map(d => d ? 1 : 0));
    const scratchCategory: number[] | null = (categoryDims > 1) ? new Array(categoryDims) : null;
    gpu.getFilterCategory = (d, info) => {
      const partIdx = pickIndex(d, info);
      const p = (partIdx == null ? 0 : partIdx);

      if (categoryDims === 1) {
        if (catNoMatch[0]) return 1;
        if (catDisabled[0]) return 0;
        const arr = catArrays[0];
        const ii = indexForArray(arr, p);
        return (arr && (arr[ii] >>> 0)) >>> 0;
      }

      const out = scratchCategory!;
      for (let k = 0; k < categoryDims; k++) {
        if (catNoMatch[k]) { out[k] = 1; continue; }
        if (catDisabled[k]) { out[k] = 0; continue; }
        const arr = catArrays[k];
        const ii = indexForArray(arr, p);
        out[k] = (arr && (arr[ii] >>> 0)) >>> 0;
      }
      return out;
    };
  }

  if (rangeDims) {
    gpu.filterRange = retOneOrMany(rngs.map(d => d.bounds));
    const scratchRange: number[] | null = (rangeDims > 1) ? new Array(rangeDims) : null;
    gpu.getFilterValue = (d, info) => {
      const partIdx = pickIndex(d, info);
      const p = (partIdx == null ? 0 : partIdx);

      if (rangeDims === 1) {
        const arr = rngArrays[0];
        const ii = indexForArray(arr, p);
        const v = arr ? arr[ii] : NaN;
        return Number.isFinite(v) ? v : NA_RANGE_VALUE;
      }

      const out = scratchRange!;
      for (let k = 0; k < rangeDims; k++) {
        const arr = rngArrays[k];
        const ii = indexForArray(arr, p);
        const v = arr ? arr[ii] : NaN;
        out[k] = Number.isFinite(v) ? v : NA_RANGE_VALUE;
      }
      return out;
    };
  }

  return { gpuFiltering: gpu, gpuMeta, forceHidden };
}
