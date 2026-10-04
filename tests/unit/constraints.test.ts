// @vitest-environment jsdom
import type { Layer } from '@deck.gl/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyOrderedViewOps, computeViewOpsByLayer } from '../../srcjs/components/views';
import type { LayerState, TransitionEntry } from '../../srcjs/core/layer-state';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../../srcjs/core/widget';
import { buildFilterIndex, getGPUFilterContribution, initFiltersState } from '../../srcjs/filters/runtime';
import { layers as builders } from '../../srcjs/layers/registry';
import { flattenLayers, mergeEncodings } from '../../srcjs/layers/utils';
import type { BuildContext } from '../../srcjs/layers/utils';
import { ensureRuntime, pickActiveViews } from '../../srcjs/runtime/api';
import { buildRenderArtifacts } from '../../srcjs/runtime/assembly';
import type { RenderArtifacts } from '../../srcjs/runtime/assembly';
import { renderInitial } from '../../srcjs/runtime/initial-render';
import filtersTwoLayers from './spec-samples/filters-two-layers';
import iconsMarkers from './spec-samples/icons-markers';
import legends from './spec-samples/legends';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';
import { normalise } from './support';

// deck.gl is imported by the builders; its first import takes several seconds.
vi.setConfig({ testTimeout: 60000 });

type Props = Record<string, unknown> & {
  data: unknown;
  filterRange?: unknown;
  updateTriggers: Record<string, unknown>;
  transitions?: Record<string, TransitionEntry>;
};
const props = (layer: Layer): Props => layer.props as unknown as Props;

interface Fixture {
  x: Spec;
  rt: WidgetRuntime;
  el: WidgetElement;
  // Builds a layer the way a flush does: from the spec the first time, from the logical
  // layer of the last build after that.
  build: (id: string) => Promise<Layer[]>;
  last: Map<string, RenderArtifacts>;
}

// By hand: the runtime gets the spec, the filter state and the filter index the way the
// widget gives them, and the builders share one context cache as they do on a page.
// `schedule` is replaced so that no flush is queued.
function setup(wire: WireSpec): Fixture {
  const x = normalise(wire);
  const el = document.createElement('div') as WidgetElement;
  const ctx: BuildContext = { el, map: null, cache: {} };
  const rt = ensureRuntime(el, {
    buildLayer: (st: LayerState) => builders.get(st.type!)!(st, ctx)
  })!;
  rt.specRef = x;
  rt.schedule = vi.fn() as unknown as WidgetRuntime['schedule'];
  initFiltersState(rt, x);
  rt._filterIndex = buildFilterIndex(x);
  const last = new Map<string, RenderArtifacts>();
  const build = async (id: string): Promise<Layer[]> => {
    const prev = last.get(id);
    const ops = computeViewOpsByLayer(x, pickActiveViews(rt, x)).opsByLayer;
    const out = await buildRenderArtifacts({
      entry: prev ? prev.entry : null,
      sourceState: prev ? null : x['.__layers'][id],
      logical: prev ? prev.logical : null,
      layerId: id,
      spec: x,
      rt,
      x,
      mergeEncodings,
      opsByLayer: ops,
      applyOrderedViewOps,
      getGPUFilterContribution,
      transitions: null,
      buildLayer: rt.buildLayer
    });
    last.set(id, out);
    return flattenLayers(out.layer);
  };
  return { x, rt, el, build, last };
}

const FILTER_TRIGGERS = ['getFilterCategory', 'getFilterValue'];

