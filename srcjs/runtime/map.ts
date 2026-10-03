import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  FullscreenControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl
} from 'maplibre-gl';
import type { ControlPosition, FitBoundsOptions, IControl, MapOptions } from 'maplibre-gl';
import { handleHover, handleOverlayClick } from '../components/tooltips';
import type { WidgetPickingInfo } from '../components/tooltips';
import { normPlainObject, stableStringify } from '../core/spec';
import type { Bounds } from '../core/spec';
import type { Spec } from '../core/spec-types';
import { isArray, normText, widgetKey } from '../core/utils';
import type { WidgetElement, WidgetRuntime } from '../core/widget';

type Projection = 'mercator' | 'globe';

// The MapLibre controls the widget added, by type, each with the signature it was built from.
export interface MapLibreControls {
  byType: Record<string, { instance: IControl; sig: string }>;
}

export interface ProjectionManager {
  map: MapLibreMap | null;
  desired: Projection;
  ready: boolean;
  promise: Promise<void> | null;
  resolve: (() => void) | null;
  handler: (() => void) | null;
  _warnedNoSetProjection: boolean;
  _warnedApplyFail: boolean;
}

// A fit that waits for the element to have a size.
export interface DeferredFitManager {
  ro: ResizeObserver | null;
  pendingBbox: Bounds | null;
  pendingDoFit: boolean | null | undefined;
  pendingHash: string | null;
  // The last bbox hash a deferred fit applied, so later renders do not fit again.
  appliedHash: string | null;
  _timer: ReturnType<typeof setTimeout> | null;
  warnNoRO: boolean;
}

export interface EnsureMapOptions {
  el: WidgetElement;
  style?: string;
  dragRotate?: boolean;
  initialBbox?: Bounds | null;
  doFit?: boolean;
  rt?: WidgetRuntime | null;
  hashBbox?: (bb: Bounds | null | undefined) => string | null;
  map?: MapLibreMap | null;
  lastFitHash?: string | null;
}

export interface EnsureOverlayOptions {
  el: WidgetElement;
  map?: MapLibreMap | null;
  overlay?: MapboxOverlay | null;
}

// --- MapLibre controls (map_options.controls) ---
function normMapCorner(pos: unknown): ControlPosition {
  const p = normText(pos);
  if (p === 'topleft') return 'top-left';
  if (p === 'topright') return 'top-right';
  if (p === 'bottomleft') return 'bottom-left';
  if (p === 'bottomright') return 'bottom-right';
  if (p) {
    console.warn('[maplamina] Invalid map control position:', pos, '— falling back to top-right.');
  }
  return 'top-right';
}

function buildMapLibreControl(type: unknown, options: unknown): IControl | null {
  const t = normText(type);
  const opts = normPlainObject(options);
  if (!t) return null;

  try {
    if (t === 'navigation') return new NavigationControl(opts);
    if (t === 'scale') return new ScaleControl(opts);
    if (t === 'fullscreen') return new FullscreenControl(opts);
    if (t === 'geolocate') return new GeolocateControl(opts);
  } catch (e) {
    console.warn('[maplamina] Failed to create MapLibre control:', t, e);
    return null;
  }

  console.warn('[maplamina] Unknown map control type:', type, '(skipping)');
  return null;
}

export function applyMapLibreControls(
  map: MapLibreMap | null | undefined,
  specObj: Spec | null | undefined,
  rt: WidgetRuntime | null | undefined
): void {
  if (!map || !specObj) return;
  const mo: Partial<Spec['map_options']> = (specObj.map_options && typeof specObj.map_options === 'object') ? specObj.map_options : {};
  const controls = isArray(mo.controls) ? mo.controls : [];

  if (!rt || typeof rt !== 'object') rt = {} as WidgetRuntime;
  if (!rt._maplibreControls || typeof rt._maplibreControls !== 'object') {
    rt._maplibreControls = { byType: {} };
  }
  const byType = rt._maplibreControls.byType || (rt._maplibreControls.byType = {});

  const nextTypes = new Set<string>();

  for (const raw of controls) {
    const c = (raw && typeof raw === 'object') ? raw : null;
    if (!c) continue;

    const type = normText(c.type);
    if (!type) continue;

    const position = normMapCorner(c.position);
    const options = normPlainObject(c.options);

    const sig = type + '|' + position + '|' + stableStringify(options);
    const prev = byType[type];

    // Duplicate types can occur; "last wins".
    if (prev && prev.sig === sig && prev.instance) {
      nextTypes.add(type);
      continue;
    }

    if (prev && prev.instance) {
      try { map.removeControl(prev.instance); } catch (_) {}
    }

    const inst = buildMapLibreControl(type, options);
    if (inst) {
      try { map.addControl(inst, position); } catch (e) {
        console.warn('[maplamina] Failed to add MapLibre control:', type, e);
      }
      byType[type] = { instance: inst, sig };
      nextTypes.add(type);
    } else {
      delete byType[type];
    }
  }

  for (const t of Object.keys(byType)) {
    if (nextTypes.has(t)) continue;
    const prev = byType[t];
    if (prev && prev.instance) {
      try { map.removeControl(prev.instance); } catch (_) {}
    }
    delete byType[t];
  }
}

