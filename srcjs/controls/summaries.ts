import { resolveRefOrHref } from '../core/assets';
import { getIndexers } from '../core/data';
import type { Indexers } from '../core/data';
import type { LayerState, ResolvedArray } from '../core/layer-state';
import type { Control, Ref, Spec, SummariesComponent, SummariesControl, SummaryRow } from '../core/spec-types';
import { formatNumber, isFiniteNumber, normText } from '../core/utils';
import type { FiltersState, WidgetElement, WidgetRuntime } from '../core/widget';
import type { RangeSource, SelectSource } from '../filters/runtime';
import { getLogicalLayer, getRenderState, readRenderField } from '../runtime/assembly';
import { register } from './registry';
import type { ControlJob } from './registry';

// What update() keeps on the node it draws into.
interface SummariesLocal {
  seq: number;
  nodes: Map<string, HTMLElement>;
  order: string[];
}

type SummariesMount = HTMLElement & { __mlSummaries?: SummariesLocal };

// A layer's rows as a summary sees them: which parts pass the filters and how many rows
// that is.
interface LayerMask {
  st: LayerState | null;
  n: number;
  passCount: number;
  mask: Uint8Array | null;
  indexers: Indexers | null;
}

// A component as the code reads it. R emits `values`; `codes` is read as a fallback.
type SummarySource = SummariesComponent & { readonly values?: Ref; readonly codes?: Ref };

type MemberPartial =
  | { kind: 'count'; n: number; empty: false; na: false }
  | { kind: 'sum' | 'mean'; s: number; n: number; empty: false; na: false }
  | { kind: 'min' | 'max'; v: number; empty: false; na: false }
  | { kind: 'na'; na: true; empty: false }
  | { kind: 'empty'; empty: true; na: false };

type SummaryValue = number | 'NA' | null;

