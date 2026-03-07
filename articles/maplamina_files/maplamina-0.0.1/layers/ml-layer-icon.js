(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function buildIconLayer(st) {
    const cols = st.data_columns || {};
    if (!cols.position || !root.utils.assertTA(st, cols.position.array, 'position.array', 'skip')) {
      return new deck.IconLayer(root.layerProps.composeLayerProps(st, { data: { length: 0 } }));
    }

    const size = cols.position.size || 2;
    const pos  = cols.position.array;
    const n    = Math.floor(pos.length / size);

    const iconSpec = (window.MAPLAMINA?.icons?.resolveIcon)
      ? window.MAPLAMINA.icons.resolveIcon(st)
      : { url: '', width: 128, height: 128, anchorX: 64, anchorY: 128, mask: true };

    // Stable icon descriptor (avoid per-feature object allocations)
    const iconObj = {
      url: iconSpec.url,
      width: iconSpec.width, height: iconSpec.height,
      anchorX: iconSpec.anchorX, anchorY: iconSpec.anchorY,
      mask: iconSpec.mask
    };

    const getColor = root.encodings.colorAccessorFrom(st, 'fillColor', [33,150,243,204]);
    const _num = root.encodings?.numericAccessorFrom;
    const getSize = _num ? _num(st, 'size', 18) : (() => 18);

    // ---- stable data identity (cached, including attributes) ----
    let dataObj = cols.__data_bin_icon;
    if (!dataObj || dataObj.length !== n) {
      dataObj = { length: n, attributes: { getPosition: { value: pos, size } } };
      cols.__data_bin_icon = dataObj;
    } else {
      const attrs = dataObj.attributes || (dataObj.attributes = {});
      const gp = attrs.getPosition || (attrs.getPosition = {});
      gp.value = pos;
      gp.size  = size;
      dataObj.length = n;
    }

    const baseProps = {
      data: dataObj,
      dataComparator: (a,b) => a === b,

      getIcon: () => iconObj,
      getColor,
      getSize,

      sizeUnits: "pixels",
      sizeMinPixels: Number.isFinite(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels : 0,
      sizeMaxPixels: Number.isFinite(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels : 64,

      parameters: { depthTest: false },
      loadOptions: {
        image: {type: 'imagebitmap'},
        imagebitmap: { resizeWidth: 256, resizeHeight: 256, resizeQuality: 'high' }
      }
    };

    const layerProps = root.layerProps.composeLayerProps(st, baseProps);
    return new deck.IconLayer(layerProps);
  }

  root.layerBuilders.buildIconLayer = buildIconLayer;
})(window);
