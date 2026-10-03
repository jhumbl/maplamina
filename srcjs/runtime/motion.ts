import type { TransitionsMap } from '../core/layer-state';
import type { LayerType } from '../core/spec-types';
import { isArray, isFiniteNumber, normText } from '../core/utils';
import type { WidgetRuntime } from '../core/widget';
import { deckPropsTouchedByEncodingPatch as propsTouchedByPatch } from '../layers/props';
import type { Invalidation, RenderJob } from './scheduler';
import {
  buildTransitionEntry,
  disableTransitionEntry,
  disableTransitionsForProps,
  primeTransitionsForProps
} from './transitions';
import type { MotionInput } from './transitions';

export interface MotionPolicy {
  reason: string | null;
  allowTransitions: boolean;
  motionEligible: boolean;
  invalidation?: Invalidation | null;
}

// By deck.gl prop name, the token of the transition armed last.
export type TransitionTokens = Record<string, number>;

type LayerIds = readonly string[] | string | null | undefined;

// A job as the scheduler builds it, or the reason alone.
type JobLike = Partial<Pick<RenderJob, 'reason' | 'motionPolicy' | 'invalidation' | 'allowMotionViews'>>;

function deckPropsTouchedByEncodingPatch(
  layerType: LayerType | null | undefined,
  encPatch: object | null | undefined
): string[] {
  return propsTouchedByPatch(layerType, encPatch) || [];
}

function normalizeReason(reason: unknown): string | null {
  return normText(reason) || null;
}

function deriveMotionPolicy(job: JobLike | null | undefined): MotionPolicy {
  const j: JobLike = (job && typeof job === 'object') ? job : {};
  const reason = normalizeReason(j.reason || (j.motionPolicy && j.motionPolicy.reason));
  const invalidation = (j.invalidation && typeof j.invalidation === 'object') ? j.invalidation : null;
  const allowTransitions = !!(
    (j.motionPolicy && j.motionPolicy.allowTransitions) ||
    j.allowMotionViews ||
    (invalidation && invalidation.motionEligible) ||
    reason === 'views'
  );
  const policy = {
    reason,
    allowTransitions,
    motionEligible: allowTransitions,
    invalidation
  };
  return policy;
}

export function transitionsForBuild(rt: WidgetRuntime | null | undefined, layerId: unknown): TransitionsMap | null {
  const lid = normText(layerId);
  if (!lid) return null;
  const t = (rt && rt._layerTransitions && typeof rt._layerTransitions.get === 'function')
    ? rt._layerTransitions.get(lid)
    : null;
  const transitionKeys = (t && typeof t === 'object') ? Object.keys(t) : [];
  return transitionKeys.length ? t! : null;
}

export function syncJobTransitions(
  rt: WidgetRuntime | null | undefined,
  layerIds: LayerIds,
  jobOrPolicy: JobLike | MotionPolicy | null | undefined
): MotionPolicy {
  const policy = (jobOrPolicy && typeof jobOrPolicy === 'object' && Object.prototype.hasOwnProperty.call(jobOrPolicy, 'allowTransitions'))
    ? jobOrPolicy as MotionPolicy
    : deriveMotionPolicy(jobOrPolicy as JobLike | null | undefined);
  if (!policy.allowTransitions) disableRuntimeTransitions(rt, layerIds);
  return policy;
}

function ensureLayerTransitions(rt: WidgetRuntime | null | undefined, layerId: unknown): TransitionsMap | null {
  if (!rt) return null;
  if (!rt._layerTransitions || typeof rt._layerTransitions.get !== 'function') rt._layerTransitions = new Map();
  const lid = normText(layerId);
  if (!lid) return null;
  let t = rt._layerTransitions.get(lid);
  if (!t || typeof t !== 'object') {
    t = {};
    rt._layerTransitions.set(lid, t);
  }
  return t;
}

function ensureTransitionTokens(rt: WidgetRuntime | null | undefined, layerId: unknown): TransitionTokens | null {
  if (!rt) return null;
  if (!rt._transitionTokens || typeof rt._transitionTokens.get !== 'function') rt._transitionTokens = new Map();
  const lid = normText(layerId);
  if (!lid) return null;
  let tok = rt._transitionTokens.get(lid);
  if (!tok || typeof tok !== 'object') {
    tok = {};
    rt._transitionTokens.set(lid, tok);
  }
  return tok;
}

