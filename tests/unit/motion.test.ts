import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerState, TransitionEntry, TransitionsMap } from '../../srcjs/core/layer-state';
import type { LayerType } from '../../srcjs/core/spec-types';
import type { WidgetRuntime } from '../../srcjs/core/widget';
import { composeLayerProps, deckPropsTouchedByEncodingPatch } from '../../srcjs/layers/props';
import type { BuildContext } from '../../srcjs/layers/utils';
import {
  attach,
  disableRuntimeTransitions,
  injectMotionTransitions,
  primeRuntimeTransitions,
  syncJobTransitions,
  transitionsForBuild
} from '../../srcjs/runtime/motion';
import circlesConstant from './spec-samples/circles-constant';
import { hydratedLayer } from './support';

// deck.gl is imported by layers/props; its first import takes several seconds.
vi.setConfig({ testTimeout: 60000 });

// By hand: the runtime is the three fields the motion policy keeps on it.
function runtime(): WidgetRuntime {
  return attach({} as WidgetRuntime)!;
}

// A runtime with two circle layers armed by a view switch on radius and fill colour.
function armed(): WidgetRuntime {
  const rt = runtime();
  injectMotionTransitions(rt, 'a', 'circle', { radius: 1, fillColor: 1 }, { duration: 300, easing: 'linear' });
  injectMotionTransitions(rt, 'b', 'circle', { radius: 1 }, { duration: 300, easing: 'linear' });
  return rt;
}

const entries = (rt: WidgetRuntime, id: string): TransitionsMap => rt._layerTransitions!.get(id)!;
const entry = (rt: WidgetRuntime, id: string, prop: string): TransitionEntry => entries(rt, id)[prop] as TransitionEntry;
const durations = (rt: WidgetRuntime, id: string): Record<string, number | undefined> =>
  Object.fromEntries(Object.entries(entries(rt, id)).map(([k, e]) => [k, (e as TransitionEntry).duration]));
const hasCallbacks = (e: TransitionEntry): boolean => 'onEnd' in e || 'onInterrupt' in e;

afterEach(() => {
  vi.restoreAllMocks();
});

const allow = { reason: 'views', allowTransitions: true, motionEligible: true };
const deny = { reason: 'filters', allowTransitions: false, motionEligible: false };

describe('the policy of a job', () => {
  it('leaves what is armed alone when it allows transitions, and is returned', () => {
    const rt = armed();
    expect(syncJobTransitions(rt, ['a', 'b'], allow)).toBe(allow);
    expect(durations(rt, 'a')).toEqual({ getRadius: 300, getFillColor: 300 });
    expect(durations(rt, 'b')).toEqual({ getRadius: 300 });
    expect(Object.keys(rt._transitionTokens!.get('a')!)).toEqual(['getRadius', 'getFillColor']);
  });

  it('disables the layers it names when it does not, and is returned', () => {
    const rt = armed();
    expect(syncJobTransitions(rt, ['a'], deny)).toBe(deny);

    expect(durations(rt, 'a')).toEqual({ getRadius: 0, getFillColor: 0 });
    expect(hasCallbacks(entry(rt, 'a', 'getRadius'))).toBe(false);
    expect(hasCallbacks(entry(rt, 'a', 'getFillColor'))).toBe(false);
    expect(typeof entry(rt, 'a', 'getRadius').easing).toBe('function');
    expect(rt._transitionTokens!.has('a')).toBe(false);

    expect(durations(rt, 'b')).toEqual({ getRadius: 300 });
    expect(hasCallbacks(entry(rt, 'b', 'getRadius'))).toBe(true);
    expect(rt._transitionTokens!.has('b')).toBe(true);
  });

  it('goes by what the policy allows, not by its reason', () => {
    const rt = armed();
    syncJobTransitions(rt, ['a'], { ...allow, reason: 'filters' });
    expect(durations(rt, 'a')).toEqual({ getRadius: 300, getFillColor: 300 });
    syncJobTransitions(rt, ['a'], { ...deny, reason: 'views' });
    expect(durations(rt, 'a')).toEqual({ getRadius: 0, getFillColor: 0 });
  });

  it('takes one layer id as a string and none as nothing to do', () => {
    const rt = armed();
    syncJobTransitions(rt, 'b', deny);
    expect(durations(rt, 'b')).toEqual({ getRadius: 0 });
    expect(durations(rt, 'a')).toEqual({ getRadius: 300, getFillColor: 300 });

    syncJobTransitions(rt, null, deny);
    syncJobTransitions(rt, ['', 'unknown'], deny);
    expect(durations(rt, 'a')).toEqual({ getRadius: 300, getFillColor: 300 });
    expect(syncJobTransitions(null, ['a'], deny)).toBe(deny);
  });
});

