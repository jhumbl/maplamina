import type { PickingInfo } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { resolveRefOrHref } from '../core/assets';
import { getIndexers } from '../core/data';
import type { LayerState, PlaceholderState, RefNode, TemplateState } from '../core/layer-state';
import { escapeHtml, isTA } from '../core/utils';
import type { WidgetElement } from '../core/widget';

export type WidgetPickingInfo = PickingInfo & { __mfContainer?: HTMLElement };

export interface TooltipContent {
  html: string;
}

export type TooltipFn = (info: WidgetPickingInfo | null | undefined) => TooltipContent | null;

type Formatter = (v: number) => string | number;

interface CompiledTemplate {
  parts: (string | null)[];
  slots: { name: string; fmt: string }[];
}

interface TemplateRuntime {
  compiled: CompiledTemplate;
  fmtByName: Record<string, Formatter>;
  hydrating: Promise<void> | null;
  hydrated: boolean;
}

function compileTemplate(template: string): CompiledTemplate {
  // Split "M {mag:.1f} at {depth:.0f}" -> parts + slots
  const re = /\{([^}:]+)(?::([^}]+))?\}/g;
  const parts: (string | null)[] = [];
  const slots: { name: string; fmt: string }[] = [];
  let last = 0, m;
  while ((m = re.exec(template))) {
    if (m.index > last) parts.push(template.slice(last, m.index));
    parts.push(null);
    slots.push({ name: m[1], fmt: m[2] || '' });
    last = re.lastIndex;
  }
  if (last < template.length) parts.push(template.slice(last));
  return { parts, slots };
}

function buildFormatter(fmt: string): Formatter {
  if (!fmt) return (v) => v;

  // Percent with optional .xf (".1f%"), fixed decimals (".1f"), thousands (",")
  if (fmt.includes('%') && /\.\d+f/.test(fmt)) {
    const d = +fmt.match(/\.(\d+)f/)![1];
    return (v) => (Number(v) * 100).toFixed(d) + '%';
  }
  if (fmt === '%') return (v) => Math.round(Number(v) * 100) + '%';

  const mFix = fmt.match(/\.(\d+)f/);
  if (mFix) {
    const d = +mFix[1];
    const useComma = fmt.includes(',');
    return (v) => {
      const t = Number(v).toFixed(d);
      return useComma ? Number(t).toLocaleString() : t;
    };
  }

  if (fmt === ',') return (v) => Number(v).toLocaleString();

  // Dates (UTC) from epoch seconds
  if (fmt.includes('%Y') || fmt.includes('%d') || fmt.includes('%b')) {
    const pad = (x: number, n = 2) => String(x).padStart(n, '0');
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (v) => {
      const d = new Date(Number(v) * 1000);
      const Y = d.getUTCFullYear();
      const M = d.getUTCMonth();
      const D = d.getUTCDate();
      if (fmt === '%Y-%m-%d') return `${Y}-${pad(M+1)}-${pad(D)}`;
      if (fmt === '%d %b %Y') return `${pad(D)} ${mon[M]} ${Y}`;
      return d.toISOString();
    };
  }

  return (v) => v;
}

function __findMapWidgetContainer(el: WidgetElement | null | undefined): WidgetElement | null {
  if (!el) return null;

  // Fast path: widget root stores __mfGetMap()
  if (typeof el.__mfGetMap === 'function') return el;

  // MapLibre attaches .maplibregl-map to the widget container
  if (typeof el.closest === 'function') {
    const c = el.closest<WidgetElement>('.maplibregl-map');
    if (c && typeof c.__mfGetMap === 'function') return c;
  }

  // Walk up DOM as a last resort (supports atypical container nesting)
  let p: WidgetElement | null = el.parentElement;
  while (p) {
    if (typeof p.__mfGetMap === 'function') return p;
    p = p.parentElement;
  }
  return null;
}

