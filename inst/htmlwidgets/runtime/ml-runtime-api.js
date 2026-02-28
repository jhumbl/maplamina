(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-runtime-api.js");
  }

  root.runtime = root.runtime || {};
  root.runtime.api = root.runtime.api || {};
  const utils = core.require('utils', 'ml-runtime-api.js');
  const asArray  = utils.asArray;
  const normText = utils.normText;

  const spec = core.require('spec', 'ml-runtime-api.js');
  const specControls = spec.controls;
  const getControlGroupsByType = specControls.getControlGroupsByType;
  const getControlSpec = specControls.getControlSpec;

  function ensureGroupedState(rt) {
    if (!rt) return {};
    if (!rt.state || typeof rt.state !== 'object') rt.state = {};
    if (!rt.state.filters || typeof rt.state.filters !== 'object') rt.state.filters = {};
    if (!rt.state.views || typeof rt.state.views !== 'object') rt.state.views = {};
    return rt.state;
  }

  


function pickActiveViews(rt, x) {
    const state = ensureGroupedState(rt);
    const groups = getControlGroupsByType(x, 'views');

    // No views controls: reset and return empty map
    if (!groups.length) {
      state.views = {};
      return {};
    }

    // Order is authored order: panel sections first (if present), then insertion order in .__controls.
    // (See spec.controls.getControlGroupsByType).
    const list = groups;

    const out = {};
    for (const g of list) {
      const gid = normText(g.groupId);
      const ctl = g && g.spec;
      if (!gid || !ctl || typeof ctl !== 'object') continue;

      const viewNames = asArray(ctl.view_names).map(normText).filter(Boolean);
      const cur = normText(state.views[gid]);
      if (cur && viewNames.includes(cur)) { out[gid] = cur; continue; }

      const def = normText(ctl.default);
      if (def && viewNames.includes(def)) { state.views[gid] = def; out[gid] = def; continue; }

      const first = viewNames.length ? viewNames[0] : 'base';
      state.views[gid] = first;
      out[gid] = first;
    }
    return out;
  }

  function attachRuntimeMethods(rt) {
    if (!rt || typeof rt !== 'object') return;
    if (rt.__mfApiMethodsAttached) return;
    rt.__mfApiMethodsAttached = true;

    // Milestone 4: views binding (schedule-based; supports multiple bind groups)
    // Signature:
    //   rt.setActiveView(groupId, viewName)
    // Back-compat:
    //   rt.setActiveView(viewName) -> uses the first views group (prefers id 'views')
    rt.setActiveView = function (groupId, newView) {
      const x = this.specRef;
      if (!x) return;

      const deps = (this._mfApiDeps && typeof this._mfApiDeps === 'object') ? this._mfApiDeps : {};
      const computeViewOpsByLayerV3 = (typeof deps.computeViewOpsByLayerV3 === 'function') ? deps.computeViewOpsByLayerV3 : null;

      const groups = getControlGroupsByType(x, 'views');
      if (!groups.length || !computeViewOpsByLayerV3) return;

      let gid = null, vIn = null;
      if (arguments.length === 1) {
        vIn = groupId;
        const pref = groups.find(g => normText(g.groupId) === 'views') || groups[0];
        gid = pref ? normText(pref.groupId) : null;
      } else {
        gid = normText(groupId);
        vIn = newView;
      }
      if (!gid) return;

      const g = groups.find(g => normText(g.groupId) === gid);
      const ctl = g ? g.spec : null;
      if (!ctl || typeof ctl !== 'object') return;

      const viewNames = asArray(ctl.view_names).map(normText).filter(Boolean);
      const v = normText(vIn);
      if (!v || (viewNames.length && !viewNames.includes(v))) return;

      // Ensure defaults for all groups, then set this group
      pickActiveViews(this, x);
      const state = ensureGroupedState(this);

      // Capture previous active view for this group (used to detect props that revert to base when omitted in the next view).
      if (!this._viewsPrev || typeof this._viewsPrev !== 'object') this._viewsPrev = {};
      if (this._viewsPrev[gid] == null) this._viewsPrev[gid] = normText(state.views[gid]) || null;

      state.views[gid] = v;

      const viewOps = computeViewOpsByLayerV3(x, state.views);
      const controlled = (viewOps && viewOps.controlledByGroup && typeof viewOps.controlledByGroup.get === 'function')
        ? viewOps.controlledByGroup.get(gid)
        : null;
      const baseIds = controlled ? Array.from(controlled) : [];
      if (!baseIds.length) return;

      if (typeof this.schedule === 'function') this.schedule({ rehydrate: baseIds, legends: true, reason: 'views' });
    };

    // Milestone 5: filters binding (schedule-based; runtime coalesces updates)
    rt.rebuildLayers = function (layerIds) {
      if (typeof this.schedule === 'function') return this.schedule({ layers: layerIds, reason: 'rebuild' });
    };

    rt.setFilter = function (groupId, label, value) {
      const x = this.specRef;
      if (!x) return;

      const deps = (this._mfApiDeps && typeof this._mfApiDeps === 'object') ? this._mfApiDeps : {};
      const motion = root.runtime && root.runtime.motion ? root.runtime.motion : null;
      const disableRuntimeTransitions = motion && typeof motion.disableRuntimeTransitions === 'function' ? motion.disableRuntimeTransitions : (() => null);

      // Back-compat: rt.setFilter(label, value) uses the default filters group (prefers id 'filters')
      let gid = null, lab = null, val = null;
      if (arguments.length === 2) {
        gid = this._defaultFiltersGroupId || 'filters';
        lab = groupId;
        val = label;
      } else {
        gid = normText(groupId);
        lab = label;
        val = value;
      }

      gid = normText(gid) || this._defaultFiltersGroupId || 'filters';
      lab = normText(lab);
      if (!lab) return;

      // Normalize by declared control type (select vs range) when possible.
      let ctlType = null;
      let ctlDef = null;
      try {
        const gspec = getControlSpec(x, gid);
        if (gspec && normText(gspec.type) === 'filters') {
          const defs = (gspec.controls && typeof gspec.controls === 'object') ? gspec.controls : null;
          if (defs) {
            ctlDef = (defs[lab] && typeof defs[lab] === 'object') ? defs[lab] : null;
            if (!ctlDef) {
              for (const k of Object.keys(defs)) {
                if (normText(k) === lab) { ctlDef = defs[k]; break; }
              }
            }
            ctlType = ctlDef && ctlDef.type ? normText(ctlDef.type) : null;
          }
        }
      } catch (_) {}

      let storeVal = val;

      if (ctlType === 'select') {
        if (storeVal == null || storeVal === '') {
          storeVal = new Set();
        } else if (storeVal instanceof Set) {
          storeVal = new Set(Array.from(storeVal, v => String(v)).filter(v => v.length));
        } else if (Array.isArray(storeVal)) {
          storeVal = new Set(storeVal.map(v => String(v)).filter(v => v.length));
        } else {
          storeVal = new Set([String(storeVal)]);
        }
      } else if (ctlType === 'range') {
        let lo = null, hi = null;
        if (Array.isArray(storeVal) && storeVal.length >= 2) {
          lo = +storeVal[0];
          hi = +storeVal[1];
        } else if (storeVal && typeof storeVal === 'object') {
          if ('min' in storeVal && 'max' in storeVal) { lo = +storeVal.min; hi = +storeVal.max; }
          else if ('lo' in storeVal && 'hi' in storeVal) { lo = +storeVal.lo; hi = +storeVal.hi; }
          else if ('from' in storeVal && 'to' in storeVal) { lo = +storeVal.from; hi = +storeVal.to; }
        } else if (storeVal != null && storeVal !== '') {
          lo = +storeVal;
          hi = +storeVal;
        }

        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
          const d = ctlDef && ctlDef.domain;
          if (d && Number.isFinite(+d.min) && Number.isFinite(+d.max)) {
            lo = +d.min;
            hi = +d.max;
          }
        }
        if (!Number.isFinite(lo)) lo = 0;
        if (!Number.isFinite(hi)) hi = lo;
        if (lo > hi) { const t = lo; lo = hi; hi = t; }
        storeVal = [lo, hi];
      } else {
        // Fallback (unknown type): keep legacy behavior for safety.
        if (storeVal instanceof Set) storeVal = new Set(storeVal);
        else if (Array.isArray(storeVal)) storeVal = storeVal.slice(0, 2);
      }

      const state = ensureGroupedState(this);
      const all = state.filters;
      const fs = (all[gid] && typeof all[gid] === 'object') ? all[gid] : (all[gid] = {});
      fs[lab] = storeVal;

      const idx = this._filterIndex;
      const key = gid + '|' + lab;
      const affected =
        (idx && idx.byKey && idx.byKey.get(key)) ? Array.from(idx.byKey.get(key))
        : (idx && idx.byGroup && idx.byGroup.get(gid)) ? Array.from(idx.byGroup.get(gid))
        : Array.from(this.layers.keys());

      disableRuntimeTransitions(this, affected);
      if (typeof this.schedule === 'function') this.schedule({ layers: affected, reason: 'filters' });
    };

    rt.clearFilters = function (groupId) {
      const x = this.specRef;
      if (!x) return;

      const deps = (this._mfApiDeps && typeof this._mfApiDeps === 'object') ? this._mfApiDeps : {};
      const initFiltersState = (typeof deps.initFiltersState === 'function')
        ? deps.initFiltersState
        : (rt0) => { ensureGroupedState(rt0); return (rt0.state && rt0.state.filters) ? rt0.state.filters : {}; };

      const motion = root.runtime && root.runtime.motion ? root.runtime.motion : null;
      const disableRuntimeTransitions = motion && typeof motion.disableRuntimeTransitions === 'function' ? motion.disableRuntimeTransitions : (() => null);

      // If no group id provided, clear all groups
      if (groupId == null) {
        initFiltersState(this, x);
        const idx = this._filterIndex;
        const allIds = (idx && idx.byLayer) ? Array.from(idx.byLayer.keys()) : Array.from(this.layers.keys());
        disableRuntimeTransitions(this, allIds);
        if (typeof this.schedule === 'function') this.schedule({ layers: allIds, reason: 'filters-clear' });
        return;
      }

      const gid = normText(groupId) || this._defaultFiltersGroupId || 'filters';
      initFiltersState(this, x, gid);

      const idx = this._filterIndex;
      const affected =
        (idx && idx.byGroup && idx.byGroup.get(gid)) ? Array.from(idx.byGroup.get(gid))
        : Array.from(this.layers.keys());

      disableRuntimeTransitions(this, affected);
      if (typeof this.schedule === 'function') this.schedule({ layers: affected, reason: 'filters-clear' });
    };
  }

  function attachPipelineAndScheduler(rt, deps) {
    try {
      const rns = root.runtime || {};
      if (rns.pipeline && typeof rns.pipeline.attach === 'function') rns.pipeline.attach(rt, deps);
      if (rns.scheduler && typeof rns.scheduler.attach === 'function') rns.scheduler.attach(rt);
    } catch (e) {
      try { console.error(e); } catch (_) {}
    }
  }

  function ensureRuntime(el, deps) {
    if (!el) return null;
    const depObj = (deps && typeof deps === 'object') ? deps : {};
    let rt = el.__mfRuntime;

    if (rt) {
      // Refresh deps used by runtime methods (hot reload / re-render safety)
      rt._mfApiDeps = depObj;

      // Refresh buildLayer (widget-scoped; may close over updated map/overlay refs)
      if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

      // Ensure motion stores exist
      try {
        const motion = root.runtime && root.runtime.motion;
        if (motion && typeof motion.attach === 'function') motion.attach(rt);
      } catch (_) {}

      // Ensure pipeline + scheduler are attached (idempotent; pipeline refreshes deps)
      attachPipelineAndScheduler(rt, depObj.pipelineDeps || depObj);

      // Ensure methods exist
      attachRuntimeMethods(rt);
      return rt;
    }

    rt = {
      specRef: null,
      layers: new Map(),
      pruneTasks: new Set(),
      state: {},
      _renderEpoch: 0,
      _mfApiDeps: depObj
    };

    // Ensure motion stores exist
    try {
      const motion = root.runtime && root.runtime.motion;
      if (motion && typeof motion.attach === 'function') motion.attach(rt);
    } catch (_) {}

    // Attach buildLayer implementation (provided by widget via deps.buildLayer)
    if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

    // Attach pipeline + scheduler
    attachPipelineAndScheduler(rt, depObj.pipelineDeps || depObj);

    // Attach methods
    attachRuntimeMethods(rt);

    el.__mfRuntime = rt;
    return rt;
  }

  root.runtime.api.ensureGroupedState = ensureGroupedState;
  root.runtime.api.pickActiveViews = pickActiveViews;
  root.runtime.api.ensureRuntime = ensureRuntime;
})(window);