(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-spec.js");
  }

  const utils = core.require('utils', 'ml-spec.js');
  const normText = utils.normText;

  // --- bbox utils (abs lon/lat coming from R) ---
  function unionBboxFromSpec(x) {
    const specs = x && x['.__layers'] || {};
    let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const id of Object.keys(specs)) {
      const st0 = specs[id];
      const b = st0 && st0.bbox;

      if (Array.isArray(b) && b.length === 4) {
        const [x0, y0, x1, y1] = b;
        if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1)) {
          if (x0 < minX) minX = x0; if (y0 < minY) minY = y0;
          if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
        }
      } else if (b && typeof b === 'object') {
        const x0 = +b.xmin, y0 = +b.ymin, x1 = +b.xmax, y1 = +b.ymax;
        if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1)) {
          if (x0 < minX) minX = x0; if (y0 < minY) minY = y0;
          if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
        }
      }
    }

    if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      return [[minX, minY], [maxX, maxY]];
    }
    return null;
  }

  function hashBbox(bb) {
    return bb ? (bb[0][0] + ',' + bb[0][1] + ',' + bb[1][0] + ',' + bb[1][1]) : '';
  }

  // --- small object helpers ---
  function normPlainObject(x) {
    return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
  }

  // Stable stringify for small option objects (avoid churn from key ordering).
  function stableStringify(x) {
    if (x == null) return 'null';
    const t = typeof x;
    if (t === 'string') return JSON.stringify(x);
    if (t === 'number') return Number.isFinite(x) ? String(x) : 'null';
    if (t === 'boolean') return x ? 'true' : 'false';
    if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
    if (t === 'object') {
      const keys = Object.keys(x).sort();
      let out = '{';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (i) out += ',';
        out += JSON.stringify(k) + ':' + stableStringify(x[k]);
      }
      out += '}';
      return out;
    }
    // Functions/other types shouldn't appear from R; coerce defensively.
    try { return JSON.stringify(String(x)); } catch (_) { return 'null'; }
  }

  // --- v3 controls helpers ---
  function getControlGroups(x) {
    const c = x && x['.__controls'];
    return (c && typeof c === 'object') ? c : {};
  }

  function getPanelSpec(x) {
    const p = x && x['.__panel'];
    return (p && typeof p === 'object') ? p : null;
  }

  function getPanelSections(x) {
    const p = getPanelSpec(x);
    const s = p && Array.isArray(p.sections) ? p.sections : null;
    return s || [];
  }

  // Controls group ordering contract (v3):
  // 1) If a panel is present, its sections order is authoritative for card order and
  //    is also used as the precedence order for group application (e.g. views).
  // 2) Any remaining groups not referenced by the panel follow insertion order in .__controls.
  function getControlGroupIdsOrdered(x) {
    const groups = getControlGroups(x);
    const ids = [];
    const seen = new Set();

    // Panel order first.
    const sections = getPanelSections(x);
    for (const sec of sections) {
      const gid = normText(sec && sec.id);
      if (!gid || !groups[gid] || seen.has(gid)) continue;
      seen.add(gid);
      ids.push(gid);
    }

    // Then any remaining control groups in insertion order.
    for (const gid of Object.keys(groups)) {
      const id = normText(gid);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }

    return ids;
  }

  function getControlSpec(x, groupId) {
    const gid = normText(groupId);
    if (!gid) return null;
    const groups = getControlGroups(x);
    const spec = groups[gid];
    return (spec && typeof spec === 'object') ? spec : null;
  }

  function getControlGroupsByType(x, type) {
    const want = normText(type);
    if (!want) return [];
    const groups = getControlGroups(x);
    const out = [];
    const order = getControlGroupIdsOrdered(x);
    for (const gid of order) {
      const spec = groups[gid];
      if (!spec || typeof spec !== 'object') continue;
      const t = spec.type ? normText(spec.type) : '';
      if (t === want) out.push({ groupId: gid, spec });
    }
    return out;
  }

  function pickControlGroupByType(x, type, preferId) {
    const list = getControlGroupsByType(x, type);
    if (!list.length) return null;
    const pref = normText(preferId);
    if (pref) {
      const hit = list.find(g => normText(g.groupId) === pref);
      if (hit) return hit;
    }
    return list[0];
  }

  function getViewsControlSpec(x) {
    const g = pickControlGroupByType(x, 'views', 'views');
    return g ? g.spec : null;
  }

  function getFiltersControlGroup(x) {
    return pickControlGroupByType(x, 'filters', 'filters');
  }


  // --- v3 spec assertions (no legacy support) ---
  // Throws if the incoming spec is not in the expected v3 shape.
  function assertV3Spec(x, where) {
    const loc = where ? ` (${where})` : '';
    if (!x || typeof x !== 'object') {
      throw new Error(`[maplamina] v3 spec required${loc}: expected an object`);
    }

    const layers = x['.__layers'];
    if (!layers || typeof layers !== 'object' || Array.isArray(layers)) {
      throw new Error(`[maplamina] v3 spec required${loc}: missing .__layers object`);
    }

    const comps = x['.__components'];
    if (!comps || typeof comps !== 'object' || Array.isArray(comps)) {
      throw new Error(`[maplamina] v3 spec required${loc}: missing .__components object`);
    }

    // Validate known component buckets (if present). In v3, component buckets are plain objects keyed by component id.
    // Note: R may emit unused buckets as NULL (→ null) or omit them entirely; both are valid.
    const knownBuckets = ['views', 'legends', 'select', 'range', 'summaries'];
    for (const k of knownBuckets) {
      if (Object.prototype.hasOwnProperty.call(comps, k)) {
        const b = comps[k];
        if (b == null) continue; // allow null/undefined for unused buckets
        // R may serialize an empty unnamed list() as [] (array). Treat empty arrays as unused buckets.
        if (Array.isArray(b)) {
          if (b.length === 0) continue;
          throw new Error(`[maplamina] v3 spec required${loc}: .__components.${k} must be an object (or empty when unused)`);
        }
        if (typeof b !== 'object') {
          throw new Error(`[maplamina] v3 spec required${loc}: .__components.${k} must be an object (or null when unused)`);
        }
      }
    }

    const ctrls = x['.__controls'];
    if (!ctrls || typeof ctrls !== 'object' || Array.isArray(ctrls)) {
      throw new Error(`[maplamina] v3 spec required${loc}: missing .__controls object`);
    }

    // Validate control group specs.
    for (const gid of Object.keys(ctrls)) {
      const g = ctrls[gid];
      if (!g || typeof g !== 'object') {
        throw new Error(`[maplamina] v3 spec required${loc}: control group "${gid}" is not an object`);
      }
      const t = g.type ? normText(g.type) : '';
      if (!t) {
        throw new Error(`[maplamina] v3 spec required${loc}: control group "${gid}" missing type`);
      }
    }

    // Optional panel validation.
    const panel = x['.__panel'];
    if (panel != null) {
      if (!panel || typeof panel !== 'object' || Array.isArray(panel)) {
        throw new Error(`[maplamina] v3 spec required${loc}: .__panel must be an object`);
      }
      if (panel.sections != null && !Array.isArray(panel.sections)) {
        throw new Error(`[maplamina] v3 spec required${loc}: .__panel.sections must be an array`);
      }
      const sections = Array.isArray(panel.sections) ? panel.sections : [];
      for (const sec of sections) {
        const id = normText(sec && sec.id);
        if (!id) {
          throw new Error(`[maplamina] v3 spec required${loc}: panel section missing id`);
        }
        if (!Object.prototype.hasOwnProperty.call(ctrls, id)) {
          throw new Error(`[maplamina] v3 spec required${loc}: panel section "${id}" has no matching control group in .__controls`);
        }
      }
    }

    // Validate layers + disallow legacy per-layer UI/components fields.
    const legacyKeys = ['views', 'filters', 'panel', 'controls', 'transitions'];
    for (const lid of Object.keys(layers)) {
      const st = layers[lid];
      if (!st || typeof st !== 'object') {
        throw new Error(`[maplamina] v3 spec required${loc}: layer "${lid}" is not an object`);
      }
      const type = st.type ? normText(st.type) : '';
      if (!type) {
        throw new Error(`[maplamina] v3 spec required${loc}: layer "${lid}" missing type`);
      }
      for (const k of legacyKeys) {
        if (Object.prototype.hasOwnProperty.call(st, k)) {
          throw new Error(`[maplamina] v3 spec required${loc}: legacy per-layer field "${k}" found in layer "${lid}"`);
        }
      }
    }

    return true;
  }

  root.spec = {
    unionBboxFromSpec,
    hashBbox,
    normPlainObject,
    stableStringify,
    assertV3Spec,
    controls: {
      getControlGroups,
      getPanelSpec,
      getPanelSections,
      getControlGroupIdsOrdered,
      getControlSpec,
      getControlGroupsByType,
      pickControlGroupByType,
      getViewsControlSpec,
      getFiltersControlGroup
    }
  };
})(window);
