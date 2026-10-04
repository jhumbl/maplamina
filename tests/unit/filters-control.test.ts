// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Control, FiltersControl, Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { FilterValue, WidgetElement, WidgetRuntime, WritableRuntime } from '../../srcjs/core/widget';
import { render } from '../../srcjs/controls/filters';
import { initFiltersState } from '../../srcjs/filters/runtime';
import filtersTwoLayers from './spec-samples/filters-two-layers';
import lengthOne from './spec-samples/length-one';
import polygonsComponents from './spec-samples/polygons-components';
import selectNumericDefaultSample from './spec-samples/select-numeric-default';
import { normalise } from './support';

// Outside WireSpec: a select default is typed as strings and this one is a number.
const selectNumericDefault = selectNumericDefaultSample as unknown as WireSpec;

interface Fixture {
  x: Spec;
  gid: string;
  control: FiltersControl;
  rt: WidgetRuntime | null;
  el: WidgetElement;
  mount: HTMLElement;
  setFilter: ReturnType<typeof vi.fn>;
}

interface Options {
  runtime?: boolean;
  filters?: Record<string, Record<string, FilterValue>>;
}

// By hand: the runtime is the filter state, seeded the way the widget seeds it, and the
// one method a change reaches. The mount sits in the widget element, in the document.
function setup(wire: WireSpec, opts: Options = {}): Fixture {
  const x = normalise(wire);
  const controls = x['.__controls'] as Record<string, Control>;
  const [gid, control] = Object.entries(controls).find(([, c]) => c.type === 'filters')!;
  const setFilter = vi.fn();
  let rt: WidgetRuntime | null = null;
  if (opts.runtime !== false) {
    rt = { setFilter } as unknown as WidgetRuntime;
    initFiltersState(rt, x);
    if (opts.filters) (rt as WritableRuntime).state.filters = opts.filters;
  }
  const el = document.body.appendChild(document.createElement('div')) as WidgetElement;
  el.id = 'w1';
  el.__mfRuntime = rt;
  const mount = el.appendChild(document.createElement('div'));
  return { x, gid, control: control as FiltersControl, rt, el, mount, setFilter };
}

const draw = (f: Fixture, control: unknown = f.control): void =>
  render(f.mount, f.el, f.x, f.gid, control as Control | null);

const titles = (f: Fixture): (string | null)[] =>
  Array.from(f.mount.querySelectorAll('.ml-filter-title'), n => n.textContent);

function filterBox(f: Fixture, title: string): HTMLElement {
  const boxes = Array.from(f.mount.querySelectorAll<HTMLElement>('.ml-filter'));
  const box = boxes.find(b => b.querySelector('.ml-filter-title')!.textContent === title);
  if (!box) throw new Error(`no filter titled '${title}'`);
  return box;
}

// The options of a select as the text beside each input and whether it is checked.
function options(box: HTMLElement): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  box.querySelectorAll('label').forEach(label => {
    out[label.querySelector('span')!.textContent!] = label.querySelector('input')!.checked;
  });
  return out;
}

function option(box: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(box.querySelectorAll('label')).find(l => l.querySelector('span')!.textContent === text);
  if (!label) throw new Error(`no option '${text}'`);
  return label.querySelector('input')!;
}

const rangeLabels = (box: HTMLElement): (string | null)[] =>
  Array.from(box.querySelectorAll('.ml-rng-labels span'), n => n.textContent);

const lowThumb = (box: HTMLElement): HTMLElement => box.querySelectorAll<HTMLElement>('.ml-rngs-thumb')[0];
const arrowRight = (node: HTMLElement): boolean =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));

