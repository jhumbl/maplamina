// Mounting targets for the controls: one container per standalone control group and one
// for the panel.

import { isFiniteNumber, safeId } from '../core/utils';
import { ensureItem, removeItem } from '../runtime/dock';
import type { DockItemOptions } from '../runtime/dock';

export interface HostOptions {
  corner?: string;
  key?: string;
  order?: number;
  className?: string;
}

function ensureDockItem(
  el: HTMLElement,
  corner: string,
  key: string,
  opts: DockItemOptions | null | undefined
): HTMLElement | null {
  const order = opts && isFiniteNumber(opts.order) ? opts.order : 10;
  const className = opts && opts.className ? opts.className : '';

  return ensureItem(el, corner, key, { className, order });
}

function removeDockItem(el: HTMLElement, corner: string, key: string): void {
  removeItem(el, corner, key);
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
