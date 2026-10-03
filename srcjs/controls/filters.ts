// Mounts the merged filters of a control group into the node the panel gives it, through
// the select and range UI in srcjs/filters.

import type { Control, FiltersControl, RangeFilterControl, SelectFilterControl, Spec } from '../core/spec-types';
import { domKey, normText } from '../core/utils';
import type { FilterValue, WidgetElement } from '../core/widget';
import { getElState } from '../filters/core';
import type { PanelMeta } from '../filters/core';
import { ensureFilterUI } from '../filters/filters';

type FilterDef = SelectFilterControl | RangeFilterControl;

function clearNode(node: Node | null | undefined): void {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

export function render(
  mountEl: HTMLElement | null,
  el: WidgetElement | null | undefined,
  x: Spec,
  groupId: string | null | undefined,
  controlSpec: Control | null | undefined
): void {
  if (!mountEl || !el) return;

  const gid = (groupId != null) ? String(groupId) : 'filters';

  const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
  if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'filters') { clearNode(mountEl); return; }
  const filters = ctl as FiltersControl;

  const defs: Readonly<Record<string, FilterDef>> = (filters.controls && typeof filters.controls === 'object') ? filters.controls : {};

  // Respect authored order from the compiled spec:
  //   - primary: ctl.order (explicit authored order)
  //   - fallback: preserve insertion order of defs keys (do NOT sort)

  const keys = Object.keys(defs);
  const byNorm = new Map<string, string>();
  for (const k of keys) byNorm.set(normText(k), k);

  const orderRaw = Array.isArray(filters.order) ? filters.order : null;
  const seen = new Set<string>();
  const order: string[] = [];
  const push = (k: string | undefined): void => {
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

  // panelMeta.mountEl is honored by ensureFiltersContainer() in filters/core.ts
  const panelMeta: PanelMeta = { mountEl: box };

  const ui = getElState(el);

  const rt = el.__mfRuntime;
  const bindId = gid;

  if (ui) {
    ui[bindId] = ui[bindId] || { select: {}, range: {} };

    // Seed UI state from runtime (so rerenders preserve selection)
    const stAll = rt && rt.state && rt.state.filters ? rt.state.filters : {};
    const st: Record<string, FilterValue> = (stAll && stAll[bindId] && typeof stAll[bindId] === 'object') ? stAll[bindId] : {};
    for (const label of order) {
      const spec = defs[label];
      if (!spec || typeof spec !== 'object') continue;

      const sel = st[label];
      if (spec.type === 'select' && sel instanceof Set) {
        // UI widgets store selected *indices* into dict; runtime stores selected *values*.
        const dict = (spec.dict && Array.isArray(spec.dict)) ? spec.dict : [];
        const idx = new Set<number>();
        for (const v of sel) {
          const sv = String(v);
          for (let i = 0; i < dict.length; i++) {
            if (String(dict[i]) === sv) { idx.add(i); break; }
          }
        }
        ui[bindId].select![label] = idx;
      }
      if (spec.type === 'range' && Array.isArray(sel) && sel.length >= 2) {
        ui[bindId].range![label] = sel.slice(0, 2);
      }
    }
  }

  const syncLabelToRuntime = (label: string): void => {
    if (!rt || typeof rt.setFilter !== 'function') return;
    const spec = defs[label];
    if (!spec || typeof spec !== 'object') return;

    if (spec.type === 'select') {
      const set = ui && ui[bindId] && ui[bindId].select ? ui[bindId].select[label] : null;

      // UI widgets store indices into the merged dict; runtime expects selected values.
      const dict = (spec.dict && Array.isArray(spec.dict)) ? spec.dict : [];
      let out = new Set<string>();

      if (set instanceof Set && set.size) {
        for (const i of set) {
          const v = dict[i];
          if (v !== undefined) out.add(String(v));
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
      ensureFilterUI(el, bindId, spec, () => syncLabelToRuntime(label), panelMeta);
    }

    if (spec0.type === 'range') {
      const domain: Partial<RangeFilterControl['domain']> = spec0.domain || {};
      const spec = Object.assign({}, spec0, {
        id: label,
        dom_id: domKey(label),
        label: spec0.label || label,
        min: +domain.min!,
        max: +domain.max!,
        // The runtime scheduler coalesces overlay updates, so the UI can emit live changes directly.
        live: (spec0.live !== false)
      });
      ensureFilterUI(el, bindId, spec, () => syncLabelToRuntime(label), panelMeta);
    }
  }
}
