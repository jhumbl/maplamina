import type { Control, Spec } from '../core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../core/widget';

// What the pipeline hands to an update: the job that asked for it.
export interface ControlJob {
  readonly reason?: string;
}

export type ControlRender = (
  mountEl: HTMLElement | null,
  el: WidgetElement,
  x: Spec,
  groupId: string,
  controlSpec: Control | null | undefined
) => void;

export type ControlUpdate = (
  mountEl: HTMLElement | null,
  el: WidgetElement,
  x: Spec,
  rt: WidgetRuntime | null | undefined,
  groupId: string,
  controlSpec: Control | null | undefined,
  job?: ControlJob | null
) => void;

export interface ControlHandler {
  render: ControlRender;
  update: ControlUpdate | null;
}

export type ControlHandlerInput = ControlRender | { render: ControlRender; update?: ControlUpdate | null };

// Registry for control handlers, keyed by controlSpec.type.
const _handlers = new Map<string, ControlHandler>();

function normType(t: unknown): string {
  return (t == null) ? '' : String(t).trim().toLowerCase();
}

function normalizeHandler(h: ControlHandlerInput): ControlHandler {
  // Allowed:
  //  - function (render)
  //  - { render: fn, update?: fn }
  if (typeof h === 'function') return { render: h, update: null };
  if (h && typeof h === 'object') {
    const r = h.render;
    const u = h.update;
    if (typeof r !== 'function') {
      throw new Error('[maplamina] controls.registry.register requires a function or {render: fn, update?: fn}');
    }
    return { render: r, update: (typeof u === 'function') ? u : null };
  }
  throw new Error('[maplamina] controls.registry.register requires a function or {render: fn, update?: fn}');
}

export function register(type: unknown, handler: ControlHandlerInput): void {
  const key = normType(type);
  if (!key) throw new Error('[maplamina] controls.registry.register requires a type');
  const h = normalizeHandler(handler);
  _handlers.set(key, h);
}

export function getHandler(type: unknown): ControlHandler | null {
  const key = normType(type);
  return key ? (_handlers.get(key) || null) : null;
}
