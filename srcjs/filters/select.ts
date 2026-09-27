import { domKey, isFiniteNumber, widgetKey } from '../core/utils';
import {
  ensureFiltersContainer,
  getElState,
  publishFilterState,
  seedSelectionSet
} from './core';
import type { PanelMeta, SelectUiSpec } from './core';

const AUTO_DROPDOWN_AT = 5;

type FilterBox = HTMLElement & { __mfCleanup?: (() => void) | null };

// Ensure per-control global listeners/observers are cleaned up between re-renders.
function runCleanup(box: FilterBox | null): void {
  if (!box) return;
  if (typeof box.__mfCleanup === 'function') {
    try { box.__mfCleanup(); } catch (e) { console.error(e); }
  }
  box.__mfCleanup = null;
}

function safeLabel(label: unknown, fallback: unknown): string {
  const raw = (label != null) ? label : fallback;
  if (Array.isArray(raw)) return String(raw[raw.length - 1]);
  return String(raw ?? '');
}

function summarizeSelection(sel: SelectUiSpec, selected: Set<number>): string {
  if (!sel || !Array.isArray(sel.dict)) return '—';
  const n = selected.size;
  if (n === 0 || n === sel.dict.length) return 'All';
  if (n === 1) return sel.dict[Array.from(selected)[0]] ?? '1 selected';
  return `${n} selected`;
}

function visibleIndices(sel: SelectUiSpec, expanded: boolean): number[] {
  const K = sel.dict.length >>> 0;
  const cap = isFiniteNumber(sel.max_levels) ? Math.max(0, Math.min(K, sel.max_levels|0)) : null;
  if (!cap || expanded || cap >= K) return Array.from({length: K}, (_, i) => i);

  const tops = Array.isArray(sel.top_indices) && sel.top_indices.length === K
    ? sel.top_indices.slice(0, cap)
    : Array.from({length: cap}, (_, i) => i);
  return tops;
}

function renderInline(
  filtersBox: HTMLElement,
  el: HTMLElement,
  bindId: string,
  sel: SelectUiSpec,
  selected: Set<number>,
  onChange: (() => void) | null | undefined
): void {
  const domLayerId = `${widgetKey(el)}-${domKey(bindId)}`;
  const cid = `ml-sel-${domLayerId}-${sel.dom_id}`;
  let box = el.querySelector<FilterBox>(`#${cid}`);
  if (!box) { box = document.createElement('div'); box.id = cid; box.className = 'ml-filter'; filtersBox.appendChild(box); }

  runCleanup(box);
  box.innerHTML = '';
  const title = document.createElement('div'); title.className = 'ml-filter-title';
  title.textContent = safeLabel(sel.label, sel.id); box.appendChild(title);

  const optionsBox = document.createElement('div'); optionsBox.className = 'ml-filter-options'; box.appendChild(optionsBox);

  const name = `ml-radio-${domLayerId}-${sel.dom_id}`;
  let expanded = false;

  function drawOptions(): void {
    optionsBox.innerHTML = '';
    const vis = visibleIndices(sel, expanded);
    vis.forEach(idx => {
      const label = document.createElement('label'); label.className = 'ml-filter-option';
      const input = document.createElement('input'); input.type = sel.multi ? 'checkbox' : 'radio';
      input.name = name; input.value = String(idx); input.checked = selected.has(idx);
      input.addEventListener('change', () => {
        if (sel.multi) { if (input.checked) selected.add(idx); else selected.delete(idx); }
        else { selected.clear(); if (input.checked) selected.add(idx); }
        if (onChange) onChange(); publishFilterState(el, bindId);

      });
      const span = document.createElement('span'); span.textContent = sel.dict[idx];
      label.appendChild(input); label.appendChild(span); optionsBox.appendChild(label);
    });

    if (isFiniteNumber(sel.max_levels) && sel.dict.length > sel.max_levels && !expanded) {
      const more = document.createElement('button'); more.type = 'button';
      more.textContent = 'Show all…';
      more.className = 'ml-filter-more';
      more.addEventListener('click', () => { expanded = true; drawOptions(); });
      optionsBox.appendChild(more);
    }
  }

  drawOptions();
}

