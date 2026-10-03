import { applyOrderedViewOps, computeViewOpsByLayer } from '../../srcjs/components/views';
import { resolveActiveOnly } from '../../srcjs/core/data';
import type { LayerState } from '../../srcjs/core/layer-state';
import { getControlGroupsByType, normalizeSpec } from '../../srcjs/core/spec';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
import { mergeEncodings } from '../../srcjs/layers/utils';

// A fresh copy of a sample as the runtime holds it after normalizeSpec().
export function normalise(wire: WireSpec): Spec {
  const x = structuredClone(wire);
  normalizeSpec(x);
  return x as Spec;
}

// A fresh copy of one layer of a sample, not yet hydrated.
export function layerState(wire: WireSpec, id: string): LayerState {
  const layers = normalise(wire)['.__layers'] as Record<string, unknown>;
  if (!layers[id]) throw new Error(`sample has no layer '${id}'`);
  return layers[id] as LayerState;
}

// One layer of a sample, hydrated, with a view of the sample's first views group applied
// the way a render applies it.
export async function hydratedLayer(wire: WireSpec, id: string, view?: string): Promise<LayerState> {
  const spec = normalise(wire);
  let st = (spec['.__layers'] as Record<string, unknown>)[id] as LayerState;
  if (!st) throw new Error(`sample has no layer '${id}'`);
  if (view) {
    const groups = getControlGroupsByType(spec, 'views');
    if (!groups.length) throw new Error('sample has no views group');
    const ops = computeViewOpsByLayer(spec, { [groups[0].groupId]: view });
    st = applyOrderedViewOps(spec, st, id, ops.opsByLayer, mergeEncodings).state;
  }
  await resolveActiveOnly(st);
  return st;
}