function nextTransitionToken(rt: WidgetRuntime | null | undefined): number {
  if (!rt) return 0;
  if (!isFiniteNumber(rt._transitionTokenSeq)) rt._transitionTokenSeq = 0;
  rt._transitionTokenSeq += 1;
  return rt._transitionTokenSeq;
}

function clearRuntimeTransition(rt: WidgetRuntime, layerId: unknown, prop: string, token: number): void {
  const lid = normText(layerId);
  const p = String(prop || '');
  if (!lid || !p) return;

  const tok = (rt._transitionTokens && rt._transitionTokens.get) ? rt._transitionTokens.get(lid) : null;
  if (!tok || tok[p] !== token) return;

  delete tok[p];
  if (!Object.keys(tok).length) {
    rt._transitionTokens!.delete(lid);
  }

  const t = (rt._layerTransitions && rt._layerTransitions.get) ? rt._layerTransitions.get(lid) : null;
  if (!t || !Object.prototype.hasOwnProperty.call(t, p)) return;

  const prev = t[p];
  const prevDur =
    (prev && typeof prev === 'object' && Number.isFinite(+prev.duration!)) ? +prev.duration!
    : (isFiniteNumber(prev) ? +prev : 0);
  const prevHadCb = !!(prev && typeof prev === 'object' && (typeof prev.onEnd === 'function' || typeof prev.onInterrupt === 'function'));
  const alreadyDisabled = (prevDur <= 0) && !prevHadCb;

  if (!alreadyDisabled) {
    t[p] = disableTransitionEntry(prev);
  }
}

export function disableRuntimeTransitions(rt: WidgetRuntime | null | undefined, layerIds: LayerIds): void {
  if (!rt) return;
  const ids = isArray(layerIds) ? layerIds : (layerIds ? [layerIds] : []);
  for (const raw of ids) {
    const lid = normText(raw);
    if (!lid) continue;
    const t = (rt._layerTransitions && rt._layerTransitions.get) ? rt._layerTransitions.get(lid) : null;
    if (!t || typeof t !== 'object') continue;

    rt._transitionTokens && rt._transitionTokens.delete && rt._transitionTokens.delete(lid);

    disableTransitionsForProps(t);
  }
}

export function primeRuntimeTransitions(
  rt: WidgetRuntime | null | undefined,
  layerId: unknown,
  layerType: LayerType | null | undefined,
  encTouch: object | null | undefined
): void {
  const touched = deckPropsTouchedByEncodingPatch(layerType, encTouch);
  if (!touched.length) return;

  const t = ensureLayerTransitions(rt, layerId);
  if (!t) return;

  primeTransitionsForProps(t, touched, null);
}

export function injectMotionTransitions(
  rt: WidgetRuntime,
  layerId: unknown,
  layerType: LayerType | null | undefined,
  encPatch: object | null | undefined,
  motion: MotionInput | null | undefined
): void {
  const touched = deckPropsTouchedByEncodingPatch(layerType, encPatch);
  if (!touched.length) {
    return;
  }

  const m: MotionInput = (motion && typeof motion === 'object') ? motion : {};
  const duration = Number.isFinite(+m.duration!) ? +m.duration! : 750;
  if (duration <= 0) {
    return;
  }

  const easingKey = (m.easing != null) ? m.easing : 'smoothstep';

  const t = ensureLayerTransitions(rt, layerId);
  const tok = ensureTransitionTokens(rt, layerId);
  if (!t || !tok) return;

  for (const p of touched) {
    const token = nextTransitionToken(rt);
    tok[p] = token;

    const onEnd = (): void => clearRuntimeTransition(rt, layerId, p, token);
    const onInterrupt = (): void => clearRuntimeTransition(rt, layerId, p, token);

    t[p] = buildTransitionEntry({ duration, easing: easingKey }, { onEnd, onInterrupt });
  }
}

export function attach(rt: WidgetRuntime | null | undefined): WidgetRuntime | null | undefined {
  if (!rt || typeof rt !== 'object') return rt;
  if (!rt._layerTransitions || typeof rt._layerTransitions.get !== 'function') rt._layerTransitions = new Map();
  if (!rt._transitionTokens || typeof rt._transitionTokens.get !== 'function') rt._transitionTokens = new Map();
  if (!isFiniteNumber(rt._transitionTokenSeq)) rt._transitionTokenSeq = 0;
  return rt;
}
