import { resolveRefOrHref } from '../core/assets';
import { getIndexers } from '../core/data';
import type { Indexers } from '../core/data';
import type { LayerState, ResolvedArray } from '../core/layer-state';
import type { Control, Ref, Spec, SummariesComponent, SummariesControl, SummaryRow } from '../core/spec-types';
import { authoredOrder, formatNumber, isFiniteNumber, normText } from '../core/utils';
import type { WidgetElement, WidgetRuntime } from '../core/widget';
import { resolveFilterDims } from '../filters/runtime';
import { getLogicalLayer, getRenderState, readRenderField } from '../runtime/assembly';
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

// A summary component as the code reads it. A count carries no `values`.
type SummarySource = SummariesComponent & { readonly values?: Ref };

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
  const ctl = controlSpec;
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
  const order = authoredOrder(rows, summaries.order);
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

export async function computeLayerMask(
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

  const dims = await resolveFilterDims(st, layerId, rt);
  if (!dims.length) {
    // No filters affect this layer.
    return { st, n, passCount: countRows(n, null, indexers), mask: null, indexers };
  }

  const mask = new Uint8Array(n);
  mask.fill(1);

  for (const dim of dims) {
    if (dim.kind === 'select') {
      if (dim.allowed === 'disabled') continue;
      if (dim.allowed === 'no match') {
        mask.fill(0);
        return { st, n, passCount: 0, mask, indexers };
      }
      const codes = dim.codes;
      const allowed = new Set(dim.allowed);
      for (let p = 0; p < n; p++) {
        if (mask[p] === 0) continue;
        if (!allowed.has(codes[indexForArray(codes, p)] >>> 0)) mask[p] = 0;
      }
    } else {
      const vals = dim.values;
      const [lo, hi] = dim.bounds;
      for (let p = 0; p < n; p++) {
        if (mask[p] === 0) continue;
        const v = vals[indexForArray(vals, p)];
        if (!Number.isFinite(v) || v < lo || v > hi) mask[p] = 0;
      }
    }
  }

  return { st, n, passCount: countRows(n, mask, indexers), mask, indexers };
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
    res = await resolveRefOrHref(st, comp.values);
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
  x: Spec,
  rt: WidgetRuntime | null | undefined,
  controlSpec: Control | null | undefined
): Promise<void> {
  if (!mountEl || !x || !rt) return;

  const ctl = controlSpec;
  if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'summaries') return;
  const summaries = ctl as SummariesControl;

  const rows = (summaries.rows && typeof summaries.rows === 'object') ? summaries.rows : {};
  const order = authoredOrder(rows, summaries.order);

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
  void updateAsync(mountEl, x, rt, controlSpec);
}
