import type { RangeFilterControl, SelectFilterControl } from '../core/spec-types';

// A filter as the controls adapter hands it to the UI: the merged control with its label as
// id and a key that is safe in a DOM id.
export interface SelectUiSpec extends SelectFilterControl {
  readonly id: string;
  readonly dom_id: string;
  readonly default_indices?: unknown;
}

export interface RangeUiSpec extends RangeFilterControl {
  readonly id: string;
  readonly dom_id: string;
  readonly min: number;
  readonly max: number;
}

export type FilterUiSpec = SelectUiSpec | RangeUiSpec;

export interface PanelMeta {
  mountEl?: HTMLElement | null;
}

// What the filter controls hold for one control group: the selected dict indices of each
// select and the [lo, hi] of each range, by filter id.
export interface GroupUiState {
  select?: Record<string, Set<number>>;
  range?: Record<string, number[]>;
  keepOpen?: Record<string, unknown>;
}

export type UiState = Record<string, GroupUiState>;

const UISTATE = new WeakMap<HTMLElement, UiState>();
export function getElState(el: HTMLElement): UiState { let s = UISTATE.get(el); if (!s) { s = {}; UISTATE.set(el, s); } return s; }

// Callers provide a concrete mount node (panel section body or standalone container)
// through panelMeta.mountEl.
export function ensureFiltersContainer(
  el: HTMLElement,
  bindId: string,
  panelMeta: PanelMeta | null | undefined
): HTMLElement | null {
  if (panelMeta && panelMeta.mountEl) return panelMeta.mountEl;
  return null;
}

function toArrayDefaultIndices(di: unknown): number[] {
  if (Array.isArray(di)) return di;
  if (Number.isFinite(di)) return [di as number];
  return [];
}

function resolveDefaultSelection(sel: SelectUiSpec | null | undefined): number[] {
  if (!sel) return [];
  if (sel.default_indices != null) return toArrayDefaultIndices(sel.default_indices);

  const d: unknown = sel.default;
  if (Array.isArray(d) && d.every(v => typeof v === 'number' && Number.isFinite(v))) return d.slice();
  if (typeof d === 'number' && Number.isFinite(d)) return [d];

  // Defaults are authored as values; map to indices using dict when available
  const dict = Array.isArray(sel.dict) ? sel.dict : [];
  const arr: unknown[] = (d == null) ? [] : (Array.isArray(d) ? d : [d]);
  const out: number[] = [];
  for (const v of arr) {
    const s = String(v);
    if (!s.length) continue;
    for (let i = 0; i < dict.length; i++) {
      if (String(dict[i]) === s) { out.push(i); break; }
    }
  }
  return out;
}

export function seedSelectionSet(ui: UiState, bindId: string, sel: SelectUiSpec): Set<number> {
  ui[bindId] = ui[bindId] || { select: {}, keepOpen: {} };
  if (!ui[bindId].select![sel.id]) {
    const seed = resolveDefaultSelection(sel);
    ui[bindId].select![sel.id] = new Set(seed);
  }
  return ui[bindId].select![sel.id];
}

export function publishFilterState(el: HTMLElement, bindId: string): void {
  if (window.Shiny && el.id) {
    const ui = getElState(el);
    const selects = (ui[bindId] && ui[bindId].select) || {};
    const ranges = (ui[bindId] && ui[bindId].range) || {};
    const snapshot: Record<string, number[]> = {};
    for (const fid of Object.keys(selects)) snapshot[fid] = Array.from(selects[fid]);
    for (const fid of Object.keys(ranges)) snapshot[fid] = Array.from(ranges[fid]);
    window.Shiny.setInputValue(el.id + "_filters", {layer: bindId, ts: Date.now(), state: snapshot}, {priority:"event"});
  }
}
