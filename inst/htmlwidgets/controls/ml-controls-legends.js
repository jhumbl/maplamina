(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};
  root.controls.legends = root.controls.legends || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-controls-legends.js");
  }

  const utils = core.require('utils', 'ml-controls-legends.js');
  if (!utils || typeof utils.asArray !== 'function') {
    throw new Error("[maplamina] Missing function utils.asArray required by ml-controls-legends.js");
  }
  if (typeof utils.normText !== 'function') {
    throw new Error("[maplamina] Missing function utils.normText required by ml-controls-legends.js");
  }

  const asArray = utils.asArray;
  const normText = (x) => String(utils.normText(x) ?? '').trim();

  function getControlsRoot(spec) {
    return (spec && spec['.__controls']) || {};
  }

  function getComponentsRoot(spec) {
    return (spec && spec['.__components']) || {};
  }

  function getLegendsBucket(spec) {
    const comps = getComponentsRoot(spec);
    const bucket = comps && comps.legends;
    return (bucket && typeof bucket === 'object') ? bucket : {};
  }

  /**
   * v3 legends renderer (control group).
   * - mountEl: container returned by ml-control-panel.js slot body for a legends control group
   * - widgetEl: the htmlwidgets root element
   * - spec: full spec (x)
   * - groupId: bind id for this control group
   * - controlSpec: the group control spec (authoritative)
   */
  function render(mountEl, widgetEl, spec, groupId, controlSpec) {
    if (!mountEl) return;

    const gid = normText(groupId);
    const controlsRoot = getControlsRoot(spec);
    const ctl = controlSpec || (gid ? controlsRoot[gid] : null);

    if (!ctl || typeof ctl !== 'object') {
      mountEl.textContent = '';
      return;
    }

    const type = normText(ctl.type).toLowerCase();
    if (type && type !== 'legends') {
      mountEl.textContent = '';
      return;
    }

    mountEl.textContent = '';

    const members = asArray(ctl.members).map(normText).filter(Boolean);
    if (!members.length) {
      const msg = document.createElement('div');
      msg.className = 'ml-controls-placeholder';
      msg.textContent = 'No legends available.';
      mountEl.appendChild(msg);
      return;
    }

    const stack = document.createElement('div');
    stack.className = 'ml-legend-stack ml-control-legends-stack';
    mountEl.appendChild(stack);

    // Stage 2.1: stable hook for group-level hide/show (used by ml-legends.applyVisibility).
    try { stack.dataset.mfLegendsGroup = gid; } catch (_) {}

    const bucket = getLegendsBucket(spec);

    // Prefer ml-legends.js card builder so we keep one canonical markup and CSS continues to work.
    const buildCard = (root.legends && typeof root.legends.buildLegendCard === 'function')
      ? root.legends.buildLegendCard
      : null;

    for (const id of members) {
      const comp = (bucket && Object.prototype.hasOwnProperty.call(bucket, id)) ? bucket[id] : null;
      if (!comp || typeof comp !== 'object') continue;

      let node = null;
      if (buildCard) {
        try {
          node = buildCard(comp);
        } catch (e) {
          console.error('[maplamina] legends control failed to build legend card', e);
        }
      }

      // Fallback: minimal card so we never hard-fail rendering.
      if (!node) {
        node = document.createElement('div');
        node.className = 'ml-legend';
        const lid = normText((comp && comp.id != null) ? comp.id : id);
        node.dataset.legendId = lid;
        const lg = (comp && comp.legend && typeof comp.legend === 'object') ? comp.legend : {};
        node.textContent = normText(lg.title || id || 'Legend');
      }

      stack.appendChild(node);
    }

    if (!stack.childNodes.length) {
      const msg = document.createElement('div');
      msg.className = 'ml-controls-placeholder';
      msg.textContent = 'No legends found for this control group.';
      mountEl.appendChild(msg);
    }

    // Stage 2: apply `when` visibility rules on first mount.
    try { root?.legends?.applyVisibility?.(widgetEl, spec); } catch (_) {}
  }

  root.controls.legends.render = render;

  // Register with controls registry (if present)
  try {
    const reg = root.controls && root.controls.registry;
    if (reg && typeof reg.register === 'function') reg.register('legends', render);
  } catch (_) {}
})(window);