// deck.gl's comparison of one update trigger (lifecycle/props.js, diffUpdateTrigger): the
// same value, or two objects whose own keys hold the same values.
function sameTrigger(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
const accessors = (p: Props): [string, unknown][] =>
  Object.entries(p).filter(([k, v]) => k.startsWith('get') && typeof v === 'function');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('two builds of a layer under different filter state', () => {
  it.each([
    ['circles with constant encodings', filtersTwoLayers, 'a', 0],
    ['polygons under a view with a colour per feature', polygonsComponents, 'polygon1', 1]
  ] as [string, WireSpec, string, number][])('keep the data object and every trigger but the filter\'s: %s', async (_name, wire, id, pairs) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = setup(wire);
    const one = await f.build(id);
    f.rt.setFilter!('filters', 'g', new Set(['a']));
    f.rt.setFilter!('filters', 'v', [2, 3]);
    const two = await f.build(id);

    expect(one.length).toBeGreaterThan(0);
    expect(two.length).toBe(one.length);
    let held = 0;
    for (let i = 0; i < one.length; i++) {
      const a = props(one[i]), b = props(two[i]);
      expect(b.data).toBe(a.data);
      expect(b.filterRange).not.toEqual(a.filterRange);

      const keys = Object.keys(a.updateTriggers).filter(k => !FILTER_TRIGGERS.includes(k));
      expect(Object.keys(b.updateTriggers).filter(k => !FILTER_TRIGGERS.includes(k))).toEqual(keys);
      for (const k of keys) {
        const t = a.updateTriggers[k];
        expect(sameTrigger(t, b.updateTriggers[k]), k).toBe(true);
        // A typed array, or a pair that holds one, is the same object: deck.gl does not walk it.
        if (ArrayBuffer.isView(t) || (Array.isArray(t) && t.some(v => v && typeof v === 'object'))) {
          expect(b.updateTriggers[k], k).toBe(t);
          held++;
        }
      }
    }
    expect(held).toBe(pairs);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('the accessors of a build', () => {
  it('are made anew by every build', async () => {
    const f = setup(filtersTwoLayers);
    const [one] = await f.build('a');
    const [two] = await f.build('a');
    const first = accessors(props(one));
    expect(first.map(([k]) => k)).toEqual(expect.arrayContaining(['getRadius', 'getFillColor', 'getFilterValue', 'getFilterCategory']));
    for (const [k, fn] of first) expect(props(two)[k], k).not.toBe(fn);
  });

  it('read the arrays the layer holds at that build', async () => {
    const f = setup(filtersTwoLayers);
    const [one] = await f.build('a');
    const before = (props(one).getRadius as (d: unknown, info: { index: number }) => number)(null, { index: 0 });

    // By hand: the radius of the logical layer becomes an array between the builds.
    const logical = f.last.get('a')!.logical;
    const n = (props(one).data as { length: number }).length;
    logical.base_encodings!.radius = { value: new Float32Array(n).fill(before + 7) } as never;
    const [two] = await f.build('a');

    const read = (l: Layer): number => (props(l).getRadius as (d: unknown, info: { index: number }) => number)(null, { index: 0 });
    expect(read(two)).toBe(before + 7);
    expect(read(one)).toBe(before);
  });
});

describe('renderInitial', () => {
  it.each([
    ['a line', linesViews, 'line1', ['getWidth', 'getColor']],
    ['an icon layer beside a marker layer with no views', iconsMarkers, 'icon1', ['getSize']],
    ['a polygon', polygonsComponents, 'polygon1', ['getFillColor']],
    ['a circle', legends, 'circle1', ['getRadius']]
  ] as [string, WireSpec, string, string[]][])('primes every prop a view of the layer touches with duration 1: %s', async (_name, wire, id, touched) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = setup(wire);
    const overlay = { setProps: vi.fn() };
    const built = await renderInitial({
      el: f.el,
      x: f.x,
      rt: f.rt,
      map: null,
      overlay: overlay as never,
      pickActiveViews,
      computeViewOpsByLayerV3: computeViewOpsByLayer,
      initFiltersState,
      buildFilterIndex,
      mergeEncodings
    });

    expect(overlay.setProps).toHaveBeenCalledTimes(1);
    expect(overlay.setProps.mock.calls[0][0].layers).toEqual(flattenLayers(Array.from(built!.values())));

    // The runtime holds the entries disabled; deck.gl is handed duration 1.
    const held = f.rt._layerTransitions!.get(id)!;
    expect(Object.keys(held).sort()).toEqual(touched.slice().sort());
    for (const k of touched) expect((held[k] as TransitionEntry).duration).toBe(0);

    const layers = built!.get(id)!;
    expect(layers.length).toBeGreaterThan(0);
    for (const l of layers) {
      const t = props(l).transitions!;
      expect(Object.keys(t).sort()).toEqual(touched.slice().sort());
      for (const k of touched) expect(t[k]).toEqual({ duration: 1 });
    }

    for (const [other, ls] of built!) {
      if (other === id) continue;
      expect(f.rt._layerTransitions!.has(other)).toBe(false);
      for (const l of ls) expect(props(l).transitions).toBeNull();
    }
  });
});
