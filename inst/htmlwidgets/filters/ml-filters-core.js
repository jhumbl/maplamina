(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  const UISTATE = new WeakMap();
  function getElState(el){ let s = UISTATE.get(el); if (!s) { s = {}; UISTATE.set(el, s); } return s; }

  // v3 mounting: callers provide a concrete mount node (panel section body / standalone container)
  // using panelMeta.mountEl. No legacy slot fallback under v3.
  function ensureFiltersContainer(el, bindId, panelMeta) {
    if (panelMeta && panelMeta.mountEl) return panelMeta.mountEl;
    return null;
  }

  function toArrayDefaultIndices(di) {
    if (Array.isArray(di)) return di;
    if (Number.isFinite(di)) return [di];
    return [];
  }

  function resolveDefaultSelection(sel) {
    if (!sel) return [];
    if (sel.default_indices != null) return toArrayDefaultIndices(sel.default_indices);

    const d = sel.default;
    if (Array.isArray(d) && d.every(v => typeof v === 'number' && Number.isFinite(v))) return d.slice();
    if (typeof d === 'number' && Number.isFinite(d)) return [d];

    // v3: defaults are authored as values; map to indices using dict when available
    const dict = Array.isArray(sel.dict) ? sel.dict : [];
    const arr = (d == null) ? [] : (Array.isArray(d) ? d : [d]);
    const out = [];
    for (const v of arr) {
      const s = String(v);
      if (!s.length) continue;
      for (let i = 0; i < dict.length; i++) {
        if (String(dict[i]) === s) { out.push(i); break; }
      }
    }
    return out;
  }

  function seedSelectionSet(ui, bindId, sel) {
    ui[bindId] = ui[bindId] || { select: {}, keepOpen: {} };
    if (!ui[bindId].select[sel.id]) {
      const seed = resolveDefaultSelection(sel);
      ui[bindId].select[sel.id] = new Set(seed);
    }
    return ui[bindId].select[sel.id];
  }

  function publishFilterState(el, bindId) {
    if (window.Shiny && el.id) {
      const ui = getElState(el);
      const perLayer = ui[bindId] && ui[bindId].select ? ui[bindId].select : {};
      const snapshot = {};
      for (const fid of Object.keys(perLayer)) snapshot[fid] = Array.from(perLayer[fid]);
      Shiny.setInputValue(el.id + "_filters", {layer: bindId, ts: Date.now(), state: snapshot}, {priority:"event"});
    }
  }

  root.filterCore = {
    getElState,
    ensureFiltersContainer,
    seedSelectionSet,
    publishFilterState
  };
})(window);
