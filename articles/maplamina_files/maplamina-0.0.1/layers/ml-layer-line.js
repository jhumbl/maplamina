(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function buildPathLayer(st, ctx) {
    const p = st.data_columns && st.data_columns.path;
    const positions    = p && p.positions_array;
    const startsNoEnd  = p && p.path_starts_array;  // N entries (no sentinel)
    const positionSize = (p && p.size) || 2;

    const _colorAccessorFrom = root.encodings?.colorAccessorFrom || MAPLAMINA.core?.colorAccessorFrom;
    const getColor = _colorAccessorFrom
      ? _colorAccessorFrom(st, 'lineColor', [0, 0, 139, 204])
      : (() => [0, 0, 139, 204]);
    const _num = root.encodings?.numericAccessorFrom;
    const getWidth = _num ? _num(st, 'lineWidth', 1) : (() => 1);

    const okPos = root.utils.assertTA(st, positions,   'path.positions_array',   'skip');
    const okSta = root.utils.assertTA(st, startsNoEnd, 'path.path_starts_array', 'skip');
    if (!okPos || !okSta) {
      return new deck.PathLayer(root.layerProps.composeLayerProps(st, {
        data: { length: 0 },
        getPath: () => [],
        getColor,
        getWidth,
        widthUnits: st.cfg?.widthUnits || 'meters',
        parameters: { depthTest: false }
      }, ctx));
    }

    const nPaths = startsNoEnd.length >>> 0;
    const nVerts = (positions.length / positionSize) >>> 0;

    const bucket = root.layerUtils?.getLayerBuildCache ? root.layerUtils.getLayerBuildCache(ctx, st, 'path') : {};

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

    const baseProps = {
      data: dataObj,
      dataComparator: (a,b) => a === b,

      getColor,
      getWidth,

      widthUnits: st.cfg?.widthUnits || 'meters',
      widthMinPixels: Number.isFinite(st.cfg?.widthMinPixels) ? st.cfg.widthMinPixels : 0,
      widthMaxPixels: Number.isFinite(st.cfg?.widthMaxPixels) ? st.cfg.widthMaxPixels : Number.MAX_SAFE_INTEGER,
      parameters: { depthTest: false }
    };

    delete baseProps.getPath;

    const layerProps = root.layerProps.composeLayerProps(st, baseProps, ctx);
    return new deck.PathLayer(layerProps);
  }

  root.layerBuilders.buildPathLayer = buildPathLayer;
})(window);
