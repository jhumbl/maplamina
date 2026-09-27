// The widget's root element and what the runtime keeps on it.

import type { Map as MapLibreMap } from 'maplibre-gl';

export interface RuntimeState {
  views?: Record<string, string>;
}

export interface WidgetRuntime {
  state?: RuntimeState;
}

export interface WidgetElement extends HTMLElement {
  __mfGetMap?: () => MapLibreMap | null;
  __mfRuntime?: WidgetRuntime | null;
}
