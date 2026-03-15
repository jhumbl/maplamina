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
  const asArray = utils.asArray;
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

    if (!groups.length) {
      state.views = {};
      return {};
    }

    const out = {};
    for (const g of groups) {
      const gid = normText(g.groupId);
      const ctl = g && g.spec;
      if (!gid || !ctl || typeof ctl !== 'object') continue;

      const viewNames = asArray(ctl.view_names).map(normText).filter(Boolean);
      const cur = normText(state.views[gid]);
      if (cur && viewNames.includes(cur)) { out[gid] = cur; continue; }

      const def = normText(ctl.default);
      if (def && viewNames.includes(def)) {
        state.views[gid] = def;
        out[gid] = def;
        continue;
      }

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

    const assembly = root.runtime && root.runtime.assembly;
    if (!assembly || typeof assembly.getLogicalLayer !== 'function' || typeof assembly.getRenderState !== 'function') {
      throw new Error('[maplamina] Missing MAPLAMINA.runtime.assembly helpers required by ml-runtime-api.js');
    }
    const getLogicalLayer = assembly.getLogicalLayer;
    const getRenderState = assembly.getRenderState;

    rt.getLayerEntry = function(layerId) {
      if (!this || !this.layers || typeof this.layers.get !== 'function') return null;
      const lid = normText(layerId);
      return lid ? (this.layers.get(lid) || null) : null;
    };

    rt.getLogicalLayerState = function(layerId) {
      return getLogicalLayer(this.getLayerEntry(layerId));
    };

    rt.getLastRenderState = function(layerId) {
      return getRenderState(this.getLayerEntry(layerId));
    };

    rt.getLastMotionPolicy = function(layerId) {
      const entry = this.getLayerEntry(layerId);
      return entry && entry.runtime && entry.runtime.lastMotionPolicy ? entry.runtime.lastMotionPolicy : null;
    };

    rt.invalidate = function(opts) {
      if (typeof this.schedule !== 'function') return Promise.resolve();
      return this.schedule((opts && typeof opts === 'object') ? opts : {});
    };

    rt.setActiveView = function(groupId, newView) {
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

      pickActiveViews(this, x);
      const state = ensureGroupedState(this);

      if (!this._viewsPrev || typeof this._viewsPrev !== 'object') this._viewsPrev = {};
      if (this._viewsPrev[gid] == null) this._viewsPrev[gid] = normText(state.views[gid]) || null;

      state.views[gid] = v;

      const viewOps = computeViewOpsByLayerV3(x, state.views);
      const controlled = (viewOps && viewOps.controlledByGroup && typeof viewOps.controlledByGroup.get === 'function')
        ? viewOps.controlledByGroup.get(gid)
        : null;
      const baseIds = controlled ? Array.from(controlled) : [];
      if (!baseIds.length) return;

      if (typeof this.invalidate === 'function') this.invalidate({ rehydrate: baseIds, legends: true, reason: 'views' });
    };

    rt.rebuildLayers = function(layerIds) {
      if (typeof this.invalidate === 'function') return this.invalidate({ layers: layerIds, reason: 'rebuild' });
    };

    rt.setFilter = function(groupId, label, value) {
      const x = this.specRef;
      if (!x) return;

      const motion = root.runtime && root.runtime.motion ? root.runtime.motion : null;
      const disableRuntimeTransitions = motion && typeof motion.disableRuntimeTransitions === 'function'
        ? motion.disableRuntimeTransitions
        : (() => null);

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
        if (storeVal == null || storeVal === '') storeVal = new Set();
        else if (storeVal instanceof Set) storeVal = new Set(Array.from(storeVal, v => String(v)).filter(v => v.length));
        else if (Array.isArray(storeVal)) storeVal = new Set(storeVal.map(v => String(v)).filter(v => v.length));
        else storeVal = new Set([String(storeVal)]);
      } else if (ctlType === 'range') {
        let lo = null, hi = null;
        if (Array.isArray(storeVal) && storeVal.length >= 2) {
          lo = +storeVal[0]; hi = +storeVal[1];
        } else if (storeVal && typeof storeVal === 'object') {
          if ('min' in storeVal && 'max' in storeVal) { lo = +storeVal.min; hi = +storeVal.max; }
          else if ('lo' in storeVal && 'hi' in storeVal) { lo = +storeVal.lo; hi = +storeVal.hi; }
          else if ('from' in storeVal && 'to' in storeVal) { lo = +storeVal.from; hi = +storeVal.to; }
        } else if (storeVal != null && storeVal !== '') {
          lo = +storeVal; hi = +storeVal;
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
      if (typeof this.invalidate === 'function') this.invalidate({ layers: affected, controls: true, reason: 'filters' });
    };

    rt.clearFilters = function(groupId) {
      const x = this.specRef;
      if (!x) return;

      const deps = (this._mfApiDeps && typeof this._mfApiDeps === 'object') ? this._mfApiDeps : {};
      const initFiltersState = (typeof deps.initFiltersState === 'function')
        ? deps.initFiltersState
        : (rt0) => { ensureGroupedState(rt0); return (rt0.state && rt0.state.filters) ? rt0.state.filters : {}; };

      const motion = root.runtime && root.runtime.motion ? root.runtime.motion : null;
      const disableRuntimeTransitions = motion && typeof motion.disableRuntimeTransitions === 'function'
        ? motion.disableRuntimeTransitions
        : (() => null);

      if (groupId == null) {
        initFiltersState(this, x);
        const idx = this._filterIndex;
        const allIds = (idx && idx.byLayer) ? Array.from(idx.byLayer.keys()) : Array.from(this.layers.keys());
        disableRuntimeTransitions(this, allIds);
        if (typeof this.invalidate === 'function') this.invalidate({ layers: allIds, controls: true, reason: 'filters-clear' });
        return;
      }

      const gid = normText(groupId) || this._defaultFiltersGroupId || 'filters';
      initFiltersState(this, x, gid);

      const idx = this._filterIndex;
      const affected =
        (idx && idx.byGroup && idx.byGroup.get(gid)) ? Array.from(idx.byGroup.get(gid))
        : Array.from(this.layers.keys());

      disableRuntimeTransitions(this, affected);
      if (typeof this.invalidate === 'function') this.invalidate({ layers: affected, controls: true, reason: 'filters-clear' });
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
      rt._mfApiDeps = depObj;
      if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

      try {
        const motion = root.runtime && root.runtime.motion;
        if (motion && typeof motion.attach === 'function') motion.attach(rt);
      } catch (_) {}

      attachPipelineAndScheduler(rt, depObj.pipelineDeps || depObj);
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

    try {
      const motion = root.runtime && root.runtime.motion;
      if (motion && typeof motion.attach === 'function') motion.attach(rt);
    } catch (_) {}

    if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

    attachPipelineAndScheduler(rt, depObj.pipelineDeps || depObj);
    attachRuntimeMethods(rt);

    el.__mfRuntime = rt;
    return rt;
  }

  root.runtime.api.ensureGroupedState = ensureGroupedState;
  root.runtime.api.pickActiveViews = pickActiveViews;
  root.runtime.api.ensureRuntime = ensureRuntime;
})(window);