describe('injectMotionTransitions', () => {
  it('arms each prop the patch touches with the motion of the view and a token of its own', () => {
    const rt = runtime();
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1, fillColor: 1 }, { duration: 300, easing: 'linear' });
    expect(Object.keys(entries(rt, 'a'))).toEqual(['getRadius', 'getFillColor']);
    for (const prop of ['getRadius', 'getFillColor']) {
      const e = entry(rt, 'a', prop);
      expect(e.duration).toBe(300);
      expect((e.easing as (t: number) => number)(0.25)).toBe(0.25);
      expect(typeof e.onEnd).toBe('function');
      expect(typeof e.onInterrupt).toBe('function');
    }
    expect(rt._transitionTokens!.get('a')).toEqual({ getRadius: 1, getFillColor: 2 });
    expect(rt._transitionTokenSeq).toBe(2);

    injectMotionTransitions(rt, 'b', 'line', { lineWidth: 1 }, { duration: 300 });
    expect(rt._transitionTokens!.get('b')).toEqual({ getWidth: 3 });
  });

  it('defaults to 750 ms and smoothstep', () => {
    const rt = runtime();
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, null);
    const e = entry(rt, 'a', 'getRadius');
    expect(e.duration).toBe(750);
    expect((e.easing as (t: number) => number)(0.25)).toBe(0.25 * 0.25 * (3 - 0.5));
  });

  it('arms nothing for a duration of 0 or a patch that touches no prop', () => {
    const rt = runtime();
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: 0 });
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: -5 });
    injectMotionTransitions(rt, 'a', 'circle', { size: 1 }, { duration: 300 });
    injectMotionTransitions(rt, 'a', 'circle', null, { duration: 300 });
    injectMotionTransitions(rt, 'a', null, { radius: 1 }, { duration: 300 });
    injectMotionTransitions(rt, '', 'circle', { radius: 1 }, { duration: 300 });
    expect(rt._layerTransitions!.size).toBe(0);
    expect(rt._transitionTokens!.size).toBe(0);
    expect(rt._transitionTokenSeq).toBe(0);
  });

  it('makes the fields of a runtime that has none', () => {
    // By hand: a runtime that never went through attach().
    const rt = {} as WidgetRuntime;
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: 300 });
    expect(durations(rt, 'a')).toEqual({ getRadius: 300 });
    expect(rt._transitionTokens!.get('a')).toEqual({ getRadius: 1 });
  });
});

describe('the end of a transition', () => {
  it.each(['onEnd', 'onInterrupt'] as const)('disables its entry and drops its token: %s', (cb) => {
    const rt = armed();
    entry(rt, 'a', 'getRadius')[cb]!();
    expect(durations(rt, 'a')).toEqual({ getRadius: 0, getFillColor: 300 });
    expect(hasCallbacks(entry(rt, 'a', 'getRadius'))).toBe(false);
    expect(hasCallbacks(entry(rt, 'a', 'getFillColor'))).toBe(true);
    expect(Object.keys(rt._transitionTokens!.get('a')!)).toEqual(['getFillColor']);

    entry(rt, 'a', 'getFillColor')[cb]!();
    expect(durations(rt, 'a')).toEqual({ getRadius: 0, getFillColor: 0 });
    expect(rt._transitionTokens!.has('a')).toBe(false);
    expect(durations(rt, 'b')).toEqual({ getRadius: 300 });
  });

  it.each(['onEnd', 'onInterrupt'] as const)('does nothing when the prop was armed again since: %s', (cb) => {
    const rt = armed();
    const stale = entry(rt, 'a', 'getRadius')[cb]!;
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: 500 });
    const current = entry(rt, 'a', 'getRadius');
    const token = rt._transitionTokens!.get('a')!.getRadius;

    stale();
    expect(entry(rt, 'a', 'getRadius')).toBe(current);
    expect(current.duration).toBe(500);
    expect(hasCallbacks(current)).toBe(true);
    expect(rt._transitionTokens!.get('a')!.getRadius).toBe(token);

    current[cb]!();
    expect(durations(rt, 'a')).toEqual({ getRadius: 0, getFillColor: 300 });
  });

  it('does nothing after the layer was disabled, and again after it was armed anew', () => {
    const rt = armed();
    const stale = entry(rt, 'a', 'getRadius').onEnd!;
    disableRuntimeTransitions(rt, ['a']);
    const disabled = entry(rt, 'a', 'getRadius');
    stale();
    expect(entry(rt, 'a', 'getRadius')).toBe(disabled);

    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: 500 });
    stale();
    expect(durations(rt, 'a')).toEqual({ getRadius: 500, getFillColor: 0 });
    expect(Object.keys(rt._transitionTokens!.get('a')!)).toEqual(['getRadius']);
  });
});

