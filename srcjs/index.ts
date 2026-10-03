// htmlwidgets entry point.

import { sync } from './controls/panel';
import { create } from './runtime/widget';

// What is reached from outside the bundle.
window.MAPLAMINA = { controls: { panel: { sync } } };

// htmlwidgets hands renderValue() the parsed JSON; create() reads it as the spec and validates it.
HTMLWidgets.widget({
  name: 'maplamina',
  type: 'output',
  factory: create
});
