import { COORDINATE_SYSTEM } from '@deck.gl/core';
import type { LayerProps } from '@deck.gl/core';
import { DataFilterExtension } from '@deck.gl/extensions';
import type { DataFilterExtensionOptions, DataFilterExtensionProps } from '@deck.gl/extensions';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildGetTemplate, buildOnClickPopup, prime, register } from '../components/tooltips';
import type { WidgetPickingInfo } from '../components/tooltips';
import type {
  ColorEncodingState,
  LayerState,
  RefNode,
  TransitionsMap,
  TypedArray
} from '../core/layer-state';
import type { LayerType } from '../core/spec-types';
import { isFiniteNumber, normText, stablePairTA } from '../core/utils';
import type { GpuMeta } from '../filters/runtime';
import { readRenderField } from '../runtime/assembly';
import type { BuildContext } from './utils';

// deck.gl's types take luma.gl's parameter names; the builders pass WebGL's depthTest.
export type LayerParameters = LayerProps['parameters'];

type UpdateTriggers = Record<string, unknown>;

interface SubLayerPatch {
  updateTriggers?: UpdateTriggers;
  transitions?: TransitionsMap;
}

// What composeLayerProps() sets on top of the props a builder supplies.
export type ComposedProps = LayerProps & DataFilterExtensionProps & {
  updateTriggers: UpdateTriggers;
  subLayerProps?: Record<string, SubLayerPatch>;
};

// An encoding as the update triggers read it, numeric or colour.
interface EncodingSource {
  value?: unknown;
  value_array?: TypedArray | null;
  encoding?: 'dict';
  codes?: RefNode;
  dict?: RefNode;
  codes_array?: TypedArray | null;
  dict_array?: TypedArray | null;
}

type GpuCheck = { ok: true } | { ok: false; reason: string };

export function gpuMeta(st: LayerState | null | undefined): GpuMeta {
  const m = readRenderField(st, 'gpuMeta');
  if (!m || typeof m !== 'object') return { rangeDims: 0, categoryDims: 0 };
  const categoryDims = Math.min(4, Math.max(0, m.categoryDims | 0));
  const rangeDims = Math.min(4, Math.max(0, m.rangeDims | 0));
  return { rangeDims, categoryDims };
}

function validateGPUProps(st: LayerState, meta?: GpuMeta | null): GpuCheck {
  const gpu = readRenderField(st, 'gpuFiltering');
  if (!gpu) return { ok: true };

  const m = meta || gpuMeta(st);
  const cat = (m && m.categoryDims) | 0;
  const rng = (m && m.rangeDims) | 0;

  if (cat > 0) {
    if (typeof gpu.getFilterCategory !== 'function') return { ok: false, reason: 'getFilterCategory missing' };
    if (!gpu.filterCategories) return { ok: false, reason: 'filterCategories missing' };
  }
  if (rng > 0) {
    if (typeof gpu.getFilterValue !== 'function') return { ok: false, reason: 'getFilterValue missing' };
    if (gpu.filterRange == null) return { ok: false, reason: 'filterRange missing' };
  }
  return { ok: true };
}

function attachGPUFiltering<P extends ComposedProps>(layerProps: P, st: LayerState): P {
  const meta = gpuMeta(st);
  const gpu = readRenderField(st, 'gpuFiltering');
  if (!gpu) return layerProps;

  const categoryDims = Math.min(4, Math.max(0, meta.categoryDims | 0));
  const rangeDims = Math.min(4, Math.max(0, meta.rangeDims | 0));
  if (categoryDims === 0 && rangeDims === 0) return layerProps;

  const valid = validateGPUProps(st, meta);
  if (!valid.ok) {
    console.warn('[maplamina][gpu] disabling filtering for layer', st && st.id, 'reason:', valid.reason);
    return layerProps;
  }

  const extOpts: DataFilterExtensionOptions = {};
  if (categoryDims > 0) extOpts.categorySize = categoryDims as DataFilterExtensionOptions['categorySize'];
  if (rangeDims > 0) extOpts.filterSize = rangeDims as DataFilterExtensionOptions['filterSize'];

  const existing = Array.isArray(layerProps.extensions) ? layerProps.extensions.slice() : [];
  const hasDFE = existing.some(e => {
    if (!e) return false;
    return e instanceof DataFilterExtension;
    return !!(e && e.constructor && e.constructor.name === 'DataFilterExtension');
  });
  if (!hasDFE) existing.push(new DataFilterExtension(extOpts));
  layerProps.extensions = existing;
  layerProps.filterEnabled = true;

  if (categoryDims > 0) {
    layerProps.getFilterCategory = gpu.getFilterCategory;
    layerProps.filterCategories = Array.isArray(gpu.filterCategories)
      ? gpu.filterCategories.slice()
      : gpu.filterCategories;
  }

  if (rangeDims > 0) {
    layerProps.getFilterValue = gpu.getFilterValue;
    const r = gpu.filterRange;
    layerProps.filterRange = ((Array.isArray(r) && Array.isArray(r[0]))
      ? (r as [number, number][]).map(x => x.slice())
      : (Array.isArray(r) ? r.slice() : r)) as typeof r;
  }

  const ut0 = (layerProps.updateTriggers && typeof layerProps.updateTriggers === 'object')
    ? layerProps.updateTriggers
    : {};
  const ut = Object.assign({}, ut0);
  if (categoryDims > 0) ut.getFilterCategory = { cats: layerProps.filterCategories, disabled: gpu.__catDisabledKey };
  if (rangeDims > 0) ut.getFilterValue = layerProps.filterRange;
  layerProps.updateTriggers = ut;

  return layerProps;
}

