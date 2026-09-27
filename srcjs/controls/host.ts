// Mounting targets for the controls: one container per standalone control group and one
// for the panel.

import { isFiniteNumber, safeId } from '../core/utils';

export interface HostOptions {
  corner?: string;
  key?: string;
  order?: number;
  className?: string;
}

interface DockItemOptions {
  order?: number;
  className?: string;
}

function ensureDockItem(
  el: HTMLElement,
  corner: string,
  key: string,
  opts: DockItemOptions | null | undefined
): HTMLElement | null {
  const dock = globalThis.MAPLAMINA.dock;
  const order = opts && isFiniteNumber(opts.order) ? opts.order : 10;
  const className = opts && opts.className ? opts.className : '';

  if (dock && typeof dock.ensureItem === 'function') {
    return dock.ensureItem(el, corner, key, { className, order });
  }

  // Fallback (no dock): mount directly under widget root.
  let host = el.querySelector<HTMLElement>(`:scope > [data-ml-dock-fallback="${key}"]`);
  if (!host) {
    host = document.createElement('div');
    host.dataset.mlDockFallback = key;
    if (className) host.className = className;
    el.appendChild(host);
  } else if (className) {
    host.className = className;
  }
  return host;
}

function removeDockItem(el: HTMLElement, corner: string, key: string): void {
  const dock = globalThis.MAPLAMINA.dock;
  if (dock && typeof dock.removeItem === 'function') {
    try { dock.removeItem(el, corner, key); } catch (_) {}
    return;
  }
  const node = el.querySelector(`:scope > [data-ml-dock-fallback="${key}"]`);
  if (node) { try { node.remove(); } catch (_) {} }
}

function standaloneKey(groupId: string): string {
  return `controls-${safeId(groupId)}`;
}

export function ensureStandaloneGroup(
  el: HTMLElement,
  groupId: string,
  opts?: HostOptions | null
): HTMLElement | null {
  opts = opts || {};
  const corner = opts.corner || 'topleft';
  const key = standaloneKey(groupId);
  const order = isFiniteNumber(opts.order) ? opts.order : 20;
  const className = opts.className || 'ml-layer-panel ml-control-standalone';

  const host = ensureDockItem(el, corner, key, { className, order });
  host!.dataset.mfControlGroup = groupId;
  host!.dataset.mfControlKind = 'standalone';
  return host;
}

export function removeStandaloneGroup(el: HTMLElement, groupId: string, opts?: HostOptions | null): void {
  opts = opts || {};
  const corner = opts.corner || 'topleft';
  removeDockItem(el, corner, standaloneKey(groupId));
}

export function ensurePanelHost(el: HTMLElement, opts?: HostOptions | null): HTMLElement | null {
  opts = opts || {};
  const corner = opts.corner || 'topleft';
  const key = opts.key || 'controls-panel';
  const order = isFiniteNumber(opts.order) ? opts.order : 10;
  const className = opts.className || 'ml-layer-panel ml-control-panel';

  const host = ensureDockItem(el, corner, key, { className, order });
  host!.dataset.mfControlKind = 'panel';
  host!.dataset.mfControlKey = key;
  return host;
}

export function removePanelHost(el: HTMLElement, opts?: HostOptions | null): void {
  opts = opts || {};
  const corner = opts.corner || 'topleft';
  const key = opts.key || 'controls-panel';
  removeDockItem(el, corner, key);
}
