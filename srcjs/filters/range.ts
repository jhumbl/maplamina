import { domKey, widgetKey } from '../core/utils';
import { ensureFiltersContainer, getElState, publishFilterState } from './core';
import type { PanelMeta, RangeUiSpec } from './core';
import { mount } from './range-slider';

type FilterBox = HTMLElement & {
  __mfCleanup?: (() => void) | null;
};

// --- helpers ---------------------------------------------------------------

// Ensure per-control listeners/observers are cleaned up between re-renders.
function runCleanup(box: FilterBox | null): void {
  if (!box) return;
  if (typeof box.__mfCleanup === 'function') {
    try { box.__mfCleanup(); } catch (e) { console.error(e); }
  }
  box.__mfCleanup = null;
}


function autoPowerStep(min: number, max: number): number {
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

function decimalsForStep(step: number): number {
  if (!(step > 0) || !isFinite(step)) return 0;
  const k = Math.log10(step);
  const dec = Math.max(0, Math.round(-k));
  return Math.min(dec, 6);
}

function formatValue(v: number, decimals: number): string {
  if (!isFinite(v)) return String(v);
  const tol = Math.pow(10, -decimals) / 2;
  if (Math.abs(v) < tol) v = 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e6) return Number(v).toExponential(2);
  return Number(v).toFixed(decimals);
}

// --- UI: ensureRangeUI -----------------------------------------------------

export function ensureRangeUI(
  el: HTMLElement,
  bindId: string,
  rng: RangeUiSpec,
  onChange: (() => void) | null | undefined,
  panelMeta: PanelMeta | null | undefined
): void {
  const filtersBox = ensureFiltersContainer(panelMeta);
  if (!filtersBox) return;

  const domLayerId = `${widgetKey(el)}-${domKey(bindId)}`;

  const cid = `ml-rng-${domLayerId}-${rng.dom_id}`;
  let found = el.querySelector<FilterBox>(`#${cid}`);
  if (!found) {
    found = document.createElement('div');
    found.id = cid;
    found.className = 'ml-filter';
    filtersBox.appendChild(found);
  }
  const box: FilterBox = found;

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

  const effectiveStep = (Number(rng.step) > 0 && isFinite(rng.step as number))
    ? Number(rng.step)
    : autoPowerStep(rng.min, rng.max);

  const decimals = decimalsForStep(effectiveStep);

  let current: readonly number[] = Array.isArray(saved)
    ? [Number(saved[0]), Number(saved[1])]
    : (Array.isArray(rng.default) ? rng.default.slice(0, 2) : [rng.min, rng.max]);

  function syncLabels(): void {
    loLab.textContent = formatValue(current[0], decimals);
    hiLab.textContent = formatValue(current[1], decimals);
  }

  // Always use the provided onChange callback.
  // The runtime scheduler coalesces rebuilds, so UI can emit live changes directly.
  const notify = () => {
    try {
      if (typeof onChange === 'function') onChange();
    } catch (e) {
      console.error(e);
    }
  };

  const sliderApi = mount(sliderHost, {
    min: rng.min,
    max: rng.max,
    step: effectiveStep,
    value: current,

    onInput: (vals) => {
      current = vals;
      ui[bindId].range![rng.id] = vals;
      syncLabels();
      publishFilterState(el, bindId);

      if (rng.live) notify();
    },

    onCommit: (vals) => {
      current = vals;
      ui[bindId].range![rng.id] = vals;
      syncLabels();
      publishFilterState(el, bindId);

      if (rng.live) {
        notify();
      } else if (typeof onChange === 'function') {
        onChange();
      }
    }
  });

  // Ensure re-renders don't leak observers.
  box.__mfCleanup = () => {
    try { sliderApi && typeof sliderApi.destroy === 'function' && sliderApi.destroy(); }
    catch (e) { console.error(e); }
  };

  syncLabels();
}
