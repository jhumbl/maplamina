(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-layer-props.js");
  }

  const utils = core.require('utils', 'ml-layer-props.js');
  const { stablePairTA, normText } = utils;




  // ------------------------ fine-grained updateTriggers ------------------------
  function buildUpdateTriggersFromEncodings(st) {

    const base = st.base_encodings || {};
    const t = {};

    function encTrig(enc) {
      if (!enc) return undefined;
      if (enc.value_array && ArrayBuffer.isView(enc.value_array)) return enc.value_array;
      if (enc.value && ArrayBuffer.isView(enc.value)) return enc.value;
      if (enc.encoding === 'dict') {
        const codes = enc.codes_array || enc.codes;
        const dict  = enc.dict_array  || enc.dict;
        return (codes && dict) ? stablePairTA(codes, dict) : undefined;
      }
      if (enc.value != null) return enc.value;
      return undefined;
    }

    const opacityIsTA = !!(base.opacity && (ArrayBuffer.isView(base.opacity.value_array) || ArrayBuffer.isView(base.opacity.value)));
    const opacityTrig = opacityIsTA ? encTrig(base.opacity) : undefined;

    function colorTrigWithOpacity(fcEnc) {
      const fc = encTrig(fcEnc);
      if (!fc) return opacityTrig || undefined;
      if (!opacityTrig) return fc;
      return stablePairTA(fc, opacityTrig);
    }

    if (st.type === 'circle') {
      t.getRadius    = encTrig(base.radius);
      t.getFillColor = colorTrigWithOpacity(base.fillColor);
      t.getLineColor = encTrig(base.lineColor);
      t.getLineWidth = encTrig(base.lineWidth);
    } else if (st.type === 'line') {
      t.getColor = encTrig(base.lineColor || base.fillColor);
      t.getWidth = encTrig(base.lineWidth);
    } else if (st.type === 'polygon') {
      t.getFillColor = colorTrigWithOpacity(base.fillColor);
      t.getLineColor = encTrig(base.lineColor);
      t.getLineWidth = encTrig(base.lineWidth);
      // no getElevation trigger
    } else if (st.type === 'icon') {
      t.getColor = colorTrigWithOpacity(base.fillColor);
      t.getSize  = encTrig(base.size);
    } else if (st.type === 'marker') {
      t.getColor = colorTrigWithOpacity(base.fillColor);
      t.getSize  = encTrig(base.size);
      t.getLineColor = encTrig(base.lineColor);
      t.getLineWidth = encTrig(base.lineWidth);
    }

    return t;
  }


  // ------------------------ encoding patch -> touched deck props ------------------------
  // Determine which deck.gl accessor props are affected by an encoding patch.
  // Note: opacity is treated as touching the relevant color accessor.
  function deckPropsTouchedByEncodingPatch(layerType, encPatch) {
    if (!encPatch || typeof encPatch !== 'object') return [];
    const keys = Object.keys(encPatch);
    const out = new Set();

    const t = (typeof normText === 'function')
      ? normText(layerType)
      : String(layerType || '').trim().toLowerCase();

    function has(k) { return keys.includes(k); }

    if (t === 'circle') {
      if (has('radius')) out.add('getRadius');
      if (has('fillColor') || has('opacity')) out.add('getFillColor');
      if (has('lineColor')) out.add('getLineColor');
      if (has('lineWidth')) out.add('getLineWidth');
    } else if (t === 'line') {
      if (has('lineColor') || has('fillColor') || has('opacity')) out.add('getColor');
      if (has('lineWidth')) out.add('getWidth');
    } else if (t === 'polygon') {
      if (has('fillColor') || has('opacity')) out.add('getFillColor');
      if (has('lineColor')) out.add('getLineColor');
      if (has('lineWidth')) out.add('getLineWidth');
    } else if (t === 'icon') {
      if (has('size')) out.add('getSize');
      if (has('fillColor') || has('opacity')) out.add('getColor');
    } else if (t === 'marker') {
      if (has('size')) out.add('getSize');
      if (has('fillColor') || has('opacity')) out.add('getColor');
      if (has('lineColor')) out.add('getLineColor');
      if (has('lineWidth')) out.add('getLineWidth');
    }

    return Array.from(out);
  }

  // PolygonLayer is composite: it renders "polygon-fill" and "polygon-stroke" sublayers.
  // Map parent transitions/updateTriggers onto sublayer prop names (no elevation mapping).
  function ensurePolygonSubLayerProps(st, props) {
    if (!st || st.type !== 'polygon') return;

    const slp = props.subLayerProps || (props.subLayerProps = {});
    const fill   = slp['polygon-fill']   || (slp['polygon-fill'] = {});
    const stroke = slp['polygon-stroke'] || (slp['polygon-stroke'] = {});

    const ut = props.updateTriggers || {};
    const tr = props.transitions || {};

    // Fill sublayer uses getFillColor
    fill.updateTriggers = Object.assign({}, fill.updateTriggers || {}, {
      ...(ut.getFillColor ? { getFillColor: ut.getFillColor } : null)
    });
    // Only attach transitions when present (avoid creating empty transitions objects).
    if (tr.getFillColor) {
      fill.transitions = Object.assign({}, fill.transitions || {}, {
        getFillColor: tr.getFillColor
      });
    }

    // Stroke sublayer uses getColor/getWidth (not getLineColor/getLineWidth)
    stroke.updateTriggers = Object.assign({}, stroke.updateTriggers || {}, {
      ...(ut.getLineColor ? { getColor: ut.getLineColor } : null),
      ...(ut.getLineWidth ? { getWidth: ut.getLineWidth } : null)
    });
    if (tr.getLineColor || tr.getLineWidth) {
      stroke.transitions = Object.assign({}, stroke.transitions || {}, {
        ...(tr.getLineColor ? { getColor: tr.getLineColor } : null),
        ...(tr.getLineWidth ? { getWidth: tr.getLineWidth } : null)
      });
    }
  }

  // ------------------------ compose layer props ------------------------
