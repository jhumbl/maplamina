(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-views.js");
  }

  const utils = core.require('utils', 'ml-views.js');
  if (!utils || typeof utils.asArray !== 'function') {
    throw new Error("[maplamina] Missing function utils.asArray required by ml-views.js");
  }
  if (typeof utils.normText !== 'function') {
    throw new Error("[maplamina] Missing function utils.normText required by ml-views.js");
  }

  const asArray = utils.asArray;
  // IMPORTANT: preserve the canonical utils.normText semantics (trim only, no lowercasing).
  // Many ids (layer ids, view ids, component ids) are case-sensitive in the authored spec.
  const normText = utils.normText;

  function inheritAlpha(baseRGBA, newRGBA) {
    if (!Array.isArray(baseRGBA) || baseRGBA.length !== 4) return newRGBA;
    if (!Array.isArray(newRGBA)  || newRGBA.length  !== 4)  return newRGBA;
    const out = newRGBA.slice(); out[3] = baseRGBA[3]; return out;
  }

  // NOTE (v3-only):
  // Legacy per-layer views (st.views / st.active_view) are no longer supported.
  // View patches must arrive via .__components.views + .__controls.views and be applied by the runtime.
  function applyActiveView() {
    throw new Error('[maplamina] applyActiveView() is removed in v3-only mode. Use v3 view components + controls.');
  }


  // v3 helpers ---------------------------------------------------------------
  // Return a plain object whose keys are the union of keys in a and b (objects), or null if none.
  function unionEncodingKeys(a, b) {
    let out = null;
    if (a && typeof a === 'object') {
      out = out || {};
      for (const k of Object.keys(a)) out[k] = 1;
    }
    if (b && typeof b === 'object') {
      out = out || {};
      for (const k of Object.keys(b)) out[k] = 1;
    }
    return out;
  }


  // v3: compute per-layer, per-component view ops from .__controls.views + .__components.views.
  // Returns:
  //   controlledByGroup: Map<groupId, Set<layerId>>
  //   opsByLayer: Map<layerId, Array<op>>
  //   activeByLayer: Map<layerId, activeView> (last group wins deterministically)
  // Where op = { groupId, cid, layerId, activeView, encPatch, motion }
  function computeViewOpsByLayer(spec, activeByGroup) {
    const out = { controlledByGroup: new Map(), opsByLayer: new Map(), activeByLayer: new Map() };

    const specControls = root.spec && root.spec.controls ? root.spec.controls : {};
    const getGroupsByType = specControls.getControlGroupsByType;
    if (typeof getGroupsByType !== 'function') return out;

    const groups = getGroupsByType(spec, 'views');
    if (!groups || !groups.length) return out;

    const comps = (spec && spec['.__components'] && spec['.__components'].views) || {};
    // Order is authored order: panel sections first (if present), then insertion order in .__controls.
    // (See spec.controls.getControlGroupsByType).
    const list = groups;

    for (const g of list) {
      const gid = normText(g.groupId);
      const ctl = g && g.spec;
      if (!gid || !ctl || typeof ctl !== 'object') continue;

      const active = (activeByGroup && activeByGroup[gid]) ? normText(activeByGroup[gid]) : 'base';
      const members = asArray(ctl.members).map(normText).filter(Boolean);

      const controlled = new Set();

      for (const mid of members) {
        const comp = comps && comps[mid];
        const layerId = comp && comp.layer ? normText(comp.layer) : '';
        if (!layerId) continue;

        controlled.add(layerId);

        // Track derived active view per layer (last group wins deterministically by authored group order).
        if (out.activeByLayer.has(layerId)) {
          const prev = out.activeByLayer.get(layerId);
          if (prev && prev !== active) {
            try { console.warn('[maplamina] Layer', layerId, 'is controlled by multiple views groups; last group wins (active:', active, ', prev:', prev, ').'); } catch (_) {}
          }
        }
        out.activeByLayer.set(layerId, active);

        // Keep per-component ops ordered (do not merge patches here).
        const v = comp && comp.views && comp.views[active];
        const enc = v && v.encodings;
        const encPatch = (enc && typeof enc === 'object') ? enc : null;
        const motion = (comp && comp.motion && typeof comp.motion === 'object') ? comp.motion : null;

        const arr = out.opsByLayer.get(layerId) || [];
        arr.push({ groupId: gid, cid: mid, layerId, activeView: active, encPatch, motion });
        out.opsByLayer.set(layerId, arr);
      }

      out.controlledByGroup.set(gid, controlled);
    }

    return out;
  }

  root.views = { applyActiveView, inheritAlpha, unionEncodingKeys, computeViewOpsByLayer };

})(window);
