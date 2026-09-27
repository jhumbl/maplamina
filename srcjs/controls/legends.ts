import { applyVisibility, buildLegendCard } from '../components/legends';
import type { Components, Control, LegendsComponent, LegendsControl, Spec } from '../core/spec-types';
import { asArray, normText as normTextBase } from '../core/utils';
import type { WidgetElement } from '../core/widget';
import { register } from './registry';

const normText = (x: unknown): string => String(normTextBase(x) ?? '').trim();

function getControlsRoot(spec: Spec): Spec['.__controls'] {
  return (spec && spec['.__controls']) || {};
}

function getComponentsRoot(spec: Spec): Partial<Components> {
  return (spec && spec['.__components']) || {};
}

function getLegendsBucket(spec: Spec): Readonly<Record<string, LegendsComponent>> {
  const comps = getComponentsRoot(spec);
  const bucket = comps && comps.legends;
  return ((bucket && typeof bucket === 'object') ? bucket : {}) as Readonly<Record<string, LegendsComponent>>;
}

// Draws the legend cards of a legends control group into the node the panel gives it.
export function render(
  mountEl: HTMLElement | null,
  widgetEl: WidgetElement | null | undefined,
  spec: Spec,
  groupId: string,
  controlSpec: Control | null | undefined
): void {
  if (!mountEl) return;

  const gid = normText(groupId);
  const controlsRoot = getControlsRoot(spec);
  const ctl = controlSpec || (gid ? controlsRoot[gid] : null);

  if (!ctl || typeof ctl !== 'object') {
    mountEl.textContent = '';
    return;
  }

  const type = normText(ctl.type).toLowerCase();
  if (type && type !== 'legends') {
    mountEl.textContent = '';
    return;
  }
  const legends = ctl as LegendsControl;

  mountEl.textContent = '';

  const members = asArray(legends.members).map(normText).filter(Boolean);
  if (!members.length) {
    const msg = document.createElement('div');
    msg.className = 'ml-controls-placeholder';
    msg.textContent = 'No legends available.';
    mountEl.appendChild(msg);
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'ml-legend-stack ml-control-legends-stack';
  mountEl.appendChild(stack);

  // Stable hook for group-level hide/show (used by applyVisibility).
  try { stack.dataset.mfLegendsGroup = gid; } catch (_) {}

  const bucket = getLegendsBucket(spec);

  for (const id of members) {
    const comp = (bucket && Object.prototype.hasOwnProperty.call(bucket, id)) ? bucket[id] : null;
    if (!comp || typeof comp !== 'object') continue;

    let node: HTMLDivElement | null = null;
    try {
      node = buildLegendCard(comp);
    } catch (e) {
      console.error('[maplamina] legends control failed to build legend card', e);
    }

    // Fallback: minimal card so we never hard-fail rendering.
    if (!node) {
      node = document.createElement('div');
      node.className = 'ml-legend';
      const lid = normText((comp && comp.id != null) ? comp.id : id);
      node.dataset.legendId = lid;
      const lg: { readonly title?: string | null } = (comp && comp.legend && typeof comp.legend === 'object') ? comp.legend : {};
      node.textContent = normText(lg.title || id || 'Legend');
    }

    stack.appendChild(node);
  }

  if (!stack.childNodes.length) {
    const msg = document.createElement('div');
    msg.className = 'ml-controls-placeholder';
    msg.textContent = 'No legends found for this control group.';
    mountEl.appendChild(msg);
  }

  // Apply `when` visibility rules on first mount.
  try { applyVisibility(widgetEl, spec); } catch (_) {}
}

try {
  register('legends', render);
} catch (_) {}
