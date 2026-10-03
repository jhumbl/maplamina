import type { computeViewOpsByLayer } from '../components/views';
import { getControlGroupsByType, getControlSpec } from '../core/spec';
import type { FilterControl, FiltersControl, RangeFilterControl, Spec } from '../core/spec-types';
import { asArray, isArray, isFiniteNumber, normText } from '../core/utils';
import type { FilterValue, FiltersState, RuntimeState, WidgetElement, WidgetRuntime } from '../core/widget';
import type { initFiltersState } from '../filters/runtime';
import { getLogicalLayer, getRenderState } from './assembly';
import * as motion from './motion';
import * as pipeline from './pipeline';
import type { PipelineDeps } from './pipeline';
import * as scheduler from './scheduler';

// What the widget hands to the runtime.
export interface RuntimeDeps {
  buildLayer?: WidgetRuntime['buildLayer'];
  computeViewOpsByLayerV3?: typeof computeViewOpsByLayer;
  initFiltersState?: typeof initFiltersState;
  pipelineDeps?: PipelineDeps;
}

type GroupedState = RuntimeState & { views: Record<string, string>; filters: FiltersState };

function ensureGroupedState(rt: WidgetRuntime | null | undefined): GroupedState {
  if (!rt) return {} as GroupedState;
  if (!rt.state || typeof rt.state !== 'object') rt.state = {};
  if (!rt.state.filters || typeof rt.state.filters !== 'object') rt.state.filters = {};
  if (!rt.state.views || typeof rt.state.views !== 'object') rt.state.views = {};
  return rt.state as GroupedState;
}

