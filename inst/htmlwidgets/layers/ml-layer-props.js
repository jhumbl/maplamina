(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-layer-props.js");
  }

  const utils = core.require('utils', 'ml-layer-props.js');
  const { stablePairTA, normText } = utils;

  function getRuntimeField(st, key) {
    const asm = root.runtime && root.runtime.assembly;
    if (asm && typeof asm.readRenderField === 'function') {
      return asm.readRenderField(st, key);
    }
    if (!st || typeof st !== 'object') return null;
    const render = (st.__render && typeof st.__render === 'object') ? st.__render : null;
    if (!render) return null;
    if (Object.prototype.hasOwnProperty.call(render, key)) return render[key];
    return null;
  }

  function gpuMeta(st) {
    const m = getRuntimeField(st, 'gpuMeta');
    if (!m || typeof m !== 'object') return { rangeDims: 0, categoryDims: 0 };
    const categoryDims = Math.min(4, Math.max(0, m.categoryDims | 0));
    const rangeDims = Math.min(4, Math.max(0, m.rangeDims | 0));
    return { rangeDims, categoryDims };
  }

  function validateGPUProps(st, meta) {
    const gpu = getRuntimeField(st, 'gpuFiltering');
    if (!gpu) return { ok: true };

    const m = meta || gpuMeta(st);
    const cat = (m && m.categoryDims) | 0;
    const rng = (m && m.rangeDims) | 0;

    if (cat > 0) {
      if (typeof gpu.getFilterCategory !== 'function') return { ok: false, reason: 'getFilterCategory missing' };
      if (!gpu.filterCategories) return { ok: false, reason: 'filterCategories missing' };
    }
    if (rng > 0) {
      if (typeof gpu.getFilterValue !== 'function') return { ok: false, reason: 'getFilterValue missing' };
      if (gpu.filterRange == null) return { ok: false, reason: 'filterRange missing' };
    }
    return { ok: true };
  }

  function attachGPUFiltering(layerProps, st) {
    const meta = gpuMeta(st);
    const gpu = getRuntimeField(st, 'gpuFiltering');
    if (!gpu) return layerProps;

    const categoryDims = Math.min(4, Math.max(0, meta.categoryDims | 0));
    const rangeDims = Math.min(4, Math.max(0, meta.rangeDims | 0));
    if (categoryDims === 0 && rangeDims === 0) return layerProps;

    const valid = validateGPUProps(st, meta);
    if (!valid.ok) {
      try { console.warn('[maplamina][gpu] disabling filtering for layer', st && st.id, 'reason:', valid.reason); } catch (_) {}
      return layerProps;
    }

    const extOpts = {};
    if (categoryDims > 0) extOpts.categorySize = categoryDims;
    if (rangeDims > 0) extOpts.filterSize = rangeDims;

    const existing = Array.isArray(layerProps.extensions) ? layerProps.extensions.slice() : [];
    const hasDFE = existing.some(e => {
      if (!e) return false;
      if (typeof deck !== 'undefined' && deck && deck.DataFilterExtension) {
        try { return e instanceof deck.DataFilterExtension; } catch (_) {}
      }
      return !!(e && e.constructor && e.constructor.name === 'DataFilterExtension');
    });
    if (!hasDFE) existing.push(new deck.DataFilterExtension(extOpts));
    layerProps.extensions = existing;
    layerProps.filterEnabled = true;

    if (categoryDims > 0) {
      layerProps.getFilterCategory = gpu.getFilterCategory;
      layerProps.filterCategories = Array.isArray(gpu.filterCategories)
        ? gpu.filterCategories.slice()
        : gpu.filterCategories;
    }

    if (rangeDims > 0) {
      layerProps.getFilterValue = gpu.getFilterValue;
      const r = gpu.filterRange;
      layerProps.filterRange = (Array.isArray(r) && Array.isArray(r[0]))
        ? r.map(x => x.slice())
        : (Array.isArray(r) ? r.slice() : r);
    }

    const ut0 = (layerProps.updateTriggers && typeof layerProps.updateTriggers === 'object')
      ? layerProps.updateTriggers
      : {};
    const ut = Object.assign({}, ut0);
    if (categoryDims > 0) ut.getFilterCategory = { cats: layerProps.filterCategories, disabled: gpu.__catDisabledKey };
    if (rangeDims > 0) ut.getFilterValue = layerProps.filterRange;
    layerProps.updateTriggers = ut;

    return layerProps;
  }

  function buildUpdateTriggersFromEncodings(st) {
    const base = st.base_encodings || {};
    const t = {};

    function encTrig(enc) {
      if (!enc) return undefined;
      if (enc.value_array && ArrayBuffer.isView(enc.value_array)) return enc.value_array;
      if (enc.value && ArrayBuffer.isView(enc.value)) return enc.value;
      if (enc.encoding === 'dict') {
        const codes = enc.codes_array || enc.codes;
        const dict = enc.dict_array || enc.dict;
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
      t.getRadius = encTrig(base.radius);
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
    } else if (st.type === 'icon') {
      t.getColor = colorTrigWithOpacity(base.fillColor);
      t.getSize = encTrig(base.size);
    } else if (st.type === 'marker') {
      t.getColor = colorTrigWithOpacity(base.fillColor);
      t.getSize = encTrig(base.size);
      t.getLineColor = encTrig(base.lineColor);
      t.getLineWidth = encTrig(base.lineWidth);
    }

    return t;
  }

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

  function ensurePolygonSubLayerProps(st, props) {
    if (!st || st.type !== 'polygon') return;

    const slp = props.subLayerProps || (props.subLayerProps = {});
    const fill = slp['polygon-fill'] || (slp['polygon-fill'] = {});
    const stroke = slp['polygon-stroke'] || (slp['polygon-stroke'] = {});

    const ut = props.updateTriggers || {};
    const tr = props.transitions || {};

    fill.updateTriggers = Object.assign({}, fill.updateTriggers || {}, {
      ...(ut.getFillColor ? { getFillColor: ut.getFillColor } : null)
    });
    if (tr.getFillColor) {
      fill.transitions = Object.assign({}, fill.transitions || {}, {
        getFillColor: tr.getFillColor
      });
    }

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

  function composeLayerProps(st, baseProps, ctx) {
    const useOffsets = Array.isArray(st.coordinate_origin) && st.coordinate_origin.length === 2;
    const coreUpdateTriggers = buildUpdateTriggersFromEncodings(st);

    const props = Object.assign({
      id: st.id,
      coordinateSystem: useOffsets ? deck.COORDINATE_SYSTEM.LNGLAT_OFFSETS : deck.COORDINATE_SYSTEM.LNGLAT,
      ...(useOffsets ? { coordinateOrigin: st.coordinate_origin } : null),
      pickable: st.cfg?.pickable !== false,
      parameters: { depthTest: true }
    }, baseProps || {});

    props.updateTriggers = Object.assign({}, coreUpdateTriggers, props.updateTriggers || {});

    const runtimeTransitions = getRuntimeField(st, 'transitions');
    if (runtimeTransitions && typeof runtimeTransitions === 'object') {
      const warmed = {};
      for (const k of Object.keys(runtimeTransitions)) {
        const entry = runtimeTransitions[k];
        const dur = (entry && typeof entry === 'object' && Number.isFinite(entry.duration))
          ? entry.duration
          : (Number.isFinite(entry) ? entry : -1);
        if (dur > 0) {
          warmed[k] = entry;
        } else if (dur === 0) {
          warmed[k] = { duration: 1 };
        }
      }
      if (Object.keys(warmed).length) {
        props.transitions = Object.assign({}, props.transitions || {}, warmed);
      }
    }

    ensurePolygonSubLayerProps(st, props);

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
      if (oc) {
        props.onClick = function(info, event) {
          try {
            if (info && !info.__mfContainer && ctx && ctx.el) info.__mfContainer = ctx.el;
          } catch (_) {}
          return oc(info, event);
        };
      }
    } catch (_) {}

    attachGPUFiltering(props, st);
    if (getRuntimeField(st, 'forceHidden')) props.visible = false;

    return props;
  }

  root.layerProps = {
    composeLayerProps,
    buildUpdateTriggersFromEncodings,
    deckPropsTouchedByEncodingPatch,
    getRuntimeField,
    gpuMeta,
    validateGPUProps,
    attachGPUFiltering
  };
})(window);
