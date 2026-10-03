// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyVisibility } from '../../srcjs/components/legends';
import { resolveActiveOnly } from '../../srcjs/core/data';
import type { LayerState } from '../../srcjs/core/layer-state';
import type { Spec, WireSpec } from '../../srcjs/core/spec-types';
import type { WidgetElement, WidgetRuntime } from '../../srcjs/core/widget';
import { clear, sync, update } from '../../srcjs/controls/panel';
import { getHandler } from '../../srcjs/controls/registry';
import { buildFilterIndex, initFiltersState } from '../../srcjs/filters/runtime';
import legends from './spec-samples/legends';
import lengthOne from './spec-samples/length-one';
import polygonsComponents from './spec-samples/polygons-components';
import { normalise } from './support';

type Fields = Record<string, unknown>;

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
type CornerClass = typeof CORNERS[number];

// By hand: the map is its container, a node with MapLibre's four corner containers, each
// holding one control of MapLibre's own.
function widget(withMap = true): WidgetElement {
  const el = document.body.appendChild(document.createElement('div')) as WidgetElement;
  if (!withMap) return el;
  const container = el.appendChild(document.createElement('div'));
  for (const c of CORNERS) {
    const corner = container.appendChild(document.createElement('div'));
    corner.className = `maplibregl-ctrl-${c}`;
    corner.appendChild(document.createElement('div')).className = 'maplibregl-ctrl built-in';
  }
  (el as unknown as Fields).__mfGetMap = () => ({ getContainer: () => container });
  return el;
}

// By hand: the runtime is the view state, the one thing the views and legends renderers read.
function withViews(el: WidgetElement, views: Record<string, string>): void {
  el.__mfRuntime = { state: { views } } as unknown as WidgetRuntime;
}

// By hand: the runtime is the fields a summary reads, each made the way the widget makes it.
async function withLayers(el: WidgetElement, x: Spec): Promise<WidgetRuntime> {
  const rt = { layers: new Map() } as unknown as WidgetRuntime;
  initFiltersState(rt, x);
  rt._filterIndex = buildFilterIndex(x);
  for (const [id, st] of Object.entries(x['.__layers'] as Record<string, LayerState>)) {
    await resolveActiveOnly(st);
    rt.layers.set(id, { logical: st });
  }
  el.__mfRuntime = rt;
  return rt;
}

async function panelFixture(): Promise<{ x: Spec; el: WidgetElement; rt: WidgetRuntime }> {
  const x = normalise(polygonsComponents);
  const el = widget();
  const rt = await withLayers(el, x);
  return { x, el, rt };
}

// By hand: replaces fields of a control group or of the panel of a normalised sample.
function editControl(x: Spec, gid: string, fields: Fields): void {
  Object.assign((x['.__controls'] as unknown as Record<string, Fields>)[gid], fields);
}

function editPanel(x: Spec, fields: Fields): void {
  Object.assign(x['.__panel'] as unknown as Fields, fields);
}

function setPanel(x: Spec, panel: Fields | null): void {
  (x as unknown as Fields)['.__panel'] = panel;
}

const all = (node: ParentNode, selector: string): HTMLElement[] =>
  Array.from(node.querySelectorAll<HTMLElement>(selector));
const corner = (el: WidgetElement, c: CornerClass): HTMLElement =>
  el.querySelector<HTMLElement>(`.maplibregl-ctrl-${c}`)!;
const standalone = (node: ParentNode): HTMLElement[] => all(node, '[data-mf-control-kind="standalone"]');
const groupsIn = (el: WidgetElement, c: CornerClass): (string | undefined)[] =>
  standalone(corner(el, c)).map(n => n.dataset.mfControlGroup);
const item = (el: WidgetElement, gid: string): HTMLElement =>
  el.querySelector<HTMLElement>(`[data-mf-control-kind="standalone"][data-mf-control-group="${gid}"]`)!;
const hosts = (el: WidgetElement): HTMLElement[] => all(el, '[data-mf-control-kind="panel"]');
const slots = (el: WidgetElement): HTMLElement[] => all(el, '.ml-panel-slot');
const slot = (el: WidgetElement, gid: string): HTMLElement =>
  el.querySelector<HTMLElement>(`.ml-panel-slot--${gid}`)!;