function __getMapFromContainer(container: WidgetElement | null | undefined): MapLibreMap | null {
  const wc = __findMapWidgetContainer(container);
  if (wc && typeof wc.__mfGetMap === 'function') {
    return wc.__mfGetMap();
  }
  return null;
}

function stableContainer(info: WidgetPickingInfo | null | undefined): HTMLElement {
  // Prefer the widget container (stable across picked + background clicks)
  if (info && info.__mfContainer) return info.__mfContainer;

  const c = containerFromInfo(info);
  const wc = __findMapWidgetContainer(c);
  if (wc) return wc;
  return c || document.body;
}

// ------------------------------------------------------------
// Hydration: compile template & resolve columns (once per spec)
// ------------------------------------------------------------
const SPEC_STATE = new WeakMap<TemplateState, TemplateRuntime>(); // spec -> { compiled, fmtByName, hydrating, hydrated }

async function hydratePlaceholder(st: LayerState, ph: PlaceholderState): Promise<void> {
  // Accept {ref|href} at the top level, or nested under {value|values}.
  const getRefObj = (x: unknown): RefNode | null => {
    if (!x || typeof x !== 'object') return null;
    const node = x as RefNode;
    if (node.ref || node.href) return node;
    const v = node.values || node.value;
    if (v && typeof v === 'object' && (v.ref || v.href)) return v;
    return null;
  };

  const coerceDict = (d: PlaceholderState['dict']): string[] => {
    if (Array.isArray(d)) return d;
    if (typeof d === 'string') return [d];
    if (d == null) return [];
    if (typeof d === 'object' && Array.isArray(d.values)) return d.values;
    return [];
  };

  // Numeric path: values/value -> {ref|href} -> typed array
  const vSpec = (ph.values != null) ? ph.values : ph.value;
  const vRefObj = getRefObj(vSpec);
  if (vRefObj) {
    try {
      const o = await resolveRefOrHref(st, vRefObj);
      if (o && o.array != null) {
        ph._array = o.array;
        ph._kind = ph._kind || ph.kind || 'numeric';
      } else {
        ph._kind = ph._kind || ph.kind || 'missing';
      }
    } catch (_) {
      ph._kind = ph._kind || ph.kind || 'missing';
    }
    return;
  }

  // Direct numeric ref/href (fallback)
  if (ph.ref || ph.href) {
    const refObj: RefNode | null = (typeof ph.ref === 'string') ? { ref: ph.ref }
      : (typeof ph.href === 'string') ? { href: ph.href }
      : (ph.ref && typeof ph.ref === 'object') ? ph.ref
      : (ph.href && typeof ph.href === 'object') ? ph.href
      : null;

    if (refObj) {
      try {
        const o = await resolveRefOrHref(st, refObj);
        if (o && o.array != null) {
          ph._array = o.array;
          ph._kind = ph._kind || ph.kind || 'numeric';
        } else {
          ph._kind = ph._kind || ph.kind || 'missing';
        }
      } catch (_) {
        ph._kind = ph._kind || ph.kind || 'missing';
      }
    }
    return;
  }

  // Categorical path: codes -> {ref|href} + dict
  const cRefObj = getRefObj(ph.codes);
  if (cRefObj) {
    try {
      const o = await resolveRefOrHref(st, cRefObj);
      ph._codes = o && o.array;
      ph._dict  = coerceDict(ph.dict);
      ph._kind  = 'categorical';
    } catch (_) {
      ph._codes = null;
      ph._dict  = coerceDict(ph.dict);
      ph._kind  = 'missing';
    }
    return;
  }

  // Already-hydrated arrays (tolerate)
  if (isTA(vSpec)) { ph._array = vSpec; ph._kind = 'numeric'; return; }
  if (isTA(ph.codes)) { ph._codes = ph.codes; ph._dict = coerceDict(ph.dict); ph._kind = 'categorical'; return; }

  // Otherwise mark missing (we'll abort on render)
  ph._kind = ph._kind || ph.kind || 'missing';
}

