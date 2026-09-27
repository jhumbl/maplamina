import type { Layer } from '@deck.gl/core';
import type {
  ApplyViewOpsOptions,
  MergeEncodings,
  ViewOp,
  ViewOpContext,
  applyOrderedViewOps
} from '../components/views';
import { pruneEmbeddedBlobs } from '../core/assets';
import { resolveActiveOnly, resolveRemainingViewsIdle } from '../core/data';
import type { LayerState, RenderFields, TransitionsMap } from '../core/layer-state';
import type { Layer as SpecLayer, Spec } from '../core/spec-types';
import type { LayerEntry, WidgetRuntime } from '../core/widget';
import type { FilterContribution, getGPUFilterContribution } from '../filters/runtime';

// A layer before it is cloned: as the spec carries it, or as the runtime holds it.
type SourceLayer = SpecLayer | LayerState;

type PrepareLogicalLayer = (st0: SourceLayer | null | undefined, layerId?: string | null) => Promise<LayerState | null>;
type CloneLogicalLayer = (logical: SourceLayer | null | undefined, layerId?: string | null) => LayerState | null;

export interface RenderArtifactsOptions {
  entry?: LayerEntry | null;
  sourceState?: SourceLayer | null;
  logical?: LayerState | null;
  layerId: string;
  spec: Spec;
  rt?: WidgetRuntime | null;
  x?: Spec;
  mergeEncodings?: MergeEncodings | null;
  opsByLayer?: Map<string, ViewOp[]> | null;
  applyOrderedViewOps?: typeof applyOrderedViewOps | null;
  prevByGroup?: ApplyViewOpsOptions['prevByGroup'];
  onViewOp?: ((op: ViewOp, meta: ViewOpContext) => void) | null;
  getGPUFilterContribution?: typeof getGPUFilterContribution | null;
  transitions?: TransitionsMap | null;
  buildLayer?: ((st: LayerState) => Layer | Layer[] | null) | null;
  prepareLogicalLayer?: PrepareLogicalLayer | null;
  cloneLogicalLayer?: CloneLogicalLayer | null;
  pruneEmbeddedBlobs?: typeof pruneEmbeddedBlobs | null;
}

interface RenderStateResult {
  logical: LayerState;
  renderState: LayerState;
  logicalChanged: boolean;
  viewOps: ViewOp[];
  filterContribution: FilterContribution | null;
}

export interface RenderArtifacts extends RenderStateResult {
  layer: Layer | Layer[] | null;
  entry: LayerEntry;
}

interface FilterContributionOptions {
  renderState: LayerState;
  layerId: string;
  x?: Spec;
  rt?: WidgetRuntime | null;
  getGPUFilterContribution?: typeof getGPUFilterContribution | null;
}

function ensureRenderBucket(st: LayerState | null | undefined): RenderFields | null {
  if (!st || typeof st !== 'object') return null;
  const r0 = st.__render;
  const r = (r0 && typeof r0 === 'object') ? r0 : {};
  st.__render = r;
  return r;
}

export function readRenderField<K extends keyof RenderFields>(
  st: LayerState | null | undefined,
  key: K
): RenderFields[K] | null {
  const render = ensureRenderBucket(st);
  if (!render) return null;
  return Object.prototype.hasOwnProperty.call(render, key) ? render[key] : null;
}

function applyRenderPatch(
  st: LayerState,
  patch: { [K in keyof RenderFields]?: RenderFields[K] | null }
): LayerState {
  if (!st || typeof st !== 'object') return st;
  const render = ensureRenderBucket(st);
  if (!render) return st;
  const p = (patch && typeof patch === 'object') ? patch : {};

  function setField<K extends keyof RenderFields>(key: K, value: RenderFields[K] | null | undefined): void {
    if (value == null || value === false) {
      try { delete render![key]; } catch (_) {}
      return;
    }
    render![key] = value;
  }

  if (Object.prototype.hasOwnProperty.call(p, 'transitions')) setField('transitions', p.transitions);
  if (Object.prototype.hasOwnProperty.call(p, 'gpuFiltering')) setField('gpuFiltering', p.gpuFiltering);
  if (Object.prototype.hasOwnProperty.call(p, 'gpuMeta')) setField('gpuMeta', p.gpuMeta);
  if (Object.prototype.hasOwnProperty.call(p, 'forceHidden')) {
    if (p.forceHidden) render.forceHidden = true;
    else try { delete render.forceHidden; } catch (_) {}
  }

  return st;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== 'object') return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function cloneLayerValue<T>(x: T): T {
  if (ArrayBuffer.isView(x)) return x;
  if (Array.isArray(x)) return x.map(cloneLayerValue) as T;
  if (isPlainObject(x)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x)) out[k] = cloneLayerValue(x[k]);
    return out as T;
  }
  return x;
}

function cloneLogicalLayer(logical: SourceLayer | null | undefined, layerId?: string | null): LayerState | null {
  if (!logical || typeof logical !== 'object') return null;
  const st = cloneLayerValue(logical) as LayerState;
  st.id = st.id || layerId || logical.id || null;
  return st;
}

async function prepareLogicalLayer(st0: SourceLayer | null | undefined, layerId?: string | null): Promise<LayerState | null> {
  const st = cloneLogicalLayer(st0, layerId);
  if (!st) return null;
  await resolveActiveOnly(st);
  return st;
}

