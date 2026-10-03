// Mounts the widget's UI elements into MapLibre's corner control containers so they stack
// with the built-in controls (navigation, attribution, scale) without collisions.

import { isFiniteNumber } from '../core/utils';
import type { WidgetElement } from '../core/widget';

export interface DockItemOptions {
  className?: string;
  order?: number;
}

type DockPos = 'topleft' | 'topright' | 'bottomleft' | 'bottomright';

interface DockState {
  groups: Map<DockPos, HTMLElement>;
}

const POS_TO_CLASS: Record<DockPos, string> = {
  topleft: 'top-left',
  topright: 'top-right',
  bottomleft: 'bottom-left',
  bottomright: 'bottom-right'
};

const STATE = new WeakMap<HTMLElement, DockState>();

function getState(el: HTMLElement): DockState {
  let st = STATE.get(el);
  if (!st) {
    st = { groups: new Map() };
    STATE.set(el, st);
  }
  return st;
}

function getMapContainer(el: WidgetElement): HTMLElement {
  const map = el && typeof el.__mfGetMap === 'function' ? el.__mfGetMap() : null;
  if (map && typeof map.getContainer === 'function') return map.getContainer();
  return el;
}

function normalizePos(pos: unknown): DockPos {
  const p = String(pos || '').toLowerCase();
  return POS_TO_CLASS[p as DockPos] ? p as DockPos : 'topleft';
}

function cornerSelector(pos: DockPos): string {
  return '.maplibregl-ctrl-' + POS_TO_CLASS[pos];
}

function getCorner(el: WidgetElement, pos: unknown): HTMLElement | null {
  const p = normalizePos(pos);
  const container = getMapContainer(el);
  if (!container || !container.querySelector) return null;
  return container.querySelector<HTMLElement>(cornerSelector(p));
}

function ensureGroup(el: WidgetElement, pos: unknown): HTMLElement | null {
  const p = normalizePos(pos);
  const st = getState(el);

  // Reuse if we still have a live node
  const existing = st.groups.get(p);
  if (existing && existing.isConnected) return existing;

  const corner = getCorner(el, p);
  if (!corner) return null;

  // Reuse if it exists in DOM (e.g. hot reload)
  let group = corner.querySelector<HTMLElement>(`[data-mf-dock-group="${p}"]`);
  if (!group) {
    group = document.createElement('div');
    group.className = `maplibregl-ctrl ml-dock-group ml-dock-group--${p}`;
    group.dataset.mfDockGroup = p;
    group.dataset.mfDock = '1';

    // Top corners keep the widget's UI after the built-in controls (nav, etc.); bottom
    // corners keep it before them (attribution, scale) so it appears above them.
    const isBottom = p === 'bottomleft' || p === 'bottomright';
    if (isBottom) corner.insertBefore(group, corner.firstChild);
    else corner.appendChild(group);
  }

  // Even if it already exists, ensure it stays in the intended spot.
  const isBottom = p === 'bottomleft' || p === 'bottomright';
  if (isBottom) {
    if (corner.firstChild !== group) corner.insertBefore(group, corner.firstChild);
  } else {
    if (corner.lastChild !== group) corner.appendChild(group);
  }

  st.groups.set(p, group);
  return group;
}

function insertItemByOrder(group: HTMLElement, item: HTMLElement, orderNum: number): void {
  const kids = Array.from(group.children as HTMLCollectionOf<HTMLElement>)
    .filter(n => n && n.dataset && n.dataset.mfDockItem);
  for (const k of kids) {
    const ko = Number(k.dataset.mfDockOrder);
    if (Number.isFinite(ko) && ko > orderNum) {
      group.insertBefore(item, k);
      return;
    }
  }
  group.appendChild(item);
}

export function ensureItem(
  el: WidgetElement,
  pos: unknown,
  key: unknown,
  opts?: DockItemOptions | null
): HTMLElement | null {
  const p = normalizePos(pos);
  const k = String(key || '').trim();
  if (!k) return null;

  const group = ensureGroup(el, p);
  const parent = group || el;
  if (!parent) return null;

  opts = opts || {};
  const orderNum = isFiniteNumber(opts.order) ? Number(opts.order) : 100;

  let item = parent.querySelector<HTMLElement>(`[data-mf-dock-pos="${p}"][data-mf-dock-item="${k}"]`);
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
  item.style.order = String(orderNum);
  return item;
}

export function removeItem(el: WidgetElement, pos: unknown, key: unknown): void {
  const p = normalizePos(pos);
  const k = String(key || '').trim();
  if (!k) return;

  const group = ensureGroup(el, p) || getState(el).groups.get(p);
  const container = group || getMapContainer(el) || el;
  if (!container) return;

  const item = container.querySelector(`[data-mf-dock-pos="${p}"][data-mf-dock-item="${k}"]`);
  if (item) {
    try { item.remove(); } catch (_) {
      item.parentNode && item.parentNode.removeChild(item);
    }
  }

  // If the group is now empty, remove it
  const g = getState(el).groups.get(p) || (container.querySelector ? container.querySelector<HTMLElement>(`[data-mf-dock-group="${p}"]`) : null);
  if (g && g.dataset && g.dataset.mfDockGroup === p) {
    const hasItems = Array.from(g.children as HTMLCollectionOf<HTMLElement>)
      .some(n => n && n.dataset && n.dataset.mfDockItem);
    if (!hasItems) {
      g.remove();
      getState(el).groups.delete(p);
    }
  }
}

export function destroy(el: WidgetElement | null | undefined): void {
  if (!el) return;
  const container = getMapContainer(el) || el;
  if (container && container.querySelectorAll) {
    const groups = container.querySelectorAll('[data-mf-dock-group]');
    groups.forEach(n => {
      n.remove();
    });
  }

  const st = STATE.get(el);
  if (st) {
    st.groups.clear();
    STATE.delete(el);
  }
}