function renderDropdown(
  filtersBox: HTMLElement,
  el: HTMLElement,
  bindId: string,
  sel: SelectUiSpec,
  selected: Set<number>,
  onChange: (() => void) | null | undefined
): void {
  const domLayerId = `${widgetKey(el)}-${domKey(bindId)}`;
  const cid = `ml-sel-${domLayerId}-${sel.dom_id}`;
  let box = el.querySelector<FilterBox>(`#${cid}`);
  if (!box) { box = document.createElement('div'); box.id = cid; box.className = 'ml-filter'; filtersBox.appendChild(box); }

  runCleanup(box);
  box.innerHTML = '';
  const title = document.createElement('div'); title.className = 'ml-filter-title';
  title.textContent = safeLabel(sel.label, sel.id); box.appendChild(title);

  const dd = document.createElement('div'); dd.className = 'ml-dd'; box.appendChild(dd);

  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ml-dd-toggle';
  const caret = document.createElement('span'); caret.textContent = '▾';
  const summary = document.createElement('div'); summary.textContent = summarizeSelection(sel, selected);
  toggle.appendChild(summary); toggle.appendChild(caret); dd.appendChild(toggle);

  const clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'ml-dd-clear'; clearBtn.title = 'Clear';
  clearBtn.textContent = '×'; dd.appendChild(clearBtn);

  const menu = document.createElement('div'); menu.className = 'ml-dd-menu'; menu.style.display = 'none';
  dd.appendChild(menu);

  let searchBox: HTMLInputElement | null = null;
  if (sel.searchable) {
    searchBox = document.createElement('input');
    searchBox.type = 'text'; searchBox.placeholder = 'Search...';
    searchBox.className = 'ml-dd-search';
    menu.appendChild(searchBox);
  }

  const optsWrap = document.createElement('div'); optsWrap.className = 'ml-dd-options'; menu.appendChild(optsWrap);
  const groupName = `ml-dd-${domLayerId}-${sel.dom_id}`;
  let expanded = false;

  function renderOptions(filterText: string): void {
    optsWrap.innerHTML = '';
    const q = (filterText || '').toLowerCase();
    const vis = visibleIndices(sel, expanded);
    vis.forEach(idx => {
      const nameText = sel.dict[idx];
      if (q && String(nameText).toLowerCase().indexOf(q) === -1) return;

      const label = document.createElement('label'); label.className = 'ml-dd-option';
      const input = document.createElement('input'); input.type = sel.multi ? 'checkbox' : 'radio';
      input.name = groupName; input.value = String(idx); input.checked = selected.has(idx);
      input.addEventListener('change', () => {
        if (sel.multi) { if (input.checked) selected.add(idx); else selected.delete(idx); }
        else { selected.clear(); if (input.checked) selected.add(idx); }
        summary.textContent = summarizeSelection(sel, selected);
        if (onChange) onChange(); publishFilterState(el, bindId);
      });
      const span = document.createElement('span'); span.textContent = nameText;
      label.appendChild(input); label.appendChild(span); optsWrap.appendChild(label);
    });

    if (isFiniteNumber(sel.max_levels) && sel.dict.length > sel.max_levels && !expanded) {
      const more = document.createElement('button'); more.type = 'button';
      more.textContent = 'Show all…';
      more.className = 'ml-filter-more';
      more.addEventListener('click', () => { expanded = true; renderOptions(searchBox ? searchBox.value : ''); });
      optsWrap.appendChild(more);
    }
  }

  renderOptions('');

  if (searchBox) {
    const input = searchBox;
    input.addEventListener('input', () => renderOptions(input.value));
  }

  let open = false;
  function setOpen(v: boolean): void { open = !!v; menu.style.display = open ? 'block' : 'none'; }
  toggle.addEventListener('click', () => setOpen(!open));

  clearBtn.addEventListener('click', () => {
    selected.clear();
    summary.textContent = summarizeSelection(sel, selected);
    renderOptions(searchBox ? searchBox.value : '');
    if (onChange) onChange(); publishFilterState(el, bindId);
  });

  const onDocClick = (ev: MouseEvent) => { if (!dd.contains(ev.target as Node | null)) setOpen(false); };
  document.addEventListener('click', onDocClick);
  // Store cleanup on the persistent container so repeated renders don't leak listeners.
  box.__mfCleanup = () => { document.removeEventListener('click', onDocClick); };
}

export function ensureSelectUI(
  el: HTMLElement,
  bindId: string,
  sel: SelectUiSpec,
  onChange: (() => void) | null | undefined,
  panelMeta: PanelMeta | null | undefined
): void {
  if (!sel || !Array.isArray(sel.dict)) { console.warn('[maplamina] select dict missing'); return; }

  const ui = getElState(el);
  const selected = seedSelectionSet(ui, bindId, sel);

  const filtersBox = ensureFiltersContainer(el, bindId, panelMeta);
  if (!filtersBox) return;

  const useDropdown = (sel.dropdown === true) ||
                      (sel.dropdown == null && sel.dict.length >= AUTO_DROPDOWN_AT);

  const onAnyChange = () => { if (typeof onChange === 'function') onChange(); };

  if (useDropdown) renderDropdown(filtersBox, el, bindId, sel, selected, onAnyChange);
  else renderInline(filtersBox, el, bindId, sel, selected, onAnyChange);
}