async function hydrateAll(st: LayerState, spec: TemplateState): Promise<void> {
  const list = spec?.placeholders || [];
  await Promise.all(list.map(ph => hydratePlaceholder(st, ph)));
}

function ensureState(spec: TemplateState): TemplateRuntime {
  let state = SPEC_STATE.get(spec);
  if (!state) {
    const compiled = compileTemplate(spec.template || '');
    const fmtByName: Record<string, Formatter> = Object.create(null);
    for (const ph of (spec.placeholders || [])) {
      fmtByName[ph.name] = buildFormatter(ph.fmt || '');
    }
    state = { compiled, fmtByName, hydrating: null, hydrated: false };
    SPEC_STATE.set(spec, state);
  }
  return state;
}

// ------------------------------------------------------------
// Build-time (used by layer builders)
// ------------------------------------------------------------
export function prime(st: LayerState): void {
  for (const which of ['tooltip', 'popup'] as const) {
    const spec = st && st[which];
    if (!spec || spec.type !== 'template' || !spec.template) continue;
    const state = ensureState(spec);
    if (!state.hydrated && !state.hydrating) {
      state.hydrating = hydrateAll(st, spec).then(() => { state.hydrated = true; });
    }
  }
}

// ------------------------------------------------------------
// Build template accessors (sync, deck.gl-friendly)
// ------------------------------------------------------------
export function buildGetTemplate(st: LayerState, which: 'tooltip' | 'popup'): TooltipFn | null {
  const spec = st && st[which];
  if (!spec || spec.type !== 'template' || !spec.template) return null;

  const state   = ensureState(spec);
  const parts   = state.compiled.parts;
  const phs     = spec.placeholders || [];
  const { indexForArray, pickPartIndex } = getIndexers(st);

  // start hydration in the background
  if (!state.hydrated && !state.hydrating) {
    state.hydrating = hydrateAll(st, spec).then(() => { state.hydrated = true; });
  }

  // Return a synchronous accessor
  return function(info) {
    if (!info || !info.picked) return null;
    if (!state.hydrated) return null;

    const partIdx = pickPartIndex(info.object, info);
    if (!Number.isFinite(partIdx)) return null;

    // Build output; if any slot can't be read, abort (no "[missing]" flicker).
    // Values are always escaped; only the template text of an html template is markup.
    let slotIdx = 0;
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p !== null) { out += spec.html ? p : escapeHtml(p); continue; }

      const ph  = phs[slotIdx++];
      const fmt = state.fmtByName[ph.name] || ((v: number) => v);

      if (ph._kind === 'categorical') {
        if (!ph._codes) return null;
        const ii = indexForArray(ph._codes, partIdx);
        if (ii < 0 || ii >= ph._codes.length) return null;
        const c = ph._codes[ii] >>> 0;
        const label = (ph._dict && ph._dict[c] != null) ? ph._dict[c] : null;
        if (label == null) return null;
        out += escapeHtml(label);
        continue;
      }

      if (ph._array) {
        const ii = indexForArray(ph._array, partIdx);
        if (ii < 0 || ii >= ph._array.length) return null;
        const v = ph._array[ii];
        const s = fmt(v);
        out += escapeHtml(s);
      } else {
        return null;
      }
    }

    return { html: out };
  };
}

// ------------------------------------------------------------
// Registry (widget element -> layerId -> tooltip function) + dispatcher
// ------------------------------------------------------------
const __TT_REG = new WeakMap<Element, Map<string, TooltipFn>>(); // el -> Map(layerId -> fn(info) -> {html})

export function register(el: Element | null | undefined, layerId: string, fn: TooltipFn | null | undefined): void {
  if (!el) return;
  let reg = __TT_REG.get(el);
  if (!reg) { reg = new Map(); __TT_REG.set(el, reg); }
  if (fn) reg.set(layerId, fn); else reg.delete(layerId);
}

