// Globals the widget script reads from the page, and the one it publishes.

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
  const HTMLWidgets: {
    widget(definition: HTMLWidgetDefinition): void;
    shinyMode?: boolean;
  };

  interface ShinyClient {
    setInputValue(name: string, value: unknown, opts?: { priority?: 'event' | 'deferred' }): void;
  }

  var MAPLAMINA: { controls: { panel: { sync: typeof import('./controls/panel').sync } } };
  var Shiny: ShinyClient | undefined;
}

export {};
