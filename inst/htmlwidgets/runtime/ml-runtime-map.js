(function (global) {
  'use strict';

  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-runtime-map.js");
  }

  root.runtime = root.runtime || {};
  root.runtime.map = root.runtime.map || {};
  const utils = core.require('utils', 'ml-runtime-map.js');
  const spec  = core.require('spec',  'ml-runtime-map.js');
  const normText        = utils.normText;
  const normPlainObject = spec.normPlainObject;
  const stableStringify = spec.stableStringify;

  // --- MapLibre controls (map_options.controls) ---
  function normMapCorner(pos) {
    const p = normText(pos);
    if (p === 'topleft') return 'top-left';
    if (p === 'topright') return 'top-right';
    if (p === 'bottomleft') return 'bottom-left';
    if (p === 'bottomright') return 'bottom-right';
    if (p) {
      try { console.warn('[maplamina] Invalid map control position:', pos, '— falling back to top-right.'); } catch (_) {}
    }
    return 'top-right';
  }

  function buildMapLibreControl(type, options) {
    const t = normText(type);
    const opts = normPlainObject(options);
    if (!t) return null;

    try {
      if (t === 'navigation') return new maplibregl.NavigationControl(opts);
      if (t === 'scale') return new maplibregl.ScaleControl(opts);
      if (t === 'fullscreen') return new maplibregl.FullscreenControl(opts);
      if (t === 'geolocate') return new maplibregl.GeolocateControl(opts);
    } catch (e) {
      try { console.warn('[maplamina] Failed to create MapLibre control:', t, e); } catch (_) {}
      return null;
    }

    try { console.warn('[maplamina] Unknown map control type:', type, '(skipping)'); } catch (_) {}
    return null;
  }

  root.runtime.map.applyMapLibreControls = function applyMapLibreControls(map, specObj, rt) {
    if (!map || !specObj) return;
    const mo = (specObj.map_options && typeof specObj.map_options === 'object') ? specObj.map_options : {};
    const controls = Array.isArray(mo.controls) ? mo.controls : [];

    if (!rt || typeof rt !== 'object') rt = {};
    if (!rt._maplibreControls || typeof rt._maplibreControls !== 'object') {
      rt._maplibreControls = { byType: {} };
    }
    const byType = rt._maplibreControls.byType || (rt._maplibreControls.byType = {});

    const nextTypes = new Set();

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
          try { console.warn('[maplamina] Failed to add MapLibre control:', type, e); } catch (_) {}
        }
        byType[type] = { instance: inst, sig };
        nextTypes.add(type);
      } else {
        try { delete byType[type]; } catch (_) {}
      }
    }

    for (const t of Object.keys(byType)) {
      if (nextTypes.has(t)) continue;
      const prev = byType[t];
      if (prev && prev.instance) {
        try { map.removeControl(prev.instance); } catch (_) {}
      }
      try { delete byType[t]; } catch (_) {}
    }
  };

  root.runtime.map.clearMapLibreControls = function clearMapLibreControls(map, rt) {
    const bag = rt && rt._maplibreControls && rt._maplibreControls.byType;
    if (!map || !bag || typeof bag !== 'object') return;
    for (const t of Object.keys(bag)) {
      const prev = bag[t];
      if (prev && prev.instance) {
        try { map.removeControl(prev.instance); } catch (_) {}
      }
    }
    try { rt._maplibreControls.byType = {}; } catch (_) {}
  };

  // --- Projection (map_options.projection) ---
  root.runtime.map.normProjection = function normProjection(p) {
    const t = normText(p);
    return (t === 'globe' || t === 'mercator') ? t : 'mercator';
  };

  root.runtime.map.resetProjectionManager = function resetProjectionManager(rt) {
    if (!rt || typeof rt !== 'object') return;
    const pm = rt._projectionMgr;
    if (pm && pm.map && pm.handler && typeof pm.map.off === 'function') {
      try { pm.map.off('style.load', pm.handler); } catch (_) {}
    }
    try { rt._projectionMgr = null; } catch (_) {}
  };

  function applyProjectionFromManager(pm) {
    const m = pm && pm.map;
    const desired = (pm && pm.desired) ? pm.desired : 'mercator';

    if (!m || typeof m.setProjection !== 'function') {
      if (pm && !pm._warnedNoSetProjection) {
        pm._warnedNoSetProjection = true;
        try { console.warn('[maplamina] map.setProjection is not available; falling back to mercator.'); } catch (_) {}
      }
      if (pm && !pm.ready) { pm.ready = true; try { pm.resolve && pm.resolve(); } catch (_) {} }
      return;
    }

    try {
      m.setProjection({ type: desired });
    } catch (e) {
      if (pm && !pm._warnedApplyFail) {
        pm._warnedApplyFail = true;
        try { console.warn('[maplamina] Failed to apply projection:', desired, e); } catch (_) {}
      }
    }

    if (pm && !pm.ready) { pm.ready = true; try { pm.resolve && pm.resolve(); } catch (_) {} }
  }

  root.runtime.map.ensureMapProjection = function ensureMapProjection(map, rt, desired) {
    const d = root.runtime.map.normProjection(desired);
    if (!rt || typeof rt !== 'object') return Promise.resolve();

    let pm = rt._projectionMgr;

    if (!pm || pm.map !== map) {
      if (pm && pm.map && pm.handler && typeof pm.map.off === 'function') {
        try { pm.map.off('style.load', pm.handler); } catch (_) {}
      }

      pm = {
        map,
        desired: d,
        ready: false,
        promise: null,
        resolve: null,
        handler: null,
        _warnedNoSetProjection: false,
        _warnedApplyFail: false
      };

      pm.promise = new Promise((resolve) => { pm.resolve = resolve; });

      pm.handler = () => {
        try { applyProjectionFromManager(pm); } catch (_) {}
      };

      rt._projectionMgr = pm;

      if (map && typeof map.on === 'function') {
        try { map.on('style.load', pm.handler); } catch (_) {}
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
  };

  // --- Map + overlay lifecycle ---
  root.runtime.map.ensureMap = function ensureMap(args) {
    const a = (args && typeof args === 'object') ? args : {};
    const el = a.el;
    const style = a.style;
    const dragRotate = a.dragRotate;
    const initialBbox = a.initialBbox;
    const doFit = a.doFit;
    const hashBbox = (typeof a.hashBbox === 'function') ? a.hashBbox : (() => null);

    let map = a.map || null;
    let lastFitHash = a.lastFitHash || null;

    if (map) {
      if (doFit !== false && initialBbox) {
        const h = hashBbox(initialBbox);
        if (h && h !== lastFitHash) {
          if (map.loaded && !map.loaded()) {
            map.once('styledata', () => map.fitBounds(initialBbox, { padding: 24, duration: 0 }));
          } else {
            map.fitBounds(initialBbox, { padding: 24, duration: 0 });
          }
          lastFitHash = h;
        }
      }
      return { map, lastFitHash };
    }

    const opts = { container: el, style, dragRotate: !!dragRotate };
    if (doFit !== false && initialBbox) {
      opts.bounds = initialBbox;
      opts.fitBoundsOptions = { padding: 24 };
      lastFitHash = hashBbox(initialBbox);
    }
    map = new maplibregl.Map(opts);
    return { map, lastFitHash };
  };

  root.runtime.map.ensureOverlay = function ensureOverlay(args) {
    const a = (args && typeof args === 'object') ? args : {};
    const el = a.el;
    const map = a.map;
    let overlay = a.overlay || null;
    if (overlay) return overlay;

    overlay = new deck.MapboxOverlay({
      layers: [],
      onHover: (info) => {
        info.__mfContainer = el;
        root?.tooltips?.handleHover?.(info);
      },
      getCursor: ({ isDragging, isHovering }) => (isDragging ? 'grabbing' : (isHovering ? 'pointer' : 'auto')),
      onClick: (info) => {
        info.__mfContainer = el;
        root?.tooltips?.handleOverlayClick?.(info);
      }
    });

    if (map && typeof map.addControl === 'function') {
      map.addControl(overlay);
    }

    return overlay;
  };
})(window);
