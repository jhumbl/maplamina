import type { Layer } from '@deck.gl/core';
import { describe, expect, it } from 'vitest';
import { replaceBuiltLayers } from '../../srcjs/layers/utils';

// By hand: a deck layer is its id here.
const layer = (id: string): Layer => ({ id }) as unknown as Layer;
const ids = (layers: Layer[]): string[] => layers.map(l => l.id);

function built(): Map<string, Layer[]> {
  return new Map([
    ['a', [layer('a')]],
    ['a-b', [layer('a-b')]],
    ['m', [layer('m-pin'), layer('m-glyph')]]
  ]);
}

describe('replaceBuiltLayers', () => {
  it('replaces the layers of one id and leaves an id that starts with it alone', () => {
    const b = built();
    const kept = b.get('a-b')![0];
    const next = layer('a');
    const flat = replaceBuiltLayers(b, new Map([['a', [next]]]));
    expect(ids(flat)).toEqual(['a', 'a-b', 'm-pin', 'm-glyph']);
    expect(flat[0]).toBe(next);
    expect(flat[1]).toBe(kept);
  });

  it('replaces every sublayer of an id together, in place', () => {
    const b = built();
    const pin = layer('m-pin'), glyph = layer('m-glyph');
    const flat = replaceBuiltLayers(b, new Map([['m', [pin, glyph]], ['a-b', [layer('a-b')]]]));
    expect(ids(flat)).toEqual(['a', 'a-b', 'm-pin', 'm-glyph']);
    expect(flat.slice(2)).toEqual([pin, glyph]);
    expect(Array.from(b.keys())).toEqual(['a', 'a-b', 'm']);
  });

  it('keeps the place of an id that built nothing', () => {
    const b = built();
    expect(ids(replaceBuiltLayers(b, new Map([['a-b', []]])))).toEqual(['a', 'm-pin', 'm-glyph']);
    expect(ids(replaceBuiltLayers(b, new Map([['a-b', [layer('a-b')]]])))).toEqual(['a', 'a-b', 'm-pin', 'm-glyph']);
  });

  it('puts an id it does not hold last', () => {
    const b = built();
    expect(ids(replaceBuiltLayers(b, new Map([['z', [layer('z')]]])))).toEqual(['a', 'a-b', 'm-pin', 'm-glyph', 'z']);
  });
});
