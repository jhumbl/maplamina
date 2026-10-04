import type { Spec } from '../core/spec-types';
import { isArray, normText } from '../core/utils';
import type { WidgetRuntime } from '../core/widget';
import type { MotionPolicy } from './motion';

// Layer ids, one id, or true for every layer the runtime holds.
type LayerIds = readonly string[] | string | true | null;

export interface ScheduleOptions {
  layers?: LayerIds;
  rehydrate?: LayerIds;
  legends?: boolean;
  controls?: boolean;
  tooltip?: boolean;
  reason?: string | null;
}

// What a flush has to do, derived from the reasons it was scheduled with.
interface FlushInvalidation {
  reasons: string[];
  render: boolean;
  encodings: boolean;
  filters: boolean;
  visibility: boolean;
  layers: boolean;
  rehydrate: boolean;
  controls: boolean;
  legends: boolean;
  tooltip: boolean;
  manual: boolean;
  motionEligible: boolean;
}

// What the first render records on a layer entry.
interface InitialInvalidation {
  initial: true;
  render: true;
  encodings: true;
  motionEligible: false;
}

export type Invalidation = FlushInvalidation | InitialInvalidation;

// One flush of the scheduler: what was asked for since the last one.
export interface RenderJob {
  layers: string[];
  rehydrate: string[];
  legends: boolean;
  controls: boolean;
  tooltip: boolean;
  epoch: number;
  renderEpoch: number;
  specRef: Spec | null;
  allowMotionViews: boolean;
  reason: string | null;
  reasons: string[];
  invalidation: FlushInvalidation;
  motionPolicy: MotionPolicy;
}

interface PendingFlush {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: unknown) => void;
}

export interface SchedulerState {
  layers: Set<string>;
  rehydrate: Set<string>;
  reasons: Set<string>;
  legends: boolean;
  controls: boolean;
  tooltip: boolean;
  allowMotionViews: boolean;
  raf: number | null;
  chain: Promise<void>;
  next: PendingFlush | null;
  epoch: number;
  __mfAttached?: boolean;
  __mfScheduleInstalled?: boolean;
}

function ensureSched(rt: WidgetRuntime): SchedulerState {
  const s0 = rt._sched;
  const s = ((s0 && typeof s0 === 'object') ? s0 : {}) as SchedulerState;
  if (!(s.layers instanceof Set)) s.layers = new Set();
  if (!(s.rehydrate instanceof Set)) s.rehydrate = new Set();
  if (!(s.reasons instanceof Set)) s.reasons = new Set();
  s.legends = !!s.legends;
  s.controls = !!s.controls;
  s.tooltip = !!s.tooltip;
  s.allowMotionViews = !!s.allowMotionViews;
  s.raf = s.raf || null;
  s.chain = s.chain || Promise.resolve();
  s.next = s.next || null;
  s.epoch = Number.isFinite(+s.epoch) ? +s.epoch : 0;
  s.__mfAttached = true;
  rt._sched = s;
  return s;
}

// normText trims only, so scheduler keys match the ids used across the runtime.
function normalizeReason(reason: unknown): string | null {
  return normText(reason) || null;
}

function pickPrimaryReason(reasons: readonly string[], fallback: unknown): string | null {
  const set = isArray(reasons) ? reasons.filter(Boolean) : [];
  if (set.includes('views')) return 'views';
  if (set.includes('filters')) return 'filters';
  if (set.includes('filters-clear')) return 'filters-clear';
  if (set.includes('rebuild')) return 'rebuild';
  return normalizeReason(fallback) || (set.length ? set[set.length - 1] : null);
}

// What a flush was asked for, before the invalidation and the policy are derived from it.
type Asked = Pick<RenderJob, 'layers' | 'rehydrate' | 'legends' | 'controls' | 'tooltip' | 'allowMotionViews'>;

