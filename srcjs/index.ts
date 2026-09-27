// htmlwidgets entry point.

import './namespace';
import { create } from './runtime/widget';

// htmlwidgets hands renderValue() the parsed JSON; create() reads it as the spec and validates it.
HTMLWidgets.widget({
  name: 'maplamina',
  type: 'output',
  factory: create
});
