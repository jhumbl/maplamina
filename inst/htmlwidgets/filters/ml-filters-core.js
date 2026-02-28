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

  function seedSelectionSet(ui, bindId, sel) {
    ui[bindId] = ui[bindId] || { select: {}, keepOpen: {} };
    if (!ui[bindId].select[sel.id]) {
      const seed = toArrayDefaultIndices(sel.default_indices || sel.default);
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