const sectionTitles = (el: WidgetElement): (string | null)[] =>
  all(el, '.ml-panel-section-title').map(n => n.textContent);
const dockGroups = (el: WidgetElement): HTMLElement[] => all(el, '[data-mf-dock-group]');

function summaryValue(el: WidgetElement, label: string): string | null {
  const row = all(el, '.ml-summary-row').find(r => r.querySelector('.ml-summary-label')!.textContent === label);
  return row ? row.querySelector('.ml-summary-value')!.textContent : null;
}

beforeEach(() => {
  // By hand: jsdom has no ResizeObserver and the range slider of the filters makes one.
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

describe('getHandler', () => {
  it('has a renderer for each of the four control types and an update for summaries alone', () => {
    for (const type of ['filters', 'legends', 'summaries', 'views']) {
      expect(typeof getHandler(type)!.render).toBe('function');
    }
    expect(typeof getHandler('summaries')!.update).toBe('function');
    expect(getHandler('filters')!.update).toBeNull();
    expect(getHandler('legends')!.update).toBeNull();
    expect(getHandler('views')!.update).toBeNull();
  });

  it('trims and lower-cases the type, and knows no other', () => {
    expect(getHandler(' Views ')).toBe(getHandler('views'));
    expect(getHandler('gauge')).toBeNull();
    expect(getHandler('')).toBeNull();
    expect(getHandler(null)).toBeNull();
    expect(getHandler(undefined)).toBeNull();
  });
});

describe('standalone groups', () => {
  it('mounts one bare item per group, classed by group and by type', () => {
    const x = normalise(legends);
    const el = widget();
    sync(el, x);

    expect(standalone(el).map(n => n.dataset.mfControlGroup).sort()).toEqual(['legend1', 'scale', 'views1']);
    expect(hosts(el)).toEqual([]);
    expect(el.querySelector('.ml-panel-title')).toBeNull();
    expect(el.querySelector('.ml-panel-description')).toBeNull();
    expect(el.querySelector('.ml-panel-slot')).toBeNull();
    expect(el.querySelector('.ml-panel-section-title')).toBeNull();

    for (const n of standalone(el)) {
      expect(Array.from(n.children, c => c.classList.contains('ml-panel-slot-body'))).toEqual([true]);
      expect(n.classList.contains('ml-control-standalone')).toBe(true);
    }
    const body = item(el, 'legend1').firstElementChild as HTMLElement;
    expect(Array.from(body.classList)).toEqual(
      ['ml-panel-slot-body', 'ml-panel-legend1', 'ml-panel-legends', 'ml-panel-type-legends']
    );
    expect(body.dataset.mfControlType).toBe('legends');
    expect(body.querySelector('.ml-legend-stack')).not.toBeNull();
    expect(item(el, 'views1').firstElementChild!.classList.contains('ml-panel-type-views')).toBe(true);

    const mounted = el.__mlMountedControls!;
    expect(Object.keys(mounted).sort()).toEqual(['legend1', 'scale', 'views1']);
    expect(mounted.legend1.mountEl).toBe(body);
    expect(mounted.legend1.controlSpec).toBe(x['.__controls'].legend1);
  });

  it('keeps one item per group when mounted again', () => {
    const x = normalise(legends);
    const el = widget();
    sync(el, x);
    const first = standalone(el);
    sync(el, x);
    const second = standalone(el);
    expect(second.length).toBe(3);
    expect(second).toEqual(first);
    for (const n of second) expect(n.children.length).toBe(1);
    expect(all(el, '.ml-legend-stack').length).toBe(2);
  });

  it('puts each group in the corner of its position, top left without one', () => {
    const el = widget();
    sync(el, normalise(legends));
    expect(groupsIn(el, 'top-left')).toEqual(['views1', 'scale']);
    expect(groupsIn(el, 'bottom-left')).toEqual(['legend1']);
    expect(groupsIn(el, 'top-right')).toEqual([]);
    expect(groupsIn(el, 'bottom-right')).toEqual([]);
    expect(dockGroups(el).map(g => g.dataset.mfDockGroup).sort()).toEqual(['bottomleft', 'topleft']);
  });

  it('keeps a top corner after the controls of the map and a bottom corner before them', () => {
    const el = widget();
    sync(el, normalise(legends));
    const top = Array.from(corner(el, 'top-left').children, n => n.className.split(' ')[1]);
    const bottom = Array.from(corner(el, 'bottom-left').children, n => n.className.split(' ')[1]);
    expect(top).toEqual(['built-in', 'ml-dock-group']);
    expect(bottom).toEqual(['ml-dock-group', 'built-in']);
  });

  it('stacks the groups of one corner in the order of the controls', () => {
    const el = widget();
    sync(el, normalise(lengthOne));
    const bottom = standalone(corner(el, 'bottom-left'));
    expect(bottom.map(n => n.dataset.mfControlGroup)).toEqual(['legend1', 'legend2']);
    expect(bottom.map(n => n.dataset.mfDockOrder)).toEqual(['20', '25']);
    expect(bottom.map(n => n.style.order)).toEqual(['20', '25']);
  });

  it('moves a group whose position changes and drops the dock group it empties', () => {
    const x = normalise(legends);
    const el = widget();
    sync(el, x);
    // By hand: the only group of the bottom left corner sent to the top right.
    editControl(x, 'legend1', { position: 'topright' });
    sync(el, x);
    expect(groupsIn(el, 'top-right')).toEqual(['legend1']);
    expect(groupsIn(el, 'bottom-left')).toEqual([]);
    expect(groupsIn(el, 'top-left')).toEqual(['views1', 'scale']);
    expect(standalone(el).length).toBe(3);
    expect(dockGroups(el).map(g => g.dataset.mfDockGroup).sort()).toEqual(['topleft', 'topright']);
  });

  it('falls back to the top left for a position that is no corner', () => {
    const x = normalise(legends);
    const el = widget();
    // By hand: a position the compiler does not emit.
    editControl(x, 'legend1', { position: 'middle' });
    sync(el, x);
    expect(groupsIn(el, 'top-left')).toEqual(['views1', 'legend1', 'scale']);
  });

  it('mounts straight into the widget element when the map has no corner containers', () => {
    const x = normalise(legends);
    const el = widget(false);
    sync(el, x);
    sync(el, x);
    expect(all(el, ':scope > [data-mf-control-kind="standalone"]').map(n => n.dataset.mfControlGroup))
      .toEqual(['views1', 'legend1', 'scale']);
    expect(dockGroups(el)).toEqual([]);
  });
});

describe('the panel', () => {
  it('mounts one host in its corner with the title, the description and a slot per section', async () => {
    const { x, el } = await panelFixture();
    sync(el, x);

    expect(hosts(el).length).toBe(1);
    const host = hosts(el)[0];
    expect(corner(el, 'bottom-right').contains(host)).toBe(true);
    expect(host.dataset.mfControlKey).toBe('controls-panel');
    expect(host.classList.contains('ml-control-panel')).toBe(true);
    expect(Array.from(host.children, n => n.className.split(' ')[0])).toEqual(
      ['ml-panel-title', 'ml-panel-description', 'ml-panel-slot', 'ml-panel-slot', 'ml-panel-slot']
    );
    expect(host.querySelector('.ml-panel-title-text')!.textContent).toBe('Panel');
    expect(host.querySelector('.ml-panel-description')!.textContent).toBe('About');
    expect(host.querySelector('.ml-panel-title-link')).toBeNull();
    expect(host.querySelector('.ml-panel-icon')).toBeNull();

    expect(sectionTitles(el)).toEqual(['views', 'filters', 'summaries']);
    expect(slots(el).map(s => s.dataset.order)).toEqual(['10', '20', '30']);
    for (const gid of ['views', 'filters', 'summaries']) {
      const body = slot(el, gid).querySelector<HTMLElement>('.ml-panel-slot-body')!;
      expect(body.classList.contains(`ml-panel-${gid}`)).toBe(true);
      expect(body.classList.contains(`ml-panel-type-${gid}`)).toBe(true);
      expect(body.dataset.mfControlType).toBe(gid);
      expect(body.children.length).toBeGreaterThan(0);
      expect(body.querySelector('.ml-controls-placeholder')).toBeNull();
      expect(el.__mlMountedControls![gid].mountEl).toBe(body);
    }

    expect(standalone(el)).toEqual([]);
    expect(Object.keys(el.__mlMountedControls!)).toEqual(['views', 'filters', 'summaries']);
  });

  it('keeps one host and one slot per section when mounted again', async () => {
    const { x, el } = await panelFixture();
    sync(el, x);
    const host = hosts(el)[0];
    const first = slots(el);
    sync(el, x);
    expect(hosts(el)).toEqual([host]);
    expect(slots(el)).toEqual(first);
    expect(all(el, '.ml-panel-title').length).toBe(1);
    expect(all(el, '.ml-panel-description').length).toBe(1);
    expect(standalone(el)).toEqual([]);
  });

  it('drops the slot of a section that goes and mounts its group standalone in the panel corner', async () => {
    const { x, el } = await panelFixture();
    sync(el, x);
    // By hand: the panel without its last section.
    editPanel(x, { sections: [{ id: 'views' }, { id: 'filters' }] });
    sync(el, x);
    expect(sectionTitles(el)).toEqual(['views', 'filters']);
    expect(groupsIn(el, 'bottom-right')).toEqual(['summaries']);
    expect(standalone(el).length).toBe(1);
    expect(all(corner(el, 'bottom-right'), '[data-mf-dock-item]').map(n => n.dataset.mfControlKind))
      .toEqual(['panel', 'standalone']);
    expect(item(el, 'summaries').querySelector('.ml-summary-row')).not.toBeNull();
    expect(Object.keys(el.__mlMountedControls!)).toEqual(['views', 'filters', 'summaries']);

    editPanel(x, { sections: [{ id: 'views' }, { id: 'filters' }, { id: 'summaries' }] });
    sync(el, x);
    expect(sectionTitles(el)).toEqual(['views', 'filters', 'summaries']);
    expect(standalone(el)).toEqual([]);
  });

  it('follows the title, the description and the icon of the spec', async () => {
    const { x, el } = await panelFixture();
    sync(el, x);
    // By hand: a panel with an icon, and without a title or a description.
    editPanel(x, { title: null, description: null, icon: 'https://example.org/icon.png' });
    sync(el, x);
    const host = hosts(el)[0];
    expect(host.querySelector('.ml-panel-title-text')!.textContent).toBe('controls');
    expect(host.querySelector('.ml-panel-description')).toBeNull();
    const link = host.querySelector<HTMLAnchorElement>('.ml-panel-title-link')!;
    expect(link.href).toBe('https://example.org/icon.png');
    expect(link.target).toBe('_blank');
    expect(link.nextElementSibling!.className).toBe('ml-panel-title-text');
    expect(link.querySelector<HTMLImageElement>('.ml-panel-icon')!.src).toBe('https://example.org/icon.png');

    editPanel(x, { title: 'Panel', description: 'About', icon: null });
    sync(el, x);
    expect(host.querySelector('.ml-panel-title-text')!.textContent).toBe('Panel');
    expect(host.querySelector('.ml-panel-description')!.textContent).toBe('About');
    expect(host.querySelector('.ml-panel-title-link')).toBeNull();
    expect(host.querySelector('.ml-panel-icon')).toBeNull();
    expect(slots(el).length).toBe(3);
  });

  it('goes when the spec has no panel, and its groups mount standalone', async () => {
    const { x, el } = await panelFixture();
    sync(el, x);
    // By hand: the same spec without its panel.
    setPanel(x, null);
    sync(el, x);
    expect(hosts(el)).toEqual([]);
    expect(slots(el)).toEqual([]);
    expect(groupsIn(el, 'top-left')).toEqual(['views', 'filters', 'summaries']);
    expect(dockGroups(el).map(g => g.dataset.mfDockGroup)).toEqual(['topleft']);
  });

  it('draws a placeholder for a section with no control and for a type with no renderer', () => {
    const x = normalise(legends);
    const el = widget();
    // By hand: a panel naming a group the controls lack, and a control type nobody renders.
    setPanel(x, { title: 'Panel', position: 'topright', sections: [{ id: 'nothing' }, { id: 'legend1' }] });
    editControl(x, 'legend1', { type: 'gauge' });
    sync(el, x);

    const texts = (gid: string, part: string): string | null =>
      slot(el, gid).querySelector(`.ml-controls-placeholder-${part}`)!.textContent;
    expect(texts('nothing', 'meta')).toBe('(control) wired via .__controls.nothing');
    expect(texts('nothing', 'note')).toBe('No renderer registered for this control type yet.');
    expect(texts('legend1', 'meta')).toBe('(gauge) wired via .__controls.legend1');
    expect(slot(el, 'legend1').querySelector<HTMLElement>('.ml-panel-slot-body')!.dataset.mfControlType).toBe('gauge');
    expect(slot(el, 'nothing').querySelector<HTMLElement>('.ml-panel-slot-body')!.dataset.mfControlType).toBeUndefined();
    expect(groupsIn(el, 'top-right')).toEqual(['views1']);
    expect(groupsIn(el, 'top-left')).toEqual(['scale']);
  });
});

describe('update', () => {
  it('updates the summaries where they are mounted and leaves the other groups alone', async () => {
    const { x, el, rt } = await panelFixture();
    sync(el, x);
    await vi.waitFor(() => expect(summaryValue(el, 'n')).toBe('1'));
    const mounts = ['views', 'filters', 'summaries'].map(gid => el.__mlMountedControls![gid].mountEl);
    const children = mounts.map(m => m!.firstElementChild);

    // By hand: the range of the seeded filter state widened to admit both rows.
    rt.state.filters = { filters: { g: new Set(['a', 'b']), v: [1, 10] } };
    update(el, x, rt);
    await vi.waitFor(() => expect(summaryValue(el, 'n')).toBe('2'));
    expect(mounts.map(m => m!.firstElementChild)).toEqual(children);
    expect(slots(el).length).toBe(3);
  });

  it('does nothing without an element or before anything is mounted', async () => {
    const { x, el, rt } = await panelFixture();
    update(null, x, rt);
    update(el, x, rt);
    expect(el.__mlMountedControls).toBeUndefined();
    expect(el.querySelector('[data-mf-control-kind]')).toBeNull();
  });
});

describe('clear', () => {
  it('removes the panel, the standalone groups and their dock groups', async () => {
    const { x, el } = await panelFixture();
    // By hand: the panel without its last section, so one group is standalone.
    editPanel(x, { sections: [{ id: 'views' }, { id: 'filters' }] });
    sync(el, x);
    expect(hosts(el).length).toBe(1);
    expect(standalone(el).length).toBe(1);

    clear(el);
    expect(el.querySelector('[data-mf-control-kind]')).toBeNull();
    expect(dockGroups(el)).toEqual([]);
    expect(el.__mlMountedControls).toEqual({});
    expect(all(el, '.built-in').length).toBe(4);
  });
});

describe('a legend group whose cards are all hidden', () => {
  // By hand: the gate of the sample cut to one view.
  function gated(): Spec {
    const x = normalise(legends as WireSpec);
    Object.assign((x['.__components'].legends as unknown as Record<string, Fields>).legend2, {
      when: { layer: 'circle1', view: ['b'] }
    });
    return x;
  }

  it('hides its standalone item and shows it again under a view it lists', () => {
    const x = gated();
    const el = widget();
    withViews(el, { views1: 'a' });
    sync(el, x);
    expect(item(el, 'scale').style.display).toBe('none');
    expect(item(el, 'legend1').style.display).toBe('');
    expect(item(el, 'views1').style.display).toBe('');

    el.__mfRuntime!.state.views = { views1: 'b' };
    applyVisibility(el, x);
    expect(item(el, 'scale').style.display).toBe('');
  });

  it('stays hidden when mounted again under the same view', () => {
    const x = gated();
    const el = widget();
    withViews(el, { views1: 'a' });
    sync(el, x);
    sync(el, x);
    expect(standalone(el).length).toBe(3);
    expect(item(el, 'scale').style.display).toBe('none');
  });

  it('hides its slot as a panel section, not the panel', () => {
    const x = gated();
    const el = widget();
    withViews(el, { views1: 'a' });
    // By hand: a panel holding the two legend groups.
    setPanel(x, { title: 'Panel', position: 'topleft', sections: [{ id: 'legend1' }, { id: 'scale' }] });
    sync(el, x);
    expect(slot(el, 'scale').style.display).toBe('none');
    expect(slot(el, 'legend1').style.display).toBe('');
    expect(hosts(el)[0].style.display).toBe('');
    expect(slot(el, 'scale').querySelector<HTMLElement>('.ml-legend-stack')!.style.display).toBe('');

    el.__mfRuntime!.state.views = { views1: 'b' };
    applyVisibility(el, x);
    expect(slot(el, 'scale').style.display).toBe('');
  });
});
