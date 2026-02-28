(function (global) {
  'use strict';

  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-filters-runtime.js");
  }
  const utils = core.require('utils', 'ml-filters-runtime.js');
  const normText = utils.normText;

  // Spec helpers (Stage 1 extraction)
  const spec = core.require('spec', 'ml-filters-runtime.js');
  const specControls = spec.controls;
  const getControlGroupsByType = specControls.getControlGroupsByType;

  const dataMod   = core.require('data',   'ml-filters-runtime.js');
  if (!dataMod || typeof dataMod.getIndexers !== 'function') {
    throw new Error("[maplamina] Missing data.getIndexers; ensure ml-data.js is loaded before ml-filters-runtime.js");
  }
  const assetsMod = core.require('assets', 'ml-filters-runtime.js');

  function ensureFiltersState(rt) {
    if (!rt || typeof rt !== 'object') return { filters: {} };
    if (!rt.state || typeof rt.state !== 'object') rt.state = {};
    if (!rt.state.filters || typeof rt.state.filters !== 'object') rt.state.filters = {};
    return rt.state;
  }




  function initFiltersState(rt, x, onlyGroupId) {
    const state = ensureFiltersState(rt);
    const groups = getControlGroupsByType(x, 'filters');

    // No filters controls -> clear state
    if (!groups.length) {
      state.filters = {};
      if (rt) {
        rt._filtersGroupIds = [];
        rt._defaultFiltersGroupId = null;
      }
      return state.filters;
    }

    // Determine default group (used for backward-compatible rt.setFilter(label, value))
    const pref = groups.find(g => normText(g.groupId) === 'filters') || groups[0];
    if (rt) {
      rt._defaultFiltersGroupId = pref ? normText(pref.groupId) : null;
      rt._filtersGroupIds = groups.map(g => normText(g.groupId)).filter(Boolean);
    }

    const gidOnly = (onlyGroupId != null) ? normText(onlyGroupId) : null;
    const prevAll = (state.filters && typeof state.filters === 'object') ? state.filters : {};
    const nextAll = gidOnly ? Object.assign({}, prevAll) : {};

    // Authored group order: panel sections first (if present), then insertion order in .__controls.
    // (See spec.controls.getControlGroupsByType).
    const list = groups;

    for (const g of list) {
      const gid = normText(g.groupId);
      if (!gid) continue;
      if (gidOnly && gid !== gidOnly) continue;

      const ctl = g && g.spec;
      const prev = (prevAll[gid] && typeof prevAll[gid] === 'object') ? prevAll[gid] : {};
      const next = {};

      if (!ctl || typeof ctl !== 'object') { nextAll[gid] = next; continue; }

      // Respect authored order when provided; otherwise preserve insertion order of keys.
      // Do NOT sort here (sorting breaks UI/author intent for filter declaration order).
      const order = Array.isArray(ctl.order) ? ctl.order.slice() : Object.keys(ctl.controls || {});
      const defs = (ctl.controls && typeof ctl.controls === 'object') ? ctl.controls : {};

      for (const labelRaw of order) {
        const label = normText(labelRaw);
        if (!label) continue;

        const spec = defs[labelRaw] || defs[label];
        if (!spec || typeof spec !== 'object') continue;

        if (spec.type === 'select') {
          const p = prev[label];
          if (p instanceof Set) next[label] = new Set(p);
          else if (Array.isArray(p)) next[label] = new Set(p.map(v => String(v)).filter(v => v.length));
          else if (p != null && p !== '') next[label] = new Set([String(p)]);
          else next[label] = new Set();
        } else if (spec.type === 'range') {
          const p = prev[label];
          let lo = null, hi = null;
          if (Array.isArray(p) && p.length >= 2) {
            lo = +p[0]; hi = +p[1];
          } else if (spec.domain && Number.isFinite(+spec.domain.min) && Number.isFinite(+spec.domain.max)) {
            lo = +spec.domain.min; hi = +spec.domain.max;
          }
          if (!Number.isFinite(lo)) lo = 0;
          if (!Number.isFinite(hi)) hi = lo;
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
          next[label] = [lo, hi];
        }
      }

      nextAll[gid] = next;
    }

    state.filters = nextAll;
    return nextAll;
  }

  function buildFilterIndex(x) {
    const out = { byLayer: new Map(), byKey: new Map(), byGroup: new Map(), groupIds: [] };
    const groups = getControlGroupsByType(x, 'filters');
    if (!groups.length) return out;

    const comps = (x && x['.__components']) || {};
    const selects = comps.select || {};
    const ranges  = comps.range  || {};

    // Authored group order: panel sections first (if present), then insertion order in .__controls.
    // (See spec.controls.getControlGroupsByType).
    const list = groups;

    for (const g of list) {
      const gid = normText(g.groupId);
      const ctl = g && g.spec;
      if (!gid || !ctl || typeof ctl !== 'object') continue;

      out.groupIds.push(gid);

      // Respect authored order when provided; otherwise preserve insertion order of keys.
      // Do NOT sort here (sorting breaks UI/author intent for filter declaration order).
      const order = Array.isArray(ctl.order) ? ctl.order.slice() : Object.keys(ctl.controls || {});
      const defs = (ctl.controls && typeof ctl.controls === 'object') ? ctl.controls : {};

      for (const labelRaw of order) {
        const label = normText(labelRaw);
        if (!label) continue;

        const def = defs[labelRaw] || defs[label];
        if (!def || typeof def !== 'object') continue;

        const members = Array.isArray(def.members) ? def.members : [];
        for (const midRaw of members) {
          const mid = normText(midRaw);
          if (!mid) continue;

          if (def.type === 'select') {
            const comp = selects[mid];
            const layerId = comp && comp.layer ? normText(comp.layer) : '';
            if (!layerId) continue;

            const entry = out.byLayer.get(layerId) || { select: [], range: [] };
            entry.select.push({ groupId: gid, label, id: mid, comp, def });
            out.byLayer.set(layerId, entry);

            const key = gid + '|' + label;
            const s = out.byKey.get(key) || new Set();
            s.add(layerId);
            out.byKey.set(key, s);

            const gs = out.byGroup.get(gid) || new Set();
            gs.add(layerId);
            out.byGroup.set(gid, gs);
          }

          if (def.type === 'range') {
            const comp = ranges[mid];
            const layerId = comp && comp.layer ? normText(comp.layer) : '';
            if (!layerId) continue;

            const entry = out.byLayer.get(layerId) || { select: [], range: [] };
            entry.range.push({ groupId: gid, label, id: mid, comp, def });
            out.byLayer.set(layerId, entry);

            const key = gid + '|' + label;
            const s = out.byKey.get(key) || new Set();
            s.add(layerId);
            out.byKey.set(key, s);

            const gs = out.byGroup.get(gid) || new Set();
            gs.add(layerId);
            out.byGroup.set(gid, gs);
          }
        }
      }
    }

    return out;
  }

  function retOneOrMany(arr) {
    return (Array.isArray(arr) && arr.length === 1) ? arr[0] : arr;
  }

  async function applyGPUFilteringFromControls(st, layerId, x, rt) {
    const idx = rt && rt._filterIndex;
    if (!idx || !idx.byLayer || !idx.byLayer.has(layerId)) {
      // clear any previous gpu filters
      if (st && st.__gpuFiltering) try { delete st.__gpuFiltering; } catch (_) {}
      if (st && st.__gpuMeta)      try { delete st.__gpuMeta; } catch (_) {}
      // clear any previous force-hidden flag (we recompute it per update)
      if (st && st.__forceHidden)  try { delete st.__forceHidden; } catch (_) {}
      return st;
    }

    const entry = idx.byLayer.get(layerId);
    const selDims = (entry && Array.isArray(entry.select)) ? entry.select.slice(0, 4) : [];
    const rngDims = (entry && Array.isArray(entry.range))  ? entry.range.slice(0, 4)  : [];

    const stateAll = (rt && rt.state && rt.state.filters && typeof rt.state.filters === 'object') ? rt.state.filters : {};

    // Canonical indexing helpers (part->row + per-part/per-row array indexing).
    // IMPORTANT: do NOT re-implement feature_index or base detection here; it must be consistent
    // across filters, encodings, tooltips, etc. (see ml-data.js).
    const { pickPartIndex: pickIndex, indexForArray } = dataMod.getIndexers(st);

    const assets = assetsMod;

    const gpu = {};
    // force-hide layers when a non-empty selection has zero overlap with this member's dict
    let forceHidden = false;

    const catArrays = [];
    const catAllowed = [];
    const catNoMatch = [];
    const catDisabled = [];
    const rngArrays = [];
    const rngPairs  = [];

    // --- Select (categorical) dims ---
    for (const dim of selDims) {
      const label = dim.label;
      const def = dim.def || null;
      const comp = dim.comp || {};
      // mergedDict kept for future (debug/UI), even if unused by current runtime
      const mergedDict = (def && Array.isArray(def.dict)) ? def.dict : (Array.isArray(comp.dict) ? comp.dict : []);
      void mergedDict;
      const compDict   = Array.isArray(comp.dict) ? comp.dict : [];

      let res = null;
      try {
        if (typeof assets.resolveRefOrHref === 'function') {
          res = await assets.resolveRefOrHref(st, comp.codes || comp.values);
        }
      } catch (_) { res = null; }
      const codes = res && res.array;

      if (!codes || !ArrayBuffer.isView(codes)) continue;

      const gid = dim.groupId;
      const groupState = (stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
      const sel = groupState[label];
      let allowed = null;
      let noMatch = false;

      let disabled = false;

      let selected = null;
      if (sel instanceof Set && sel.size) selected = new Set(Array.from(sel, v => String(v)));
      else if (Array.isArray(sel) && sel.length) selected = new Set(sel.map(v => String(v)));

      if (selected) {
        allowed = [];
        for (let i = 0; i < compDict.length; i++) {
          if (selected.has(String(compDict[i]))) allowed.push(i);
        }
        if (allowed.length === 0) {
          // Non-empty selection but this member has no overlapping values.
          // Mark layer as force-hidden (deterministic 'match nothing'), but keep GPU filter props
          // stable to avoid deck state churn (filterSize/categorySize changes can corrupt attributes).
          forceHidden = true;

          // Avoid deck.gl crash on empty filterCategories; keep a safe categorical dimension.
          allowed = [0];
          noMatch = true;
        }
      } else {
        // empty selection => dimension disabled (avoid building large allow-lists)
        disabled = true;
        allowed = [0];
      }

      catArrays.push(codes);
      catAllowed.push(allowed);
      catNoMatch.push(!!noMatch);
      catDisabled.push(!!disabled);
    }

    // --- Range (numeric) dims ---
    for (const dim of rngDims) {
      const label = dim.label;
      const comp = dim.comp || {};

      let res = null;
      try {
        if (typeof assets.resolveRefOrHref === 'function') {
          res = await assets.resolveRefOrHref(st, comp.values || comp.codes);
        }
      } catch (_) { res = null; }
      const vals = res && res.array;
      if (!vals || !ArrayBuffer.isView(vals)) continue;

      const gid = dim.groupId;
      const groupState = (stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
      const r = groupState[label];
      let lo = null, hi = null;
      if (Array.isArray(r) && r.length >= 2) { lo = +r[0]; hi = +r[1]; }
      else {
        lo = Number.isFinite(+comp.min) ? +comp.min : (Number.isFinite(+comp.domain?.min) ? +comp.domain.min : 0);
        hi = Number.isFinite(+comp.max) ? +comp.max : (Number.isFinite(+comp.domain?.max) ? +comp.domain.max : lo);
      }
      if (!Number.isFinite(lo)) lo = 0;
      if (!Number.isFinite(hi)) hi = lo;
      if (lo > hi) { const t = lo; lo = hi; hi = t; }

      rngArrays.push(vals);
      rngPairs.push([lo, hi]);
    }

    const categoryDims = catArrays.length;
    const rangeDims = rngArrays.length;
    if (categoryDims === 0 && rangeDims === 0) {
      if (st && st.__gpuFiltering) try { delete st.__gpuFiltering; } catch (_) {}
      if (st && st.__gpuMeta)      try { delete st.__gpuMeta; } catch (_) {}
      return st;
    }

    // Validate dims for filterAdapter (prevents costly introspection on every update)
    st.__gpuMeta = { categoryDims, rangeDims };

    if (categoryDims) {
      gpu.filterCategories = retOneOrMany(catAllowed);
      // Distinguish "disabled (empty selection)" from "enabled, first option".
      // Both states can have filterCategories === [0], but deck.gl only invalidates attributes
      // when updateTriggers change. This key is included in updateTriggers via ml-filters-adapter.
      gpu.__catDisabledKey = retOneOrMany(catDisabled.map(d => d ? 1 : 0));
      const scratchCategory = (categoryDims > 1) ? new Array(categoryDims) : null;
      gpu.getFilterCategory = (d, info) => {
        const partIdx = pickIndex(d, info);
        const p = (partIdx == null ? 0 : partIdx);

        if (categoryDims === 1) {
          // >>> 0 prevents undefined bubbling into deck.gl (it would crash inside _getCategoryKey)
          if (catNoMatch[0]) return 1;
          if (catDisabled[0]) return 0;
          const arr = catArrays[0];
          const ii = indexForArray(arr, p);
          return (arr && (arr[ii] >>> 0)) >>> 0;
        }

        const out = scratchCategory;
        for (let k = 0; k < categoryDims; k++) {
          if (catNoMatch[k]) { out[k] = 1; continue; }
          if (catDisabled[k]) { out[k] = 0; continue; }
          const arr = catArrays[k];
          const ii = indexForArray(arr, p);
          out[k] = (arr && (arr[ii] >>> 0)) >>> 0;
        }
        return out;
      };
    }

    if (rangeDims) {
      gpu.filterRange = retOneOrMany(rngPairs);
      const scratchRange = (rangeDims > 1) ? new Array(rangeDims) : null;
      gpu.getFilterValue = (d, info) => {
        const partIdx = pickIndex(d, info);
        const p = (partIdx == null ? 0 : partIdx);

        if (rangeDims === 1) {
          const arr = rngArrays[0];
          const ii = indexForArray(arr, p);
          const v = arr ? arr[ii] : 0;
          return Number.isFinite(v) ? v : 0;
        }

        const out = scratchRange;
        for (let k = 0; k < rangeDims; k++) {
          const arr = rngArrays[k];
          const ii = indexForArray(arr, p);
          const v = arr ? arr[ii] : 0;
          out[k] = Number.isFinite(v) ? v : 0;
        }
        return out;
      };
    }

    // force-hidden flag (consumed by ml-layer-props to set visible=false)
    if (forceHidden) {
      st.__forceHidden = true;
    } else {
      if (st && st.__forceHidden) try { delete st.__forceHidden; } catch (_) {}
    }

    st.__gpuFiltering = gpu;
    return st;
  }

  root.filtersRuntime = Object.assign(root.filtersRuntime || {}, {
    initFiltersState,
    buildFilterIndex,
    applyGPUFilteringFromControls
  });
})(window);