export function clearMapLibreControls(
  map: MapLibreMap | null | undefined,
  rt: WidgetRuntime | null | undefined
): void {
  const bag = rt && rt._maplibreControls && rt._maplibreControls.byType;
  if (!map || !bag || typeof bag !== 'object') return;
  for (const t of Object.keys(bag)) {
    const prev = bag[t];
    if (prev && prev.instance) {
      try { map.removeControl(prev.instance); } catch (_) {}
    }
  }
  rt._maplibreControls!.byType = {};
}

// --- Projection (map_options.projection) ---
export function normProjection(p: unknown): Projection {
  const t = normText(p);
  return (t === 'globe' || t === 'mercator') ? t : 'mercator';
}

export function resetProjectionManager(rt: WidgetRuntime | null | undefined): void {
  if (!rt || typeof rt !== 'object') return;
  const pm = rt._projectionMgr;
  if (pm && pm.map && pm.handler && typeof pm.map.off === 'function') {
    try { pm.map.off('style.load', pm.handler); } catch (_) {}
  }
  rt._projectionMgr = null;
}

function applyProjectionFromManager(pm: ProjectionManager | null | undefined): void {
  const m = pm && pm.map;
  const desired = (pm && pm.desired) ? pm.desired : 'mercator';

  if (!m || typeof m.setProjection !== 'function') {
    if (pm && !pm._warnedNoSetProjection) {
      pm._warnedNoSetProjection = true;
      console.warn('[maplamina] map.setProjection is not available; falling back to mercator.');
    }
    if (pm && !pm.ready) { pm.ready = true; pm.resolve && pm.resolve(); }
    return;
  }

  try {
    m.setProjection({ type: desired });
  } catch (e) {
    if (pm && !pm._warnedApplyFail) {
      pm._warnedApplyFail = true;
      console.warn('[maplamina] Failed to apply projection:', desired, e);
    }
  }

  if (pm && !pm.ready) { pm.ready = true; pm.resolve && pm.resolve(); }
}

export function ensureMapProjection(
  map: MapLibreMap | null,
  rt: WidgetRuntime | null | undefined,
  desired: unknown
): Promise<void> {
  const d = normProjection(desired);
  if (!rt || typeof rt !== 'object') return Promise.resolve();

  let pm = rt._projectionMgr;

  if (!pm || pm.map !== map) {
    if (pm && pm.map && pm.handler && typeof pm.map.off === 'function') {
      try { pm.map.off('style.load', pm.handler); } catch (_) {}
    }

    const next: ProjectionManager = pm = {
      map,
      desired: d,
      ready: false,
      promise: null,
      resolve: null,
      handler: null,
      _warnedNoSetProjection: false,
      _warnedApplyFail: false
    };

    next.promise = new Promise((resolve) => { next.resolve = resolve; });

    next.handler = () => {
      applyProjectionFromManager(next);
    };

    rt._projectionMgr = next;

    if (map && typeof map.on === 'function') {
      try { map.on('style.load', next.handler); } catch (_) {}
    }
  } else {
    pm.desired = d;
  }

  try {
    const styleLoaded =
      (map && typeof map.isStyleLoaded === 'function') ? map.isStyleLoaded()
      : (map && typeof map.loaded === 'function') ? map.loaded()
      : false;
    if (styleLoaded) applyProjectionFromManager(pm);
  } catch (_) {}

  return pm.promise || Promise.resolve();
}

// --- Map + overlay lifecycle ---
function elHasSize(el: HTMLElement | null | undefined): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return true;
  const r = el.getBoundingClientRect();
  return !!(r && r.width > 2 && r.height > 2);
}

