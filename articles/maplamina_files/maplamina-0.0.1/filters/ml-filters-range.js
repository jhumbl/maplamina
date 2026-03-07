(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-filters-range.js");
  }

  const utils = core.require('utils', 'ml-filters-range.js');
  if (!utils || typeof utils.domKey !== 'function') {
    throw new Error("[maplamina] Missing function utils.domKey required by ml-filters-range.js");
  }
  const domKey = utils.domKey;

  const filterCore = core.require('filterCore', 'ml-filters-range.js');
  const { ensureFiltersContainer, publishFilterState, getElState } = filterCore;
  if (typeof ensureFiltersContainer !== 'function') throw new Error("[maplamina] Missing function filterCore.ensureFiltersContainer required by ml-filters-range.js");
  if (typeof publishFilterState !== 'function') throw new Error("[maplamina] Missing function filterCore.publishFilterState required by ml-filters-range.js");
  if (typeof getElState !== 'function') throw new Error("[maplamina] Missing function filterCore.getElState required by ml-filters-range.js");

  // --- helpers ---------------------------------------------------------------

  // Ensure per-control listeners/observers are cleaned up between re-renders.
  function runCleanup(box) {
    if (!box) return;
    if (typeof box.__mfCleanup === 'function') {
      try { box.__mfCleanup(); } catch (e) { console.error(e); }
    }
    box.__mfCleanup = null;
    box.__mfRangeSliderApi = null;
  }


  function autoPowerStep(min, max) {
    const span = Math.abs((Number(max) || 0) - (Number(min) || 0));
    if (!isFinite(span) || span <= 0) return 1;
    const target = 240;
    const raw = span / target;
    const k = Math.round(Math.log10(raw));
    let step = Math.pow(10, k);
    let n = span / step;
    if (n < 60)  step /= 10;
    if (n > 240) step *= 10;
    return step;
  }

  function decimalsForStep(step) {
    if (!(step > 0) || !isFinite(step)) return 0;
    const k = Math.log10(step);
    const dec = Math.max(0, Math.round(-k));
    return Math.min(dec, 6);
  }

  function formatValue(v, decimals) {
    if (!isFinite(v)) return String(v);
    const tol = Math.pow(10, -decimals) / 2;
    if (Math.abs(v) < tol) v = 0;
    if (v === 0) return '0';
    if (Math.abs(v) >= 1e6) return Number(v).toExponential(2);
    return Number(v).toFixed(decimals);
  }

  // --- UI: ensureRangeUI -----------------------------------------------------

  function ensureRangeUI(el, bindId, rng, onChange, panelMeta){
    const filtersBox = ensureFiltersContainer(el, bindId, panelMeta);
    if (!filtersBox) return;

    const domLayerId = domKey(bindId);

    const cid = `ml-rng-${domLayerId}-${(rng && rng.dom_id) ? rng.dom_id : rng.id}`;
    let box = el.querySelector(`#${cid}`);
    if (!box) {
      box = document.createElement('div');
      box.id = cid;
      box.className = 'ml-filter';
      filtersBox.appendChild(box);
    }

    runCleanup(box);
    box.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ml-filter-title';
    const niceLabel = Array.isArray(rng.label) ? String(rng.label[rng.label.length - 1]) : String(rng.label || rng.id);
    title.textContent = niceLabel;
    box.appendChild(title);

    const labels = document.createElement('div');
    labels.className = 'ml-rng-labels';
    const loLab = document.createElement('span');
    const hiLab = document.createElement('span');
    labels.appendChild(loLab);
    labels.appendChild(hiLab);
    box.appendChild(labels);

    const sliderHost = document.createElement('div');
    box.appendChild(sliderHost);

    const ui = getElState(el);
    ui[bindId] = ui[bindId] || {};
    ui[bindId].range = ui[bindId].range || {};
    const saved = ui[bindId].range[rng.id];

    const effectiveStep = (Number(rng.step) > 0 && isFinite(rng.step))
      ? Number(rng.step)
      : autoPowerStep(rng.min, rng.max);

    const decimals = decimalsForStep(effectiveStep);

    let current = Array.isArray(saved)
      ? [Number(saved[0]), Number(saved[1])]
      : (Array.isArray(rng.default) ? rng.default.slice(0, 2) : [rng.min, rng.max]);

    function syncLabels(){
      loLab.textContent = formatValue(current[0], decimals);
      hiLab.textContent = formatValue(current[1], decimals);
    }

    // v3: always use the provided onChange callback.
    // The runtime scheduler coalesces rebuilds, so UI can emit live changes directly.
    const notify = () => {
      try {
        if (typeof onChange === 'function') onChange();
      } catch (e) {
        console.error(e);
      }
    };

    const sliderApi = root.rangeSlider.mount(sliderHost, {
      min: rng.min,
      max: rng.max,
      step: effectiveStep,
      value: current,

      onInput: (vals) => {
        current = vals;
        ui[bindId].range[rng.id] = vals;
        syncLabels();
        publishFilterState(el, bindId);

        if (rng.live) notify();
      },

      onCommit: (vals) => {
        current = vals;
        ui[bindId].range[rng.id] = vals;
        syncLabels();
        publishFilterState(el, bindId);

        if (rng.live) {
          notify();
        } else if (typeof onChange === 'function') {
          onChange();
        }
      }
    });

    // Persist slider API for cleanup; ensure re-renders don't leak observers.
    box.__mfRangeSliderApi = sliderApi;
    box.__mfCleanup = () => {
      try { sliderApi && typeof sliderApi.destroy === 'function' && sliderApi.destroy(); }
      catch (e) { console.error(e); }
      box.__mfRangeSliderApi = null;
    };

    syncLabels();
  }

  // (v3) GPU filtering is driven by .__controls.filters in maplamina.js.
  // Legacy per-layer GPU wiring removed.

  root.filterRange = Object.assign({}, root.filterRange, { ensureRangeUI });
})(window);
