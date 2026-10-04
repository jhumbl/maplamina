// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyVisibility, buildLegendCard } from '../../srcjs/components/legends';
import type { Control, LegendsComponent, Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { WidgetElement, WidgetRuntime, WritableRuntime } from '../../srcjs/core/widget';
import { render } from '../../srcjs/controls/legends';
import legends from './spec-samples/legends';
import lengthOne from './spec-samples/length-one';
import { normalise } from './support';

interface Fixture {
  x: Spec;
  el: WidgetElement;
  controls: Record<string, Control>;
  components: Record<string, LegendsComponent>;
}

// By hand: the runtime is the view state, the one thing visibility reads from it.
function setup(wire: WireSpec, views?: Record<string, string>): Fixture {
  const x = normalise(wire);
  const el = document.body.appendChild(document.createElement('div')) as WidgetElement;
  if (views) el.__mfRuntime = { state: { views } } as unknown as WidgetRuntime;
  return {
    x,
    el,
    controls: x['.__controls'] as Record<string, Control>,
    components: x['.__components'].legends as Record<string, LegendsComponent>
  };
}

// Draws one control group into a mount of its own inside the widget element.
function draw(f: Fixture, gid: string, control: unknown = f.controls[gid]): HTMLElement {
  const mount = f.el.appendChild(document.createElement('div'));
  render(mount, f.el, f.x, gid, control as Control | null);
  return mount;
}

// By hand: replaces fields of a legend component of the sample.
function edit(f: Fixture, id: string, fields: Record<string, unknown>): void {
  Object.assign(f.components[id] as unknown as Record<string, unknown>, fields);
}

const cards = (node: HTMLElement): HTMLElement[] => Array.from(node.querySelectorAll<HTMLElement>('.ml-legend'));
const stack = (node: HTMLElement): HTMLElement => node.querySelector<HTMLElement>('.ml-legend-stack')!;
const texts = (node: HTMLElement, selector: string): (string | null)[] =>
  Array.from(node.querySelectorAll(selector), n => n.textContent);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = '';
});

describe('the stack', () => {
  it('holds a card per member and carries the group id', () => {
    const f = setup(legends);
    const mount = draw(f, 'legend1');
    expect(stack(mount).dataset.mfLegendsGroup).toBe('legend1');
    expect(cards(mount).map(c => c.dataset.legendId)).toEqual(['legend1']);

    const scale = draw(f, 'scale');
    expect(stack(scale).dataset.mfLegendsGroup).toBe('scale');
    expect(cards(scale).map(c => c.dataset.legendId)).toEqual(['legend2']);
  });

  it('skips a member the components lack', () => {
    const f = setup(legends);
    // By hand: a member that names no component.
    const mount = draw(f, 'legend1', { ...f.controls.legend1, members: ['gone', 'legend1'] });
    expect(cards(mount).map(c => c.dataset.legendId)).toEqual(['legend1']);
    expect(mount.querySelector('.ml-controls-placeholder')).toBeNull();
  });

  it('gives way to a placeholder when no member is found, and to another when there are none', () => {
    const f = setup(legends);
    // By hand: the members replaced.
    const lost = draw(f, 'legend1', { ...f.controls.legend1, members: ['gone'] });
    expect(cards(lost).length).toBe(0);
    expect(texts(lost, '.ml-controls-placeholder')).toEqual(['No legends found for this control group.']);

    const none = draw(f, 'legend1', { ...f.controls.legend1, members: [] });
    expect(none.querySelector('.ml-legend-stack')).toBeNull();
    expect(none.textContent).toBe('No legends available.');
  });

  it('is cleared for a control of another type or none', () => {
    const f = setup(legends);
    const mount = draw(f, 'legend1');
    render(mount, f.el, f.x, 'legend1', f.controls.views1);
    expect(mount.childNodes.length).toBe(0);

    render(mount, f.el, f.x, 'legend1', f.controls.legend1);
    render(mount, f.el, f.x, 'legend1', null);
    expect(mount.childNodes.length).toBe(0);
  });
});