function buildUpdateTriggersFromEncodings(st: LayerState): UpdateTriggers {
  const base = st.base_encodings || {};
  const t: UpdateTriggers = {};

  function encTrig(enc: EncodingSource | undefined): unknown {
    if (!enc) return undefined;
    if (enc.value_array && ArrayBuffer.isView(enc.value_array)) return enc.value_array;
    if (enc.value && ArrayBuffer.isView(enc.value)) return enc.value;
    if (enc.encoding === 'dict') {
      const codes = enc.codes_array || enc.codes;
      const dict = enc.dict_array || enc.dict;
      return (codes && dict) ? stablePairTA(codes, dict) : undefined;
    }
    if (enc.value != null) return enc.value;
    return undefined;
  }

  const opacityIsTA = !!(base.opacity && (ArrayBuffer.isView(base.opacity.value_array) || ArrayBuffer.isView(base.opacity.value)));
  const opacityTrig = opacityIsTA ? encTrig(base.opacity) : undefined;

  // A colour trigger is an array or a pair, and the opacity trigger a typed array.
  function colorTrigWithOpacity(fcEnc: ColorEncodingState | undefined): unknown {
    const fc = encTrig(fcEnc);
    if (!fc) return opacityTrig || undefined;
    if (!opacityTrig) return fc;
    return stablePairTA(fc as object, opacityTrig as object);
  }

  if (st.type === 'circle') {
    t.getRadius = encTrig(base.radius);
    t.getFillColor = colorTrigWithOpacity(base.fillColor);
    t.getLineColor = encTrig(base.lineColor);
    t.getLineWidth = encTrig(base.lineWidth);
  } else if (st.type === 'line') {
    t.getColor = encTrig(base.lineColor || base.fillColor);
    t.getWidth = encTrig(base.lineWidth);
  } else if (st.type === 'polygon') {
    t.getFillColor = colorTrigWithOpacity(base.fillColor);
    t.getLineColor = encTrig(base.lineColor);
    t.getLineWidth = encTrig(base.lineWidth);
  } else if (st.type === 'icon') {
    t.getColor = colorTrigWithOpacity(base.fillColor);
    t.getSize = encTrig(base.size);
  } else if (st.type === 'marker') {
    t.getColor = colorTrigWithOpacity(base.fillColor);
    t.getSize = encTrig(base.size);
    t.getLineColor = encTrig(base.lineColor);
    t.getLineWidth = encTrig(base.lineWidth);
  }

  return t;
}

// encPatch is read for its keys only: an encoding patch, or the keys a view switch touches.
export function deckPropsTouchedByEncodingPatch(
  layerType: LayerType | null | undefined,
  encPatch: object | null | undefined
): string[] {
  if (!encPatch || typeof encPatch !== 'object') return [];
  const keys = Object.keys(encPatch);
  const out = new Set<string>();

  const t = normText(layerType);

  function has(k: string): boolean { return keys.includes(k); }

  if (t === 'circle') {
    if (has('radius')) out.add('getRadius');
    if (has('fillColor') || has('opacity')) out.add('getFillColor');
    if (has('lineColor')) out.add('getLineColor');
    if (has('lineWidth')) out.add('getLineWidth');
  } else if (t === 'line') {
    if (has('lineColor') || has('fillColor') || has('opacity')) out.add('getColor');
    if (has('lineWidth')) out.add('getWidth');
  } else if (t === 'polygon') {
    if (has('fillColor') || has('opacity')) out.add('getFillColor');
    if (has('lineColor')) out.add('getLineColor');
    if (has('lineWidth')) out.add('getLineWidth');
  } else if (t === 'icon') {
    if (has('size')) out.add('getSize');
    if (has('fillColor') || has('opacity')) out.add('getColor');
  } else if (t === 'marker') {
    if (has('size')) out.add('getSize');
    if (has('fillColor') || has('opacity')) out.add('getColor');
    if (has('lineColor')) out.add('getLineColor');
    if (has('lineWidth')) out.add('getLineWidth');
  }

  return Array.from(out);
}

