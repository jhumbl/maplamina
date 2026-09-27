// Runs widget scripts that have not been converted yet against a bare namespace object.
import namespaceSource from '../../inst/htmlwidgets/core/ml-namespace.js?raw';
import utilsSource from '../../inst/htmlwidgets/core/ml-utils.js?raw';
import specSource from '../../inst/htmlwidgets/core/ml-spec.js?raw';
import type { Control, Spec, WireSpec } from '../../srcjs/core/spec-types';

export interface SpecModule {
  assertV3Spec(x: unknown, where?: string): true;
  controls: {
    getControlGroupIdsOrdered(x: Spec): string[];
    getControlGroupsByType(x: Spec, type: string): { groupId: string; spec: Control }[];
  };
}

export function loadSpecModule(): SpecModule {
  const page: { MAPLAMINA?: { spec?: SpecModule } } = {};
  for (const source of [namespaceSource, utilsSource, specSource]) {
    new Function('window', source)(page);
  }
  const spec = page.MAPLAMINA?.spec;
  if (!spec) throw new Error('ml-spec.js did not register MAPLAMINA.spec');
  return spec;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// The same three replacements renderValue() makes before it validates.
export function normalise(wire: WireSpec): Spec {
  const x = structuredClone(wire) as Mutable<WireSpec>;
  if (Array.isArray(x['.__layers'])) x['.__layers'] = {};
  if (Array.isArray(x['.__components'])) x['.__components'] = {} as WireSpec['.__components'];
  if (Array.isArray(x['.__controls'])) x['.__controls'] = {};
  return x as Spec;
}