function dispatch(info: WidgetPickingInfo | null | undefined): TooltipContent | null {
  if (!info || !info.layer || !info.__mfContainer) return null;
  const fn = __TT_REG.get(info.__mfContainer)?.get(info.layer.id);
  return typeof fn === 'function' ? fn(info) : null;
}

// ------------------------------------------------------------
// Per-widget runtime: tooltip DOM + popup cleanup (no leaks)
// ------------------------------------------------------------
const TT_RUNTIME = new WeakMap<Element, { ttEl?: HTMLElement | null }>(); // container -> { ttEl }
const POPUP_CLEANUP = new WeakMap<Element, () => void>();                  // container -> () => void

function containerFromInfo(info: WidgetPickingInfo | null | undefined): HTMLElement {
  try {
    // deck declares `canvas` protected.
    const deck = info?.layer?.context?.deck as unknown as { canvas?: HTMLCanvasElement | null } | undefined;
    const canvas = deck?.canvas;
    return canvas?.parentElement || document.body;
  } catch (_) {
    return document.body;
  }
}

function containerFromEl(el: WidgetElement | null | undefined): HTMLElement {
  try {
    const m = el?.__mfGetMap?.();
    return (m && m.getContainer) ? m.getContainer() : (el || document.body);
  } catch (_) { return el || document.body; }
}

// ------------------------------------------------------------
// Widget lifecycle
// ------------------------------------------------------------
export function init(el: WidgetElement | null | undefined): void {
  const container = containerFromEl(el);
  if (!TT_RUNTIME.has(container)) TT_RUNTIME.set(container, { ttEl: null });
}

export function destroy(el: WidgetElement): void {
  const container = containerFromEl(el);
  __TT_REG.delete(el);

  // Close popup if open
  const cleanup = POPUP_CLEANUP.get(container);
  if (typeof cleanup === 'function') {
    cleanup();
    POPUP_CLEANUP.delete(container);
  }

  // Remove tooltip element
  const rt = TT_RUNTIME.get(container);
  if (rt && rt.ttEl && rt.ttEl.parentNode) rt.ttEl.parentNode.removeChild(rt.ttEl);
  TT_RUNTIME.delete(container);
}

// ------------------------------------------------------------
// Custom tooltip manager (bypasses deck.gl default tooltip)
// ------------------------------------------------------------
function __ensureTtEl(container: HTMLElement): HTMLElement {
  const rt = TT_RUNTIME.get(container) || {};
  if (rt.ttEl && rt.ttEl.parentNode) return rt.ttEl;
  const el = document.createElement('div');
  el.className = 'ml-tt2';
  container.appendChild(el);
  TT_RUNTIME.set(container, { ttEl: el });
  return el;
}

function __hideTt(container: HTMLElement): void {
  const rt = TT_RUNTIME.get(container);
  if (rt?.ttEl) rt.ttEl.style.display = 'none';
}

// ------------------------------------------------------------
// Runtime events (wired by the overlay)
// ------------------------------------------------------------
export function handleHover(info: WidgetPickingInfo | null | undefined): void {
  const container = containerFromInfo(info);
  const el = __ensureTtEl(container);

  // No pick → hide + reset cursor
  if (!info || !info.picked) {
    __hideTt(container);
    const cv = container.querySelector('canvas');
    if (cv) cv.style.cursor = '';
    return;
  }

  // Per-layer content
  const res = dispatch(info);
  if (!res) { __hideTt(container); return; }

  // Pointer cursor like Leaflet
  const cv = container.querySelector('canvas');
  if (cv) cv.style.cursor = 'pointer';

  // Flip side based on available width
  const rect = container.getBoundingClientRect();
  const side = info.x < rect.width * 0.5 ? 'right' : 'left';

  // Inner HTML (content + caret span; caret styled in CSS)
  el.className = `ml-tt2 ml-tt2--${side}`;
  el.innerHTML = `<div class="ml-tt2__inner">${res.html}</div><span class="ml-tt2__caret"></span>`;

  // Position near cursor; vertically centered; nudge 12px away horizontally
  el.style.display = 'block';
  el.style.left = `${info.x}px`;
  el.style.top  = `${info.y}px`;
  el.style.transform = (side === 'right')
    ? 'translate(12px, -50%)'                 // RIGHT of cursor
    : 'translate(calc(-100% - 12px), -50%)';  // fully LEFT of cursor
}