describe('primeRuntimeTransitions', () => {
  it('gives each prop the keys touch a duration-0 entry and leaves an armed one alone', () => {
    const rt = runtime();
    injectMotionTransitions(rt, 'a', 'circle', { radius: 1 }, { duration: 300 });
    const live = entry(rt, 'a', 'getRadius');
    primeRuntimeTransitions(rt, 'a', 'circle', { radius: 1, fillColor: 1, lineWidth: 1 });
    expect(durations(rt, 'a')).toEqual({ getRadius: 300, getFillColor: 0, getLineWidth: 0 });
    expect(entry(rt, 'a', 'getRadius')).toBe(live);
    expect(hasCallbacks(entry(rt, 'a', 'getFillColor'))).toBe(false);
    expect(rt._transitionTokens!.get('a')).toEqual({ getRadius: 1 });
  });

  it('makes no entry when the keys touch no prop or there is no layer id', () => {
    const rt = runtime();
    primeRuntimeTransitions(rt, 'a', 'circle', { size: 1 });
    primeRuntimeTransitions(rt, 'a', 'circle', null);
    primeRuntimeTransitions(rt, '', 'circle', { radius: 1 });
    primeRuntimeTransitions(null, 'a', 'circle', { radius: 1 });
    expect(rt._layerTransitions!.size).toBe(0);
  });
});

describe('transitionsForBuild', () => {
  it('is the stored map of a layer that has entries', () => {
    const rt = armed();
    expect(transitionsForBuild(rt, 'a')).toBe(entries(rt, 'a'));
    expect(transitionsForBuild(rt, ' a ')).toBe(entries(rt, 'a'));
  });

  it('is null for a layer with none, an empty id or no runtime', () => {
    const rt = armed();
    rt._layerTransitions!.set('empty', {});
    expect(transitionsForBuild(rt, 'empty')).toBeNull();
    expect(transitionsForBuild(rt, 'unknown')).toBeNull();
    expect(transitionsForBuild(rt, '')).toBeNull();
    expect(transitionsForBuild(rt, null)).toBeNull();
    expect(transitionsForBuild(null, 'a')).toBeNull();
    expect(transitionsForBuild({} as WidgetRuntime, 'a')).toBeNull();
  });
});

describe('attach', () => {
  it('makes the three fields and keeps the ones a runtime has', () => {
    const rt = attach({} as WidgetRuntime)!;
    expect(rt._layerTransitions).toBeInstanceOf(Map);
    expect(rt._transitionTokens).toBeInstanceOf(Map);
    expect(rt._transitionTokenSeq).toBe(0);

    const live = armed();
    const maps = [live._layerTransitions, live._transitionTokens];
    expect(attach(live)).toBe(live);
    expect([live._layerTransitions, live._transitionTokens]).toEqual(maps);
    expect(live._layerTransitions).toBe(maps[0]);
    expect(live._transitionTokenSeq).toBe(3);
    expect(attach(null)).toBeNull();
  });
});