function composeLayerProps(st, baseProps, ctx) {
  // v3 invariant: layers are rendering-only; any deck.gl transitions must be runtime-injected via st.__transitions.

  const useOffsets = Array.isArray(st.coordinate_origin) && st.coordinate_origin.length === 2;
  const coreUpdateTriggers = buildUpdateTriggersFromEncodings(st);

  const props = Object.assign({
    id: st.id,
    coordinateSystem: useOffsets ? deck.COORDINATE_SYSTEM.LNGLAT_OFFSETS
                                 : deck.COORDINATE_SYSTEM.LNGLAT,
    ...(useOffsets ? { coordinateOrigin: st.coordinate_origin } : null),

    pickable: st.cfg?.pickable !== false,
    parameters: { depthTest: true }
  }, baseProps || {});

  // Merge (not overwrite) triggers.
  // v3 invariant: layers MUST NOT own/define transitions. Any transitions must be injected by the runtime
  // at patch-time (e.g. views motion), not derived from the layer spec.
  props.updateTriggers = Object.assign({}, coreUpdateTriggers, props.updateTriggers || {});

  // Stage 3: runtime-injected transitions (component-authored motion).
  // The runtime attaches st.__transitions (runtime-only) before buildLayer().
  // This is NOT part of the R spec (layers must not have `transitions`).
  if (st && st.__transitions && typeof st.__transitions === 'object') {
    props.transitions = Object.assign({}, props.transitions || {}, st.__transitions);
  }

  // Composite-layer wiring (polygon sublayers)
  ensurePolygonSubLayerProps(st, props);

  // Tooltips / popups
  try {
    MAPLAMINA?.tooltips?.prime?.(st);
    const tt = MAPLAMINA?.tooltips?.buildGetTemplate?.(st, 'tooltip');
    if (tt) {
      MAPLAMINA?.tooltips?.register?.(st.id, tt);
      if (st.type === 'polygon') {
        MAPLAMINA?.tooltips?.register?.(`${st.id}-polygon-fill`, tt);
        MAPLAMINA?.tooltips?.register?.(`${st.id}-polygon-stroke`, tt);
      }
    }
    const oc = MAPLAMINA?.tooltips?.buildOnClickPopup?.(st);
    if (oc) props.onClick = oc;
  } catch (_) {}

  // GPU filtering
  try { MAPLAMINA?.filterAdapter?.attachGPUFiltering?.(props, st); } catch (_) {}

  // Force-hide layers when a bound categorical selection has no overlap with this layer
  if (st && st.__forceHidden) props.visible = false;

  return props;
}

  root.layerProps = { composeLayerProps, buildUpdateTriggersFromEncodings, deckPropsTouchedByEncodingPatch };
})(window);