// Attempt to apply fitBounds immediately.
//
// In hidden/tabbed layouts (Quarto dashboards, Shiny tabsets, etc.) the style can
// finish loading while the container is still 0x0. If we defer fitBounds via style
// events and then clear our "pending" bbox, we can get stuck at the default world
// view because the deferred callback never runs.
//
// Strategy: try fitBounds now; if it throws, we keep the pending bbox and retry via
// ResizeObserver/polling when the element is visible and the map is ready.
function safeFitBoundsNow(
  map: MapLibreMap | null | undefined,
  bbox: Bounds | null | undefined,
  options?: FitBoundsOptions | null
): boolean {
  if (!map || !bbox) return false;
  const opts = options || { padding: 24, duration: 0 };
  try {
    if (map && typeof map.fitBounds === 'function') {
      map.fitBounds(bbox, opts);
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

// The manager lives on the runtime, or on the element when there is no runtime.
type DeferredFitHost = { _mfDeferredFitMgr?: DeferredFitManager };

function peekDeferredFitMgr(
  el: WidgetElement | null | undefined,
  rt: WidgetRuntime | null | undefined
): DeferredFitManager | null {
  const host: DeferredFitHost | null | undefined = (rt && typeof rt === 'object') ? rt : el;
  if (!host || typeof host !== 'object') return null;
  const mgr = host._mfDeferredFitMgr;
  return (mgr && typeof mgr === 'object') ? mgr : null;
}

function getDeferredFitMgr(
  el: WidgetElement | null | undefined,
  rt: WidgetRuntime | null | undefined
): DeferredFitManager | null {
  const host: DeferredFitHost | null | undefined = (rt && typeof rt === 'object') ? rt : el;
  if (!host || typeof host !== 'object') return null;

  let mgr = host._mfDeferredFitMgr;
  if (!mgr || typeof mgr !== 'object') {
    mgr = { ro: null, pendingBbox: null, pendingDoFit: null, pendingHash: null, appliedHash: null, _timer: null, warnNoRO: false };
    host._mfDeferredFitMgr = mgr;
  }
  return mgr;
}

function armDeferredFit(
  el: WidgetElement,
  map: MapLibreMap | null,
  rt: WidgetRuntime | null | undefined,
  bbox: Bounds,
  doFit: boolean | undefined,
  hash: string | null,
  options: FitBoundsOptions
): void {
  const mgr = getDeferredFitMgr(el, rt);
  if (!mgr) return;

  mgr.pendingBbox = bbox;
  mgr.pendingDoFit = doFit;
  mgr.pendingHash = hash;

  const attempt = (): void => {
    if (!mgr.pendingBbox || mgr.pendingDoFit === false) return;
    if (!elHasSize(el)) return;

    const ph = mgr.pendingHash;
    try { map && typeof map.resize === 'function' && map.resize(); } catch (_) {}
    const ok = safeFitBoundsNow(map, mgr.pendingBbox, options);

    // Only clear the pending bbox if fitBounds was actually applied.
    // If the call failed (threw), keep pending and allow retries.
    if (ok) {
      mgr.appliedHash = ph || mgr.appliedHash;
      mgr.pendingBbox = null;
      mgr.pendingDoFit = null;
      mgr.pendingHash = null;

      if (mgr.ro) { mgr.ro.disconnect(); mgr.ro = null; }
      if (mgr._timer) { clearTimeout(mgr._timer); mgr._timer = null; }
    }
  };

  // If already armed, just re-attempt (pending bbox may have changed)
  if (mgr.ro || mgr._timer) {
    attempt();
    return;
  }

  if (typeof ResizeObserver === 'function') {
    try {
      mgr.ro = new ResizeObserver(() => { attempt(); });
      mgr.ro.observe(el);
    } catch (_) {
      mgr.ro = null;
    }
    // Some tabbed-layout hosts (e.g. Quarto dashboards) may not reliably emit
    // ResizeObserver notifications on show/hide transitions. Add a lightweight
    // polling fallback even when ResizeObserver exists.
    const poll = (): void => {
      mgr._timer = null;
      attempt();
      if (mgr.pendingBbox && mgr.pendingDoFit !== false) {
        mgr._timer = setTimeout(poll, 120);
      }
    };
    if (!mgr._timer) mgr._timer = setTimeout(poll, 120);
    attempt();
    return;
  }

  // Fallback poll when ResizeObserver isn't available.
  if (!mgr.warnNoRO) {
    mgr.warnNoRO = true;
    console.warn('[maplamina] ResizeObserver unavailable; using polling to apply fitBounds.');
  }

  const poll = (): void => {
    mgr._timer = null;
    attempt();
    if (mgr.pendingBbox && mgr.pendingDoFit !== false) {
      mgr._timer = setTimeout(poll, 120);
    }
  };
  poll();
}

export function clearDeferredFit(
  rt: WidgetRuntime | null | undefined,
  el: WidgetElement | null | undefined
): void {
  const mgr = peekDeferredFitMgr(el, rt);
  if (!mgr) return;
  if (mgr.ro) { mgr.ro.disconnect(); mgr.ro = null; }
  if (mgr._timer) { clearTimeout(mgr._timer); mgr._timer = null; }
  mgr.pendingBbox = null;
  mgr.pendingDoFit = null;
  mgr.pendingHash = null;
}

export function ensureMap(args: EnsureMapOptions): { map: MapLibreMap; lastFitHash: string | null } {
  const a = ((args && typeof args === 'object') ? args : {}) as EnsureMapOptions;
  const el = a.el;
  const style = a.style;
  const dragRotate = a.dragRotate;
  const initialBbox = a.initialBbox;
  const doFit = a.doFit;
  const rt = a.rt;
  const hashBbox = (typeof a.hashBbox === 'function') ? a.hashBbox : (() => null);

  let map = a.map || null;
  let lastFitHash = a.lastFitHash || null;

  // If a deferred fit already ran, treat that as the effective last-fit hash.
  const mgr = peekDeferredFitMgr(el, rt);
  if (mgr && mgr.appliedHash && !lastFitHash) lastFitHash = mgr.appliedHash;

  if (map) {
    if (doFit !== false && initialBbox) {
      const h = hashBbox(initialBbox);
      if (h && h !== lastFitHash) {
        if (elHasSize(el)) {
          const ok = safeFitBoundsNow(map, initialBbox, { padding: 24, duration: 0 });
          if (ok) lastFitHash = h;
          else armDeferredFit(el, map, rt, initialBbox, doFit, h, { padding: 24, duration: 0 });
        } else {
          // Do NOT advance lastFitHash here: the fit has not been applied yet.
          // This avoids a situation where future renders skip the fit and the
          // map remains at the default world view.
          armDeferredFit(el, map, rt, initialBbox, doFit, h, { padding: 24, duration: 0 });
        }
      }
    }
    return { map, lastFitHash };
  }

  const opts: MapOptions = { container: el, style, dragRotate: !!dragRotate };

  const sized = elHasSize(el);
  let initHash: string | null = null;
  if (doFit !== false && initialBbox) {
    initHash = hashBbox(initialBbox);

    // Applying bounds while the container is hidden (e.g. Quarto dashboard pages/tabs)
    // can result in an incorrect initial zoom. Defer the fit until we have a real size.
    if (sized) {
      opts.bounds = initialBbox;
      opts.fitBoundsOptions = { padding: 24 };
      lastFitHash = initHash;
    }
  }

  map = new MapLibreMap(opts);

  if (doFit !== false && initialBbox && !sized) {
    // Defer the fit; do NOT advance lastFitHash yet (fit not applied).
    armDeferredFit(el, map, rt, initialBbox, doFit, initHash, { padding: 24, duration: 0 });
  }

  return { map, lastFitHash };
}

export function ensureOverlay(args: EnsureOverlayOptions): MapboxOverlay {
  const a = ((args && typeof args === 'object') ? args : {}) as EnsureOverlayOptions;
  const el = a.el;
  const map = a.map;
  let overlay = a.overlay || null;
  if (overlay) return overlay;

  overlay = new MapboxOverlay({
    id: `deckgl-overlay-${widgetKey(el)}`,
    layers: [],
    onHover: (info: WidgetPickingInfo) => {
      info.__mfContainer = el;
      handleHover(info);
    },
    getCursor: ({ isDragging, isHovering }) => (isDragging ? 'grabbing' : (isHovering ? 'pointer' : 'auto')),
    onClick: (info: WidgetPickingInfo) => {
      info.__mfContainer = el;
      handleOverlayClick(info);
    }
  });

  if (map && typeof map.addControl === 'function') {
    map.addControl(overlay);
  }

  return overlay;
}
