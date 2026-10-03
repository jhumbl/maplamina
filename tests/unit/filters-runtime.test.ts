import { beforeEach, describe, expect, it } from 'vitest';
import { clearMemo } from '../../srcjs/core/assets';
import { resolveActiveOnly } from '../../srcjs/core/data';
import type { LayerState } from '../../srcjs/core/layer-state';
import { assertV3Spec } from '../../srcjs/core/spec';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { FilterValue, WidgetRuntime } from '../../srcjs/core/widget';
import { buildFilterIndex, getGPUFilterContribution, initFiltersState } from '../../srcjs/filters/runtime';
import circlesConstant from './spec-samples/circles-constant';
import filtersTwoLayers from './spec-samples/filters-two-layers';
import lengthOne from './spec-samples/length-one';
import polygonsComponents from './spec-samples/polygons-components';
import selectNumericDefaultSample from './spec-samples/select-numeric-default';
import { normalise } from './support';

// Outside WireSpec: a select default is typed as strings and this one is a number.
const selectNumericDefault = selectNumericDefaultSample as unknown as WireSpec;

const NA_RANGE_VALUE = -3.4028234663852886e38;
const newRt = (): WidgetRuntime => ({}) as WidgetRuntime;
const at = (index: number): [null, { index: number }] => [null, { index }];

// A spec, its runtime with the filter state seeded or given, and one hydrated layer.
async function setup(wire: WireSpec, layerId: string, filters?: Record<string, Record<string, FilterValue>>): Promise<{
  x: Spec; rt: WidgetRuntime; st: LayerState;
}> {
  const x = normalise(wire);
  const rt = newRt();
  initFiltersState(rt, x);
  if (filters) rt.state!.filters = filters;
  rt._filterIndex = buildFilterIndex(x);
  const st = (x['.__layers'] as Record<string, unknown>)[layerId] as LayerState;
  await resolveActiveOnly(st);
  return { x, rt, st };
}

beforeEach(() => { clearMemo(); });

describe('initFiltersState', () => {
  it('seeds the select and range defaults R emits', () => {
    const rt = newRt();
    const out = initFiltersState(rt, normalise(polygonsComponents));
    expect(out).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
    expect(rt.state!.filters).toBe(out);
    expect(rt._defaultFiltersGroupId).toBe('filters');
    expect(rt._filtersGroupIds).toEqual(['filters']);
  });

  it('seeds a length-1 select default', () => {
    const out = initFiltersState(newRt(), normalise(lengthOne));
    const group = Object.values(out)[0];
    expect(group).toEqual({ g: new Set(['a']) });
  });

  it('seeds no selection and the merged domain when there is no default', () => {
    const out = initFiltersState(newRt(), normalise(filtersTwoLayers));
    expect(out).toEqual({ filters: { g: new Set(), v: [0, 4] } });
  });

  it('keeps the state a label already has over its default', () => {
    const x = normalise(polygonsComponents);
    const rt = newRt();
    initFiltersState(rt, x);
    const chosen = new Set(['b']);
    rt.state!.filters = { filters: { g: chosen, v: [2, 3] } };
    const out = initFiltersState(rt, x);
    expect(out).toEqual({ filters: { g: new Set(['b']), v: [2, 3] } });
    expect(out.filters.g).not.toBe(chosen);
  });

  it('keeps an emptied selection empty rather than seeding the default again', () => {
    const x = normalise(polygonsComponents);
    const rt = newRt();
    initFiltersState(rt, x);
    rt.state!.filters = { filters: { g: new Set(), v: [1, 5] } };
    expect(initFiltersState(rt, x).filters.g).toEqual(new Set());
  });

  it('clears the state and the group ids for a spec with no filters', () => {
    const rt = newRt();
    initFiltersState(rt, normalise(polygonsComponents));
    expect(initFiltersState(rt, normalise(circlesConstant))).toEqual({});
    expect(rt.state!.filters).toEqual({});
    expect(rt._filtersGroupIds).toEqual([]);
    expect(rt._defaultFiltersGroupId).toBeNull();
  });

  // R emits a select default as given. For a numeric column the dict holds the values as
  // strings and the default arrives as a number, which is read as a 0-based dict index:
  // default = 2 starts the map on the value 3 (P-26-34, open).
  it('reads a numeric select default as a dict index, not as a value', () => {
    const x = normalise(selectNumericDefault);
    expect(assertV3Spec(x)).toBe(true);
    const def = x['.__controls'].filters_1;
    expect(def.type === 'filters' && def.controls.n).toMatchObject({ dict: ['1', '2', '3'], default: 2 });
    const out = initFiltersState(newRt(), x);
    expect(out.filters_1.n).toEqual(new Set(['3']));
  });

  // The shapes below are written by hand.
  it('selects nothing for a numeric default past the end of the dict', () => {
    const x = normalise(selectNumericDefault) as any;
    x['.__controls'].filters_1.controls.n.default = 3;
    x['.__components'].select.sel_1.default = 3;
    expect(initFiltersState(newRt(), x).filters_1.n).toEqual(new Set());
  });

  it('falls back to the component default when the control carries none', () => {
    const x = normalise(polygonsComponents) as any;
    delete x['.__controls'].filters.controls.g.default;
    delete x['.__controls'].filters.controls.v.default;
    expect(initFiltersState(newRt(), x)).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
  });

  it('clamps a range default to the domain and orders it', () => {
    const x = normalise(polygonsComponents) as any;
    const v = x['.__controls'].filters.controls.v;
    v.default = [100, -100];
    expect(initFiltersState(newRt(), x).filters.v).toEqual([v.domain.min, v.domain.max]);
  });

  it('replaces prior state of the wrong kind: a select gets no selection, a range its domain', () => {
    const x = normalise(polygonsComponents);
    const v = (x['.__controls'].filters as any).controls.v;
    const rt = newRt();
    initFiltersState(rt, x);
    rt.state!.filters = { filters: { g: [1, 2], v: new Set(['a']) } } as any;
    expect(initFiltersState(rt, x)).toEqual({ filters: { g: new Set(), v: [v.domain.min, v.domain.max] } });
  });

  it('re-seeds one group and keeps the others when given a group id', () => {
    const x = normalise(polygonsComponents) as any;
    x['.__controls'].filters2 = structuredClone(x['.__controls'].filters);
    const rt = newRt();
    initFiltersState(rt, x);
    expect(rt._filtersGroupIds).toEqual(['filters', 'filters2']);
    const kept = rt.state!.filters!.filters;
    delete rt.state!.filters!.filters2;
    const out = initFiltersState(rt, x, 'filters2');
    expect(out.filters).toBe(kept);
    expect(out.filters2).toEqual({ g: new Set(['a', 'b']), v: [1, 5] });
  });
});