function deriveInvalidation(job: Asked, reasons: readonly string[]): FlushInvalidation {
  const list = isArray(reasons) ? reasons.filter(Boolean) : [];
  const has = (x: string): boolean => list.includes(x);
  const rehydrate = !!(job && Array.isArray(job.rehydrate) && job.rehydrate.length);
  const layers = !!(job && Array.isArray(job.layers) && job.layers.length);
  const filters = has('filters') || has('filters-clear');
  const views = has('views');
  const encodings = views || rehydrate;
  const manual = has('rebuild');
  const controls = !!(job && job.controls);
  const legends = !!(job && job.legends);
  const tooltip = !!(job && job.tooltip);
  const visibility = filters || layers;
  const render = encodings || visibility || manual;
  const motionEligible = !!(job && job.allowMotionViews && encodings && !filters && !layers && !manual);

  return {
    reasons: list,
    render,
    encodings,
    filters,
    visibility,
    layers,
    rehydrate,
    controls,
    legends,
    tooltip,
    manual,
    motionEligible
  };
}

function schedAdd(set: Set<string>, ids: LayerIds | undefined, rt: WidgetRuntime): void {
  if (!set || ids == null) return;

  // ids === true => all known runtime layer ids
  if (ids === true) {
    for (const k of rt.layers.keys()) set.add(k);
    return;
  }

  const arr = isArray(ids) ? ids : [ids];
  for (const v of arr) {
    const lid = normText(v);
    if (lid) set.add(lid);
  }
}

// Attach the scheduler to a runtime instance (idempotent). The pipeline installs
// rt._flushSnapshot(job), which each flush calls.
export function attach(rt: WidgetRuntime | null | undefined): void {
  if (!rt || typeof rt !== 'object') return;
  const s = ensureSched(rt);

  // Avoid re-wrapping schedule on hot reload; still keep _sched normalized.
  if (typeof rt.schedule === 'function' && s.__mfScheduleInstalled) return;

  rt.schedule = function (opts) {
    const s = ensureSched(this);
    const o: ScheduleOptions = (opts && typeof opts === 'object') ? opts : {};

    schedAdd(s.layers, o.layers, this);
    schedAdd(s.rehydrate, o.rehydrate, this);

    if (o.legends) s.legends = true;
    if (o.controls) s.controls = true;
    if (o.tooltip) s.tooltip = true;

    const reason = normalizeReason(o.reason);
    if (reason) s.reasons.add(reason);
    if (reason === 'views') s.allowMotionViews = true;

    if (!s.next) {
      s.next = {} as PendingFlush;
      s.next.promise = new Promise((resolve, reject) => { s.next!.resolve = resolve; s.next!.reject = reject; });
    }

    if (s.raf) return s.next.promise;

    s.raf = requestAnimationFrame(() => {
      s.raf = null;

      const reasons = Array.from(s.reasons);
      const asked: Asked = {
        layers: Array.from(s.layers),
        rehydrate: Array.from(s.rehydrate),
        legends: s.legends,
        controls: s.controls,
        tooltip: s.tooltip,
        allowMotionViews: !!s.allowMotionViews
      };
      const reason = pickPrimaryReason(reasons, o.reason);
      const invalidation = deriveInvalidation(asked, reasons);
      const job: RenderJob = {
        ...asked,
        epoch: ++s.epoch,
        renderEpoch: this._renderEpoch,
        specRef: this.specRef,
        reason,
        reasons,
        invalidation,
        motionPolicy: {
          reason,
          allowTransitions: invalidation.motionEligible,
          motionEligible: invalidation.motionEligible
        }
      };

      s.layers.clear();
      s.rehydrate.clear();
      s.reasons.clear();
      s.legends = false;
      s.controls = false;
      s.tooltip = false;
      s.allowMotionViews = false;

      const done = s.next;
      s.next = null;

      s.chain = s.chain
        .then(() => {
          if (typeof this._flushSnapshot === 'function') return this._flushSnapshot(job);
        })
        .then(() => { if (done && done.resolve) done.resolve(); })
        .catch((e) => { if (done && done.reject) done.reject(e); console.error(e); });
    });

    return ensureSched(this).next!.promise;
  };

  s.__mfScheduleInstalled = true;
}