beforeEach(() => {
  // By hand: jsdom has no ResizeObserver and the slider makes one.
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

describe('the box', () => {
  it('holds one filter per control, in the order of the control', () => {
    const f = setup(polygonsComponents);
    draw(f);
    expect(f.mount.querySelectorAll('.ml-filters').length).toBe(1);
    expect(titles(f)).toEqual(['g', 'v']);
  });

  it('follows `order` over the order of the keys', () => {
    const f = setup(polygonsComponents);
    // By hand: the same control with its order reversed.
    draw(f, { ...f.control, order: ['v', 'g'] });
    expect(titles(f)).toEqual(['v', 'g']);
  });

  it('is replaced, not added to, by a second render', () => {
    const f = setup(polygonsComponents);
    draw(f);
    draw(f);
    expect(f.mount.querySelectorAll('.ml-filters').length).toBe(1);
    expect(titles(f)).toEqual(['g', 'v']);
  });

  it('is cleared for a control of another type or none', () => {
    const f = setup(polygonsComponents);
    const controls = f.x['.__controls'] as Record<string, Control>;
    draw(f);
    draw(f, controls.summaries);
    expect(f.mount.childNodes.length).toBe(0);

    draw(f);
    draw(f, null);
    expect(f.mount.childNodes.length).toBe(0);
  });

  it('is not drawn without a widget element', () => {
    const f = setup(polygonsComponents);
    render(f.mount, null, f.x, f.gid, f.control);
    expect(f.mount.childNodes.length).toBe(0);
  });
});

describe('the select drawing', () => {
  it('is a dropdown with a search box when the control asks for one', () => {
    const f = setup(polygonsComponents);
    draw(f);
    const box = filterBox(f, 'g');
    expect(box.querySelector('.ml-dd-toggle')).not.toBeNull();
    expect(box.querySelector<HTMLElement>('.ml-dd-menu')!.style.display).toBe('none');
    expect(box.querySelector('.ml-dd-search')).not.toBeNull();
    expect(box.querySelectorAll('.ml-dd-option').length).toBe(2);
  });

  it('is a list of options for four levels and no `dropdown`', () => {
    const f = setup(filtersTwoLayers);
    draw(f);
    const box = filterBox(f, 'g');
    expect(box.querySelector('.ml-dd')).toBeNull();
    expect(box.querySelectorAll('.ml-filter-option').length).toBe(4);
    expect(Object.keys(options(box))).toEqual(f.control.controls.g.type === 'select' ? [...f.control.controls.g.dict] : []);
  });
});

describe('what is shown at first', () => {
  it('is the state the runtime was seeded with from the defaults', () => {
    const f = setup(polygonsComponents);
    expect(f.rt!.state.filters).toEqual({ filters: { g: new Set(['a', 'b']), v: [1, 5] } });
    draw(f);
    expect(options(filterBox(f, 'g'))).toEqual({ a: true, b: true });
    expect(filterBox(f, 'g').querySelector('.ml-dd-toggle div')!.textContent).toBe('All');
    expect(rangeLabels(filterBox(f, 'v'))).toEqual(['1', '5']);
  });

  it('is the state of the runtime over the defaults of the control', () => {
    const f = setup(polygonsComponents, { filters: { filters: { g: new Set(['b']), v: [2, 3] } } });
    draw(f);
    expect(options(filterBox(f, 'g'))).toEqual({ a: false, b: true });
    expect(filterBox(f, 'g').querySelector('.ml-dd-toggle div')!.textContent).toBe('b');
    expect(rangeLabels(filterBox(f, 'v'))).toEqual(['2', '3']);
  });

  it('is a length-1 default', () => {
    const f = setup(lengthOne);
    draw(f);
    expect(options(filterBox(f, 'g'))).toEqual({ a: true });
  });

  it('is nothing selected and the whole domain when there is no default', () => {
    const f = setup(filtersTwoLayers);
    draw(f);
    expect(Object.values(options(filterBox(f, 'g')))).toEqual([false, false, false, false]);
    expect(rangeLabels(filterBox(f, 'v'))).toEqual(['0', '4.0']);
  });

  it('is the defaults of the control when there is no runtime', () => {
    const f = setup(polygonsComponents, { runtime: false });
    draw(f);
    expect(options(filterBox(f, 'g'))).toEqual({ a: true, b: true });
    expect(rangeLabels(filterBox(f, 'v'))).toEqual(['1', '5']);
  });

  // P-26-34, open: a numeric default is read as an index into the dictionary.
  it('is the third value for a numeric select default of 2', () => {
    const seeded = setup(selectNumericDefault);
    draw(seeded);
    expect(options(filterBox(seeded, 'n'))).toEqual({ 1: false, 2: false, 3: true });

    const bare = setup(selectNumericDefault, { runtime: false });
    draw(bare);
    expect(options(filterBox(bare, 'n'))).toEqual({ 1: false, 2: false, 3: true });
  });
});

describe('a select change', () => {
  it('sends values, not indices', () => {
    const f = setup(filtersTwoLayers);
    draw(f);
    option(filterBox(f, 'g'), 'c').click();
    expect(f.setFilter.mock.calls).toEqual([['filters', 'g', new Set(['c'])]]);
    option(filterBox(f, 'g'), 'a').click();
    expect(f.setFilter.mock.calls[1]).toEqual(['filters', 'g', new Set(['c', 'a'])]);
  });

  it('sends what is left, down to an empty set', () => {
    const f = setup(polygonsComponents);
    draw(f);
    const box = filterBox(f, 'g');
    option(box, 'a').click();
    option(box, 'b').click();
    expect(f.setFilter.mock.calls).toEqual([
      ['filters', 'g', new Set(['b'])],
      ['filters', 'g', new Set()]
    ]);
    expect(box.querySelector('.ml-dd-toggle div')!.textContent).toBe('All');
  });

  it('sends an empty set from the clear button and unchecks the options', () => {
    const f = setup(polygonsComponents);
    draw(f);
    const box = filterBox(f, 'g');
    box.querySelector<HTMLElement>('.ml-dd-clear')!.click();
    expect(f.setFilter.mock.calls).toEqual([['filters', 'g', new Set()]]);
    expect(options(box)).toEqual({ a: false, b: false });
  });

  it('is sent under a label with a slash and a space, as written', () => {
    const f = setup(polygonsComponents);
    // By hand: the select of the sample under another label.
    const g = f.control.controls.g;
    draw(f, { ...f.control, controls: { 'a/b c': { ...g, label: 'a/b c' } }, order: ['a/b c'] });
    const box = filterBox(f, 'a/b c');
    expect(box.id).not.toMatch(/[/\s]/);
    expect(f.el.querySelector(`#${box.id}`)).toBe(box);
    option(box, 'a').click();
    expect(f.setFilter.mock.calls).toEqual([['filters', 'a/b c', new Set(['b'])]]);
  });

  it('is kept in the element when there is no runtime to send it to', () => {
    const f = setup(polygonsComponents, { runtime: false });
    draw(f);
    option(filterBox(f, 'g'), 'a').click();
    expect(options(filterBox(f, 'g'))).toEqual({ a: false, b: true });
    expect(f.setFilter).not.toHaveBeenCalled();
  });
});

describe('a range change from the keyboard', () => {
  it('sends the pair once, on commit, when the control is not live', () => {
    const f = setup(polygonsComponents);
    draw(f);
    const box = filterBox(f, 'v');
    arrowRight(lowThumb(box));
    expect(f.setFilter.mock.calls).toEqual([['filters', 'v', [1.5, 5]]]);
    // P-26-35, open: a step of 0.5 gives labels no decimals, so 1.5 reads as 2.
    expect(rangeLabels(box)).toEqual(['2', '5']);
  });

  it('sends the pair on input and on commit when the control is live', () => {
    const f = setup(filtersTwoLayers);
    draw(f);
    arrowRight(lowThumb(filterBox(f, 'v')));
    expect(f.setFilter.mock.calls).toEqual([
      ['filters', 'v', [0.1, 4]],
      ['filters', 'v', [0.1, 4]]
    ]);
    expect(rangeLabels(filterBox(f, 'v'))).toEqual(['0.1', '4.0']);
  });
});