describe('buildFilterIndex', () => {
  it('lists two layers under one label', () => {
    const idx = buildFilterIndex(normalise(filtersTwoLayers));
    expect(idx.groupIds).toEqual(['filters']);
    expect(Array.from(idx.byLayer.keys())).toEqual(['a', 'b']);
    expect(idx.byKey.get('filters|g')).toEqual(new Set(['a', 'b']));
    expect(idx.byKey.get('filters|v')).toEqual(new Set(['a', 'b']));
    expect(idx.byGroup.get('filters')).toEqual(new Set(['a', 'b']));
  });

  it('gives each layer its own component for the label', () => {
    const x = normalise(filtersTwoLayers);
    const idx = buildFilterIndex(x);
    const b = idx.byLayer.get('b')!;
    expect(b.select.map((d) => [d.groupId, d.label, d.id])).toEqual([['filters', 'g', 'sel_2']]);
    expect(b.range.map((d) => [d.groupId, d.label, d.id])).toEqual([['filters', 'v', 'rng_2']]);
    expect(b.select[0].comp.dict).toEqual(['(Missing)', 'c']);
  });

  it('is empty for a spec with no filters', () => {
    const idx = buildFilterIndex(normalise(circlesConstant));
    expect(idx.groupIds).toEqual([]);
    expect(idx.byLayer.size).toBe(0);
  });
});

