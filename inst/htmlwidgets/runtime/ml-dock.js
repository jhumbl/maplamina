(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  // Dock: mounts Maplamina UI elements into MapLibre's corner control containers
  // so they stack with built-in controls (navigation, attribution, scale, etc.)
  // without collisions.

  const POS_TO_CLASS = {
    topleft: 'top-left',
    topright: 'top-right',
    bottomleft: 'bottom-left',
    bottomright: 'bottom-right'
  };

  const STATE = new WeakMap();

  function getState(el) {
    let st = STATE.get(el);
    if (!st) {
      st = { groups: new Map() };
      STATE.set(el, st);
    }
    return st;
  }

  function getMapContainer(el) {
    try {
      const map = el && typeof el.__mfGetMap === 'function' ? el.__mfGetMap() : null;
      if (map && typeof map.getContainer === 'function') return map.getContainer();
    } catch (_) {}
    return el;
  }

  function normalizePos(pos) {
    const p = String(pos || '').toLowerCase();
    return POS_TO_CLASS[p] ? p : 'topleft';
  }

  function cornerSelector(pos) {
    return '.maplibregl-ctrl-' + POS_TO_CLASS[pos];
  }

  function getCorner(el, pos) {
    const p = normalizePos(pos);
    const container = getMapContainer(el);
    if (!container || !container.querySelector) return null;
    return container.querySelector(cornerSelector(p));
  }

  function ensureGroup(el, pos) {
    const p = normalizePos(pos);
    const st = getState(el);

    // Reuse if we still have a live node
    const existing = st.groups.get(p);
    if (existing && existing.isConnected) return existing;

    const corner = getCorner(el, p);
    if (!corner) return null;

    // Reuse if it exists in DOM (e.g. hot reload)
    let group = corner.querySelector(`[data-ml-dock-group="${p}"]`);
    if (!group) {
      group = document.createElement('div');
      group.className = `maplibregl-ctrl ml-dock-group ml-dock-group--${p}`;
      group.dataset.mfDockGroup = p;
      group.dataset.mfDock = '1';

      // Important ordering:
      // - Top corners: keep Maplamina UI *after* built-in controls (nav, etc.)
      // - Bottom corners: keep Maplamina UI *before* built-in controls (attribution, scale)
      //   so it appears above them instead of below.
      const isBottom = p === 'bottomleft' || p === 'bottomright';
      if (isBottom) corner.insertBefore(group, corner.firstChild);
      else corner.appendChild(group);
    }

    // Even if it already exists, ensure it stays in the intended spot.
    try {
      const isBottom = p === 'bottomleft' || p === 'bottomright';
      if (isBottom) {
        if (corner.firstChild !== group) corner.insertBefore(group, corner.firstChild);
      } else {
        if (corner.lastChild !== group) corner.appendChild(group);
      }
    } catch (_) {}

    st.groups.set(p, group);
    return group;
  }

  function insertItemByOrder(group, item, orderNum) {
    const kids = Array.from(group.children).filter(n => n && n.dataset && n.dataset.mfDockItem);
    for (const k of kids) {
      const ko = Number(k.dataset.mfDockOrder);
      if (Number.isFinite(ko) && ko > orderNum) {
        group.insertBefore(item, k);
        return;
      }
    }
    group.appendChild(item);
  }

  function ensureItem(el, pos, key, opts) {
    const p = normalizePos(pos);
    const k = String(key || '').trim();
    if (!k) return null;

    const group = ensureGroup(el, p);
    const parent = group || el;
    if (!parent) return null;

    opts = opts || {};
    const orderNum = Number.isFinite(opts.order) ? Number(opts.order) : 100;

    let item = parent.querySelector(`[data-ml-dock-pos="${p}"][data-ml-dock-item="${k}"]`);
    if (!item) {
      item = document.createElement('div');
      const extra = opts.className ? String(opts.className) : '';
      item.className = `ml-dock-item ml-dock-item--${k}${extra ? ' ' + extra : ''}`;
      item.dataset.mfDock = '1';
      item.dataset.mfDockPos = p;
      item.dataset.mfDockItem = k;
      item.dataset.mfDockOrder = String(orderNum);

      if (group) insertItemByOrder(group, item, orderNum);
      else parent.appendChild(item);
    } else {
      item.dataset.mfDockOrder = String(orderNum);
    }

    // Flex order is handled by the group, but keep it anyway for clarity
    try { item.style.order = String(orderNum); } catch (_) {}
    return item;
  }

  function removeItem(el, pos, key) {
    const p = normalizePos(pos);
    const k = String(key || '').trim();
    if (!k) return;

    const group = ensureGroup(el, p) || getState(el).groups.get(p);
    const container = group || getMapContainer(el) || el;
    if (!container) return;

    const item = container.querySelector(`[data-ml-dock-pos="${p}"][data-ml-dock-item="${k}"]`);
    if (item) {
      try { item.remove(); } catch (_) {
        try { item.parentNode && item.parentNode.removeChild(item); } catch (_) {}
      }
    }

    // If the group is now empty, remove it
    const g = getState(el).groups.get(p) || (container.querySelector ? container.querySelector(`[data-ml-dock-group="${p}"]`) : null);
    if (g && g.dataset && g.dataset.mfDockGroup === p) {
      const hasItems = Array.from(g.children).some(n => n && n.dataset && n.dataset.mfDockItem);
      if (!hasItems) {
        try { g.remove(); } catch (_) {}
        getState(el).groups.delete(p);
      }
    }
  }

  function destroy(el) {
    if (!el) return;
    const container = getMapContainer(el) || el;
    if (container && container.querySelectorAll) {
      const groups = container.querySelectorAll('[data-ml-dock-group]');
      groups.forEach(n => {
        try { n.remove(); } catch (_) {}
      });
    }

    const st = STATE.get(el);
    if (st) {
      st.groups.clear();
      STATE.delete(el);
    }
  }

  root.dock = {
    ensureGroup,
    ensureItem,
    removeItem,
    destroy
  };
})(window);
