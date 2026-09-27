import { describe, expect, it } from 'vitest';
import type { WireSpec } from '../../srcjs/core/spec-types';
import { loadSpecModule, normalise } from './legacy';
import circlesConstant from './spec-samples/circles-constant';
import circlesPerFeature from './spec-samples/circles-per-feature';
import empty from './spec-samples/empty';
import iconsMarkers from './spec-samples/icons-markers';
import legends from './spec-samples/legends';
import lengthOne from './spec-samples/length-one';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';

const samples: Record<string, WireSpec> = {
  empty,
  'circles-constant': circlesConstant,
  'circles-per-feature': circlesPerFeature,
  'lines-views': linesViews,
  'polygons-components': polygonsComponents,
  'icons-markers': iconsMarkers,
  legends,
  'length-one': lengthOne,
};

const spec = loadSpecModule();

// A copy of a sample that a test may break.
function broken(edit: (x: any) => void): unknown {
  const x = normalise(polygonsComponents);
  edit(x);
  return x;
}

describe('assertV3Spec accepts what the R compiler emits', () => {
  for (const [name, sample] of Object.entries(samples)) {
    it(name, () => {
      expect(spec.assertV3Spec(normalise(sample), name)).toBe(true);
    });
  }

  it('accepts a component bucket that is null, empty or absent', () => {
    expect(spec.assertV3Spec(broken((x) => { x['.__components'].legends = null; }))).toBe(true);
    expect(spec.assertV3Spec(broken((x) => { x['.__components'].legends = []; }))).toBe(true);
    expect(spec.assertV3Spec(broken((x) => { delete x['.__components'].legends; }))).toBe(true);
  });

  it('accepts a spec with no panel', () => {
    expect(spec.assertV3Spec(broken((x) => { x['.__panel'] = null; }))).toBe(true);
  });
});

describe('assertV3Spec rejects the empty top-level lists until renderValue() has replaced them', () => {
  it('.__layers as []', () => {
    expect(() => spec.assertV3Spec(empty)).toThrow('missing .__layers object');
  });

  it('.__controls as []', () => {
    expect(() => spec.assertV3Spec({ ...empty, '.__layers': {} })).toThrow('missing .__controls object');
  });
});

describe('assertV3Spec rejects', () => {
  const cases: [string, unknown, string][] = [
    ['a spec that is not an object', 'spec', 'expected an object'],
    ['no spec', null, 'expected an object'],
    ['missing .__layers', broken((x) => { delete x['.__layers']; }), 'missing .__layers object'],
    ['missing .__components', broken((x) => { delete x['.__components']; }), 'missing .__components object'],
    ['.__components as an array', broken((x) => { x['.__components'] = []; }), 'missing .__components object'],
    ['missing .__controls', broken((x) => { delete x['.__controls']; }), 'missing .__controls object'],
    ['a bucket that is a filled array', broken((x) => { x['.__components'].views = [{}]; }),
      '.__components.views must be an object'],
    ['a bucket that is a string', broken((x) => { x['.__components'].range = 'range'; }),
      '.__components.range must be an object'],
    ['a control group that is not an object', broken((x) => { x['.__controls'].views = 'views'; }),
      'control group "views" is not an object'],
    ['a control group with no type', broken((x) => { delete x['.__controls'].views.type; }),
      'control group "views" missing type'],
    ['a panel that is an array', broken((x) => { x['.__panel'] = []; }), '.__panel must be an object'],
    ['panel sections that are not an array', broken((x) => { x['.__panel'].sections = { id: 'views' }; }),
      '.__panel.sections must be an array'],
    ['a panel section with no id', broken((x) => { x['.__panel'].sections = [{}]; }), 'panel section missing id'],
    ['a panel section naming no control group', broken((x) => { x['.__panel'].sections = [{ id: 'absent' }]; }),
      'panel section "absent" has no matching control group'],
    ['a layer that is not an object', broken((x) => { x['.__layers'].polygon1 = 'polygon'; }),
      'layer "polygon1" is not an object'],
    ['a layer with no type', broken((x) => { delete x['.__layers'].polygon1.type; }),
      'layer "polygon1" missing type'],
  ];

  for (const [name, x, message] of cases) {
    it(name, () => {
      expect(() => spec.assertV3Spec(x, 'test')).toThrow(message);
    });
  }

  for (const key of ['views', 'filters', 'panel', 'controls', 'transitions']) {
    it(`a layer carrying "${key}"`, () => {
      const x = broken((s) => { s['.__layers'].polygon1[key] = {}; });
      expect(() => spec.assertV3Spec(x)).toThrow(`legacy per-layer field "${key}" found in layer "polygon1"`);
    });
  }
});

describe('control group order', () => {
  it('follows the panel sections, then the remaining groups as emitted', () => {
    const x = normalise(polygonsComponents);
    expect(Object.keys(x['.__controls'])).toEqual(['views', 'filters', 'summaries']);
    const reordered = broken((s) => {
      s['.__panel'].sections = [{ id: 'summaries' }, { id: 'views' }];
    }) as typeof x;
    expect(spec.controls.getControlGroupIdsOrdered(reordered)).toEqual(['summaries', 'views', 'filters']);
  });

  it('is the emitted order when there is no panel', () => {
    const x = normalise(legends);
    expect(spec.controls.getControlGroupIdsOrdered(x)).toEqual(Object.keys(x['.__controls']));
  });
});