function clearNode(node: Node | null | undefined): void {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function inferFeatureCount(st: LayerState | null | undefined): number {
  const cols = st && st.data_columns ? st.data_columns : {};

  // points/icons/markers
  const pos = cols && cols.position;
  if (pos && pos.array && ArrayBuffer.isView(pos.array)) {
    const sz = Number.isFinite(+pos.size!) ? (+pos.size!) : 2;
    return Math.floor(pos.array.length / (sz || 2)) >>> 0;
  }

  // paths
  const p = cols && cols.path;
  if (p && p.path_starts_array && ArrayBuffer.isView(p.path_starts_array)) {
    return (p.path_starts_array.length >>> 0);
  }

  // polygons
  const poly = cols && cols.polygon;
  if (poly && poly.poly_starts_array && ArrayBuffer.isView(poly.poly_starts_array)) {
    return (poly.poly_starts_array.length >>> 0);
  }

  const idx = cols.feature_index_array;
  if (idx && ArrayBuffer.isView(idx)) return (idx.length >>> 0);

  return 0;
}

// Summaries are per row. Multipart geometry has one part per entry in the mask, so each
// row is visited through its first part only.
function forEachRow(
  n: number,
  mask: Uint8Array | null,
  indexers: Indexers | null,
  fn: (p: number) => boolean | void
): void {
  const rowIndex = (indexers && indexers.hasIdxMap && typeof indexers.rowIndex === 'function') ? indexers.rowIndex : null;
  const seen = rowIndex ? new Uint8Array(n) : null;
  for (let p = 0; p < n; p++) {
    if (mask && mask[p] !== 1) continue;
    if (seen) {
      const r = rowIndex!(p);
      if (seen[r]) continue;
      seen[r] = 1;
    }
    if (fn(p) === false) return;
  }
}

function countRows(n: number, mask: Uint8Array | null, indexers: Indexers | null): number {
  let c = 0;
  forEachRow(n, mask, indexers, () => { c++; });
  return c;
}

function buildRowOrder(rows: Readonly<Record<string, unknown>>, orderRaw: unknown): string[] {
  const keys = Object.keys(rows || {});
  if (!keys.length) return [];

  const byNorm = new Map<string, string>();
  for (const k of keys) byNorm.set(normText(k), k);

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (k: string | undefined): void => {
    if (!k) return;
    if (seen.has(k)) return;
    if (!Object.prototype.hasOwnProperty.call(rows, k)) return;
    seen.add(k);
    out.push(k);
  };

  if (Array.isArray(orderRaw) && orderRaw.length) {
    for (const raw of orderRaw) {
      const s = String(raw == null ? '' : raw);
      push(Object.prototype.hasOwnProperty.call(rows, s) ? s : byNorm.get(normText(s)));
    }
  }

  for (const k of keys) push(k);
  return out;
}

function ensureLocalState(mountEl: SummariesMount): SummariesLocal {
  const s = (mountEl && mountEl.__mlSummaries && typeof mountEl.__mlSummaries === 'object')
    ? mountEl.__mlSummaries
    : null;
  if (s) return s;
  const out: SummariesLocal = { seq: 0, nodes: new Map(), order: [] };
  mountEl.__mlSummaries = out;
  return out;
}

export function render(
  mountEl: HTMLElement | null,
  el: WidgetElement | null | undefined,
  x: Spec,
  groupId: string | null | undefined,
  controlSpec: Control | null | undefined
): void {
  if (!mountEl) return;

  const gid = (groupId != null) ? String(groupId) : 'summaries';
  const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
  if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'summaries') {
    clearNode(mountEl);
    return;
  }
  const summaries = ctl as SummariesControl;

  const rows = (summaries.rows && typeof summaries.rows === 'object') ? summaries.rows : {};
  const keys = Object.keys(rows);

  clearNode(mountEl);

  // Reset local state for this mount.
  const local = ensureLocalState(mountEl);
  local.nodes = new Map();
  local.order = [];

  if (!keys.length) {
    const msg = document.createElement('div');
    msg.className = 'ml-controls-placeholder';
    msg.textContent = 'No summaries available.';
    mountEl.appendChild(msg);
    return;
  }

  // Respect authored order from the compiled spec.
  const order = buildRowOrder(rows, summaries.order);
  local.order = order.slice();

  const box = document.createElement('div');
  box.className = 'ml-summaries';
  mountEl.appendChild(box);

  for (const k of order) {
    const rowSpec: Partial<SummaryRow> = rows[k] || {};

    const row = document.createElement('div');
    row.className = 'ml-summary-row';
    row.dataset.mfSummaryLabel = normText(rowSpec.label) || normText(k);
    row.dataset.mfSummaryOp = normText(rowSpec.op) || '';

    const lab = document.createElement('div');
    lab.className = 'ml-summary-label';
    lab.textContent = normText(rowSpec.label) || normText(k) || 'Summary';

    const val = document.createElement('div');
    val.className = 'ml-summary-value';

    // Values are computed later; provide a placeholder.
    const op = normText(rowSpec.op);
    val.textContent = (op === 'count' || op === 'count_non_na') ? '0' : '—';

    row.appendChild(lab);
    row.appendChild(val);
    box.appendChild(row);

    // Fast lookup for update(). Use the resolved row label as the key.
    const rowKey = normText(rowSpec.label) || normText(k);
    if (rowKey) local.nodes.set(rowKey, val);
  }

  // If a runtime is present, do an immediate best-effort update.
  // (Pipeline will also call update() on the next scheduled flush.)
  const rt = el && el.__mfRuntime;
  if (rt) {
    update(mountEl, el, x, rt, gid, summaries, { reason: 'mount' });
  }
}

function renderValue(rowSpec: Partial<SummaryRow>, value: SummaryValue): string {
  const digits = Number.isFinite(+rowSpec.digits!) ? (+rowSpec.digits! | 0) : 0;
  const prefix = (rowSpec.prefix == null) ? '' : String(rowSpec.prefix);
  const suffix = (rowSpec.suffix == null) ? '' : String(rowSpec.suffix);

  if (value === null) return '—';
  if (value === 'NA') return 'NA';
  if (!isFiniteNumber(value)) return '—';

  const txt = formatNumber(value, digits);
  return `${prefix}${txt}${suffix}`;
}

