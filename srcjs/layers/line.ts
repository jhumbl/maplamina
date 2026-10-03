import { PathLayer } from '@deck.gl/layers';
import type { PathLayerProps } from '@deck.gl/layers';
import { colorAccessorFrom, numericAccessorFrom } from '../core/encodings';
import type { LayerState, TypedArray } from '../core/layer-state';
import { assertTA, isFiniteNumber } from '../core/utils';
import { composeLayerProps } from './props';
import type { LayerParameters } from './props';
import { getLayerBuildCache } from './utils';
import type { BuildContext } from './utils';

interface PathData {
  length: number;
  startIndices: Uint32Array;
  attributes?: {
    getPath?: { value?: TypedArray; size?: number };
  };
}

interface PathBucket {
  startIndices?: Uint32Array;
  dataObj?: PathData;
}

export function buildPathLayer(st: LayerState, ctx: BuildContext): PathLayer {
  const p = st.data_columns && st.data_columns.path;
  const positions    = p && p.positions_array;
  const startsNoEnd  = p && p.path_starts_array;  // N entries (no sentinel)
  const positionSize = (p && p.size) || 2;

  const getColor = colorAccessorFrom(st, 'lineColor', [0, 0, 139, 204]);
  const getWidth = numericAccessorFrom(st, 'lineWidth', 1);

  const okPos = assertTA(st, positions,   'path.positions_array',   'skip');
  const okSta = assertTA(st, startsNoEnd, 'path.path_starts_array', 'skip');
  if (!okPos || !okSta) {
    return new PathLayer(composeLayerProps<Partial<PathLayerProps>>(st, {
      data: { length: 0 },
      getPath: () => [],
      getColor,
      getWidth,
      widthUnits: st.cfg?.widthUnits || 'meters',
      parameters: { depthTest: false } as LayerParameters
    }, ctx));
  }

  const nPaths = startsNoEnd.length >>> 0;
  const nVerts = (positions.length / positionSize) >>> 0;

  const bucket = getLayerBuildCache<PathBucket>(ctx, st, 'path');

  let startIndices = bucket.startIndices;
  if (!startIndices || startIndices.length !== nPaths + 1) {
    startIndices = new Uint32Array(nPaths + 1);
    bucket.startIndices = startIndices;
  }
  startIndices.set(startsNoEnd, 0);
  startIndices[nPaths] = nVerts;

  let dataObj = bucket.dataObj;
  if (!dataObj || dataObj.length !== nPaths) {
    dataObj = {
      length: nPaths,
      startIndices,
      attributes: {
        getPath: { value: positions, size: positionSize }
      }
    };
    bucket.dataObj = dataObj;
  } else {
    dataObj.length = nPaths;
    dataObj.startIndices = startIndices;
    const attrs = dataObj.attributes || (dataObj.attributes = {});
    const gp = attrs.getPath || (attrs.getPath = {});
    gp.value = positions;
    gp.size  = positionSize;
  }

  const baseProps: Partial<PathLayerProps> = {
    data: dataObj,
    dataComparator: (a,b) => a === b,

    getColor,
    getWidth,

    widthUnits: st.cfg?.widthUnits || 'meters',
    widthMinPixels: isFiniteNumber(st.cfg?.widthMinPixels) ? st.cfg.widthMinPixels : 0,
    widthMaxPixels: isFiniteNumber(st.cfg?.widthMaxPixels) ? st.cfg.widthMaxPixels : Number.MAX_SAFE_INTEGER,
    parameters: { depthTest: false } as LayerParameters
  };

  const layerProps = composeLayerProps(st, baseProps, ctx);
  return new PathLayer(layerProps);
}
