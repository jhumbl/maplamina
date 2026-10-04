// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemo } from '../../srcjs/core/assets';
import { resolveActiveOnly } from '../../srcjs/core/data';
import type { LayerState } from '../../srcjs/core/layer-state';
import type { Control, Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { FilterValue, WidgetElement, WidgetRuntime } from '../../srcjs/core/widget';
import { render, update } from '../../srcjs/controls/summaries';
import { buildFilterIndex, initFiltersState } from '../../srcjs/filters/runtime';
import polygonsComponents from './spec-samples/polygons-components';
import rangeFloat32 from './spec-samples/range-float32';
import summariesNa from './spec-samples/summaries-na';
import { normalise } from './support';

type Filters = Record<string, Record<string, FilterValue>>;

interface Fixture {
  x: Spec;
  rt: WidgetRuntime;
  el: WidgetElement;
  mount: HTMLElement;
  control: Control;
  layers: Record<string, LayerState>;
}

const inLocale = (v: number, digits: number): string =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

// By hand: the runtime is the three fields a summary reads (layer entries, filter state,
// filter index), each made the way the widget makes it.
async function setup(wire: WireSpec, filters?: Filters): Promise<Fixture> {
  const x = normalise(wire);
  const rt = { layers: new Map() } as unknown as WidgetRuntime;
  initFiltersState(rt, x);
  if (filters) rt.state.filters = filters;
  rt._filterIndex = buildFilterIndex(x);
  const layers = x['.__layers'] as Record<string, LayerState>;
  for (const [id, st] of Object.entries(layers)) {
    await resolveActiveOnly(st);
    rt.layers.set(id, { logical: st });
  }
  const el = document.createElement('div') as WidgetElement;
  el.__mfRuntime = rt;
  const control = (x['.__controls'] as Record<string, Control>).summaries;
  return { x, rt, el, mount: document.createElement('div'), control, layers };
}

function rowTexts(mount: HTMLElement): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  mount.querySelectorAll('.ml-summary-row').forEach(row => {
    const label = row.querySelector('.ml-summary-label')!.textContent!;
    out[label] = row.querySelector('.ml-summary-value')!.textContent;
  });
  return out;
}

function rowLabels(mount: HTMLElement): (string | null)[] {
  return Array.from(mount.querySelectorAll('.ml-summary-label'), n => n.textContent);
}

// render() with the runtime on the element computes at once; the values arrive later.
async function rendered(f: Fixture, expected: Record<string, string>): Promise<void> {
  render(f.mount, f.el, f.x, 'summaries', f.control);
  await vi.waitFor(() => { expect(rowTexts(f.mount)).toEqual(expected); });
}

const polygonRow = { n: '1', sum: `$${inLocale(1, 1)} m`, mean: '1', min: '1', max: '1' };
const multipolygonRow = { n: '1', sum: `$${inLocale(10, 1)} m`, mean: '10', min: '10', max: '10' };
const bothRows = { n: '2', sum: `$${inLocale(11, 1)} m`, mean: inLocale(5.5, 0), min: '1', max: '10' };
const noRows = { n: '0', sum: '—', mean: '—', min: '—', max: '—' };

beforeEach(() => { clearMemo(); });

describe('render', () => {
  it('draws the rows in the order of the control, with a placeholder each, when there is no runtime', async () => {
    const f = await setup(polygonsComponents);
    render(f.mount, null, f.x, 'summaries', f.control);
    expect(rowLabels(f.mount)).toEqual(['n', 'sum', 'mean', 'min', 'max']);
    expect(rowTexts(f.mount)).toEqual(noRows);
  });

  it('follows `order` over the order of the keys', async () => {
    const f = await setup(polygonsComponents);
    // By hand: the same control with its order reversed.
    const control = { ...f.control, order: ['max', 'min', 'mean', 'sum', 'n'] } as Control;
    render(f.mount, null, f.x, 'summaries', control);
    expect(rowLabels(f.mount)).toEqual(['max', 'min', 'mean', 'sum', 'n']);
  });

  it('clears the mount for a control of another type or none', async () => {
    const f = await setup(polygonsComponents);
    const controls = f.x['.__controls'] as Record<string, Control>;
    render(f.mount, null, f.x, 'summaries', f.control);
    render(f.mount, null, f.x, 'summaries', controls.filters);
    expect(f.mount.childNodes.length).toBe(0);

    render(f.mount, null, f.x, 'summaries', f.control);
    render(f.mount, null, f.x, 'summaries', null);
    expect(f.mount.childNodes.length).toBe(0);
  });

  it('says so when the control has no rows', async () => {
    const f = await setup(polygonsComponents);
    // By hand: the same control without its rows.
    const control = { ...f.control, rows: {}, order: [] } as Control;
    render(f.mount, f.el, f.x, 'summaries', control);
    expect(f.mount.textContent).toBe('No summaries available.');
    expect(f.mount.querySelectorAll('.ml-summary-row').length).toBe(0);
  });
});

