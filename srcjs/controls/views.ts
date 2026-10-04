import type { Control, Spec, ViewsControl } from '../core/spec-types';
import { asArray, normText } from '../core/utils';
import type { WidgetElement } from '../core/widget';
import { pickActiveViews } from '../runtime/api';

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

  const active = pickActiveViews(widgetEl && widgetEl.__mfRuntime, spec)[gid];

  renderRadioList(mountEl, widgetEl, views, active, gid);
}
