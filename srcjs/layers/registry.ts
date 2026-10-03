import type { Layer } from '@deck.gl/core';
import type { LayerState } from '../core/layer-state';
import { buildScatterplotLayer } from './circle';
import { buildIconLayer } from './icon';
import { buildPathLayer } from './line';
import { buildMarkerLayer } from './marker';
import { buildPolygonLayer } from './polygon';
import type { BuildContext } from './utils';

export type LayerBuilder = (st: LayerState, ctx: BuildContext) => Layer | Layer[] | null;

export interface LayerRegistry extends Map<string, LayerBuilder> {
  register(type: string, builderFn: LayerBuilder): void;
}

const registry = new Map<string, LayerBuilder>();

function registerLayer(type: string, builderFn: LayerBuilder): void {
  if (!type || typeof builderFn !== 'function') return;
  registry.set(type, builderFn);
}

// Register built-ins (builder signature: (st, ctx?) => Layer|Layer[] )
registerLayer('circle',  (st, ctx) => buildScatterplotLayer(st, ctx));
registerLayer('line',    (st, ctx) => buildPathLayer(st, ctx));
registerLayer('polygon', (st, ctx) => buildPolygonLayer(st, ctx));
registerLayer('icon',    (st, ctx) => buildIconLayer(st, ctx));
registerLayer('marker',  (st, ctx) => buildMarkerLayer(st, ctx));

export const layers: LayerRegistry = Object.assign(registry, { register: registerLayer });
