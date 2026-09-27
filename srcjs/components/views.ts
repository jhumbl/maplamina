import type { EncodingsState, LayerState } from '../core/layer-state';
import { getControlGroupsByType, wireMap } from '../core/spec';
import type { EmptyList, Motion, Spec, ViewEncodings } from '../core/spec-types';
import { asArray, normText } from '../core/utils';

export type EncodingPatch = ViewEncodings | EmptyList;

export interface ViewOp {
  groupId: string;
  cid: string;
  layerId: string;
  activeView: string;
  encPatch: EncodingPatch | null;
  motion: Motion | null;
}

export interface ViewOps {
  controlledByGroup: Map<string, Set<string>>;
  opsByLayer: Map<string, ViewOp[]>;
  activeByLayer: Map<string, string>;
}

export type EncodingKeys = Record<string, 1>;

export type MergeEncodings = (
  base: EncodingsState | null | undefined,
  patch: EncodingPatch | EncodingsState | null | undefined
) => EncodingsState;

export interface ViewOpContext {
  patch: EncodingPatch | null;
  touch: EncodingKeys | null;
  layerId: string;
  state: LayerState;
}

export interface ApplyViewOpsOptions {
  prevByGroup?: Record<string, string | null | undefined> | null;
  onOp?: ((op: ViewOp, ctx: ViewOpContext) => void) | null;
}

// v3 helpers ---------------------------------------------------------------
// Return a plain object whose keys are the union of keys in a and b (objects), or null if none.
function unionEncodingKeys(a: object | null | undefined, b: object | null | undefined): EncodingKeys | null {
  let out: EncodingKeys | null = null;
  if (a && typeof a === 'object') {
    out = out || {};
    for (const k of Object.keys(a)) out[k] = 1;
  }
  if (b && typeof b === 'object') {
    out = out || {};
    for (const k of Object.keys(b)) out[k] = 1;
  }
  return out;
}

export function collectPrimeViewEncodingKeys(spec: Spec, ops: readonly ViewOp[] | null | undefined): EncodingKeys | null {
  let out: EncodingKeys | null = null;
  if (!Array.isArray(ops) || !ops.length) return out;
  const comps = wireMap(spec && spec['.__components'] && spec['.__components'].views);
  for (const op of ops) {
    try {
      const comp = (op && op.cid) ? comps[op.cid] : null;
      const views = (comp && comp.views && typeof comp.views === 'object') ? wireMap(comp.views) : null;
      if (!views) continue;
      for (const vn of Object.keys(views)) {
        const enc = views[vn] && views[vn].encodings;
        out = unionEncodingKeys(out, enc);
      }
    } catch (_) {}
  }
  return out;
}

export function applyOrderedViewOps(
  spec: Spec,
  st: LayerState,
  layerId: string,
  opsByLayer: Map<string, ViewOp[]> | null | undefined,
  mergeEncodings: MergeEncodings | null | undefined,
  opts?: ApplyViewOpsOptions | null
): { state: LayerState; ops: ViewOp[] } {
  const out: LayerState = Object.assign({}, st || {});
  out.id = out.id || layerId || null;

  const merge: MergeEncodings = (typeof mergeEncodings === 'function')
    ? mergeEncodings
    : ((a, b) => Object.assign({}, a || {}, b || {}) as EncodingsState);

  let enc = merge(out.base_encodings, null);
  const ops = (opsByLayer && typeof opsByLayer.get === 'function') ? (opsByLayer.get(layerId) || []) : [];
  const comps = wireMap(spec && spec['.__components'] && spec['.__components'].views);
  const prevByGroup = (opts && opts.prevByGroup && typeof opts.prevByGroup === 'object') ? opts.prevByGroup : {};
  const onOp = (opts && typeof opts.onOp === 'function') ? opts.onOp : null;

  if (Array.isArray(ops) && ops.length) {
    for (const op of ops) {
      const patch = op && op.encPatch;
      let touch: EncodingKeys | null = null;
      try {
        const comp = (op && op.cid) ? comps[op.cid] : null;
        const views = (comp && comp.views && typeof comp.views === 'object') ? wireMap(comp.views) : null;
        const prevName = (op && op.groupId) ? normText(prevByGroup[op.groupId]) : null;
        const prevEnc = (views && prevName && views[prevName] && views[prevName].encodings) || null;
        const nextEnc = (patch && typeof patch === 'object')
          ? patch
          : (views && op && op.activeView && views[op.activeView] && views[op.activeView].encodings) || null;
        touch = unionEncodingKeys(prevEnc, nextEnc);
      } catch (_) {}

      if (onOp) {
        try { onOp(op, { patch, touch, layerId, state: out }); } catch (_) {}
      }

      if (patch && typeof patch === 'object') {
        enc = merge(enc, patch);
      }
    }
  }

  out.base_encodings = enc;
  return { state: out, ops };
}

// Compute per-layer, per-component view ops from .__controls.views + .__components.views.
// Returns:
//   controlledByGroup: Map<groupId, Set<layerId>>
//   opsByLayer: Map<layerId, Array<op>>
//   activeByLayer: Map<layerId, activeView> (last group wins deterministically)
// Where op = { groupId, cid, layerId, activeView, encPatch, motion }
export function computeViewOpsByLayer(
  spec: Spec,
  activeByGroup: Record<string, string> | null | undefined
): ViewOps {
  const out: ViewOps = { controlledByGroup: new Map(), opsByLayer: new Map(), activeByLayer: new Map() };

  const groups = getControlGroupsByType(spec, 'views');
  if (!groups || !groups.length) return out;

  const comps = wireMap(spec && spec['.__components'] && spec['.__components'].views);
  // Order is authored order: panel sections first (if present), then insertion order in .__controls.
  // (See getControlGroupsByType in core/spec.ts).
  const list = groups;

  for (const g of list) {
    const gid = normText(g.groupId);
    const ctl = g && g.spec;
    if (!gid || !ctl || typeof ctl !== 'object') continue;

    const active = (activeByGroup && activeByGroup[gid]) ? normText(activeByGroup[gid]) : 'base';
    const members = asArray(ctl.members).map(normText).filter(Boolean);

    const controlled = new Set<string>();

    for (const mid of members) {
      const comp = comps && comps[mid];
      const layerId = comp && comp.layer ? normText(comp.layer) : '';
      if (!layerId) continue;

      controlled.add(layerId);

      // Track derived active view per layer (last group wins deterministically by authored group order).
      if (out.activeByLayer.has(layerId)) {
        const prev = out.activeByLayer.get(layerId);
        if (prev && prev !== active) {
          try { console.warn('[maplamina] Layer', layerId, 'is controlled by multiple views groups; last group wins (active:', active, ', prev:', prev, ').'); } catch (_) {}
        }
      }
      out.activeByLayer.set(layerId, active);

      // Keep per-component ops ordered (do not merge patches here).
      const v = comp && comp.views && wireMap(comp.views)[active];
      const enc = v && v.encodings;
      const encPatch = (enc && typeof enc === 'object') ? enc : null;
      const motion = (comp && comp.motion && typeof comp.motion === 'object') ? comp.motion : null;

      const arr = out.opsByLayer.get(layerId) || [];
      arr.push({ groupId: gid, cid: mid, layerId, activeView: active, encPatch, motion });
      out.opsByLayer.set(layerId, arr);
    }

    out.controlledByGroup.set(gid, controlled);
  }

  return out;
}