// Close popup on bg click for this container
export function handleOverlayClick(info: WidgetPickingInfo | null | undefined): void {
  const container = stableContainer(info);
  if (info && info.picked) return;

  const cleanup = POPUP_CLEANUP.get(container);
  if (typeof cleanup === 'function') {
    try { cleanup(); } finally { POPUP_CLEANUP.delete(container); }
  }
}

// ------------------------------------------------------------
// Anchored popup (click-pinned, follows pan/zoom)
// ------------------------------------------------------------
export function buildOnClickPopup(st: LayerState): ((info: WidgetPickingInfo | null | undefined) => void) | null {
  const getTpl = buildGetTemplate(st, 'popup');
  if (!getTpl) return null;

  let panel: HTMLDivElement | null = null;

  return function onClick(info) {
    if (!info || !info.picked) return;

    const container = stableContainer(info);

    // Get the MapLibre instance (preferred: widget-scoped getter)
    const mapCanvas: (HTMLCanvasElement & { _map?: MapLibreMap }) | null = container.querySelector('canvas');
    const legacyMap = (mapCanvas && mapCanvas._map) || null;
    const map = __getMapFromContainer(container) || legacyMap;
    if (!map) return;

    // Cleanup any previous popup FIRST (prevents second-click no-show)
    const prevStable = POPUP_CLEANUP.get(container);
    if (typeof prevStable === 'function') { prevStable(); POPUP_CLEANUP.delete(container); }
    else {
      const legacyKey = containerFromInfo(info); // overlay canvas parent when picked
      const prevLegacy = POPUP_CLEANUP.get(legacyKey);
      if (typeof prevLegacy === 'function') { prevLegacy(); POPUP_CLEANUP.delete(legacyKey); }
    }

    // Create panel
    if (!panel || !panel.parentNode) {
      panel = document.createElement('div');
      panel.className = 'ml-popup';
      container.appendChild(panel);   // <- container is the stable map container now
    }

    // Content
    const tip = getTpl(info);
    if (!tip) return;
    panel.innerHTML = tip.html;

    // Anchor at feature coordinate; fallback to pointer unproject
    let anchor: [number, number];
    if (Array.isArray(info.coordinate) && isFinite(info.coordinate[0]) && isFinite(info.coordinate[1])) {
      anchor = [Number(info.coordinate[0]), Number(info.coordinate[1])];
    } else {
      const ll = map.unproject([info.x, info.y]);
      anchor = [ll.lng, ll.lat];
    }

    // Position above the anchor with a small caret gap
    function position() {
      const p = map!.project(anchor);
      panel!.style.left = `${p.x}px`;
      panel!.style.top  = `${p.y}px`;
      panel!.style.transform = 'translate(-50%, calc(-100% - 10px))';
    }

    const onMove   = () => position();
    const onRender = () => position();

    function close() {
      try { map!.off('move', onMove); map!.off('render', onRender); } catch(_) {}
      document.removeEventListener('keydown', onKey);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      POPUP_CLEANUP.delete(container);
    }
    function onKey(e: KeyboardEvent){ if (e.key === 'Escape') close(); }

    document.addEventListener('keydown', onKey);
    if (map && map.on) { map.on('move', onMove); map.on('render', onRender); }
    POPUP_CLEANUP.set(container, close);
    position();
  };
}
