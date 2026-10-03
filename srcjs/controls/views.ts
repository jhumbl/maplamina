import type { Control, Spec, ViewsControl } from '../core/spec-types';
import { asArray, normText } from '../core/utils';
import type { RuntimeState, WidgetElement, WidgetRuntime } from '../core/widget';

function ensureRuntimeState(rt: WidgetRuntime | null | undefined): RuntimeState | null {
  if (!rt) return null;
  if (!rt.state || typeof rt.state !== 'object') rt.state = {};
  if (!rt.state.views || typeof rt.state.views !== 'object') rt.state.views = {};
  return rt.state;
}

function pickInitialActive(
  rt: WidgetRuntime | null | undefined,
  controlSpec: ViewsControl | null | undefined,
  groupId: string
): string {
  const state: RuntimeState = ensureRuntimeState(rt) || {};
  const gid = normText(groupId) || 'views';
  const viewNames = asArray(controlSpec && controlSpec.view_names).map(normText).filter(Boolean);

  const current = normText(state.views && state.views[gid]);
  if (current && viewNames.includes(current)) return current;

  const def = normText(controlSpec && controlSpec.default);
  if (def && viewNames.includes(def)) return def;

  return viewNames.length ? viewNames[0] : 'base';
}

function renderRadioList(
  mountEl: HTMLElement,
  widgetEl: WidgetElement | null | undefined,
  controlSpec: ViewsControl | null | undefined,
  activeView: string,
  groupId: string
): void {
  mountEl.textContent = '';

  const viewNames = asArray(controlSpec && controlSpec.view_names).map(normText).filter(Boolean);

  if (!viewNames.length) {
    const msg = document.createElement('div');
    msg.className = 'ml-controls-placeholder';
    msg.textContent = 'No views available.';
    mountEl.appendChild(msg);
    return;
  }

  const form = document.createElement('form');
  const name = 'ml-views-radios-' + (widgetEl && widgetEl.id ? widgetEl.id : 'maplamina') + '-' + normText(groupId || 'views');

  for (const vn of viewNames) {
    const row = document.createElement('label');

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = vn;
    input.checked = (vn === activeView);

    input.addEventListener('change', () => {
      if (!input.checked) return;
      const rt = widgetEl && widgetEl.__mfRuntime;

      if (rt && typeof rt.setActiveView === 'function') {
        try { rt.setActiveView(normText(groupId) || 'views', vn); } catch (e) { console.error(e); }
      }
    });

    const span = document.createElement('span');
    span.textContent = vn;

    row.appendChild(input);
    row.appendChild(span);
    form.appendChild(row);
  }

  mountEl.appendChild(form);
}

// Draws the radio list of a views control group into the node the panel gives it.
export function render(
  mountEl: HTMLElement | null,
  widgetEl: WidgetElement | null | undefined,
  spec: Spec,
  groupId: string,
  controlSpec: Control | null | undefined
): void {
  if (!mountEl) return;

  const gid = normText(groupId) || 'views';
  const ctl = controlSpec;
  if (!ctl || typeof ctl !== 'object') { mountEl.textContent = ''; return; }
  if (ctl.type && String(ctl.type) !== 'views') { mountEl.textContent = ''; return; }
  const views = ctl as ViewsControl;

  const rt = widgetEl && widgetEl.__mfRuntime;
  const state = ensureRuntimeState(rt);
  const active = pickInitialActive(rt, views, gid);
  if (state) {
    if (!state.views || typeof state.views !== 'object') state.views = {};
    state.views[gid] = active;
  }

  renderRadioList(mountEl, widgetEl, views, active, gid);
}