async function computeLayerMask(
  rt: WidgetRuntime | null | undefined,
  x: Spec,
  layerId: string
): Promise<LayerMask> {
  const entry = rt && rt.layers && typeof rt.layers.get === 'function' ? rt.layers.get(layerId) : null;

  const st = (entry ? getRenderState(entry) : null)
    || (entry ? getLogicalLayer(entry) : null)
    || (x && x['.__layers'] ? x['.__layers'][layerId] as LayerState : null);
  if (!st || typeof st !== 'object') {
    return { st: null, n: 0, passCount: 0, mask: null, indexers: null };
  }

  const n = inferFeatureCount(st) >>> 0;
  if (!n) return { st, n: 0, passCount: 0, mask: null, indexers: null };

  const indexers = getIndexers(st);
  const indexForArray = indexers && typeof indexers.indexForArray === 'function'
    ? indexers.indexForArray
    : ((arr: ArrayLike<number> | null | undefined, p: number) => (Number.isFinite(p) ? (p >>> 0) : 0));

  // If layer is force-hidden (e.g. select dim has no overlapping values), nothing passes.
  const forceHidden = !!readRenderField(st, 'forceHidden');
  if (forceHidden) {
    const z = new Uint8Array(n);
    return { st, n, passCount: 0, mask: z, indexers };
  }

  const idx = rt && rt._filterIndex;
  const entryIdx = idx && idx.byLayer && typeof idx.byLayer.get === 'function' ? idx.byLayer.get(layerId) : null;
  const selDims = (entryIdx && Array.isArray(entryIdx.select)) ? entryIdx.select.slice(0, 4) : [];
  const rngDims = (entryIdx && Array.isArray(entryIdx.range))  ? entryIdx.range.slice(0, 4)  : [];

  if (!selDims.length && !rngDims.length) {
    // No filters affect this layer.
    return { st, n, passCount: countRows(n, null, indexers), mask: null, indexers };
  }

  const stateAll: FiltersState = (rt && rt.state && rt.state.filters && typeof rt.state.filters === 'object') ? rt.state.filters : {};
  const mask = new Uint8Array(n);
  mask.fill(1);

  // --- Select dims ---
  for (const dim of selDims) {
    const comp: Partial<SelectSource> = dim && dim.comp ? dim.comp : {};
    const gid = normText(dim.groupId);
    const label = normText(dim.label);
    const groupState: Record<string, unknown> = (gid && stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
    const sel = groupState[label];

    // Empty selection disables the dim.
    let selected: Set<string> | null = null;
    if (sel instanceof Set && sel.size) selected = new Set(Array.from(sel, v => String(v)));
    else if (Array.isArray(sel) && sel.length) selected = new Set(sel.map(v => String(v)));
    if (!selected) continue;

    const dict = Array.isArray(comp.dict) ? comp.dict : [];
    const allowed = new Set<number>();
    for (let i = 0; i < dict.length; i++) {
      if (selected.has(String(dict[i]))) allowed.add(i);
    }
    if (allowed.size === 0) {
      // Deterministic match-nothing.
      mask.fill(0);
      return { st, n, passCount: 0, mask, indexers };
    }

    let res: ResolvedArray | null = null;
    try {
      res = await resolveRefOrHref(st, comp.codes || comp.values);
    } catch (_) { res = null; }
    const codes = res && res.array;
    if (!codes || !ArrayBuffer.isView(codes)) continue;

    for (let p = 0; p < n; p++) {
      if (mask[p] === 0) continue;
      const ii = indexForArray(codes, p);
      const code = (codes && codes[ii] != null) ? (codes[ii] >>> 0) : 0;
      if (!allowed.has(code)) mask[p] = 0;
    }
  }

  // Early exit
  let passCount = countRows(n, mask, indexers);
  if (!passCount) return { st, n, passCount: 0, mask, indexers };

  // --- Range dims ---
  for (const dim of rngDims) {
    const comp: Partial<RangeSource> = dim && dim.comp ? dim.comp : {};
    const gid = normText(dim.groupId);
    const label = normText(dim.label);

    const groupState: Record<string, unknown> = (gid && stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
    const r = groupState[label];
    let lo: number | null = null, hi: number | null = null;
    if (Array.isArray(r) && r.length >= 2) { lo = +r[0]; hi = +r[1]; }
    else {
      const cmin = comp.min as number, cmax = comp.max as number;
      const dmin = comp.domain?.min as number, dmax = comp.domain?.max as number;
      lo = Number.isFinite(+cmin) ? +cmin : (Number.isFinite(+dmin) ? +dmin : 0);
      hi = Number.isFinite(+cmax) ? +cmax : (Number.isFinite(+dmax) ? +dmax : lo);
    }
    if (!isFiniteNumber(lo)) lo = 0;
    if (!isFiniteNumber(hi)) hi = lo;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }

    let res: ResolvedArray | null = null;
    try {
      res = await resolveRefOrHref(st, comp.values || comp.codes);
    } catch (_) { res = null; }
    const vals = res && res.array;
    if (!vals || !ArrayBuffer.isView(vals)) continue;

    for (let p = 0; p < n; p++) {
      if (mask[p] === 0) continue;
      const ii = indexForArray(vals, p);
      const v = vals ? vals[ii] : NaN;
      if (!Number.isFinite(v) || v < lo || v > hi) mask[p] = 0;
    }
  }

  passCount = countRows(n, mask, indexers);
  return { st, n, passCount, mask, indexers };
}

async function computeMemberPartial(
  op: string,
  rowSpec: Partial<SummaryRow>,
  comp: SummarySource,
  layerCtx: LayerMask
): Promise<MemberPartial> {
  const naRm = !!rowSpec.na_rm;
  const n = layerCtx.n >>> 0;
  const mask = layerCtx.mask;
  const indexers = layerCtx.indexers;
  const indexForArray = indexers && typeof indexers.indexForArray === 'function'
    ? indexers.indexForArray
    : ((arr: ArrayLike<number> | null | undefined, p: number) => (Number.isFinite(p) ? (p >>> 0) : 0));

  // count does not require values
  if (op === 'count') {
    return { kind: 'count', n: layerCtx.passCount >>> 0, empty: false, na: false };
  }

  const st = layerCtx.st;
  if (!st) return { kind: 'empty', empty: true, na: false };

  // Resolve values array
  let res: ResolvedArray | null = null;
  try {
    res = await resolveRefOrHref(st, comp.values || comp.codes);
  } catch (_) { res = null; }
  const arr = res && res.array;
  if (!arr || !ArrayBuffer.isView(arr)) {
    return { kind: 'empty', empty: true, na: false };
  }

  if (op === 'count_non_na') {
    let nn = 0;
    forEachRow(n, mask, indexers, (p) => {
      const ii = indexForArray(arr, p);
      const v = arr[ii];
      if (Number.isFinite(v)) nn++;
    });
    return { kind: 'count', n: nn, empty: false, na: false };
  }

  if (op === 'sum' || op === 'mean') {
    let s = 0;
    let nn = 0;
    let sawNA = false;
    forEachRow(n, mask, indexers, (p) => {
      const ii = indexForArray(arr, p);
      const v = arr[ii];
      if (Number.isFinite(v)) {
        s += v;
        nn += 1;
      } else {
        if (!naRm) { sawNA = true; return false; }
      }
    });
    if (sawNA) return { kind: 'na', na: true, empty: false };
    if (nn === 0) return { kind: 'empty', empty: true, na: false };
    return (op === 'sum')
      ? { kind: 'sum', s, n: nn, empty: false, na: false }
      : { kind: 'mean', s, n: nn, empty: false, na: false };
  }

  if (op === 'min' || op === 'max') {
    let best = (op === 'min') ? Infinity : -Infinity;
    let has = false;
    let sawNA = false;
    forEachRow(n, mask, indexers, (p) => {
      const ii = indexForArray(arr, p);
      const v = arr[ii];
      if (Number.isFinite(v)) {
        if (!has) { best = v; has = true; }
        else {
          if (op === 'min') { if (v < best) best = v; }
          else { if (v > best) best = v; }
        }
      } else {
        if (!naRm) { sawNA = true; return false; }
      }
    });
    if (sawNA) return { kind: 'na', na: true, empty: false };
    if (!has) return { kind: 'empty', empty: true, na: false };
    return { kind: op, v: best, empty: false, na: false };
  }

  return { kind: 'empty', empty: true, na: false };
}

async function updateAsync(
  mountEl: SummariesMount | null,
  el: WidgetElement | null | undefined,
  x: Spec,
  rt: WidgetRuntime | null | undefined,
  groupId: string | null | undefined,
  controlSpec: Control | null | undefined,
  job?: ControlJob | null
): Promise<void> {
  if (!mountEl || !x || !rt) return;

  const gid = (groupId != null) ? String(groupId) : 'summaries';
  const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
  if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'summaries') return;
  const summaries = ctl as SummariesControl;

  const rows = (summaries.rows && typeof summaries.rows === 'object') ? summaries.rows : {};
  const order = buildRowOrder(rows, summaries.order);

  const local = ensureLocalState(mountEl);
  const seq = ++local.seq;

  // Build missing node index if needed
  if (!local.nodes || typeof local.nodes.get !== 'function' || !local.nodes.size) {
    local.nodes = new Map();
    const nodes = mountEl.querySelectorAll<HTMLElement>('.ml-summary-row');
    nodes && nodes.forEach(r => {
      const label = normText(r.dataset.mfSummaryLabel);
      const v = r.querySelector<HTMLElement>('.ml-summary-value');
      if (label && v) local.nodes.set(label, v);
    });
  }

  // Cache per-layer masks within this update
  const layerCache = new Map<string, LayerMask>();
  const getLayer = async (layerId: unknown): Promise<LayerMask> => {
    const lid = normText(layerId);
    if (!lid) return { st: null, n: 0, passCount: 0, mask: null, indexers: null };
    if (layerCache.has(lid)) return layerCache.get(lid)!;
    const ctx = await computeLayerMask(rt, x, lid);
    layerCache.set(lid, ctx);
    return ctx;
  };

  const compsAll = ((x && x['.__components'] && x['.__components'].summaries) ? x['.__components'].summaries : {}) as Readonly<Record<string, SummarySource>>;

  for (const k of order) {
    if (local.seq !== seq) return; // stale

    const rowSpec: Partial<SummaryRow> = rows[k] || {};
    const label = normText(rowSpec.label) || normText(k);
    const op = normText(rowSpec.op);
    const members = Array.isArray(rowSpec.members) ? rowSpec.members : [];

    const node = local.nodes.get(label);
    if (!node) continue;

    // Compute row value from members
    let outVal: SummaryValue = null; // null => empty
    let outNA = false;

    if (op === 'count' || op === 'count_non_na') {
      let total = 0;
      for (const midRaw of members) {
        const mid = normText(midRaw);
        const comp = mid ? compsAll[mid] : null;
        if (!comp) continue;
        const ctx = await getLayer(comp.layer);
        if (local.seq !== seq) return;

        const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
        if (local.seq !== seq) return;

        if (partial.na) { outNA = true; break; }
        if (partial.kind === 'count') total += (+partial.n || 0);
      }
      if (outNA) outVal = 'NA';
      else outVal = total;
    } else if (op === 'sum') {
      let sTot = 0;
      let hasAny = false;
      for (const midRaw of members) {
        const mid = normText(midRaw);
        const comp = mid ? compsAll[mid] : null;
        if (!comp) continue;
        const ctx = await getLayer(comp.layer);
        if (local.seq !== seq) return;

        const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
        if (local.seq !== seq) return;

        if (partial.na) { outNA = true; break; }
        if (!partial.empty && partial.kind === 'sum') {
          sTot += (+partial.s || 0);
          hasAny = true;
        }
      }
      outVal = outNA ? 'NA' : (hasAny ? sTot : null);
    } else if (op === 'min' || op === 'max') {
      let best = (op === 'min') ? Infinity : -Infinity;
      let has = false;
      for (const midRaw of members) {
        const mid = normText(midRaw);
        const comp = mid ? compsAll[mid] : null;
        if (!comp) continue;
        const ctx = await getLayer(comp.layer);
        if (local.seq !== seq) return;

        const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
        if (local.seq !== seq) return;

        if (partial.na) { outNA = true; break; }
        if (!partial.empty && partial.kind === op) {
          const v = +partial.v;
          if (!Number.isFinite(v)) continue;
          if (!has) { best = v; has = true; }
          else {
            if (op === 'min') { if (v < best) best = v; }
            else { if (v > best) best = v; }
          }
        }
      }
      outVal = outNA ? 'NA' : (has ? best : null);
    } else if (op === 'mean') {
      let sTot = 0;
      let nTot = 0;
      for (const midRaw of members) {
        const mid = normText(midRaw);
        const comp = mid ? compsAll[mid] : null;
        if (!comp) continue;
        const ctx = await getLayer(comp.layer);
        if (local.seq !== seq) return;

        const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
        if (local.seq !== seq) return;

        if (partial.na) { outNA = true; break; }
        if (!partial.empty && (partial.kind === 'mean')) {
          sTot += (+partial.s || 0);
          nTot += (+partial.n || 0);
        }
      }
      outVal = outNA ? 'NA' : (nTot > 0 ? (sTot / nTot) : null);
    } else {
      outVal = null;
    }

    const txt = renderValue(rowSpec, outVal);
    if (node.textContent !== txt) node.textContent = txt;
  }
}

export function update(
  mountEl: HTMLElement | null,
  el: WidgetElement | null | undefined,
  x: Spec,
  rt: WidgetRuntime | null | undefined,
  groupId: string | null | undefined,
  controlSpec: Control | null | undefined,
  job?: ControlJob | null
): void {
  // Fire-and-forget async update; pipeline does not await.
  void updateAsync(mountEl, el, x, rt, groupId, controlSpec, job);
}

try {
  register('summaries', { render, update });
} catch (_) {}
