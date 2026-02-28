(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-filters-select.js");
  }

  const utils = core.require('utils', 'ml-filters-select.js');
  if (!utils || typeof utils.domKey !== 'function') {
    throw new Error("[maplamina] Missing function utils.domKey required by ml-filters-select.js");
  }
  const domKey = utils.domKey;

  const filterCore = core.require('filterCore', 'ml-filters-select.js');
  const { getElState, ensureFiltersContainer, seedSelectionSet, publishFilterState } = filterCore;
  if (typeof getElState !== 'function') throw new Error("[maplamina] Missing function filterCore.getElState required by ml-filters-select.js");
  if (typeof ensureFiltersContainer !== 'function') throw new Error("[maplamina] Missing function filterCore.ensureFiltersContainer required by ml-filters-select.js");
  if (typeof seedSelectionSet !== 'function') throw new Error("[maplamina] Missing function filterCore.seedSelectionSet required by ml-filters-select.js");
  if (typeof publishFilterState !== 'function') throw new Error("[maplamina] Missing function filterCore.publishFilterState required by ml-filters-select.js");

  const AUTO_DROPDOWN_AT = 5;

  // Ensure per-control global listeners/observers are cleaned up between re-renders.
  function runCleanup(box) {
    if (!box) return;
    if (typeof box.__mfCleanup === 'function') {
      try { box.__mfCleanup(); } catch (e) { console.error(e); }
    }
    box.__mfCleanup = null;
  }

  function safeLabel(label, fallback) {
    const raw = (label != null) ? label : fallback;
    if (Array.isArray(raw)) return String(raw[raw.length - 1]);
    return String(raw ?? '');
  }

  function summarizeSelection(sel, selected) {
    if (!sel || !Array.isArray(sel.dict)) return '—';
    const n = selected.size;
    if (n === 0 || n === sel.dict.length) return 'All';
    if (n === 1) return sel.dict[Array.from(selected)[0]] ?? '1 selected';
    return `${n} selected`;
  }

  function visibleIndices(sel, expanded) {
    const K = sel.dict.length >>> 0;
    const cap = Number.isFinite(sel.max_levels) ? Math.max(0, Math.min(K, sel.max_levels|0)) : null;
    if (!cap || expanded || cap >= K) return Array.from({length: K}, (_, i) => i);

    const tops = Array.isArray(sel.top_indices) && sel.top_indices.length === K
      ? sel.top_indices.slice(0, cap)
      : Array.from({length: cap}, (_, i) => i);
    return tops;
  }

  function renderInline(filtersBox, el, bindId, sel, selected, onChange) {
    const domLayerId = domKey(bindId);
    const cid = `ml-sel-${domLayerId}-${(sel && sel.dom_id) ? sel.dom_id : sel.id}`;
    let box = el.querySelector(`#${cid}`);
    if (!box) { box = document.createElement('div'); box.id = cid; box.className = 'ml-filter'; filtersBox.appendChild(box); }

    runCleanup(box);
    box.innerHTML = '';
    const title = document.createElement('div'); title.className = 'ml-filter-title';
    title.textContent = safeLabel(sel.label, sel.id); box.appendChild(title);

    const optionsBox = document.createElement('div'); optionsBox.className = 'ml-filter-options'; box.appendChild(optionsBox);

    const name = `ml-radio-${domLayerId}-${(sel && sel.dom_id) ? sel.dom_id : sel.id}`;
    let expanded = false;

    function drawOptions() {
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

      if (Number.isFinite(sel.max_levels) && sel.dict.length > sel.max_levels && !expanded) {
        const more = document.createElement('button'); more.type = 'button';
        more.textContent = 'Show all…';
        more.className = 'ml-filter-more';
        more.addEventListener('click', () => { expanded = true; drawOptions(); });
        optionsBox.appendChild(more);
      }
    }

    drawOptions();
  }

  function renderDropdown(filtersBox, el, bindId, sel, selected, onChange) {
    const domLayerId = domKey(bindId);
    const cid = `ml-sel-${domLayerId}-${(sel && sel.dom_id) ? sel.dom_id : sel.id}`;
    let box = el.querySelector(`#${cid}`);
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

    let searchBox = null;
    if (sel.searchable) {
      searchBox = document.createElement('input');
      searchBox.type = 'text'; searchBox.placeholder = 'Search...';
      searchBox.className = 'ml-dd-search';
      menu.appendChild(searchBox);
    }

    const optsWrap = document.createElement('div'); optsWrap.className = 'ml-dd-options'; menu.appendChild(optsWrap);
    const groupName = `ml-dd-${domLayerId}-${(sel && sel.dom_id) ? sel.dom_id : sel.id}`;
    let expanded = false;

    function renderOptions(filterText) {
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

      if (Number.isFinite(sel.max_levels) && sel.dict.length > sel.max_levels && !expanded) {
        const more = document.createElement('button'); more.type = 'button';
        more.textContent = 'Show all…';
        more.className = 'ml-filter-more';
        more.addEventListener('click', () => { expanded = true; renderOptions(searchBox ? searchBox.value : ''); });
        optsWrap.appendChild(more);
      }
    }

    renderOptions('');

    if (searchBox) searchBox.addEventListener('input', () => renderOptions(searchBox.value));

    let open = false;
    function setOpen(v) { open = !!v; menu.style.display = open ? 'block' : 'none'; }
    toggle.addEventListener('click', () => setOpen(!open));

    clearBtn.addEventListener('click', () => {
      selected.clear();
      summary.textContent = summarizeSelection(sel, selected);
      renderOptions(searchBox ? searchBox.value : '');
      if (onChange) onChange(); publishFilterState(el, bindId);
    });

    const onDocClick = (ev) => { if (!dd.contains(ev.target)) setOpen(false); };
    document.addEventListener('click', onDocClick);
    // Store cleanup on the persistent container so repeated renders don't leak listeners.
    box.__mfCleanup = () => { document.removeEventListener('click', onDocClick); };
  }

  function ensureSelectUI(el, bindId, sel, onChange, panelMeta){
    if (!sel || !Array.isArray(sel.dict)) { console.warn('[maplamina] select dict missing'); return; }

    const ui = getElState(el);
    const selected = seedSelectionSet(ui, bindId, sel);

    const filtersBox = ensureFiltersContainer(el, bindId, panelMeta);
    if (!filtersBox) return;

    const autoAt = (root.filterSelect && Number.isFinite(root.filterSelect.AUTO_DROPDOWN_AT))
      ? root.filterSelect.AUTO_DROPDOWN_AT : AUTO_DROPDOWN_AT;

    const useDropdown = (sel.dropdown === true) ||
                        (sel.dropdown == null && sel.dict.length >= autoAt);

    const onAnyChange = () => { if (typeof onChange === 'function') onChange(); };

    if (useDropdown) renderDropdown(filtersBox, el, bindId, sel, selected, onAnyChange);
    else renderInline(filtersBox, el, bindId, sel, selected, onAnyChange);
  }

  // (v3) GPU filtering is driven by .__controls.filters in maplamina.js.
  // Legacy per-layer GPU wiring removed.

  root.filterSelect = Object.assign(root.filterSelect || {}, {
    ensureSelectUI,
    AUTO_DROPDOWN_AT
  });
})(window);
