import { describe, expect, it, vi } from 'vitest';
import * as utils from '../../srcjs/core/utils';
import polygonsComponents from './spec-samples/polygons-components';

describe('authoredOrder', () => {
  const controls = polygonsComponents['.__controls'];

  it('is the order list R emits for filters and for summary rows', () => {
    expect(utils.authoredOrder(controls.filters.controls, controls.filters.order)).toEqual(['g', 'v']);
    expect(utils.authoredOrder(controls.summaries.rows, controls.summaries.order))
      .toEqual(['n', 'sum', 'mean', 'min', 'max']);
  });

  it('follows the list, not the insertion order of the keys', () => {
    expect(utils.authoredOrder(controls.filters.controls, ['v', 'g'])).toEqual(['v', 'g']);
  });

  // R emits every key, once, by its exact name; the shapes below are written by hand.
  it('appends the keys the list does not name, in insertion order', () => {
    const rows = { a: 1, b: 2, c: 3, d: 4 };
    expect(utils.authoredOrder(rows, ['c'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('matches a padded name in the list to its key', () => {
    expect(utils.authoredOrder({ a: 1, b: 2 }, [' b ', 'a'])).toEqual(['b', 'a']);
  });

  it('matches a name in the list to a padded key', () => {
    expect(utils.authoredOrder({ a: 1, ' b ': 2 }, ['b'])).toEqual([' b ', 'a']);
  });

  it('prefers the exact key when a padded key trims to the same name', () => {
    expect(utils.authoredOrder({ ' a': 1, a: 2 }, ['a'])).toEqual(['a', ' a']);
  });

  it('skips a name that is no key, a repeated name and a null entry', () => {
    expect(utils.authoredOrder({ a: 1, b: 2 }, ['x', 'b', 'b', null, 'a'])).toEqual(['b', 'a']);
  });

  it('is the insertion order when the list is absent, empty or not an array', () => {
    const rows = { b: 1, a: 2 };
    expect(utils.authoredOrder(rows, undefined)).toEqual(['b', 'a']);
    expect(utils.authoredOrder(rows, [])).toEqual(['b', 'a']);
    expect(utils.authoredOrder(rows, 'a')).toEqual(['b', 'a']);
  });

  it('is empty for no rows', () => {
    expect(utils.authoredOrder({}, ['a'])).toEqual([]);
  });
});

describe('ids for the DOM', () => {
  it('safeId keeps letters, digits, underscore and hyphen', () => {
    expect(utils.safeId('circle-1_a')).toBe('circle-1_a');
    expect(utils.safeId(' price / m2 ')).toBe('price_m2');
    expect(utils.safeId(null)).toBe('');
  });

  it('widgetKey is the element id, or a fixed name without one', () => {
    expect(utils.widgetKey({ id: 'htmlwidget-1f2e' })).toBe('htmlwidget-1f2e');
    expect(utils.widgetKey({ id: 'my widget' })).toBe('my_widget');
    expect(utils.widgetKey({})).toBe('maplamina');
    expect(utils.widgetKey(null)).toBe('maplamina');
  });

  it('domKey is a valid id fragment for any label', () => {
    for (const label of ['price / m2', 'a b', '2024', '/', '', 'été', 'g']) {
      expect(utils.domKey(label)).toMatch(/^[A-Za-z_][A-Za-z0-9_-]*$/);
    }
  });

  it('domKey is stable and trims its input', () => {
    expect(utils.domKey('price / m2')).toBe(utils.domKey('price / m2'));
    expect(utils.domKey(' g ')).toBe(utils.domKey('g'));
    expect(utils.domKey('g')).toMatch(/^g-/);
    expect(utils.domKey('2024')).toMatch(/^k_2024-/);
  });

  it('domKey tells apart labels that slug to the same text', () => {
    expect(utils.safeId('a/b')).toBe(utils.safeId('a b'));
    expect(utils.domKey('a/b')).not.toBe(utils.domKey('a b'));
  });
});

describe('small helpers', () => {
  it('asArray wraps a scalar, keeps an array and empties null', () => {
    const arr = ['a', 'b'];
    expect(utils.asArray(arr)).toBe(arr);
    expect(utils.asArray('a')).toEqual(['a']);
    expect(utils.asArray(0)).toEqual([0]);
    expect(utils.asArray(null)).toEqual([]);
    expect(utils.asArray(undefined)).toEqual([]);
  });

  it('normText trims and turns null into an empty string', () => {
    expect(utils.normText('  a b ')).toBe('a b');
    expect(utils.normText(null)).toBe('');
    expect(utils.normText(3)).toBe('3');
  });

  it('escapeHtml escapes the four characters once', () => {
    expect(utils.escapeHtml('<b a="1">&</b>')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;');
    expect(utils.escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('isTA accepts typed arrays only', () => {
    expect(utils.isTA(new Float32Array(1))).toBe(true);
    expect(utils.isTA(new Uint8Array(0))).toBe(true);
    expect(utils.isTA([1])).toBe(false);
    expect(utils.isTA(null)).toBe(false);
  });

  it('stablePairTA returns the same pair for the same two arrays', () => {
    const a = new Float32Array(2), b = new Uint8Array(2), c = new Uint8Array(2);
    const pair = utils.stablePairTA(a, b);
    expect(pair[0]).toBe(a);
    expect(pair[1]).toBe(b);
    expect(utils.stablePairTA(a, b)).toBe(pair);
    expect(utils.stablePairTA(a, c)).not.toBe(pair);
  });
});

describe('warnings on a layer', () => {
  it('pushWarn records a message once and logs it each time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = { id: 'circle1' } as Parameters<typeof utils.pushWarn>[0];
    utils.pushWarn(st, 'bad column');
    utils.pushWarn(st, 'bad column');
    expect(st.__warns).toEqual(['bad column']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith('[maplamina][circle1] bad column');
    warn.mockRestore();
  });

  it('assertTA passes a typed array and warns on anything else', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = { id: 'circle1' } as Parameters<typeof utils.pushWarn>[0];
    expect(utils.assertTA(st, new Float32Array(1), 'radius')).toBe(true);
    expect(st.__warns).toBeUndefined();
    expect(utils.assertTA(st, [1, 2], 'radius')).toBe(false);
    expect(utils.assertTA(st, [1, 2], 'position', 'skip')).toBe(false);
    expect(st.__warns).toEqual([
      'radius is not a TypedArray; falling back to safe defaults',
      'position is not a TypedArray; skipping build for this layer',
    ]);
    warn.mockRestore();
  });
});

describe('formatNumber', () => {
  const inLocale = (v: number, digits: number): string =>
    new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

  it('formats in the viewer locale with a fixed number of digits', () => {
    expect(utils.formatNumber(1234.5, 1)).toBe(inLocale(1234.5, 1));
    expect(utils.formatNumber(11, 1)).toBe(inLocale(11, 1));
    expect(utils.formatNumber(2.5)).toBe(inLocale(2.5, 0));
    expect(utils.formatNumber(2.5, null)).toBe(inLocale(2.5, 0));
  });

  it('keeps the digits asked for', () => {
    expect(utils.formatNumber(1, 2)).toMatch(/^1\D00$/);
    expect(utils.formatNumber(1, 0)).toBe('1');
    expect(utils.formatNumber(1, -3)).toBe('1');
    expect(utils.formatNumber(1, 40)).toMatch(/^1\D0{12}$/);
  });

  it('is empty for a value that is not finite', () => {
    expect(utils.formatNumber(NaN, 1)).toBe('');
    expect(utils.formatNumber(Infinity)).toBe('');
  });
});
