import type { Control, Spec } from '../core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../core/widget';
import { render as renderFilters } from './filters';
import { render as renderLegends } from './legends';
import { render as renderSummaries, update as updateSummaries } from './summaries';
import { render as renderViews } from './views';

// What the pipeline hands to an update: the job that asked for it.
export interface ControlJob {
  readonly reason?: string | null;
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

// Control handlers, keyed by controlSpec.type.
const _handlers = new Map<string, ControlHandler>([
  ['filters',   { render: renderFilters,   update: null }],
  ['legends',   { render: renderLegends,   update: null }],
  ['summaries', { render: renderSummaries, update: updateSummaries }],
  ['views',     { render: renderViews,     update: null }]
]);

function normType(t: unknown): string {
  return (t == null) ? '' : String(t).trim().toLowerCase();
}

export function getHandler(type: unknown): ControlHandler | null {
  const key = normType(type);
  return key ? (_handlers.get(key) || null) : null;
}
