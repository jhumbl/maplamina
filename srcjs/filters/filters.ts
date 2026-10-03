import type { FilterUiSpec, PanelMeta } from './core';
import { ensureRangeUI } from './range';
import { ensureSelectUI } from './select';

export function ensureFilterUI(
  el: HTMLElement,
  layerId: string,
  spec: FilterUiSpec | null | undefined,
  onChange: (() => void) | null | undefined,
  panelMeta: PanelMeta | null | undefined
): void {
  if (!spec || !spec.type) return;
  if (spec.type === 'select') return ensureSelectUI(el, layerId, spec, onChange, panelMeta);
  if (spec.type === 'range')  return ensureRangeUI(el, layerId, spec, onChange, panelMeta);
}
