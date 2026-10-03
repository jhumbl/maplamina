// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Control, Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../../srcjs/core/widget';
import { render } from '../../srcjs/controls/views';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';
import { normalise } from './support';

interface Fixture {
  x: Spec;
  gid: string;
  control: Control;
  rt: WidgetRuntime;
  el: WidgetElement;
  mount: HTMLElement;
  setActiveView: ReturnType<typeof vi.fn>;
}

// By hand: the runtime is the state and the one method the list reaches.
function setup(wire: WireSpec, views?: Record<string, string>, elementId = 'w1'): Fixture {
  const x = normalise(wire);
  const controls = x['.__controls'] as Record<string, Control>;
  const [gid, control] = Object.entries(controls).find(([, c]) => c.type === 'views')!;
  const setActiveView = vi.fn();
  const rt = { state: views ? { views } : {}, setActiveView } as unknown as WidgetRuntime;
  const el = document.createElement('div') as WidgetElement;
  el.id = elementId;
  el.__mfRuntime = rt;
  // In the document: a click on a detached radio fires no change event.
  const mount = document.body.appendChild(document.createElement('div'));
  return { x, gid, control, rt, el, mount, setActiveView };
}

const radios = (mount: HTMLElement): HTMLInputElement[] =>
  Array.from(mount.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
const checked = (mount: HTMLElement): string[] => radios(mount).filter(r => r.checked).map(r => r.value);
const draw = (f: Fixture, control: Control | null = f.control): void =>
  render(f.mount, f.el, f.x, f.gid, control);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = '';
});

describe('the list', () => {
  it('has a radio per view in the order of the control, the default checked', () => {
    const f = setup(linesViews);
    draw(f);
    expect(radios(f.mount).map(r => r.value)).toEqual(['thin', 'by value', 'flat']);
    expect(Array.from(f.mount.querySelectorAll('label span'), s => s.textContent)).toEqual(['thin', 'by value', 'flat']);
    expect(checked(f.mount)).toEqual(['thin']);
  });

  it('is replaced, not added to, by a second render', () => {
    const f = setup(linesViews);
    draw(f);
    draw(f);
    expect(f.mount.querySelectorAll('form').length).toBe(1);
    expect(radios(f.mount).length).toBe(3);
  });

  it('is drawn without a runtime', () => {
    const f = setup(linesViews);
    render(f.mount, null, f.x, f.gid, f.control);
    expect(checked(f.mount)).toEqual(['thin']);
  });

  it('gives way to a placeholder when the control names no view', () => {
    const f = setup(linesViews);
    // By hand: the same control without its names.
    draw(f, { ...f.control, view_names: [] } as Control);
    expect(f.mount.textContent).toBe('No views available.');
    expect(radios(f.mount).length).toBe(0);
    expect(f.rt.state.views).toEqual({ [f.gid]: 'base' });
  });

  it('is cleared for a control of another type or none', () => {
    const f = setup(polygonsComponents);
    const controls = f.x['.__controls'] as Record<string, Control>;
    draw(f);
    draw(f, controls.filters);
    expect(f.mount.childNodes.length).toBe(0);

    draw(f);
    draw(f, null);
    expect(f.mount.childNodes.length).toBe(0);
  });
});

describe('the view checked at first', () => {
  it('is the one the state holds', () => {
    const f = setup(linesViews, { views1: 'flat' });
    expect(f.gid).toBe('views1');
    draw(f);
    expect(checked(f.mount)).toEqual(['flat']);
    expect(f.rt.state.views).toEqual({ views1: 'flat' });
  });

  it('is the default when the state holds a name the control lacks', () => {
    const f = setup(linesViews, { views1: 'gone' });
    // By hand: R emits the first view as the default; this one is the last.
    draw(f, { ...f.control, default: 'flat' } as Control);
    expect(checked(f.mount)).toEqual(['flat']);
    expect(f.rt.state.views).toEqual({ views1: 'flat' });
  });

  it('is the first when the default is not a name of the control', () => {
    const f = setup(linesViews);
    // By hand: a default the control does not list.
    draw(f, { ...f.control, default: 'gone' } as Control);
    expect(checked(f.mount)).toEqual(['thin']);
  });

  it('is written to the state under the group id, which is made when absent', () => {
    const f = setup(polygonsComponents);
    expect(f.gid).toBe('views');
    // By hand: a runtime that has no state yet.
    (f.rt as { state?: unknown }).state = undefined;
    draw(f);
    expect(f.rt.state).toEqual({ views: { views: 'scale' } });
  });
});

describe('a change', () => {
  it('sends the group id and the name of the radio now checked', () => {
    const f = setup(linesViews);
    draw(f);
    radios(f.mount)[1].click();
    expect(f.setActiveView.mock.calls).toEqual([['views1', 'by value']]);
    expect(checked(f.mount)).toEqual(['by value']);
  });

  it('sends nothing from a radio that is not checked', () => {
    const f = setup(linesViews);
    draw(f);
    radios(f.mount)[2].dispatchEvent(new Event('change'));
    expect(f.setActiveView).not.toHaveBeenCalled();
  });

  it('logs what setActiveView throws', () => {
    const f = setup(linesViews);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('no such view');
    f.setActiveView.mockImplementation(() => { throw failure; });
    draw(f);
    expect(() => radios(f.mount)[2].click()).not.toThrow();
    expect(logged.mock.calls).toEqual([[failure]]);
  });

  it('treats a view named base like any other', () => {
    const f = setup(linesViews);
    // By hand: the names of the sample replaced.
    draw(f, { ...f.control, view_names: ['other', 'base'], default: 'base' } as Control);
    expect(checked(f.mount)).toEqual(['base']);
    expect(f.rt.state.views).toEqual({ views1: 'base' });
    radios(f.mount)[0].click();
    radios(f.mount)[1].click();
    expect(f.setActiveView.mock.calls).toEqual([['views1', 'other'], ['views1', 'base']]);
  });
});

describe('radio names', () => {
  it('carry the id of the widget element and the group id', () => {
    const one = setup(polygonsComponents, undefined, 'w1');
    const two = setup(polygonsComponents, undefined, 'w2');
    draw(one);
    draw(two);
    expect(new Set(radios(one.mount).map(r => r.name))).toEqual(new Set(['ml-views-radios-w1-views']));
    expect(new Set(radios(two.mount).map(r => r.name))).toEqual(new Set(['ml-views-radios-w2-views']));
  });

  it('fall back to the package name for an element without an id', () => {
    const f = setup(polygonsComponents, undefined, '');
    draw(f);
    expect(radios(f.mount)[0].name).toBe('ml-views-radios-maplamina-views');
  });
});