describe('getGPUFilterContribution', () => {
  it('is null for a layer with no filters and for a runtime with no index', async () => {
    const { x, rt, st } = await setup(polygonsComponents, 'polygon1');
    expect(await getGPUFilterContribution(st, 'nope', x, rt)).toBeNull();
    expect(await getGPUFilterContribution(st, 'polygon1', x, newRt())).toBeNull();
  });

  it('applies a select and a range together, each part reading its own row', async () => {
    const { x, rt, st } = await setup(polygonsComponents, 'polygon1');
    const c = (await getGPUFilterContribution(st, 'polygon1', x, rt))!;
    expect(c.gpuMeta).toEqual({ categoryDims: 1, rangeDims: 1 });
    expect(c.forceHidden).toBe(false);
    expect(c.gpuFiltering.filterCategories).toEqual([0, 1]);
    expect(c.gpuFiltering.filterRange).toEqual([1, 5]);
    expect([0, 1, 2].map((p) => c.gpuFiltering.getFilterCategory!(...at(p)))).toEqual([0, 0, 1]);
    expect([0, 1, 2].map((p) => c.gpuFiltering.getFilterValue!(...at(p)))).toEqual([10, 10, 1]);
  });

  it('allows only the chosen category', async () => {
    const { x, rt, st } = await setup(polygonsComponents, 'polygon1', { filters: { g: new Set(['b']), v: [1, 10] } });
    const c = (await getGPUFilterContribution(st, 'polygon1', x, rt))!;
    expect(c.gpuFiltering.filterCategories).toEqual([1]);
    expect(c.gpuFiltering.__catDisabledKey).toBe(0);
    expect(c.forceHidden).toBe(false);
  });

  it('keeps the category dimension for an empty selection and lets every part pass', async () => {
    const { x, rt, st } = await setup(polygonsComponents, 'polygon1', { filters: { g: new Set(), v: [1, 10] } });
    const c = (await getGPUFilterContribution(st, 'polygon1', x, rt))!;
    expect(c.gpuMeta).toEqual({ categoryDims: 1, rangeDims: 1 });
    expect(c.forceHidden).toBe(false);
    expect(c.gpuFiltering.filterCategories).toEqual([0]);
    expect(c.gpuFiltering.__catDisabledKey).toBe(1);
    expect([0, 1, 2].map((p) => c.gpuFiltering.getFilterCategory!(...at(p)))).toEqual([0, 0, 0]);
  });

  it('hides a layer whose categories match none of the selection, with the same dimensions', async () => {
    const chosen = { filters: { g: new Set(['a']), v: [0, 4] as [number, number] } };
    const a = await setup(filtersTwoLayers, 'a', chosen);
    const ca = (await getGPUFilterContribution(a.st, 'a', a.x, a.rt))!;
    expect(ca.forceHidden).toBe(false);
    expect(ca.gpuFiltering.filterCategories).toEqual([0]);
    expect([0, 1, 2].map((p) => ca.gpuFiltering.getFilterCategory!(...at(p)))).toEqual([0, 1, 0]);

    const b = await setup(filtersTwoLayers, 'b', chosen);
    const cb = (await getGPUFilterContribution(b.st, 'b', b.x, b.rt))!;
    expect(cb.forceHidden).toBe(true);
    expect(cb.gpuMeta).toEqual(ca.gpuMeta);
    expect(cb.gpuFiltering.filterCategories).toEqual([0]);
    expect([0, 1, 2].map((p) => cb.gpuFiltering.getFilterCategory!(...at(p)))).toEqual([1, 1, 1]);
  });

  it('allows a category by its index in the layer own dict, missing values included', async () => {
    const b = await setup(filtersTwoLayers, 'b', { filters: { g: new Set(['(Missing)']), v: [0, 4] } });
    const c = (await getGPUFilterContribution(b.st, 'b', b.x, b.rt))!;
    expect(c.gpuFiltering.filterCategories).toEqual([0]);
    expect([0, 1, 2].map((p) => c.gpuFiltering.getFilterCategory!(...at(p)))).toEqual([1, 0, 1]);
  });

  it('gives an NA range value the value no range admits, in a domain that includes 0', async () => {
    const b = await setup(filtersTwoLayers, 'b');
    const c = (await getGPUFilterContribution(b.st, 'b', b.x, b.rt))!;
    expect(c.gpuFiltering.filterRange).toEqual([0, 4]);
    expect([0, 1, 2].map((p) => c.gpuFiltering.getFilterValue!(...at(p)))).toEqual([0, NA_RANGE_VALUE, 4]);
    expect(NA_RANGE_VALUE).toBeLessThan(0);
    expect(new Float32Array([NA_RANGE_VALUE])[0]).toBe(NA_RANGE_VALUE);
  });

  it('uses the component extent for a range with no state', async () => {
    const a = await setup(filtersTwoLayers, 'a', { filters: {} });
    const c = (await getGPUFilterContribution(a.st, 'a', a.x, a.rt))!;
    expect(c.gpuFiltering.filterRange).toEqual([1.5, 3.5]);
    expect(c.gpuFiltering.__catDisabledKey).toBe(1);
  });

  // R warns past four selects or ranges on a layer; the index below is filled by hand.
  it('takes the first four dimensions of each kind', async () => {
    const { x, rt, st } = await setup(polygonsComponents, 'polygon1');
    const entry = rt._filterIndex!.byLayer.get('polygon1')!;
    for (let i = 0; i < 4; i++) { entry.select.push(entry.select[0]); entry.range.push(entry.range[0]); }
    const c = (await getGPUFilterContribution(st, 'polygon1', x, rt))!;
    expect(c.gpuMeta).toEqual({ categoryDims: 4, rangeDims: 4 });
    expect(c.gpuFiltering.filterCategories).toEqual([[0, 1], [0, 1], [0, 1], [0, 1]]);
    expect(c.gpuFiltering.filterRange).toEqual([[1, 5], [1, 5], [1, 5], [1, 5]]);
    expect(c.gpuFiltering.getFilterCategory!(...at(2))).toEqual([1, 1, 1, 1]);
    expect(c.gpuFiltering.getFilterValue!(...at(2))).toEqual([1, 1, 1, 1]);
  });
});