describe('the props an encoding patch touches', () => {
  const all = { radius: 1, fillColor: 1, lineColor: 1, lineWidth: 1, size: 1, opacity: 1 };

  it.each([
    ['circle', ['getRadius', 'getFillColor', 'getLineColor', 'getLineWidth']],
    ['line', ['getColor', 'getWidth']],
    ['polygon', ['getFillColor', 'getLineColor', 'getLineWidth']],
    ['icon', ['getSize', 'getColor']],
    ['marker', ['getSize', 'getColor', 'getLineColor', 'getLineWidth']]
  ] as [LayerType, string[]][])('of a %s layer, with every key', (type, props) => {
    expect(deckPropsTouchedByEncodingPatch(type, all)).toEqual(props);
  });

  it.each([
    ['circle', { radius: 1 }, ['getRadius']],
    ['circle', { opacity: 1 }, ['getFillColor']],
    ['circle', { size: 1 }, []],
    ['line', { fillColor: 1 }, ['getColor']],
    ['line', { lineColor: 1 }, ['getColor']],
    ['line', { opacity: 1 }, ['getColor']],
    ['line', { radius: 1 }, []],
    ['polygon', { opacity: 1 }, ['getFillColor']],
    ['polygon', { radius: 1 }, []],
    ['icon', { opacity: 1 }, ['getColor']],
    ['icon', { lineColor: 1, lineWidth: 1 }, []],
    ['marker', { fillColor: 1 }, ['getColor']],
    ['marker', { radius: 1 }, []]
  ] as [LayerType, object, string[]][])('of a %s layer, key by key: %o', (type, patch, props) => {
    expect(deckPropsTouchedByEncodingPatch(type, patch)).toEqual(props);
  });

  it('is empty for no patch or a type it does not know', () => {
    expect(deckPropsTouchedByEncodingPatch('circle', null)).toEqual([]);
    expect(deckPropsTouchedByEncodingPatch('circle', {})).toEqual([]);
    expect(deckPropsTouchedByEncodingPatch(null, all)).toEqual([]);
    expect(deckPropsTouchedByEncodingPatch('hexagon' as LayerType, all)).toEqual([]);
  });
});

describe('the transitions composeLayerProps hands to deck.gl', () => {
  // By hand: no element, no map and an empty cache.
  const ctx = { el: null, map: null, cache: {} } as unknown as BuildContext;

  // By hand: the transitions of the build written on the render fields of the layer.
  async function compose(transitions?: TransitionsMap | null): Promise<TransitionsMap | undefined> {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    if (transitions !== undefined) st.__render = { transitions } as LayerState['__render'];
    return composeLayerProps(st, {}, ctx).transitions as TransitionsMap | undefined;
  }

  it('gives a primed prop a duration of 1, never 0', async () => {
    const rt = runtime();
    primeRuntimeTransitions(rt, 'circle1', 'circle', { radius: 1, fillColor: 1 });
    expect(durations(rt, 'circle1')).toEqual({ getRadius: 0, getFillColor: 0 });
    expect(await compose(transitionsForBuild(rt, 'circle1'))).toEqual({
      getRadius: { duration: 1 },
      getFillColor: { duration: 1 }
    });
    expect(durations(rt, 'circle1')).toEqual({ getRadius: 0, getFillColor: 0 });
  });

  it('gives an armed prop its entry as it is, and a disabled one a duration of 1', async () => {
    const rt = armed();
    entry(rt, 'a', 'getFillColor').onEnd!();
    const out = (await compose(transitionsForBuild(rt, 'a')))!;
    expect(out.getRadius).toBe(entry(rt, 'a', 'getRadius'));
    expect(out.getFillColor).toEqual({ duration: 1 });
  });

  it('takes a bare number as a duration and leaves out an entry without one', async () => {
    // By hand: entry shapes the runtime does not write.
    const out = await compose({ a: 250, b: 0, c: {}, d: { duration: -1 } } as unknown as TransitionsMap);
    expect(out).toEqual({ a: 250, b: { duration: 1 } });
  });

  it('sets no transitions for a layer that has none', async () => {
    expect(await compose()).toBeUndefined();
    expect(await compose(null)).toBeUndefined();
    expect(await compose({})).toBeUndefined();
  });
});
