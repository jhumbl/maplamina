import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../../srcjs/core/widget';
import { buildFilterIndex, initFiltersState } from '../../srcjs/filters/runtime';
import { ensureRuntime } from '../../srcjs/runtime/api';
import type { RuntimeDeps } from '../../srcjs/runtime/api';
import { injectMotionTransitions } from '../../srcjs/runtime/motion';
import filtersTwoLayers from './spec-samples/filters-two-layers';
import polygonsComponents from './spec-samples/polygons-components';
import { normalise } from './support';

// deck.gl is imported by the pipeline behind runtime/api; its first import takes several seconds.
vi.setConfig({ testTimeout: 60000 });

type Fields = Record<string, unknown>;
type Loose = (...args: unknown[]) => void;

interface Fixture {
  x: Spec;
  rt: WidgetRuntime;
  schedule: Mock;
  set: Loose;
  stored: (label: string, gid?: string) => unknown;
}

// By hand: the element is a plain object, and the runtime gets the spec, the filter state,
// the filter index and an entry per layer the way the widget gives them. `schedule` is
// replaced so that no flush is queued; invalidate() still builds the job it is handed.
function setup(wire: WireSpec): Fixture {
  const x = normalise(wire);
  const rt = ensureRuntime({} as WidgetElement, {})!;
  rt.specRef = x;
  initFiltersState(rt, x);
  rt._filterIndex = buildFilterIndex(x);
  for (const id of Object.keys(x['.__layers'])) rt.layers.set(id, {} as never);
  const schedule = vi.fn();
  rt.schedule = schedule as unknown as WidgetRuntime['schedule'];
  return {
    x,
    rt,
    schedule,
    set: (...args) => (rt.setFilter as unknown as (...a: unknown[]) => void).apply(rt, args),
    stored: (label, gid = 'filters') => (rt.state.filters as unknown as Record<string, Fields>)[gid][label]
  };
}

const jobs = (f: Fixture): Fields[] => f.schedule.mock.calls.map(c => c[0] as Fields);
const scheduledLayers = (f: Fixture): string[] => (jobs(f).at(-1)!.layers as string[]).slice().sort();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureRuntime', () => {
  it('builds a runtime without a map or an overlay and keeps it on the element', () => {
    const error = vi.spyOn(console, 'error');
    const el = {} as WidgetElement;
    const rt = ensureRuntime(el, {})!;
    expect(el.__mfRuntime).toBe(rt);
    expect(rt.specRef).toBeNull();
    expect(rt.layers).toBeInstanceOf(Map);
    expect(rt.state).toEqual({});
    expect(rt._layerTransitions).toBeInstanceOf(Map);
    for (const name of ['setFilter', 'clearFilters', 'setActiveView', 'invalidate', 'schedule', 'rebuildLayers'] as const) {
      expect(typeof rt[name]).toBe('function');
    }
    expect(error).not.toHaveBeenCalled();
  });

  it('returns the runtime the element has, with the deps of the last call', () => {
    const el = {} as WidgetElement;
    const rt = ensureRuntime(el, {})!;
    const setFilter = rt.setFilter;
    // By hand: deps with a layer builder that builds nothing.
    const deps = { buildLayer: () => null } as unknown as RuntimeDeps;
    expect(ensureRuntime(el, deps)).toBe(rt);
    expect(rt._mfApiDeps).toBe(deps);
    expect(rt.buildLayer).toBe(deps.buildLayer);
    expect(rt.setFilter).toBe(setFilter);
  });

  it('is null without an element', () => {
    expect(ensureRuntime(null, {})).toBeNull();
    expect(ensureRuntime(undefined)).toBeNull();
  });
});

describe('setFilter on a select', () => {
  it('starts from the seeded state', () => {
    const f = setup(polygonsComponents);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
    expect(f.rt._defaultFiltersGroupId).toBe('filters');
  });

  it.each([
    ['a Set', new Set(['a']), ['a']],
    ['an array', ['b', 'a'], ['b', 'a']],
    ['one value', 'b', ['b']],
    ['numbers', [1, 2], ['1', '2']],
    ['a Set of numbers', new Set([1]), ['1']],
    ['empty strings among the values', ['a', ''], ['a']],
    ['null', null, []],
    ['an empty string', '', []],
    ['an empty array', [], []]
  ])('stores a Set of strings for %s', (_name, value, expected) => {
    const f = setup(polygonsComponents);
    f.set('filters', 'g', value);
    expect(f.stored('g')).toEqual(new Set(expected));
    expect(f.stored('g')).not.toBe(value);
    expect(f.stored('v')).toEqual([1, 5]);
  });
});

