(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function buildMarkerLayer(st) {
    const cols = st.data_columns || {};
    // Require packed binary positions (same guard as buildIconLayer)
    if (!cols.position || !root.utils.assertTA(st, cols.position.array, 'position.array', 'skip')) {
      return new deck.IconLayer(root.layerProps.composeLayerProps(st, { data: { length: 0 } }));
    }

    const posSize = cols.position.size || 2;     // [lon,lat] or [lon,lat,z]
    const posArr  = cols.position.array;         // Float32Array
    const n       = Math.floor(posArr.length / posSize);

    // ---- helpers ------------------------------------------------------------
    const resolveIconFromKey = (stLike, key, fallbackUrl) => {
      if (window.MAPLAMINA?.icons?.resolveIcon) {
        const s = Object.assign({}, stLike, { cfg: Object.assign({}, stLike.cfg, { icon: key }) });
        return window.MAPLAMINA.icons.resolveIcon(s);
      }
      return {
        url: fallbackUrl,
        width: 128, height: 128,
        anchorX: 64, anchorY: 64,
        mask: true
      };
    };

    // Default keys from cfg (R: cfg_extra$icon / cfg_extra$iconStroke)
    const keyFill   = st.cfg?.icon       || 'geo_alt_fill';
    const keyStroke = st.cfg?.iconStroke || 'geo_alt';
    const iconFill   = resolveIconFromKey(st, keyFill,   'icons/geo-alt-fill.svg');
    const iconStroke = resolveIconFromKey(st, keyStroke, 'icons/geo-alt.svg');

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
    let sharedData = cols.__data_bin_marker;
    if (!sharedData || sharedData.length !== n) {
      sharedData = { length: n, attributes: { getPosition: { value: posArr, size: posSize } } };
      cols.__data_bin_marker = sharedData;
    } else {
      sharedData.length = n;
      const attrs = sharedData.attributes || (sharedData.attributes = {});
      const gp = attrs.getPosition || (attrs.getPosition = {});
      gp.value = posArr;
      gp.size  = posSize;
    }

    // ---- accessors ----------------------------------------------------------
    const getColorBase = root.encodings.colorAccessorFrom(st, 'fillColor', [33,150,243,255]);
    const _num = root.encodings?.numericAccessorFrom;
    const getSizeBase = _num ? _num(st, 'size', 18) : (() => 18);

    // Configurable factors
    const strokeDarken = Number.isFinite(st.cfg?.strokeDarken) ? st.cfg.strokeDarken : 0.6;
    const fillScale    = Number.isFinite(st.cfg?.fillScale)    ? st.cfg.fillScale    : 0.91;

    const clamp255 = (x) => Math.max(0, Math.min(255, x | 0));

    // Avoid per-feature allocations for stroke colors by writing into a reusable scratch array.
    const _scratchStroke = [0, 0, 0, 255];
    const darkenRGBAInto = (rgba, k, out) => {
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

    const getColorStroke = (d, info) => darkenRGBAInto(getColorBase(d, info), strokeDarken, _scratchStroke);
    const getColorFill   = getColorBase;

    const getSizeStroke  = getSizeBase;
    const getSizeFill    = (d, info) => fillScale * getSizeBase(d, info);

    // Common props for both sublayers
    const sharedProps = {
      data: sharedData,
      dataComparator: (a, b) => a === b,

      sizeUnits: (!Array.isArray(st.cfg?.sizeUnits) && st.cfg?.sizeUnits !== null) ? st.cfg.sizeUnits : "pixels",
      parameters: { depthTest: false },
      loadOptions: { image: { type: 'imagebitmap' } },
      alphaCutoff: 0
    };

    // IMPORTANT: give both sublayers the SAME filterKey (default to base id)
    const filterKey = st.filterKey || st.id;

    // ---- STROKE (under) -----------------------------------------------------
    const stStroke = Object.assign({}, st, {
      id: st.id ? `${st.id}-stroke` : undefined,
      filterKey,
      // Make this truly non-interactive: drive via cfg because composeLayerProps reads st.cfg.pickable
      cfg: Object.assign({}, st.cfg, { pickable: false }),
      tooltip: null,
      popup: null,
      show_controls: false
    });

    const basePropsStroke = Object.assign({}, sharedProps, {
      getIcon: () => iconStrokeObj,
      getColor: getColorStroke,
      getSize:  getSizeStroke,
      sizeMinPixels: Number.isFinite(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels : 0,
      sizeMaxPixels: Number.isFinite(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels : 80
    });

    const propsStroke = root.layerProps.composeLayerProps(stStroke, basePropsStroke);

    // ---- FILL (over) --------------------------------------------------------
    const stFill = Object.assign({}, st, { filterKey });

    const basePropsFill = Object.assign({}, sharedProps, {
      getIcon: () => iconFillObj,
      getColor: getColorFill,
      getSize:  getSizeFill,
      sizeMinPixels: Number.isFinite(st.cfg?.sizeMinPixels) ? st.cfg.sizeMinPixels * 0.91 : 0,
      sizeMaxPixels: Number.isFinite(st.cfg?.sizeMaxPixels) ? st.cfg.sizeMaxPixels * 0.91 : 80 * 0.91
    });

    const propsFill = root.layerProps.composeLayerProps(stFill, basePropsFill);

    // Order: stroke first (under), fill second (over)
    return [ new deck.IconLayer(propsStroke), new deck.IconLayer(propsFill) ];
  }

  // Export for registry + direct access
  root.layerBuilders.buildMarkerLayer = buildMarkerLayer;
})(window);
