(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};
  root.controls.views = root.controls.views || {};

  const core = root.core;
  const utils = (core && typeof core.require === 'function')
    ? core.require('utils', 'ml-controls-views.js')
    : root.utils;

  const asArray = utils.asArray;
  const normText = utils.normText;

  function ensureRuntimeState(rt) {
    if (!rt) return null;
    if (!rt.state || typeof rt.state !== 'object') rt.state = {};
    if (!rt.state.views || typeof rt.state.views !== 'object') rt.state.views = {};
    return rt.state;
  }

  function pickInitialActive(rt, controlSpec, groupId) {
    const state = ensureRuntimeState(rt) || {};
    const gid = normText(groupId) || 'views';
    const viewNames = asArray(controlSpec && controlSpec.view_names).map(normText).filter(Boolean);

    const current = normText(state.views && state.views[gid]);
    if (current && viewNames.includes(current)) return current;

    const def = normText(controlSpec && controlSpec.default);
    if (def && viewNames.includes(def)) return def;

    return viewNames.length ? viewNames[0] : 'base';
  }

  function renderRadioList(mountEl, widgetEl, controlSpec, activeView, groupId) {
    mountEl.textContent = '';

    const viewNames = asArray(controlSpec && controlSpec.view_names).map(normText).filter(Boolean);

    if (!viewNames.length) {
      const msg = document.createElement('div');
      msg.className = 'ml-controls-placeholder';
      msg.textContent = 'No views available.';
      mountEl.appendChild(msg);
      return;
    }

    const form = document.createElement('form');
    const name = 'ml-views-radios-' + (widgetEl && widgetEl.id ? widgetEl.id : 'maplamina') + '-' + normText(groupId || 'views');

    for (const vn of viewNames) {
      const row = document.createElement('label');

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = vn;
      input.checked = (vn === activeView);

      input.addEventListener('change', () => {
        if (!input.checked) return;
        const rt = widgetEl && widgetEl.__mfRuntime;

        if (rt && typeof rt.setActiveView === 'function') {
          try { rt.setActiveView(normText(groupId) || 'views', vn); } catch (e) { console.error(e); }
        }
      });

      const span = document.createElement('span');
      span.textContent = vn;

      row.appendChild(input);
      row.appendChild(span);
      form.appendChild(row);
    }

    mountEl.appendChild(form);
  }

  /**
   * v3 views renderer (control group).
   * - mountEl: container returned by ml-control-panel.js slot body for a views control group
   * - widgetEl: the htmlwidgets root element
   * - spec: full spec (x)
   * - groupId: bind id for this control group
   * - controlSpec: the group control spec (authoritative)
   */
  function render(mountEl, widgetEl, spec, groupId, controlSpec) {
    if (!mountEl) return;

    const gid = normText(groupId) || 'views';
    const ctl = controlSpec || (spec && spec['.__controls'] && spec['.__controls'][gid]);
    if (!ctl || typeof ctl !== 'object') { mountEl.textContent = ''; return; }
    if (ctl.type && String(ctl.type) !== 'views') { mountEl.textContent = ''; return; }

    const rt = widgetEl && widgetEl.__mfRuntime;
    const state = ensureRuntimeState(rt);
    const active = pickInitialActive(rt, ctl, gid);
    if (state) {
      if (!state.views || typeof state.views !== 'object') state.views = {};
      state.views[gid] = active;
    }

    renderRadioList(mountEl, widgetEl, ctl, active, gid);
  }

  root.controls.views.render = render;

  // Register with controls registry (if present)
  try {
    const reg = root.controls && root.controls.registry;
    if (reg && typeof reg.register === 'function') reg.register('views', render);
  } catch (_) {}
})(window);
