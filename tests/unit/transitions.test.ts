import { describe, expect, it } from 'vitest';
import type { TransitionEntry, TransitionsMap } from '../../srcjs/core/layer-state';
import {
  buildTransitionEntry,
  disableTransitionEntry,
  disableTransitionsForProps,
  primeTransitionsForProps,
} from '../../srcjs/runtime/transitions';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const armed = (): TransitionEntry => ({ duration: 500, easing: (t) => t, onEnd: () => {}, onInterrupt: () => {} });

describe('buildTransitionEntry', () => {
  it('takes the duration and easing R emits for a view', () => {
    const linear = buildTransitionEntry(linesViews['.__components'].views.views1.motion);
    expect(linear.duration).toBe(500);
    expect(linear.easing!(0.25)).toBe(0.25);
    expect(Object.keys(linear).sort()).toEqual(['duration', 'easing']);

    const smooth = buildTransitionEntry(polygonsComponents['.__components'].views.views1.motion);
    expect(smooth.duration).toBe(750);
    expect(smooth.easing!(0.25)).toBe(smoothstep(0.25));
  });

  it('defaults to 750 ms and smoothstep with no motion', () => {
    for (const motion of [null, undefined, {}]) {
      const e = buildTransitionEntry(motion);
      expect(e.duration).toBe(750);
      expect(e.easing!(0.25)).toBe(smoothstep(0.25));
      expect(e.delay).toBeUndefined();
    }
  });

  it('looks an easing up by name whatever its case or padding', () => {
    const cubic = buildTransitionEntry({ easing: 'easeInOutCubic' }).easing!;
    expect(cubic(0.25)).toBe(4 * 0.25 ** 3);
    expect(cubic(0.75)).toBe(1 - Math.pow(-2 * 0.75 + 2, 3) / 2);
    expect(buildTransitionEntry({ easing: ' EASEINOUTCUBIC ' }).easing!(0.25)).toBe(cubic(0.25));
    expect(buildTransitionEntry({ easing: 'Linear' }).easing!(0.3)).toBe(0.3);
  });

  it('knows every easing name, each running from 0 to 1', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'smoothstep', 'easeInOutCubic']) {
      const f = buildTransitionEntry({ easing: name }).easing!;
      expect(f(0)).toBeCloseTo(0, 12);
      expect(f(1)).toBeCloseTo(1, 12);
      expect(f(0.5)).toBeGreaterThan(0);
      expect(f(0.5)).toBeLessThan(1);
    }
    expect(buildTransitionEntry({ easing: 'easeIn' }).easing!(0.5)).toBe(0.25);
    expect(buildTransitionEntry({ easing: 'easeOut' }).easing!(0.5)).toBe(0.75);
  });

  it('sets no easing for a name it does not know, and keeps a function as given', () => {
    expect('easing' in buildTransitionEntry({ easing: 'bounce' })).toBe(false);
    const f = (t: number): number => t / 2;
    expect(buildTransitionEntry({ easing: f }).easing).toBe(f);
  });

  it('floors a negative duration at 0 and keeps a delay', () => {
    expect(buildTransitionEntry({ duration: -5 }).duration).toBe(0);
    expect(buildTransitionEntry({ duration: 0 }).duration).toBe(0);
    expect(buildTransitionEntry({ duration: 200, delay: 40 })).toMatchObject({ duration: 200, delay: 40 });
  });

  it('attaches the callbacks it is given', () => {
    const onEnd = (): void => {}, onInterrupt = (): void => {};
    const e = buildTransitionEntry({ duration: 100 }, { onEnd, onInterrupt });
    expect(e.onEnd).toBe(onEnd);
    expect(e.onInterrupt).toBe(onInterrupt);
    expect('onEnd' in buildTransitionEntry({ duration: 100 }, null)).toBe(false);
  });
});

