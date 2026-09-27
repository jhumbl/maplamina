import { PolygonLayer } from '@deck.gl/layers';
import type { PolygonLayerProps } from '@deck.gl/layers';
import { getIndexers } from '../core/data';
import type { AccessorInfo } from '../core/data';
import { colorAccessorFrom, numericAccessorFrom } from '../core/encodings';
import type { LayerState, PolygonColumnState, TypedArray } from '../core/layer-state';
import { assertTA, isFiniteNumber } from '../core/utils';
import { composeLayerProps } from './props';
import { getLayerBuildCache } from './utils';
import type { BuildContext } from './utils';

// One polygon as getPolygon returns it: a view of its vertices and, when it has holes, the
// offsets at which they start.
interface PolygonObject {
  positions: TypedArray;
  positionSize: number;
  holeIndices?: Uint32Array;
}

interface PolygonBucket {
  holesVersion?: number;
  positions?: TypedArray;
  ringStarts?: TypedArray;
  polyStarts?: TypedArray;
  positionSize?: number;
  nPolys?: number;
  polyObjs?: (PolygonObject | null)[];
  dataObj?: { i: number }[] | null;
}

// Bump this if the precompute format/logic changes.
const HOLES_VERSION = 2;

export function buildPolygonLayer(st: LayerState, ctx: BuildContext): PolygonLayer | null {
  const P: Partial<PolygonColumnState> = st?.data_columns?.polygon || {};

  const positions    = P.positions_array || (P.positions && P.positions.array);
  const ringStarts   = P.ring_starts_array || (P.ring_starts && P.ring_starts.array);
  const polyStarts   = P.poly_starts_array || (P.poly_starts && P.poly_starts.array);
  const positionSize = P.size || 2;

  const okPos = assertTA(st, positions,  'polygon.positions_array',   'skip');
  const okRng = assertTA(st, ringStarts, 'polygon.ring_starts_array', 'skip');
  const okPol = assertTA(st, polyStarts, 'polygon.poly_starts_array', 'skip');
  if (!okPos || !okRng || !okPol) return null;
  if (!positions || !ringStarts || !polyStarts) return null;

  // -----------------------------
  // Precompute + cache (versioned)
  // -----------------------------
  const bucket = getLayerBuildCache<PolygonBucket>(ctx, st, 'polygon');
  const cacheOK =
    bucket.holesVersion === HOLES_VERSION &&
    bucket.positions === positions &&
    bucket.ringStarts === ringStarts &&
    bucket.polyStarts === polyStarts &&
    bucket.positionSize === positionSize &&
    Array.isArray(bucket.polyObjs) &&
    Number.isFinite(bucket.nPolys);

  if (!cacheOK) {
    const posSize = positionSize;
    const nVerts = (positions.length / posSize) >>> 0;

    const ringHasSentinel =
      ringStarts.length > 0 && (ringStarts[ringStarts.length - 1] >>> 0) === nVerts;
    const nRings = ringHasSentinel ? ((ringStarts.length - 1) >>> 0) : (ringStarts.length >>> 0);

    const polyHasSentinel =
      polyStarts.length > 0 && (polyStarts[polyStarts.length - 1] >>> 0) === nRings;

    const nPolys = polyHasSentinel ? ((polyStarts.length - 1) >>> 0) : (polyStarts.length >>> 0);

    const ringStartAt = (r: number) => (r < ringStarts.length ? (ringStarts[r] >>> 0) : (nVerts >>> 0));

    const polyVStart = new Uint32Array(nPolys);
    const polyVEnd   = new Uint32Array(nPolys);
    const holesStartsJS: number[] = [];
    const holesStartIdx = new Uint32Array(nPolys);
    const holesCount    = new Uint32Array(nPolys);

    let acc = 0;

    for (let i = 0; i < nPolys; i++) {
      const r0 = polyStarts[i] >>> 0;
      const r1 = (i + 1 < polyStarts.length) ? (polyStarts[i + 1] >>> 0) : (nRings >>> 0);

      const vStart = ringStartAt(r0);
      const vEnd   = (r1 <= nRings) ? ringStartAt(r1) : (nVerts >>> 0);

      polyVStart[i] = vStart;
      polyVEnd[i]   = vEnd;
      holesStartIdx[i] = acc;

      let count = 0;
      if (r1 > r0 + 1) {
        for (let r = (r0 + 1) >>> 0; r < r1; r++) {
          const holeV = ringStartAt(r);
          const holeE = (r + 1 <= nRings) ? ringStartAt(r + 1) : (nVerts >>> 0);
          if ((holeE - holeV) >= 3) {
            holesStartsJS.push(((holeV - vStart) * posSize) >>> 0);
            count++;
            acc++;
          }
        }
      }
      holesCount[i] = count >>> 0;
    }

    const holesAll = new Uint32Array(holesStartsJS);
    const polyObjs = new Array<PolygonObject | null>(nPolys);
    for (let i = 0; i < nPolys; i++) {
      const vStart = polyVStart[i] >>> 0;
      const vEnd   = polyVEnd[i] >>> 0;

      if ((vEnd - vStart) < 3) {
        polyObjs[i] = null;
        continue;
      }

      const positionsView = positions.subarray(vStart * posSize, vEnd * posSize);
      const count = holesCount[i] >>> 0;
      if (count) {
        const h0 = holesStartIdx[i] >>> 0;
        polyObjs[i] = {
          positions: positionsView,
          positionSize: posSize,
          holeIndices: holesAll.subarray(h0, h0 + count)
        };
      } else {
        polyObjs[i] = {
          positions: positionsView,
          positionSize: posSize
        };
      }
    }

    bucket.holesVersion = HOLES_VERSION;
    bucket.positions = positions;
    bucket.ringStarts = ringStarts;
    bucket.polyStarts = polyStarts;
    bucket.positionSize = positionSize;
    bucket.nPolys = nPolys;
    bucket.polyObjs = polyObjs;
    bucket.dataObj = null;
  }

  const nPolys = bucket.nPolys! >>> 0;

  let dataObj = bucket.dataObj;
  if (!dataObj || dataObj.length !== nPolys) {
    dataObj = Array.from({ length: nPolys }, (_, i) => ({ i }));
    bucket.dataObj = dataObj;
  }

  const polyObjs = bucket.polyObjs || [];

  // Canonical indexing helpers (multipart-safe)
  const indexers = getIndexers(st);
  const idxMap = indexers.idxMap;
  const pickPartIndex = indexers.pickPartIndex;

  const getPolygon = (d: unknown, info?: AccessorInfo | null) => {
    const i = pickPartIndex(d, info);
    if (i >= polyObjs.length) return null;
    return polyObjs[i];
  };

  const getFillColor = colorAccessorFrom(st, 'fillColor', [30, 64, 175, 255], idxMap);

  const getLineColor = colorAccessorFrom(st, 'lineColor', [255, 255, 255, 255], idxMap);

  const getLineWidth = numericAccessorFrom(st, 'lineWidth', 1, idxMap);
  const baseProps: Partial<PolygonLayerProps> = {
    data: dataObj,
    dataComparator: (a, b) => a === b,

    // deck.gl's types ask for holeIndices on every polygon and never null; it takes both.
    getPolygon: getPolygon as PolygonLayerProps['getPolygon'],
    positionFormat: positionSize === 2 ? 'XY' : 'XYZ',

    wrapLongitude: true,
    filled: true,
    stroked: !!st.cfg?.stroke,

    getFillColor,
    getLineColor,
    getLineWidth,

    lineWidthUnits: st.cfg?.lineWidthUnits || 'meters',
    lineWidthMinPixels: isFiniteNumber(st.cfg?.lineWidthMinPixels) ? st.cfg.lineWidthMinPixels : 0,
    lineWidthMaxPixels: isFiniteNumber(st.cfg?.lineWidthMaxPixels)
      ? st.cfg.lineWidthMaxPixels
      : Number.MAX_SAFE_INTEGER
  };

  const layerProps = composeLayerProps(st, baseProps, ctx);
  return new PolygonLayer(layerProps);
}
