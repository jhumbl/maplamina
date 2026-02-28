(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};

  const normText = root.utils.normText;
  const safeId = root.utils.safeId;

  function ensureTitleRow(panelEl, titleText) {
    let titleEl = panelEl.querySelector('.ml-panel-title');
    if (!titleEl) {
      titleEl = document.createElement('div');
      titleEl.className = 'ml-panel-title';
      panelEl.insertBefore(titleEl, panelEl.firstChild);
    }

    let tspan = titleEl.querySelector('.ml-panel-title-text');
    if (!tspan) {
      const existingText = (titleEl.textContent || '').trim();
      titleEl.textContent = '';
      tspan = document.createElement('span');
      tspan.className = 'ml-panel-title-text';
      tspan.textContent = existingText;
      titleEl.appendChild(tspan);
    }

    tspan.textContent = normText(titleText);
    return titleEl;
  }

function ensureTitleIconLink(panelEl, panelSpec) {
  if (!panelEl || !panelSpec) return;

  // NOTE (v3): panelSpec.icon is the only supported input.
  // It is expected to be a URL string (or a depUrl() object) and we use it as:
  //  - <img src="..."> for the icon image
  //  - <a href="..."> to make it clickable

  // Prefer depUrl because it normalizes common object shapes: {href}, {data}, etc.
  const depUrl = (root.assets && typeof root.assets.depUrl === 'function')
    ? root.assets.depUrl
    : (x => x);

  const resolveStr = (v) => {
    const out = depUrl(v);
    return (typeof out === 'string') ? out.trim() : '';
  };

  const iconUrl = resolveStr(panelSpec.icon);
  const titleEl = panelEl.querySelector('.ml-panel-title');
  if (!titleEl) return;

  // If no icon URL, remove any previously created elements.
  if (!iconUrl) {
    const existingLink = titleEl.querySelector('.ml-panel-title-link');
    if (existingLink) { try { existingLink.remove(); } catch (_) {} }
    const strayIcon = titleEl.querySelector('.ml-panel-icon');
    if (strayIcon && (!strayIcon.closest || !strayIcon.closest('.ml-panel-title-link'))) {
      try { strayIcon.remove(); } catch (_) {}
    }
    return;
  }

  // Ensure link exists and sits before title text.
  let linkEl = titleEl.querySelector('.ml-panel-title-link');
  if (!linkEl) {
    linkEl = document.createElement('a');
    linkEl.className = 'ml-panel-title-link';
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.setAttribute('aria-label', 'Open icon link');

    const tspan = titleEl.querySelector('.ml-panel-title-text');
    if (tspan) titleEl.insertBefore(linkEl, tspan);
    else titleEl.insertBefore(linkEl, titleEl.firstChild);
  }

  // Use iconUrl as the link destination.
  linkEl.href = iconUrl;

  // Ensure image exists inside the link.
  let imgEl = linkEl.querySelector('.ml-panel-icon');
  if (!imgEl) {
    imgEl = document.createElement('img');
    imgEl.className = 'ml-panel-icon';
    imgEl.alt = '';
    linkEl.appendChild(imgEl);
  }

  imgEl.src = iconUrl;
}

  function ensureDescription(panelEl, descText) {
    const txt = normText(descText);
    const existing = panelEl.querySelector('.ml-panel-description');
    if (txt) {
      if (existing) {
        existing.textContent = txt;
      } else {
        const desc = document.createElement('p');
        desc.className = 'ml-panel-description';
        desc.textContent = txt;
        const titleNode = panelEl.querySelector('.ml-panel-title');
        if (titleNode && titleNode.nextSibling) panelEl.insertBefore(desc, titleNode.nextSibling);
        else panelEl.appendChild(desc);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function reinsertSlot(panelEl, slotEl, orderNum) {
    const others = Array.from(panelEl.querySelectorAll('.ml-panel-slot')).filter(n => n !== slotEl);
    let inserted = false;
    for (const n of others) {
      const o = Number(n.dataset.order);
      if (isFinite(o) && o > orderNum) {
        panelEl.insertBefore(slotEl, n);
        inserted = true;
        break;
      }
    }
    if (!inserted) panelEl.appendChild(slotEl);
  }

  function ensureSectionSlot(panelEl, groupId, opts) {
    opts = opts || {};
    const label = normText(opts.label) || groupId;
    const orderNum = Number.isFinite(opts.order) ? opts.order : 100;

    const sid = `ml-controls-slot-${safeId(groupId)}`;
    let slot = panelEl.querySelector(`#${sid}`);

    if (!slot) {
      slot = document.createElement('div');
      slot.id = sid;
      slot.className = `ml-panel-slot ml-panel-slot--${safeId(groupId)}`;
      slot.dataset.order = String(orderNum);

      const header = document.createElement('div');
      header.className = `ml-panel-section-title ml-panel-section-title--${safeId(groupId)}`;
      header.textContent = label;
      slot.appendChild(header);

      const body = document.createElement('div');
      body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
      slot.appendChild(body);

      panelEl.appendChild(slot);
      reinsertSlot(panelEl, slot, orderNum);
    } else {
      slot.dataset.order = String(orderNum);

      const header = slot.querySelector('.ml-panel-section-title');
      if (header) header.textContent = label;

      let body = slot.querySelector('.ml-panel-slot-body');
      if (!body) {
        body = document.createElement('div');
        body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
        slot.appendChild(body);
      } else {
        body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
      }

      reinsertSlot(panelEl, slot, orderNum);
    }

    return slot.querySelector('.ml-panel-slot-body');
  }


  function applyBodyClasses(bodyEl, groupId, controlSpec) {
    if (!bodyEl) return;

    const gid = safeId(groupId);
    const typeRaw = controlSpec && controlSpec.type ? normText(controlSpec.type) : '';
    const typeId = typeRaw ? safeId(typeRaw) : '';

    // Always include group-scoped class; also include type-scoped class so CSS can target
    // `.ml-panel-views` / `.ml-panel-filters` regardless of bind/group id.
    const cls = ['ml-panel-slot-body', `ml-panel-${gid}`];
    if (typeId) {
      cls.push(`ml-panel-${typeId}`);
      cls.push(`ml-panel-type-${typeId}`);
      try { bodyEl.dataset.mfControlType = typeRaw; } catch (_) {}
    } else {
      try { delete bodyEl.dataset.mfControlType; } catch (_) {}
    }
    bodyEl.className = cls.join(' ');
  }

  function renderPlaceholder(mountEl, groupId, controlSpec, noteText) {
    if (!mountEl) return;
    mountEl.textContent = '';

    const p = document.createElement('div');
    p.className = 'ml-controls-placeholder';

    const type = controlSpec && controlSpec.type ? normText(controlSpec.type) : 'control';

    const meta = document.createElement('div');
    meta.className = 'ml-controls-placeholder-meta';
    meta.textContent = `(${type}) wired via .__controls.${groupId}`;
    p.appendChild(meta);

    const note = document.createElement('div');
    note.className = 'ml-controls-placeholder-note';
    note.textContent = noteText || 'No renderer registered for this control type yet.';
    p.appendChild(note);

    mountEl.appendChild(p);
  }


  function renderGroup(mountEl, el, x, groupId, controlSpec) {
    if (!mountEl) return;

    const type = controlSpec && controlSpec.type ? normText(controlSpec.type) : '';

    // Prefer registry dispatch by control type.
    const reg = root.controls && root.controls.registry;
    let renderer = null;
    if (type && reg && typeof reg.get === 'function') renderer = reg.get(type);

    // Fallback: allow direct module dispatch if registry is not yet initialized (load-order safety).
    if (!renderer && type) {
      const api = root.controls && root.controls[type];
      if (api && typeof api.render === 'function') renderer = api.render;
    }

    if (renderer && typeof renderer === 'function') {
      try { renderer(mountEl, el, x, groupId, controlSpec); return; } catch (e) { console.error(e); return renderPlaceholder(mountEl, groupId, controlSpec, 'Renderer crashed — see console.'); }
    }

    renderPlaceholder(mountEl, groupId, controlSpec);
  }


  // Standalone positioning (v3): allow each control group to choose its own dock corner.
  const ALL_CORNERS = ['topleft', 'topright', 'bottomright', 'bottomleft'];

  function normalizeCorner(pos, fallback) {
    const p = String(pos || '').toLowerCase().trim();
    if (p === 'topleft' || p === 'topright' || p === 'bottomleft' || p === 'bottomright') return p;
    const fb = String(fallback || '').toLowerCase().trim();
    if (fb === 'topleft' || fb === 'topright' || fb === 'bottomleft' || fb === 'bottomright') return fb;
    return 'topleft';
  }

  function removeStandaloneOtherCorners(hostApi, el, groupId, keepCorner) {
    const keep = normalizeCorner(keepCorner, 'topleft');
    for (const c of ALL_CORNERS) {
      if (c === keep) continue;
      try { hostApi.removeStandaloneGroup && hostApi.removeStandaloneGroup(el, groupId, { corner: c }); } catch (_) {}
    }
  }

  function removeStandaloneAllCorners(hostApi, el, groupId) {
    for (const c of ALL_CORNERS) {
      try { hostApi.removeStandaloneGroup && hostApi.removeStandaloneGroup(el, groupId, { corner: c }); } catch (_) {}
    }
  }

  function sync(el, x) {
    const hostApi = root.controls && root.controls.host;
    if (!hostApi) return;

    const specControls = root.spec && root.spec.controls;
    if (!specControls || typeof specControls.getControlGroups !== 'function') {
      throw new Error("[maplamina] Missing MAPLAMINA.spec.controls.getControlGroups; ensure ml-spec.js is loaded before ml-control-panel.js");
    }

    const controls = specControls.getControlGroups(x);

    // IMPORTANT (v3): Respect authored order from the compiled spec.
    // Prefer the centralized spec helper which applies panel order first (if present),
    // then insertion order in .__controls.
    const allGroups = (typeof specControls.getControlGroupIdsOrdered === 'function')
      ? specControls.getControlGroupIdsOrdered(x)
      : Object.keys(controls);

    const panelSpec = (typeof specControls.getPanelSpec === 'function') ? specControls.getPanelSpec(x) : null;
    const sections = panelSpec && Array.isArray(panelSpec.sections) ? panelSpec.sections : null;
    const hasPanel = !!(sections && sections.length);

    // Always remove legacy per-layer UI (safe; does not touch v3 containers)
    try { hostApi.removeLegacyLayerPanels && hostApi.removeLegacyLayerPanels(el); } catch (_) {}

    // PANEL MOUNTING
    const panelGroups = new Set();
    if (hasPanel) {
      const corner = normText(panelSpec.corner) || 'topleft';
      const key = normText(panelSpec.key) || 'controls-panel';

      const panelHost = hostApi.ensurePanelHost(el, {
        corner,
        key,
        order: Number.isFinite(panelSpec.order) ? panelSpec.order : 10,
        className: 'ml-layer-panel ml-control-panel'
      });

      if (panelHost) {
        panelHost.id = panelHost.id || 'ml-controls-panel';
        ensureTitleRow(panelHost, normText(panelSpec.title) || 'controls');
        ensureDescription(panelHost, panelSpec.description);

        // Title icon/link: show a clickable icon next to the title when panelSpec.icon is provided
        // (icon is expected to be a URL string).
        try { ensureTitleIconLink(panelHost, panelSpec); } catch (e) { console.error(e); }

        // Create/update slots in declared order
        const seenSlots = new Set();
        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i] || {};
          const gid = normText(sec.id);
          if (!gid) continue;

          panelGroups.add(gid);
          const body = ensureSectionSlot(panelHost, gid, {
            label: normText(sec.label) || gid,
            order: Number.isFinite(sec.order) ? sec.order : (10 + i * 10)
          });

          seenSlots.add(`ml-controls-slot-${safeId(gid)}`);

          // Ensure both group- and type-scoped classes are applied (e.g. ml-panel-views)
          applyBodyClasses(body, gid, controls[gid]);

          renderGroup(body, el, x, gid, controls[gid]);
        }

        // Remove any slots not referenced anymore
        const existingSlots = Array.from(panelHost.querySelectorAll('.ml-panel-slot'));
        for (const slot of existingSlots) {
          if (!slot || !slot.id) continue;
          if (!seenSlots.has(slot.id)) {
            try { slot.remove(); } catch (_) {}
          }
        }
      }

      // Suppress standalone for panel-mounted groups (remove in all corners)
      for (const gid of panelGroups) {
          try { removeStandaloneAllCorners(hostApi, el, gid); } catch (_) {}
      }
    } else {
      // No panel requested: remove panel host in all corners (best effort)
      for (const corner of ['topleft','topright','bottomright','bottomleft']) {
        try { hostApi.removePanelHost && hostApi.removePanelHost(el, { corner, key: 'controls-panel' }); } catch (_) {}
      }
    }

    // STANDALONE MOUNTING
    const standaloneGroups = allGroups.filter(g => !panelGroups.has(g));
    const defaultStandaloneCorner = (panelSpec && normText(panelSpec.corner)) ? normText(panelSpec.corner) : 'topleft';

    // Track order per corner so each corner stacks deterministically.
    const cornerCount = { topleft: 0, topright: 0, bottomright: 0, bottomleft: 0 };

    // Ensure desired standalone groups exist
    for (let i = 0; i < standaloneGroups.length; i++) {
      const gid = standaloneGroups[i];
      const controlSpec = controls[gid] || {};
      const desiredCorner = normalizeCorner(controlSpec.position, defaultStandaloneCorner);

      // Avoid duplicates across corners: keep only the desired corner.
      try { removeStandaloneOtherCorners(hostApi, el, gid, desiredCorner); } catch (_) {}

      const idx = Number.isFinite(cornerCount[desiredCorner]) ? cornerCount[desiredCorner] : 0;
      cornerCount[desiredCorner] = idx + 1;

      const container = hostApi.ensureStandaloneGroup(el, gid, {
        corner: desiredCorner,
        order: 20 + idx * 5,
        className: 'ml-layer-panel ml-control-standalone'
      });

      if (container) {
        container.id = container.id || `ml-controls-standalone-${safeId(gid)}`;

        // Standalone controls should be "bare": no bind-id title, no description,
        // and no slot wrapper (which would trigger divider chrome).
        try {
          const title = container.querySelector(':scope > .ml-panel-title');
          if (title) title.remove();
          const desc = container.querySelector(':scope > .ml-panel-description');
          if (desc) desc.remove();

          const slots = container.querySelectorAll(':scope > .ml-panel-slot');
          slots && slots.forEach(s => { try { s.remove(); } catch (_) {} });
        } catch (_) {}

        // Mount directly into a single body node.
        let body = container.querySelector(':scope > .ml-panel-slot-body');
        if (!body) {
          body = document.createElement('div');
          body.className = 'ml-panel-slot-body';
          container.appendChild(body);
        } else {
          body.className = 'ml-panel-slot-body';
        }

        // Apply group- and type-scoped classes so styling works even when bind != 'views'
        applyBodyClasses(body, gid, controls[gid]);

        renderGroup(body, el, x, gid, controls[gid]);
      }
    }

    // Remove stale standalone nodes in the DOM (fallback path)
    try {
      const nodes = el.querySelectorAll('[data-ml-control-kind="standalone"]');
      nodes && nodes.forEach(n => {
        const gid = n.dataset.mfControlGroup;
        if (!gid) return;
        if (!standaloneGroups.includes(gid)) {
          try { removeStandaloneAllCorners(hostApi, el, gid); } catch (_) {}
          try { n.remove(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  function clear(el) {
    const hostApi = root.controls && root.controls.host;
    if (!hostApi) return;

    // Remove v3 panel host in all corners (best effort)
    for (const corner of ['topleft','topright','bottomright','bottomleft']) {
      try { hostApi.removePanelHost && hostApi.removePanelHost(el, { corner, key: 'controls-panel' }); } catch (_) {}
    }

    // Remove v3 standalone hosts (best-effort via attributes)
    try {
      const nodes = el.querySelectorAll('[data-ml-control-kind="standalone"]');
      nodes && nodes.forEach(n => {
        const gid = n.dataset.mfControlGroup;
        if (gid) {
          for (const corner of ['topleft','topright','bottomright','bottomleft']) {
            try { hostApi.removeStandaloneGroup && hostApi.removeStandaloneGroup(el, gid, { corner }); } catch (_) {}
          }
        }
        try { n.remove(); } catch (_) {}
      });
    } catch (_) {}

    // Also remove any legacy per-layer UI
    try { hostApi.removeLegacyLayerPanels && hostApi.removeLegacyLayerPanels(el); } catch (_) {}
  }

  function removeLegacyLayerUI(el) {
    const hostApi = root.controls && root.controls.host;
    if (!hostApi) return;
    try { hostApi.removeLegacyLayerPanels && hostApi.removeLegacyLayerPanels(el); } catch (_) {}

    // Also remove older view-switcher stack if still present
    try {
      const old = el.querySelector('.ml-view-switcher-stack');
      if (old) old.remove();
    } catch (_) {}
  }

  // v3 API: mounting only.
  root.controls.panel = {
    sync,
    clear,
    removeLegacyLayerUI
  };
})(window);