export function pickActiveViews(rt: WidgetRuntime | null | undefined, x: Spec): Record<string, string> {
  const state = ensureGroupedState(rt);
  const groups = getControlGroupsByType(x, 'views');

  if (!groups.length) {
    state.views = {};
    return {};
  }

  const out: Record<string, string> = {};
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

function attachRuntimeMethods(rt: WidgetRuntime | null | undefined): void {
  if (!rt || typeof rt !== 'object') return;
  if (rt.__mfApiMethodsAttached) return;
  rt.__mfApiMethodsAttached = true;

  rt.getLayerEntry = function(layerId) {
    if (!this || !this.layers || typeof this.layers.get !== 'function') return null;
    const lid = normText(layerId);
    return lid ? (this.layers.get(lid) || null) : null;
  };

  rt.getLogicalLayerState = function(layerId) {
    return getLogicalLayer(this.getLayerEntry!(layerId));
  };

  rt.getLastRenderState = function(layerId) {
    return getRenderState(this.getLayerEntry!(layerId));
  };

  rt.getLastMotionPolicy = function(layerId) {
    const entry = this.getLayerEntry!(layerId);
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

    let gid: string | null = null, vIn: string | null | undefined = null;
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

  rt.setFilter = function(groupId: string, label: string | Set<string> | number[], value?: Set<string> | number[]) {
    const x = this.specRef;
    if (!x) return;

    const disableRuntimeTransitions = motion.disableRuntimeTransitions;

    let gid: string | null = null, lab: typeof label | null = null, val: unknown = null;
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

    let ctlType: string | null = null;
    let ctlDef: FilterControl | null = null;
    const gspec = getControlSpec(x, gid);
    if (gspec && normText(gspec.type) === 'filters') {
      const group = gspec as FiltersControl;
      const defs = (group.controls && typeof group.controls === 'object') ? group.controls : null;
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

    let storeVal = val;
    if (ctlType === 'select') {
      if (storeVal == null || storeVal === '') storeVal = new Set();
      else if (storeVal instanceof Set) storeVal = new Set(Array.from(storeVal, v => String(v)).filter(v => v.length));
      else if (isArray(storeVal)) storeVal = new Set(storeVal.map(v => String(v)).filter(v => v.length));
      else storeVal = new Set([String(storeVal)]);
    } else if (ctlType === 'range') {
      let lo: number | null = null, hi: number | null = null;
      if (isArray(storeVal) && storeVal.length >= 2) {
        lo = +(storeVal[0] as number); hi = +(storeVal[1] as number);
      } else if (storeVal && typeof storeVal === 'object') {
        const o = storeVal as Record<string, number>;
        if ('min' in o && 'max' in o) { lo = +o.min; hi = +o.max; }
        else if ('lo' in o && 'hi' in o) { lo = +o.lo; hi = +o.hi; }
        else if ('from' in o && 'to' in o) { lo = +o.from; hi = +o.to; }
      } else if (storeVal != null && storeVal !== '') {
        lo = +(storeVal as number); hi = +(storeVal as number);
      }

      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        const d = ctlDef && (ctlDef as RangeFilterControl).domain;
        if (d && Number.isFinite(+d.min) && Number.isFinite(+d.max)) {
          lo = +d.min;
          hi = +d.max;
        }
      }
      if (!isFiniteNumber(lo)) lo = 0;
      if (!isFiniteNumber(hi)) hi = lo;
      if (lo > hi) { const t = lo; lo = hi; hi = t; }
      storeVal = [lo, hi];
    } else {
      if (storeVal instanceof Set) storeVal = new Set(storeVal);
      else if (isArray(storeVal)) storeVal = storeVal.slice(0, 2);
    }

    const state = ensureGroupedState(this);
    const all = state.filters;
    const fs = (all[gid] && typeof all[gid] === 'object') ? all[gid] : (all[gid] = {});
    fs[lab] = storeVal as FilterValue;

    const idx = this._filterIndex;
    const key = gid + '|' + lab;
    const affected =
      (idx && idx.byKey && idx.byKey.get(key)) ? Array.from(idx.byKey.get(key)!)
      : (idx && idx.byGroup && idx.byGroup.get(gid)) ? Array.from(idx.byGroup.get(gid)!)
      : Array.from(this.layers.keys());

    disableRuntimeTransitions(this, affected);
    if (typeof this.invalidate === 'function') this.invalidate({ layers: affected, controls: true, reason: 'filters' });
  };

  rt.clearFilters = function(groupId) {
    const x = this.specRef;
    if (!x) return;

    const deps = (this._mfApiDeps && typeof this._mfApiDeps === 'object') ? this._mfApiDeps : {};
    const initFiltersState: NonNullable<RuntimeDeps['initFiltersState']> = (typeof deps.initFiltersState === 'function')
      ? deps.initFiltersState
      : (rt0) => { ensureGroupedState(rt0); return (rt0!.state && rt0!.state.filters) ? rt0!.state.filters : {}; };

    const disableRuntimeTransitions = motion.disableRuntimeTransitions;

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
      (idx && idx.byGroup && idx.byGroup.get(gid)) ? Array.from(idx.byGroup.get(gid)!)
      : Array.from(this.layers.keys());

    disableRuntimeTransitions(this, affected);
    if (typeof this.invalidate === 'function') this.invalidate({ layers: affected, controls: true, reason: 'filters-clear' });
  };
}

function attachPipelineAndScheduler(rt: WidgetRuntime, deps: PipelineDeps): void {
  try {
    pipeline.attach(rt, deps);
    scheduler.attach(rt);
  } catch (e) {
    console.error(e);
  }
}

export function ensureRuntime(el: WidgetElement | null | undefined, deps?: RuntimeDeps | null): WidgetRuntime | null {
  if (!el) return null;
  const depObj: RuntimeDeps = (deps && typeof deps === 'object') ? deps : {};
  let rt = el.__mfRuntime;

  if (rt) {
    rt._mfApiDeps = depObj;
    if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

    motion.attach(rt);

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

  motion.attach(rt);

  if (typeof depObj.buildLayer === 'function') rt.buildLayer = depObj.buildLayer;

  attachPipelineAndScheduler(rt, depObj.pipelineDeps || depObj);
  attachRuntimeMethods(rt);

  el.__mfRuntime = rt;
  return rt;
}