function ensureLayerEntry(entry: LayerEntry | null | undefined, logical?: LayerState | null): Required<LayerEntry> {
  const out = ((entry && typeof entry === 'object') ? entry : {}) as Required<LayerEntry>;
  if (!out.runtime || typeof out.runtime !== 'object') out.runtime = {};
  if (!out.cache || typeof out.cache !== 'object') out.cache = {};
  if (arguments.length > 1) out.logical = logical || null;
  if (!Object.prototype.hasOwnProperty.call(out, 'logical')) out.logical = null;
  if (!Object.prototype.hasOwnProperty.call(out.cache, 'lastRenderState')) out.cache.lastRenderState = null;
  return out;
}

export function getLogicalLayer(entry: LayerEntry | null | undefined): LayerState | null {
  return (entry && typeof entry === 'object') ? (entry.logical || null) : null;
}

export function getRenderState(entry: LayerEntry | null | undefined): LayerState | null {
  if (!entry || !entry.cache || typeof entry.cache !== 'object') return null;
  return entry.cache.lastRenderState || null;
}

function attachFilterContribution(st: LayerState, contribution: FilterContribution | null | undefined): LayerState {
  const c = (contribution && typeof contribution === 'object') ? contribution : null;
  return applyRenderPatch(st, {
    gpuFiltering: c ? c.gpuFiltering : null,
    gpuMeta: c ? c.gpuMeta : null,
    forceHidden: !!(c && c.forceHidden)
  });
}

async function collectFilterContribution(opts: FilterContributionOptions): Promise<FilterContribution | null> {
  const getGPUFilterContribution = opts && opts.getGPUFilterContribution;
  if (typeof getGPUFilterContribution !== 'function') return null;
  return await getGPUFilterContribution(
    opts && opts.renderState,
    opts && opts.layerId,
    opts && opts.x!,
    opts && opts.rt
  );
}

function attachTransitions(st: LayerState, transitions: TransitionsMap | null | undefined): LayerState {
  return applyRenderPatch(st, { transitions: transitions || null });
}

async function assembleRenderState(opts: RenderArtifactsOptions): Promise<RenderStateResult> {
  const layerId = opts && opts.layerId;
  const spec = opts && opts.spec;
  const rt = opts && opts.rt;
  const sourceState = opts && opts.sourceState;
  const logicalIn = (opts && Object.prototype.hasOwnProperty.call(opts, 'logical')) ? opts.logical : null;
  const prepareLogical = (opts && opts.prepareLogicalLayer) || prepareLogicalLayer;
  const cloneLayer = (opts && opts.cloneLogicalLayer) || cloneLogicalLayer;

  let logical = logicalIn || null;
  let logicalChanged = false;

  if (!logical) {
    logical = (typeof prepareLogical === 'function')
      ? await prepareLogical(sourceState, layerId)
      : (cloneLayer(sourceState, layerId) || Object.assign({}, sourceState || {}) as LayerState);
    logicalChanged = true;
  }

  let renderState = cloneLayer(logical, layerId) || Object.assign({}, logical || {}) as LayerState;
  renderState.id = renderState.id || layerId;
  // Builder and runtime caches live outside layer state (in the widget's context cache), so
  // renderState holds render content rather than retained build artifacts.

  let viewOps: ViewOp[] = [];
  if (typeof (opts && opts.applyOrderedViewOps) === 'function') {
    const res = opts.applyOrderedViewOps!(spec, renderState, layerId, opts.opsByLayer, opts.mergeEncodings, {
      prevByGroup: opts.prevByGroup,
      onOp: opts.onViewOp
    });
    renderState = (res && res.state) ? res.state : renderState;
    viewOps = (res && Array.isArray(res.ops)) ? res.ops : [];
  }

  if (viewOps.length) {
    await resolveActiveOnly(renderState);
  }

  const filterContribution = await collectFilterContribution({
    renderState,
    layerId,
    x: opts && opts.x,
    rt,
    getGPUFilterContribution: opts && opts.getGPUFilterContribution
  });
  attachFilterContribution(renderState, filterContribution);
  attachTransitions(renderState, opts && opts.transitions);

  return {
    logical: logical!,
    renderState,
    logicalChanged,
    viewOps,
    filterContribution: filterContribution || null
  };
}

export async function buildRenderArtifacts(opts: RenderArtifactsOptions): Promise<RenderArtifacts> {
  const out = await assembleRenderState(opts || {});
  const layer = (opts && typeof opts.buildLayer === 'function') ? opts.buildLayer(out.renderState) : null;

  const entry = ensureLayerEntry(opts && opts.entry, out.logical);
  entry.logical = out.logical;
  entry.cache.lastRenderState = out.renderState || null;

  const prune = (opts && opts.pruneEmbeddedBlobs) || pruneEmbeddedBlobs;
  if (out.logicalChanged && typeof prune === 'function') {
    try { prune(out.logical); } catch (_) {}
  }
  if (out.renderState) {
    resolveRemainingViewsIdle(out.renderState);
  }

  return {
    logical: out.logical,
    renderState: out.renderState,
    logicalChanged: out.logicalChanged,
    viewOps: out.viewOps,
    filterContribution: out.filterContribution,
    layer,
    entry
  };
}
