// htmlwidgets entry point.

// The control renderers register themselves when they load.
import './controls/filters';
import './controls/legends';
import { sync } from './controls/panel';
import './controls/summaries';
import './controls/views';
import { create } from './runtime/widget';

// What is reached from outside the bundle.
window.MAPLAMINA = { controls: { panel: { sync } } };

// htmlwidgets hands renderValue() the parsed JSON; create() reads it as the spec and validates it.
HTMLWidgets.widget({
  name: 'maplamina',
  type: 'output',
  factory: create
});
