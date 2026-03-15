(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function buildScatterplotLayer(st, ctx) {
    const cols = st.data_columns || {};
    if (!cols.position || !root.utils.assertTA(st, cols.position.array, 'position.array', 'skip')) {
      return new deck.ScatterplotLayer(root.layerProps.composeLayerProps(st, { data: { length: 0 } }, ctx));
    }

    const size = cols.position.size || 2;
    const pos  = cols.position.array;
    const n    = Math.floor(pos.length / size);

    const bucket = root.layerUtils?.getLayerBuildCache ? root.layerUtils.getLayerBuildCache(ctx, st, 'scatterplot') : {};
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

    const getFillColor = root.encodings.colorAccessorFrom(st, 'fillColor', [33,150,243,204]);
    const getLineColor = root.encodings.colorAccessorFrom(st, 'lineColor', [0,0,0,255]);
    const _num = root.encodings?.numericAccessorFrom;
    const getRadius = _num ? _num(st, 'radius', 5) : (() => 5);
    const getLineWidth = _num ? _num(st, 'lineWidth', 0) : (() => 0);

    const baseProps = {
      data: dataObj,
      dataComparator: (a,b) => a === b,
      positionFormat: size === 2 ? 'XY' : 'XYZ',

      // NOTE: pickable is now handled consistently in composeLayerProps()
      stroked: !!st.cfg?.stroke,

      getRadius,
      getFillColor,
      getLineColor,
      getLineWidth,

      radiusUnits: st.cfg?.radiusUnits || 'meters',
      radiusMinPixels: Number.isFinite(st.cfg?.radiusMinPixels) ? st.cfg.radiusMinPixels : 0,
      radiusMaxPixels: Number.isFinite(st.cfg?.radiusMaxPixels) ? st.cfg.radiusMaxPixels : Number.MAX_SAFE_INTEGER,
      lineWidthUnits: st.cfg?.lineWidthUnits || 'pixels',
      lineWidthMinPixels: Number.isFinite(st.cfg?.lineWidthMinPixels) ? st.cfg.lineWidthMinPixels : 0,
      lineWidthMaxPixels: Number.isFinite(st.cfg?.lineWidthMaxPixels) ? st.cfg.lineWidthMaxPixels : Number.MAX_SAFE_INTEGER
    };

    const layerProps = root.layerProps.composeLayerProps(st, baseProps, ctx);
    return new deck.ScatterplotLayer(layerProps);
  }

  root.layerBuilders.buildScatterplotLayer = buildScatterplotLayer;
})(window);