describe('disableTransitionEntry', () => {
  it('sets the duration to 0, drops the callbacks and keeps easing and delay', () => {
    const src = { ...armed(), delay: 20 };
    const e = disableTransitionEntry(src);
    expect(e.duration).toBe(0);
    expect(e.delay).toBe(20);
    expect(e.easing).toBe(src.easing);
    expect('onEnd' in e).toBe(false);
    expect('onInterrupt' in e).toBe(false);
  });

  it('returns a new entry and leaves the one given armed', () => {
    const src = armed();
    const e = disableTransitionEntry(src);
    expect(e).not.toBe(src);
    expect(src.duration).toBe(500);
    expect(typeof src.onEnd).toBe('function');
  });

  it('takes a bare duration or nothing', () => {
    expect(disableTransitionEntry(300)).toEqual({ duration: 0 });
    expect(disableTransitionEntry(null)).toEqual({ duration: 0 });
    expect(disableTransitionEntry(undefined)).toEqual({ duration: 0 });
  });

  it('gives an entry with no easing the default one', () => {
    expect(disableTransitionEntry({ duration: 100 }).easing!(0.25)).toBe(smoothstep(0.25));
  });
});

describe('primeTransitionsForProps', () => {
  it('creates a duration-0 entry with no callbacks for each prop the map lacks', () => {
    const t: TransitionsMap = {};
    expect(primeTransitionsForProps(t, ['getRadius', 'getFillColor'], null)).toBe(t);
    expect(Object.keys(t)).toEqual(['getRadius', 'getFillColor']);
    const e = t.getRadius as TransitionEntry;
    expect(e.duration).toBe(0);
    expect(e.easing!(0.25)).toBe(smoothstep(0.25));
    expect('onEnd' in e).toBe(false);
  });

  it('takes delay and easing from the motion it is given', () => {
    const t: TransitionsMap = {};
    primeTransitionsForProps(t, 'getRadius', { duration: 900, delay: 30, easing: 'linear' });
    const e = t.getRadius as TransitionEntry;
    expect(e.duration).toBe(0);
    expect(e.delay).toBe(30);
    expect(e.easing!(0.25)).toBe(0.25);
  });

  it('leaves an armed entry as it is, object or bare number', () => {
    const entry = armed();
    const t: TransitionsMap = { getRadius: entry, getLineWidth: 250 };
    primeTransitionsForProps(t, ['getRadius', 'getLineWidth'], null);
    expect(t.getRadius).toBe(entry);
    expect(typeof entry.onEnd).toBe('function');
    expect(t.getLineWidth).toBe(250);
  });

  it('strips the callbacks from an entry already at duration 0', () => {
    const t: TransitionsMap = { getRadius: { duration: 0, onEnd: () => {}, onInterrupt: () => {} } };
    primeTransitionsForProps(t, ['getRadius'], null);
    const e = t.getRadius as TransitionEntry;
    expect(e.duration).toBe(0);
    expect('onEnd' in e).toBe(false);
    expect('onInterrupt' in e).toBe(false);
  });

  it('skips an empty prop name, and does nothing without a map or props', () => {
    const t: TransitionsMap = {};
    primeTransitionsForProps(t, ['', 'getRadius'], null);
    expect(Object.keys(t)).toEqual(['getRadius']);
    expect(primeTransitionsForProps(t, null, null)).toBe(t);
    expect(Object.keys(t)).toEqual(['getRadius']);
    expect(primeTransitionsForProps(null, ['getRadius'], null)).toBeNull();
  });
});

describe('disableTransitionsForProps', () => {
  it('disables every entry when no props are named', () => {
    const t: TransitionsMap = { getRadius: armed(), getFillColor: armed(), getLineWidth: 250 };
    expect(disableTransitionsForProps(t)).toBe(t);
    for (const k of Object.keys(t)) {
      const e = t[k] as TransitionEntry;
      expect(e.duration).toBe(0);
      expect('onEnd' in e).toBe(false);
    }
    expect(Object.keys(t)).toEqual(['getRadius', 'getFillColor', 'getLineWidth']);
  });

  it('disables only the props named, one or several', () => {
    const t: TransitionsMap = { getRadius: armed(), getFillColor: armed() };
    disableTransitionsForProps(t, 'getRadius');
    expect((t.getRadius as TransitionEntry).duration).toBe(0);
    expect((t.getFillColor as TransitionEntry).duration).toBe(500);
    disableTransitionsForProps(t, ['getFillColor']);
    expect((t.getFillColor as TransitionEntry).duration).toBe(0);
  });

  it('adds no entry for a prop the map lacks', () => {
    const t: TransitionsMap = { getRadius: armed() };
    disableTransitionsForProps(t, ['getFillColor', '']);
    expect(Object.keys(t)).toEqual(['getRadius']);
    expect((t.getRadius as TransitionEntry).duration).toBe(500);
  });

  it('is null without a map', () => {
    expect(disableTransitionsForProps(null)).toBeNull();
  });
});
