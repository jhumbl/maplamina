import { describe, expect, it } from 'vitest';
import * as spec from '../../srcjs/core/spec';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
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

function normalise(wire: WireSpec): Spec {
  const x = structuredClone(wire);
  spec.normalizeSpec(x);
  return x as Spec;
}

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

describe('assertV3Spec rejects the empty top-level lists until normalizeSpec() has replaced them', () => {
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
    expect(spec.getControlGroupIdsOrdered(reordered)).toEqual(['summaries', 'views', 'filters']);
  });

  it('is the emitted order when there is no panel', () => {
    const x = normalise(legends);
    expect(spec.getControlGroupIdsOrdered(x)).toEqual(Object.keys(x['.__controls']));
  });

  // R emits section ids that are control group keys; these three shapes are written by hand.
  it('skips a section naming no group, and a group named twice comes once', () => {
    const x = broken((s) => {
      s['.__panel'].sections = [{ id: 'nope' }, { id: 'summaries' }, { id: 'summaries' }];
    }) as Spec;
    expect(spec.getControlGroupIdsOrdered(x)).toEqual(['summaries', 'views', 'filters']);
  });

  it('matches a section id after trimming', () => {
    const x = broken((s) => {
      s['.__panel'].sections = [{ id: ' filters ' }];
    }) as Spec;
    expect(spec.getControlGroupIdsOrdered(x)).toEqual(['filters', 'views', 'summaries']);
  });

  it('lists the groups of one type in that order', () => {
    const x = broken((s) => {
      s['.__controls'].filters2 = structuredClone(s['.__controls'].filters);
      s['.__panel'].sections = [{ id: 'filters2' }, { id: 'views' }];
    }) as Spec;
    const groups = spec.getControlGroupsByType(x, 'filters');
    expect(groups.map((g) => g.groupId)).toEqual(['filters2', 'filters']);
    expect(groups[1].spec).toBe(x['.__controls'].filters);
    expect(spec.getControlGroupsByType(x, 'legends')).toEqual([]);
  });
});

describe('control and panel lookup', () => {
  it('finds a control group by id, trimmed, and gives null for an absent one', () => {
    const x = normalise(polygonsComponents);
    expect(spec.getControlSpec(x, 'views')).toBe(x['.__controls'].views);
    expect(spec.getControlSpec(x, ' views ')).toBe(x['.__controls'].views);
    expect(spec.getControlSpec(x, 'nope')).toBeNull();
    expect(spec.getControlSpec(x, null)).toBeNull();
  });

  it('gives the panel, or null when the spec has none', () => {
    const x = normalise(polygonsComponents);
    expect(spec.getPanelSpec(x)).toBe(x['.__panel']);
    expect(spec.getPanelSpec(normalise(legends))).toBeNull();
  });
});

describe('normalizeSpec', () => {
  it('replaces the empty top-level lists of a map with no layers and keeps its empty buckets', () => {
    expect(empty['.__layers']).toEqual([]);
    expect(empty['.__controls']).toEqual([]);
    const x = normalise(empty);
    expect(x['.__layers']).toEqual({});
    expect(x['.__components'].select).toEqual([]);
    expect(x['.__controls']).toEqual({});
  });

  it('keeps the containers a spec already has', () => {
    const wire = structuredClone(polygonsComponents) as WireSpec;
    const layers = wire['.__layers'];
    const controls = wire['.__controls'];
    spec.normalizeSpec(wire);
    expect(wire['.__layers']).toBe(layers);
    expect(wire['.__controls']).toBe(controls);
  });

  it('leaves an object with no spec keys alone', () => {
    const o = { a: 1 };
    spec.normalizeSpec(o);
    expect(o).toEqual({ a: 1 });
  });
});

describe('keyed lists and option objects', () => {
  it('wireMap reads an empty list as no keys', () => {
    expect(Object.keys(spec.wireMap([]))).toEqual([]);
    expect(spec.wireMap(null)).toEqual({});
    const selects = normalise(polygonsComponents)['.__components'].select;
    expect(spec.wireMap(selects)).toBe(selects);
  });

  it('normPlainObject keeps an object and replaces anything else', () => {
    const o = { showCompass: false };
    expect(spec.normPlainObject(o)).toBe(o);
    expect(spec.normPlainObject([])).toEqual({});
    expect(spec.normPlainObject(null)).toEqual({});
    expect(spec.normPlainObject('x')).toEqual({});
  });

  it('stableStringify does not depend on key order', () => {
    const a = { unit: 'metric', maxWidth: 80, nested: { b: [1, 'x', true], a: null } };
    const b = { nested: { a: null, b: [1, 'x', true] }, maxWidth: 80, unit: 'metric' };
    expect(spec.stableStringify(a)).toBe(spec.stableStringify(b));
    expect(spec.stableStringify(a)).toBe('{"maxWidth":80,"nested":{"a":null,"b":[1,"x",true]},"unit":"metric"}');
    expect(spec.stableStringify({ maxWidth: 81, unit: 'metric' })).not.toBe(spec.stableStringify({ maxWidth: 80, unit: 'metric' }));
  });

  it('stableStringify writes a missing or non-finite value as null', () => {
    expect(spec.stableStringify(undefined)).toBe('null');
    expect(spec.stableStringify(NaN)).toBe('null');
    expect(spec.stableStringify({})).toBe('{}');
  });
});

describe('bounds', () => {
  it('is the layer bbox for one layer', () => {
    const x = normalise(polygonsComponents);
    const [x0, y0, x1, y1] = x['.__layers'].polygon1.bbox;
    expect(spec.unionBboxFromSpec(x)).toEqual([[x0, y0], [x1, y1]]);
  });

  it('is the union over layers', () => {
    const x = normalise(iconsMarkers);
    const ids = Object.keys(x['.__layers']);
    expect(ids.length).toBe(2);
    const [x0, y0, x1, y1] = x['.__layers'][ids[0]].bbox;
    const moved = structuredClone(x) as any;
    moved['.__layers'][ids[1]].bbox = [x0 - 1, y0 + 0.001, x1 - 1, y1 + 2];
    expect(spec.unionBboxFromSpec(moved)).toEqual([[x0 - 1, y0], [x1, y1 + 2]]);
  });

  it('is null with no layers, and hashes to an empty string', () => {
    expect(spec.unionBboxFromSpec(normalise(empty))).toBeNull();
    expect(spec.hashBbox(null)).toBe('');
    expect(spec.hashBbox([[-1, 2], [3.5, 4]])).toBe('-1,2,3.5,4');
  });
});
