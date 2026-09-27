// HUD DOM wiring only; the widget decides what to display.

import type { WidgetElement } from '../core/widget';
import { ensureItem } from './dock';

export interface HudParts {
  hud: HTMLElement;
  summary: HTMLElement;
  gpu: HTMLElement;
  notes: HTMLElement;
}

export function ensureParts(el: WidgetElement | null | undefined): HudParts | null {
  if (!el) return null;

  let host: HTMLElement | null = null;
  try {
    host = ensureItem(el, 'bottomright', 'hud', { className: 'ml-hud-host', order: 90 });
  } catch (_) {}

  const mount = host || el;

  let hud = mount.querySelector<HTMLElement>('.ml-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.className = 'ml-hud';
    mount.appendChild(hud);
  }

  // Store a direct reference for cleanup (avoid querying the dock host).
  try { el.__mfHudNode = hud; } catch (_) {}

  let summary = hud.querySelector<HTMLElement>('.ml-hud-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'ml-hud-summary';
    hud.appendChild(summary);
  }

  let gpu = hud.querySelector<HTMLElement>('.ml-hud-gpu');
  if (!gpu) {
    gpu = document.createElement('div');
    gpu.className = 'ml-hud-gpu';
    gpu.style.marginTop = '4px';
    hud.appendChild(gpu);
  }

  let notes = hud.querySelector<HTMLElement>('.ml-hud-notes');
  if (!notes) {
    notes = document.createElement('div');
    notes.className = 'ml-hud-notes';
    notes.style.marginTop = '4px';
    hud.appendChild(notes);
  }

  return { hud, summary, gpu, notes };
}

export function destroy(el: WidgetElement | null | undefined): void {
  if (!el) return;

  // Prefer the explicit node reference captured in ensureParts().
  let hud: HTMLElement | null = null;
  try { hud = el.__mfHudNode || null; } catch (_) {}
  if (!hud) {
    try { hud = el.querySelector<HTMLElement>('.ml-hud'); } catch (_) {}
  }

  if (hud && hud.parentNode) {
    try { hud.parentNode.removeChild(hud); } catch (_) {}
  }

  try { el.__mfHudNode = null; } catch (_) {}

  // Best-effort: if the dock host exists and is now empty, remove it.
  try {
    const host = el.querySelector('.ml-hud-host');
    if (host && host.parentNode && !host.querySelector('.ml-hud')) {
      host.parentNode.removeChild(host);
    }
  } catch (_) {}
}