describe('rows of a multipart layer', () => {
  it('counts, sums and averages rows, not parts', async () => {
    const f = await setup(polygonsComponents, { filters: { g: new Set(['a', 'b']), v: [1, 10] } });
    await rendered(f, bothRows);
  });

  it('keeps the row the seeded range admits', async () => {
    const f = await setup(polygonsComponents);
    expect(f.rt.state.filters).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
    await rendered(f, polygonRow);
  });

  it('counts the two-part row once when the range leaves it alone', async () => {
    const f = await setup(polygonsComponents, { filters: { g: new Set(['a', 'b']), v: [5, 10] } });
    await rendered(f, multipolygonRow);
  });
});

describe('select state', () => {
  it('keeps the rows of the selected value', async () => {
    const f = await setup(polygonsComponents, { filters: { g: new Set(['b']), v: [1, 10] } });
    await rendered(f, polygonRow);
  });

  it('passes nothing for a value the dictionary lacks', async () => {
    const f = await setup(polygonsComponents, { filters: { g: new Set(['zz']), v: [1, 10] } });
    await rendered(f, noRows);
  });

  it('is no filter when the selection is empty', async () => {
    const f = await setup(polygonsComponents, { filters: { g: new Set(), v: [1, 10] } });
    await rendered(f, bothRows);
  });
});

describe('NA rows', () => {
  const pooled = (sum: number, n: number): string => inLocale(sum / n, 2);

  it('are left out by a range whose domain includes 0, and skipped by the value operations', async () => {
    const f = await setup(summariesNa);
    expect(f.rt.state.filters).toEqual({ filters: { v: [-1, 1] } });
    // Layer a: -1, NA, 1 under the range. Layer b: 2, NA under no filter.
    await rendered(f, { n: '4', known: '4', sum: '2', mean: pooled(2, 3), min: '-1', max: '2' });
  });

  it('stay out when the range moves', async () => {
    const f = await setup(summariesNa, { filters: { v: [0.5, 3] } });
    await rendered(f, { n: '3', known: '3', sum: '3', mean: pooled(3, 2), min: '1', max: '2' });
  });
});

// The values 0.3, 0.5, 0.7, 0.9, 1.1 are held as float32: 0.3 and 1.1 round up, 0.7 and
// 0.9 round down.
describe('range ends that are not exact in float32', () => {
  it('keep the rows at both ends of the seeded range', async () => {
    const f = await setup(rangeFloat32);
    expect(f.rt.state.filters).toEqual({ filters: { v: [0.3, 1.1] } });
    await rendered(f, { n: '5' });
  });

  it('keep the row at a minimum that rounds down', async () => {
    const f = await setup(rangeFloat32, { filters: { v: [0.7, 1.1] } });
    await rendered(f, { n: '3' });
  });

  it('leave out the rows beyond the ends', async () => {
    const f = await setup(rangeFloat32, { filters: { v: [0.5, 0.9] } });
    await rendered(f, { n: '3' });
  });
});

describe('update', () => {
  it('rewrites the values after the filter state changes', async () => {
    const f = await setup(polygonsComponents);
    await rendered(f, polygonRow);

    f.rt.state.filters = { filters: { g: new Set(['a', 'b']), v: [5, 10] } };
    update(f.mount, f.el, f.x, f.rt, 'summaries', f.control);
    await vi.waitFor(() => { expect(rowTexts(f.mount)).toEqual(multipolygonRow); });
  });

  it('ends on the state of the later of two calls', async () => {
    const f = await setup(polygonsComponents);
    await rendered(f, polygonRow);

    f.rt.state.filters = { filters: { g: new Set(['a', 'b']), v: [5, 10] } };
    update(f.mount, f.el, f.x, f.rt, 'summaries', f.control);
    f.rt.state.filters = { filters: { g: new Set(['a', 'b']), v: [1, 10] } };
    update(f.mount, f.el, f.x, f.rt, 'summaries', f.control);
    await vi.waitFor(() => { expect(rowTexts(f.mount)).toEqual(bothRows); });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rowTexts(f.mount)).toEqual(bothRows);
  });

  it('writes nothing without a runtime', async () => {
    const f = await setup(polygonsComponents);
    render(f.mount, null, f.x, 'summaries', f.control);
    update(f.mount, null, f.x, null, 'summaries', f.control);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rowTexts(f.mount)).toEqual(noRows);
  });
});
