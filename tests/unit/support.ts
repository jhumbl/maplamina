import type { LayerState } from '../../srcjs/core/layer-state';
import { normalizeSpec } from '../../srcjs/core/spec';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';

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
