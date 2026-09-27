import { ScatterplotLayer } from '@deck.gl/layers';
import type { ScatterplotLayerProps } from '@deck.gl/layers';
import { colorAccessorFrom, numericAccessorFrom } from '../core/encodings';
import type { LayerState, TypedArray } from '../core/layer-state';
import { assertTA, isFiniteNumber } from '../core/utils';
import { composeLayerProps } from './props';
import { getLayerBuildCache } from './utils';
import type { BuildContext } from './utils';

// Positions as a binary attribute; the object is kept across rebuilds.
export interface PointData {
  length: number;
  attributes?: {
    getPosition?: { value?: TypedArray; size?: number };
  };
}

interface ScatterplotBucket {
  dataObj?: PointData;
}

export function buildScatterplotLayer(st: LayerState, ctx: BuildContext): ScatterplotLayer {
  const cols = st.data_columns || {};
  if (!cols.position || !assertTA(st, cols.position.array, 'position.array', 'skip')) {
    return new ScatterplotLayer(composeLayerProps(st, { data: { length: 0 } }, ctx));
  }

  const size = cols.position.size || 2;
  const pos  = cols.position.array;
  const n    = Math.floor(pos.length / size);

  const bucket = getLayerBuildCache<ScatterplotBucket>(ctx, st, 'scatterplot');
  let dataObj = bucket.dataObj;
  if (!dataObj || dataObj.length !== n) {
    dataObj = {
      length: n,
      attributes: {
        getPosition: { value: pos, size }
      }
    };
    bucket.dataObj = dataObj;
  } else {
    const attr = dataObj.attributes || (dataObj.attributes = {});
    const gp   = attr.getPosition || (attr.getPosition = {});
    gp.value = pos;
    gp.size  = size;
    dataObj.length = n;
  }

  const getFillColor = colorAccessorFrom(st, 'fillColor', [33,150,243,204]);
  const getLineColor = colorAccessorFrom(st, 'lineColor', [0,0,0,255]);
  const getRadius = numericAccessorFrom(st, 'radius', 5);
  const getLineWidth = numericAccessorFrom(st, 'lineWidth', 0);

  const baseProps: Partial<ScatterplotLayerProps> = {
    data: dataObj,
    dataComparator: (a,b) => a === b,
    positionFormat: size === 2 ? 'XY' : 'XYZ',

    // pickable is set in composeLayerProps()
    stroked: !!st.cfg?.stroke,

    getRadius,
    getFillColor,
    getLineColor,
    getLineWidth,

    radiusUnits: st.cfg?.radiusUnits || 'meters',
    radiusMinPixels: isFiniteNumber(st.cfg?.radiusMinPixels) ? st.cfg.radiusMinPixels : 0,
    radiusMaxPixels: isFiniteNumber(st.cfg?.radiusMaxPixels) ? st.cfg.radiusMaxPixels : Number.MAX_SAFE_INTEGER,
    lineWidthUnits: st.cfg?.lineWidthUnits || 'pixels',
    lineWidthMinPixels: isFiniteNumber(st.cfg?.lineWidthMinPixels) ? st.cfg.lineWidthMinPixels : 0,
    lineWidthMaxPixels: isFiniteNumber(st.cfg?.lineWidthMaxPixels) ? st.cfg.lineWidthMaxPixels : Number.MAX_SAFE_INTEGER
  };

  const layerProps = composeLayerProps(st, baseProps, ctx);
  return new ScatterplotLayer(layerProps);
}