function ensurePolygonSubLayerProps(st: LayerState, props: ComposedProps): void {
  if (!st || st.type !== 'polygon') return;

  const slp = props.subLayerProps || (props.subLayerProps = {});
  const fill = slp['polygon-fill'] || (slp['polygon-fill'] = {});
  const stroke = slp['polygon-stroke'] || (slp['polygon-stroke'] = {});

  const ut = props.updateTriggers || {};
  const tr = props.transitions || {};

  fill.updateTriggers = Object.assign({}, fill.updateTriggers || {}, {
    ...(ut.getFillColor ? { getFillColor: ut.getFillColor } : null)
  });
  if (tr.getFillColor) {
    fill.transitions = Object.assign({}, fill.transitions || {}, {
      getFillColor: tr.getFillColor
    });
  }

  stroke.updateTriggers = Object.assign({}, stroke.updateTriggers || {}, {
    ...(ut.getLineColor ? { getColor: ut.getLineColor } : null),
    ...(ut.getLineWidth ? { getWidth: ut.getLineWidth } : null)
  });
  if (tr.getLineColor || tr.getLineWidth) {
    stroke.transitions = Object.assign({}, stroke.transitions || {}, {
      ...(tr.getLineColor ? { getColor: tr.getLineColor } : null),
      ...(tr.getLineWidth ? { getWidth: tr.getLineWidth } : null)
    });
  }
}

// deck normalises the viewport longitude into [-180, 180); an offsets origin near the
// dateline is moved to the world copy nearest the viewport so its deltas stay in view.
export function originNearView(
  origin: readonly number[],
  map: MapLibreMap | null | undefined
): readonly number[] {
  const lng = map && typeof map.getCenter === 'function' ? map.getCenter().lng : 0;
  const view = ((lng + 540) % 360) - 180;
  const lon = origin[0] + 360 * Math.round((view - origin[0]) / 360);
  return lon === origin[0] ? origin : [lon, origin[1]];
}

export function composeLayerProps<P extends object>(
  st: LayerState,
  baseProps: P | null | undefined,
  ctx: BuildContext
): P & ComposedProps {
  const origin = st.coordinate_origin;
  const useOffsets = Array.isArray(origin) && origin.length === 2;
  const coreUpdateTriggers = buildUpdateTriggersFromEncodings(st);

  // deck.gl's types ask for a string id and a three-number origin; it is given the layer's
  // id and a two-number origin.
  const props = Object.assign({
    id: st.id,
    coordinateSystem: useOffsets ? COORDINATE_SYSTEM.LNGLAT_OFFSETS : COORDINATE_SYSTEM.LNGLAT,
    ...(useOffsets ? { coordinateOrigin: originNearView(origin, ctx && ctx.map) } : null),
    pickable: st.cfg?.pickable !== false,
    parameters: { depthTest: true }
  }, baseProps || {}) as unknown as P & ComposedProps;

  props.updateTriggers = Object.assign({}, coreUpdateTriggers, props.updateTriggers || {});

  const runtimeTransitions = readRenderField(st, 'transitions');
  if (runtimeTransitions && typeof runtimeTransitions === 'object') {
    const warmed: TransitionsMap = {};
    for (const k of Object.keys(runtimeTransitions)) {
      const entry = runtimeTransitions[k];
      const dur = (entry && typeof entry === 'object' && isFiniteNumber(entry.duration))
        ? entry.duration
        : (isFiniteNumber(entry) ? entry : -1);
      if (dur > 0) {
        warmed[k] = entry;
      } else if (dur === 0) {
        warmed[k] = { duration: 1 };
      }
    }
    if (Object.keys(warmed).length) {
      props.transitions = Object.assign({}, props.transitions || {}, warmed);
    }
  }

  ensurePolygonSubLayerProps(st, props);

  try {
    prime(st);
    const tt = buildGetTemplate(st, 'tooltip');
    if (tt) {
      register(ctx?.el, st.id!, tt);
    }
    const oc = buildOnClickPopup(st);
    if (oc) {
      props.onClick = function(info: WidgetPickingInfo) {
        if (info && !info.__mfContainer && ctx && ctx.el) info.__mfContainer = ctx.el;
        return oc(info);
      };
    }
  } catch (e) { console.error(e); }

  attachGPUFiltering(props, st);
  if (readRenderField(st, 'forceHidden')) props.visible = false;

  return props;
}
