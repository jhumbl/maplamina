// Globals the page provides before the widget scripts run.

interface HTMLWidgetInstance {
  renderValue(x: unknown): void | Promise<void>;
  resize(width: number, height: number): void;
  destroy?(): void;
}

interface HTMLWidgetDefinition {
  name: string;
  type: 'output';
  factory(el: HTMLElement, width: number, height: number): HTMLWidgetInstance;
}

declare global {
  const deck: typeof import('@deck.gl/core') &
    typeof import('@deck.gl/layers') &
    typeof import('@deck.gl/extensions') &
    typeof import('@deck.gl/mapbox');
  const maplibregl: typeof import('maplibre-gl');
  const HTMLWidgets: {
    widget(definition: HTMLWidgetDefinition): void;
    shinyMode?: boolean;
  };

  interface ShinyClient {
    setInputValue(name: string, value: unknown, opts?: { priority?: 'event' | 'deferred' }): void;
  }

  var MAPLAMINA: import('./namespace').Namespace;
  var Shiny: ShinyClient | undefined;
}

export {};
