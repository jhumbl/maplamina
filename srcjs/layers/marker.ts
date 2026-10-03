import { IconLayer } from '@deck.gl/layers';
import type { IconLayerProps } from '@deck.gl/layers';
import { resolveIcon } from '../components/icons';
import type { AccessorInfo } from '../core/data';
import { colorAccessorFrom, numericAccessorFrom } from '../core/encodings';
import type { LayerState, RgbaTuple } from '../core/layer-state';
import { assertTA, isFiniteNumber } from '../core/utils';
import type { PointData } from './circle';
import { composeLayerProps } from './props';
import type { LayerParameters } from './props';
import { getLayerBuildCache } from './utils';
import type { BuildContext } from './utils';

interface MarkerBucket {
  sharedData?: PointData;
}

export function buildMarkerLayer(st: LayerState, ctx: BuildContext): IconLayer | IconLayer[] {
  const cols = st.data_columns || {};
  // Require packed binary positions (same guard as buildIconLayer)
  if (!cols.position || !assertTA(st, cols.position.array, 'position.array', 'skip')) {
    return new IconLayer(composeLayerProps(st, { data: { length: 0 } }, ctx));
  }

  const posSize = cols.position.size || 2;     // [lon,lat] or [lon,lat,z]
  const posArr  = cols.position.array;         // Float32Array
  const n       = Math.floor(posArr.length / posSize);

  // ---- helpers ------------------------------------------------------------
  const resolveIconFromKey = (stLike: LayerState, key: string) => {
    const s = Object.assign({}, stLike, { cfg: Object.assign({}, stLike.cfg, { icon: key }) });
    return resolveIcon(s);
  };

  // Default keys from cfg (R: cfg_extra$icon / cfg_extra$iconStroke)
  const keyFill   = st.cfg?.icon       || 'geo_alt_fill';
  const keyStroke = st.cfg?.iconStroke || 'geo_alt';
  const iconFill   = resolveIconFromKey(st, keyFill);
  const iconStroke = resolveIconFromKey(st, keyStroke);

  // Stable icon descriptors (avoid per-feature object allocations in getIcon)
  const iconFillObj = {
    url: iconFill.url,
    width: iconFill.width, height: iconFill.height,
    anchorX: iconFill.anchorX, anchorY: iconFill.anchorY,
    mask: iconFill.mask
  };
  const iconStrokeObj = {
    url: iconStroke.url,
    width: iconStroke.width, height: iconStroke.height,
    anchorX: iconStroke.anchorX, anchorY: iconStroke.anchorY,
    mask: iconStroke.mask
  };

  // ---- stable shared binary geometry identity (cached) --------------------
  const bucket = getLayerBuildCache<MarkerBucket>(ctx, st, 'marker');
  let sharedData = bucket.sharedData;
  if (!sharedData || sharedData.length !== n) {
    sharedData = { length: n, attributes: { getPosition: { value: posArr, size: posSize } } };
    bucket.sharedData = sharedData;
  } else {
    sharedData.length = n;
    const attrs = sharedData.attributes || (sharedData.attributes = {});
    const gp = attrs.getPosition || (attrs.getPosition = {});
    gp.value = posArr;
    gp.size  = posSize;
  }

  // ---- accessors ----------------------------------------------------------
  const getColorBase = colorAccessorFrom(st, 'fillColor', [33,150,243,255]);
  const getSizeBase = numericAccessorFrom(st, 'size', 18);

  // Configurable factors
  const strokeDarken = isFiniteNumber(st.cfg?.strokeDarken) ? st.cfg.strokeDarken : 0.6;
  const fillScale    = isFiniteNumber(st.cfg?.fillScale)    ? st.cfg.fillScale    : 0.91;

  const clamp255 = (x: number) => Math.max(0, Math.min(255, x | 0));

  // Avoid per-feature allocations for stroke colors by writing into a reusable scratch array.
  const _scratchStroke: RgbaTuple = [0, 0, 0, 255];
  const darkenRGBAInto = (rgba: RgbaTuple, k: number, out: RgbaTuple) => {
    if (!rgba || typeof rgba !== 'object') return rgba;
    const r0 = rgba[0] ?? 0;
    const g0 = rgba[1] ?? 0;
    const b0 = rgba[2] ?? 0;
    const a0 = (rgba[3] == null ? 255 : rgba[3]);
    out[0] = clamp255(Math.round(r0 * k));
    out[1] = clamp255(Math.round(g0 * k));
    out[2] = clamp255(Math.round(b0 * k));
    out[3] = clamp255(a0);
    return out;
  };

  const getColorStroke = (d: unknown, info?: AccessorInfo | null) => darkenRGBAInto(getColorBase(d, info), strokeDarken, _scratchStroke);
  const getColorFill   = getColorBase;

  const getSizeStroke  = getSizeBase;
  const getSizeFill    = (d: unknown, info?: AccessorInfo | null) => fillScale * getSizeBase(d, info);

  // Common props for both sublayers
  const sharedProps: Partial<IconLayerProps> = {
    data: sharedData,
    dataComparator: (a, b) => a === b,

    sizeUnits: (!Array.isArray(st.cfg?.sizeUnits) && st.cfg?.sizeUnits !== null) ? st.cfg!.sizeUnits : "pixels",
    parameters: { depthTest: false } as LayerParameters,
    loadOptions: { image: { type: 'imagebitmap' } },
    alphaCutoff: 0
  };

  // ---- STROKE (under) -----------------------------------------------------
  const stStroke: LayerState = Object.assign({}, st, {
    id: st.id ? `${st.id}-stroke` : undefined,
    // Make this truly non-interactive: drive via cfg because composeLayerProps reads st.cfg.pickable
    cfg: Object.assign({}, st.cfg, { pickable: false }),
    tooltip: null,
    popup: null
  });

  const basePropsStroke: Partial<IconLayerProps> = Object.assign({}, sharedProps, {
    getIcon: () => iconStrokeObj,
    getColor: getColorStroke,
    getSize:  getSizeStroke,
    sizeMinPixels: isFiniteNumber(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels : 0,
    sizeMaxPixels: isFiniteNumber(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels : 80
  });

  const propsStroke = composeLayerProps(stStroke, basePropsStroke, ctx);

  // ---- FILL (over) --------------------------------------------------------
  const stFill: LayerState = Object.assign({}, st);

  const basePropsFill: Partial<IconLayerProps> = Object.assign({}, sharedProps, {
    getIcon: () => iconFillObj,
    getColor: getColorFill,
    getSize:  getSizeFill,
    sizeMinPixels: isFiniteNumber(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels * 0.91 : 0,
    sizeMaxPixels: isFiniteNumber(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels * 0.91 : 80 * 0.91
  });

  const propsFill = composeLayerProps(stFill, basePropsFill, ctx);

  // Order: stroke first (under), fill second (over)
  return [ new IconLayer(propsStroke), new IconLayer(propsFill) ];
}
