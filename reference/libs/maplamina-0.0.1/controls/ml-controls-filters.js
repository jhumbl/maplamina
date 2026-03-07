// --- v3 global controls adapter --------------------------------------------
// Keeps existing filter UI rendering (ml-filters-select/range) intact, but mounts
// the merged bind-group controls from .__controls.filters into a provided mount.
(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};
  root.controls.filters = root.controls.filters || {};

  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-controls-filters.js");
  }

  const utils = core.require('utils', 'ml-controls-filters.js');
  const normText = utils.normText;
  const domKey = utils.domKey;
  if (typeof domKey !== 'function') {
    throw new Error("[maplamina] Missing function utils.domKey required by ml-controls-filters.js");
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function render(mountEl, el, x, groupId, controlSpec) {
    if (!mountEl || !el) return;

    const gid = (groupId != null) ? String(groupId) : 'filters';

    const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
    if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'filters') { clearNode(mountEl); return; }

    const defs = (ctl.controls && typeof ctl.controls === 'object') ? ctl.controls : {};

    // Respect authored order from the compiled spec:
    //   - primary: ctl.order (explicit authored order)
    //   - fallback: preserve insertion order of defs keys (do NOT sort)

    const keys = Object.keys(defs);
    const byNorm = new Map();
    for (const k of keys) byNorm.set(normText(k), k);

    const orderRaw = Array.isArray(ctl.order) ? ctl.order : null;
    const seen = new Set();
    const order = [];
    const push = (k) => {
      if (!k) return;
      if (seen.has(k)) return;
      if (!Object.prototype.hasOwnProperty.call(defs, k)) return;
      seen.add(k);
      order.push(k);
    };

    if (orderRaw && orderRaw.length) {
      for (const raw of orderRaw) {
        const s = String(raw == null ? '' : raw);
        push(Object.prototype.hasOwnProperty.call(defs, s) ? s : byNorm.get(normText(s)));
      }
    }

    // Append any controls not present in ctl.order in their natural insertion order.
    for (const k of keys) push(k);

    clearNode(mountEl);

    // Use a dedicated inner wrapper so the existing filter UI (which assumes it
    // can append controls into a container) can mount cleanly.
    const box = document.createElement('div');
    box.className = 'ml-filters';
    mountEl.appendChild(box);

    // panelMeta.mountEl is honored by ml-filters-core.js::ensureFiltersContainer
    const panelMeta = { mountEl: box };

    const filterCore = core.require('filterCore', 'ml-controls-filters.js');

    const getElState = filterCore && filterCore.getElState;
    if (typeof getElState !== 'function') {
      throw new Error("[maplamina] Missing function filterCore.getElState required by ml-controls-filters.js");
    }

    const ui = getElState(el);

    const rt = el.__mfRuntime;
    const bindId = gid;

    if (ui) {
      ui[bindId] = ui[bindId] || { select: {}, range: {}, keepOpen: {} };

      // Seed UI state from runtime (so rerenders preserve selection)
      const stAll = rt && rt.state && rt.state.filters ? rt.state.filters : {};
      const st = (stAll && stAll[bindId] && typeof stAll[bindId] === 'object') ? stAll[bindId] : {};
      for (const label of order) {
        const spec = defs[label];
        if (!spec || typeof spec !== 'object') continue;

        if (spec.type === 'select' && st[label] instanceof Set) {
          // UI widgets store selected *indices* into dict; runtime stores selected *values*.
          const dict = (spec.dict && Array.isArray(spec.dict)) ? spec.dict : (Array.isArray(spec.domain) ? spec.domain : []);
          const idx = new Set();
          for (const v of st[label]) {
            const sv = String(v);
            for (let i = 0; i < dict.length; i++) {
              if (String(dict[i]) === sv) { idx.add(i); break; }
            }
          }
          ui[bindId].select[label] = idx;
        }
        if (spec.type === 'range' && Array.isArray(st[label]) && st[label].length >= 2) {
          ui[bindId].range[label] = st[label].slice(0, 2);
        }
      }
    }

    const syncLabelToRuntime = (label) => {
      if (!rt || typeof rt.setFilter !== 'function') return;
      const spec = defs[label];
      if (!spec || typeof spec !== 'object') return;

      if (spec.type === 'select') {
        const set = ui && ui[bindId] && ui[bindId].select ? ui[bindId].select[label] : null;

        // UI widgets store indices into the merged dict; runtime expects selected values.
        const dict = (spec.dict && Array.isArray(spec.dict)) ? spec.dict : (Array.isArray(spec.domain) ? spec.domain : []);
        let out = new Set();

        if (set instanceof Set && set.size) {
          const arr = Array.from(set);
          const allInt = arr.every(v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < dict.length);
          if (allInt && dict.length) {
            for (const i of arr) {
              const v = dict[i];
              if (v !== undefined) out.add(String(v));
            }
          } else {
            // Treat as already-values (fallback)
            for (const v of arr) out.add(String(v));
          }
        }

        rt.setFilter(bindId, label, out);
      } else if (spec.type === 'range') {
        const vals = ui && ui[bindId] && ui[bindId].range ? ui[bindId].range[label] : null;
        if (Array.isArray(vals) && vals.length >= 2) rt.setFilter(bindId, label, vals.slice(0, 2));
      }
    };

    // Render each merged label-control using the existing per-control UI.
    for (const label of order) {
      const spec0 = defs[label];
      if (!spec0 || typeof spec0 !== 'object') continue;

      if (spec0.type === 'select') {
        const spec = Object.assign({}, spec0, {
          id: label,
          dom_id: domKey(label),
          label: spec0.label || label
        });
        // onChange: only sync this label
        root.filters?.ensureFilterUI?.(el, bindId, spec, () => syncLabelToRuntime(label), panelMeta);
      }

      if (spec0.type === 'range') {
        const domain = spec0.domain || {};
        const spec = Object.assign({}, spec0, {
          id: label,
          dom_id: domKey(label),
          label: spec0.label || label,
          min: Number.isFinite(+spec0.min) ? +spec0.min : +domain.min,
          max: Number.isFinite(+spec0.max) ? +spec0.max : +domain.max,
          // v3 expects batching; runtime scheduler coalesces overlay updates, so UI can emit live changes directly.
          live: (spec0.live !== false)
        });
        root.filters?.ensureFilterUI?.(el, bindId, spec, () => syncLabelToRuntime(label), panelMeta);
      }
    }
  }

  root.controls.filters.render = render;

  // Register with controls registry (if present)
  try {
    const reg = root.controls && root.controls.registry;
    if (reg && typeof reg.register === 'function') reg.register('filters', render);
  } catch (_) {}
})(window);