describe('setFilter on a range', () => {
  it.each([
    ['a pair', [2, 6], [2, 6]],
    ['a reversed pair', [6, 2], [2, 6]],
    ['a pair of strings', ['2', '6.5'], [2, 6.5]],
    ['the first two of three', [2, 6, 9], [2, 6]],
    ['min and max', { min: 2, max: 6 }, [2, 6]],
    ['lo and hi', { lo: 6, hi: 2 }, [2, 6]],
    ['from and to', { from: 2, to: 6 }, [2, 6]],
    ['one number', 4, [4, 4]],
    ['one string', '4', [4, 4]],
    ['a pair beyond the domain', [-5, 50], [-5, 50]]
  ])('stores the two ends for %s', (_name, value, expected) => {
    const f = setup(polygonsComponents);
    f.set('filters', 'v', value);
    expect(f.stored('v')).toEqual(expected);
    expect(f.stored('g')).toEqual(new Set(['a', 'b']));
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a pair that is no numbers', ['x', 'y']],
    ['a pair with one end missing', [Number.NaN, 3]],
    ['an array of one', [5]],
    ['an object with other keys', { a: 1 }]
  ])('falls back to the domain of the control for %s', (_name, value) => {
    const f = setup(polygonsComponents);
    f.set('filters', 'v', value);
    expect(f.stored('v')).toEqual([1, 10]);
  });

  it('falls back to 0 when the control has no domain', () => {
    const f = setup(polygonsComponents);
    // By hand: the range control without its domain.
    const controls = (f.x['.__controls'].filters as unknown as { controls: Record<string, Fields> }).controls;
    delete controls.v.domain;
    f.set('filters', 'v', null);
    expect(f.stored('v')).toEqual([0, 0]);
  });
});

describe('the group and the label', () => {
  it('takes two arguments as a label and a value in the default group', () => {
    const f = setup(polygonsComponents);
    f.set('g', ['a']);
    f.set('v', [2, 6]);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['a']), v: [2, 6] } });
  });

  it('uses the default group for an empty group id, and `filters` when there is no default', () => {
    const f = setup(polygonsComponents);
    f.set('', 'g', 'a');
    expect(f.stored('g')).toEqual(new Set(['a']));

    // By hand: a runtime whose default filters group was never set.
    f.rt._defaultFiltersGroupId = null;
    f.set('g', 'b');
    f.set('  ', 'v', 3);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['b']), v: [3, 3] } });
  });

  it('trims the group id and the label', () => {
    const f = setup(polygonsComponents);
    f.set(' filters ', ' g ', ['a']);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['a']), v: [1, 5] } });
  });

  it('does nothing for an empty label', () => {
    const f = setup(polygonsComponents);
    f.set('filters', '  ', ['a']);
    f.set('filters', null, ['a']);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
    expect(f.schedule).not.toHaveBeenCalled();
  });

  it('stores the value of a label the spec lacks as it is given, a Set copied and an array cut to two', () => {
    const f = setup(polygonsComponents);
    const set = new Set([1, 2]);
    f.set('filters', 'zz', set);
    expect(f.stored('zz')).toEqual(new Set([1, 2]));
    expect(f.stored('zz')).not.toBe(set);

    f.set('filters', 'zz', [3, 2, 1]);
    expect(f.stored('zz')).toEqual([3, 2]);
    f.set('filters', 'zz', 'a');
    expect(f.stored('zz')).toBe('a');
    f.set('filters', 'zz', null);
    expect(f.stored('zz')).toBeNull();

    expect(f.stored('g')).toEqual(new Set(['a', 'b']));
    expect(f.stored('v')).toEqual([1, 5]);
    expect(f.schedule).toHaveBeenCalledTimes(4);
  });

  it('stores under a group that is no filters group without coercing', () => {
    const f = setup(polygonsComponents);
    f.set('views', 'g', 'a');
    f.set('nowhere', 'v', [6, 2]);
    expect(f.stored('g', 'views')).toBe('a');
    expect(f.stored('v', 'nowhere')).toEqual([6, 2]);
    expect(f.stored('g')).toEqual(new Set(['a', 'b']));
  });

  it('does nothing before the runtime has a spec', () => {
    const f = setup(polygonsComponents);
    // By hand: the runtime as it is before the first render.
    f.rt.specRef = null;
    f.set('filters', 'g', ['a']);
    expect(f.stored('g')).toEqual(new Set(['a', 'b']));
    expect(f.schedule).not.toHaveBeenCalled();
  });
});

describe('what setFilter asks of the runtime', () => {
  const durations = (rt: WidgetRuntime, id: string): (number | undefined)[] =>
    Object.values(rt._layerTransitions!.get(id)!).map(e => (e as { duration?: number }).duration);

  it('schedules the layers the filter is bound to, with the controls, for the reason `filters`', () => {
    const f = setup(filtersTwoLayers);
    f.set('filters', 'g', ['a']);
    expect(f.schedule).toHaveBeenCalledTimes(1);
    expect(jobs(f)[0]).toEqual({ layers: expect.any(Array), controls: true, reason: 'filters' });
    expect(scheduledLayers(f)).toEqual(['a', 'b']);
  });

  it('schedules the layers of the group for a label the spec lacks, and every layer for a group it lacks', () => {
    const f = setup(filtersTwoLayers);
    // By hand: a layer entry no filter is bound to.
    f.rt.layers.set('c', {} as never);
    f.set('filters', 'zz', 1);
    expect(scheduledLayers(f)).toEqual(['a', 'b']);
    f.set('nowhere', 'zz', 1);
    expect(scheduledLayers(f)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the transitions as they are: the flush disables them, by the reason it is given', () => {
    const f = setup(filtersTwoLayers);
    for (const id of ['a', 'b']) {
      injectMotionTransitions(f.rt, id, 'circle', { radius: 1, fillColor: 1 }, { duration: 300 });
    }
    f.set('filters', 'v', [1, 2]);
    expect(durations(f.rt, 'a')).toEqual([300, 300]);
    expect(durations(f.rt, 'b')).toEqual([300, 300]);
    expect(Array.from(f.rt._transitionTokens!.keys())).toEqual(['a', 'b']);
    expect(jobs(f)).toEqual([{ layers: expect.any(Array), controls: true, reason: 'filters' }]);
  });
});
