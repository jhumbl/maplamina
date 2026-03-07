(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.layerBuilders = root.layerBuilders || {};

  // Bump this if the precompute format/logic changes.
  const HOLES_VERSION = 2;

  function buildPolygonLayer(st) {
    const P = st?.data_columns?.polygon || {};

    const positions    = P.positions_array || (P.positions && P.positions.array);
    const ringStarts   = P.ring_starts_array || (P.ring_starts && P.ring_starts.array);
    const polyStarts   = P.poly_starts_array || (P.poly_starts && P.poly_starts.array);
    const positionSize = P.size || 2;

    const okPos = root.utils.assertTA(st, positions,  'polygon.positions_array',   'skip');
    const okRng = root.utils.assertTA(st, ringStarts, 'polygon.ring_starts_array', 'skip');
    const okPol = root.utils.assertTA(st, polyStarts, 'polygon.poly_starts_array', 'skip');
    if (!okPos || !okRng || !okPol) return null;
    if (!positions || !ringStarts || !polyStarts) return null;

    // -----------------------------
    // Precompute + cache (versioned)
    // -----------------------------
    const cacheOK =
      P.__holes_version === HOLES_VERSION &&
      P.__cache_positions === positions &&
      P.__cache_ringStarts === ringStarts &&
      P.__cache_polyStarts === polyStarts &&
      P.__cache_posSize === positionSize &&
      P.__poly_object_per_poly &&
      P.length != null;

    if (!cacheOK) {
      const posSize = positionSize;
      const nVerts = (positions.length / posSize) >>> 0;

      const ringHasSentinel =
        ringStarts.length > 0 && (ringStarts[ringStarts.length - 1] >>> 0) === nVerts;
      const nRings = ringHasSentinel ? ((ringStarts.length - 1) >>> 0) : (ringStarts.length >>> 0);

      const polyHasSentinel =
        polyStarts.length > 0 && (polyStarts[polyStarts.length - 1] >>> 0) === nRings;

      const nPolys = (P.length != null)
        ? (P.length >>> 0)
        : (polyHasSentinel ? ((polyStarts.length - 1) >>> 0) : (polyStarts.length >>> 0));

      const ringStartAt = (r) => (r < ringStarts.length ? (ringStarts[r] >>> 0) : (nVerts >>> 0));

      // Per-polygon vertex span (vertex indices, not flat)
      const polyVStart = new Uint32Array(nPolys);
      const polyVEnd   = new Uint32Array(nPolys);

      // Precompute holes in a single flat table for performance:
      // - holesAll: concatenated hole starts (flat indices into positionsView)
      // - holesStartIdx: per polygon offset into holesAll
      // - holesCount: per polygon hole count
      const holesStartsJS = [];
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
              // IMPORTANT:
              // deck.gl expects holeIndices as offsets into the *flat positions array*
              // (not vertex offsets). So multiply by positionSize.
              holesStartsJS.push(((holeV - vStart) * posSize) >>> 0);
              count++;
              acc++;
            }
          }
        }
        holesCount[i] = count >>> 0;
      }

      const holesAll = new Uint32Array(holesStartsJS);

      // Prebuild stable polygon objects per poly (avoids per-accessor allocations)
      const polyObjs = new Array(nPolys);
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
          const holeIndicesView = holesAll.subarray(h0, h0 + count);
          polyObjs[i] = {
            positions: positionsView,
            positionSize: posSize,
            holeIndices: holeIndicesView
          };
        } else {
          polyObjs[i] = {
            positions: positionsView,
            positionSize: posSize
          };
        }
      }

      // Persist caches (single source of truth)
      P.__poly_object_per_poly = polyObjs;

      P.length = nPolys;

      // Cache identity + version
      P.__holes_version = HOLES_VERSION;
      P.__cache_positions = positions;
      P.__cache_ringStarts = ringStarts;
      P.__cache_polyStarts = polyStarts;
      P.__cache_posSize = positionSize;

      // If data identity array depends on nPolys, reset it too
      P.__data_i = null;
    }

    const nPolys = (P.length >>> 0);

    // Stable data identity (one object per polygon)
    let dataObj = P.__data_i;
    if (!dataObj || dataObj.length !== nPolys) {
      dataObj = Array.from({ length: nPolys }, (_, i) => ({ i }));
      P.__data_i = dataObj;
    }

    const polyObjs = P.__poly_object_per_poly;

    // Canonical indexing helpers (multipart-safe)
    const data = root.data;
    if (!data || typeof data.getIndexers !== 'function') {
      console.error("[maplamina] Missing data.getIndexers; ensure ml-data.js is loaded before ml-layer-polygon.js");
      return null;
    }
    const indexers = data.getIndexers(st);
    const idxMap = indexers.idxMap;
    const pickPartIndex = indexers.pickPartIndex;

    const getPolygon = (d, info) => {
      const i = pickPartIndex(d, info);
      if (i >= polyObjs.length) return null;
      return polyObjs[i];
    };

    const _colorAccessorFrom = root.encodings?.colorAccessorFrom || MAPLAMINA.core?.colorAccessorFrom;
    const _numericAccessorFrom = root.encodings?.numericAccessorFrom || MAPLAMINA.core?.numericAccessorFrom;

    const getFillColor = _colorAccessorFrom
      ? _colorAccessorFrom(st, 'fillColor', [30, 64, 175, 255], idxMap)
      : (() => [30, 64, 175, 255]);

    const getLineColor = _colorAccessorFrom
      ? _colorAccessorFrom(st, 'lineColor', [255, 255, 255, 255], idxMap)
      : (() => [255, 255, 255, 255]);

    const getLineWidth = _numericAccessorFrom
      ? _numericAccessorFrom(st, 'lineWidth', 1, idxMap)
      : (() => 1);
    const baseProps = {
      data: dataObj,
      dataComparator: (a, b) => a === b,

      getPolygon,
      positionFormat: positionSize === 2 ? 'XY' : 'XYZ',

      wrapLongitude: true,
      filled: true,
      stroked: !!st.cfg?.stroke,

      getFillColor,
      getLineColor,
      getLineWidth,

      lineWidthUnits: st.cfg?.lineWidthUnits || 'meters',
      lineWidthMinPixels: Number.isFinite(st.cfg?.lineWidthMinPixels) ? st.cfg.lineWidthMinPixels : 0,
      lineWidthMaxPixels: Number.isFinite(st.cfg?.lineWidthMaxPixels)
        ? st.cfg.lineWidthMaxPixels
        : Number.MAX_SAFE_INTEGER
    };

    const layerProps = root.layerProps.composeLayerProps(st, baseProps);
    return new deck.PolygonLayer(layerProps);
  }

  root.layerBuilders.buildPolygonLayer = buildPolygonLayer;
})(window);
