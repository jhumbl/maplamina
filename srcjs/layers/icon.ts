import { IconLayer } from '@deck.gl/layers';
import type { IconLayerProps } from '@deck.gl/layers';
import { resolveIcon } from '../components/icons';
import { colorAccessorFrom, numericAccessorFrom } from '../core/encodings';
import type { LayerState } from '../core/layer-state';
import { assertTA, isFiniteNumber } from '../core/utils';
import type { PointData } from './circle';
import { composeLayerProps } from './props';
import type { LayerParameters } from './props';
import { getLayerBuildCache } from './utils';
import type { BuildContext } from './utils';

interface IconBucket {
  dataObj?: PointData;
}

export function buildIconLayer(st: LayerState, ctx: BuildContext): IconLayer {
  const cols = st.data_columns || {};
  if (!cols.position || !assertTA(st, cols.position.array, 'position.array', 'skip')) {
    return new IconLayer(composeLayerProps(st, { data: { length: 0 } }, ctx));
  }

  const size = cols.position.size || 2;
  const pos  = cols.position.array;
  const n    = Math.floor(pos.length / size);

  const iconSpec = resolveIcon(st);

  // Stable icon descriptor (avoid per-feature object allocations)
  const iconObj = {
    url: iconSpec.url,
    width: iconSpec.width, height: iconSpec.height,
    anchorX: iconSpec.anchorX, anchorY: iconSpec.anchorY,
    mask: iconSpec.mask
  };

  const getColor = colorAccessorFrom(st, 'fillColor', [33,150,243,204]);
  const getSize = numericAccessorFrom(st, 'size', 18);

  // ---- stable data identity (cached, including attributes) ----
  const bucket = getLayerBuildCache<IconBucket>(ctx, st, 'icon');
  let dataObj = bucket.dataObj;
  if (!dataObj || dataObj.length !== n) {
    dataObj = { length: n, attributes: { getPosition: { value: pos, size } } };
    bucket.dataObj = dataObj;
  } else {
    const attrs = dataObj.attributes || (dataObj.attributes = {});
    const gp = attrs.getPosition || (attrs.getPosition = {});
    gp.value = pos;
    gp.size  = size;
    dataObj.length = n;
  }

  const baseProps: Partial<IconLayerProps> = {
    data: dataObj,
    dataComparator: (a,b) => a === b,

    getIcon: () => iconObj,
    getColor,
    getSize,

    sizeUnits: st.cfg?.sizeUnits || "pixels",
    sizeMinPixels: isFiniteNumber(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels : 0,
    sizeMaxPixels: isFiniteNumber(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels : 64,

    parameters: { depthTest: false } as LayerParameters,
    loadOptions: {
      image: {type: 'imagebitmap'},
      imagebitmap: { resizeWidth: 256, resizeHeight: 256, resizeQuality: 'high' }
    }
  };

  const layerProps = composeLayerProps(st, baseProps, ctx);
  return new IconLayer(layerProps);
}