describe('a categorical card', () => {
  it('has its title and a row per item, each with a swatch of its shape and a label', () => {
    const f = setup(legends);
    const card = cards(draw(f, 'legend1'))[0];
    expect(texts(card, '.ml-legend-title')).toEqual(['Groups']);
    expect(texts(card, '.ml-legend-row .ml-legend-label')).toEqual(['a', 'b']);
    const swatches = Array.from(card.querySelectorAll('.ml-legend-row .ml-legend-swatch'));
    expect(swatches.length).toBe(2);
    expect(swatches[0].classList.contains('ml-legend-swatch--circle')).toBe(true);
    expect(swatches[1].classList.contains('ml-legend-swatch--icon')).toBe(true);
  });

  it('has one row for a length-1 legend and no title node for a null title', () => {
    const f = setup(lengthOne);
    const card = cards(draw(f, 'legend1'))[0];
    expect(card.querySelector('.ml-legend-title')).toBeNull();
    expect(texts(card, '.ml-legend-row .ml-legend-label')).toEqual(['only']);
  });
});

describe('a continuous card', () => {
  it('has a gradient bar and a label per break', () => {
    const f = setup(legends);
    const card = cards(draw(f, 'scale'))[0];
    expect(card.querySelector('.ml-legend-title')).toBeNull();
    expect(card.querySelectorAll('.ml-legend-gradient').length).toBe(1);
    expect(texts(card, '.ml-legend-tick-label')).toEqual(['low', 'high']);
  });

  it('draws one label for a label and a break that arrive as scalars', () => {
    const f = setup(lengthOne);
    const card = cards(draw(f, 'legend2'))[0];
    expect(card.querySelectorAll('.ml-legend-gradient').length).toBe(1);
    expect(texts(card, '.ml-legend-tick-label')).toEqual(['low']);
  });
});

describe('buildLegendCard', () => {
  it('says so for a type it does not know', () => {
    const f = setup(legends);
    const comp = f.components.legend1;
    // By hand: a type R does not emit.
    const card = buildLegendCard({ ...comp, legend: { ...comp.legend, type: 'heat' } } as unknown as LegendsComponent);
    expect(texts(card, '.ml-legend-title')).toEqual(['Groups']);
    expect(texts(card, '.ml-legend-body')).toEqual(['Unknown legend type']);
  });

  it('warns about a component without a legend and builds a card without an id', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // By hand: a component with no `legend`.
    const card = buildLegendCard({ type: 'legends', id: 'x' } as unknown as LegendsComponent);
    expect(warned).toHaveBeenCalledTimes(1);
    expect(card.className).toBe('ml-legend');
    expect(card.dataset.legendId).toBe('');
    expect(card.textContent).toBe('Unknown legend type');
  });
});

describe('visibility', () => {
  it('shows a card with no `when`', () => {
    const f = setup(legends);
    const mount = draw(f, 'legend1');
    expect(cards(mount)[0].style.display).toBe('');
    expect(stack(mount).style.display).toBe('');
  });

  it('shows a card gated on the views of its layer under each of them', () => {
    const byDefault = setup(legends);
    expect(cards(draw(byDefault, 'scale'))[0].style.display).toBe('');

    const underB = setup(legends, { views1: 'b' });
    expect(cards(draw(underB, 'scale'))[0].style.display).toBe('');
  });

  it('hides a card and its stack under a view it does not list, and shows them again', () => {
    const f = setup(legends, { views1: 'a' });
    // By hand: the gate of the sample cut to one view.
    edit(f, 'legend2', { when: { layer: 'circle1', view: ['b'] } });
    const mount = draw(f, 'scale');
    const open = draw(f, 'legend1');
    expect(cards(mount)[0].style.display).toBe('none');
    expect(stack(mount).style.display).toBe('none');
    expect(stack(open).style.display).toBe('');

    (f.el.__mfRuntime as WritableRuntime).state.views = { views1: 'b' };
    applyVisibility(f.el, f.x);
    expect(cards(mount)[0].style.display).toBe('');
    expect(stack(mount).style.display).toBe('');
  });

  it('hides a card gated on a view when the spec has no views group', () => {
    const f = setup(lengthOne);
    expect(f.components.legend2.when).toEqual({ layer: null, view: ['a'] });
    const gated = draw(f, 'legend2');
    const open = draw(f, 'legend1');
    expect(cards(gated)[0].style.display).toBe('none');
    expect(stack(gated).style.display).toBe('none');
    expect(cards(open)[0].style.display).toBe('');
  });

  it('hides a card gated on a layer the spec lacks', () => {
    const f = setup(legends);
    // By hand: a gate that names no layer of the sample.
    edit(f, 'legend2', { when: { layer: 'gone', view: null } });
    const mount = draw(f, 'scale');
    expect(cards(mount)[0].style.display).toBe('none');
  });

  it('does nothing without a widget element', () => {
    const f = setup(legends);
    expect(() => applyVisibility(null, f.x)).not.toThrow();
  });
});
