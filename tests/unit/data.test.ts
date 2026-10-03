import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemo, pruneEmbeddedBlobs, resolveRefOrHref } from '../../srcjs/core/assets';
import { getIndexers, resolveActiveOnly } from '../../srcjs/core/data';
import type { LayerState, RefNode } from '../../srcjs/core/layer-state';
import circlesPerFeature from './spec-samples/circles-per-feature';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';
import { layerState } from './support';

// The polygon sample has two rows and three parts: a multipolygon of two, then a polygon.
const polygon = (): LayerState => layerState(polygonsComponents, 'polygon1');

const fetchSpy = vi.fn(() => { throw new Error('a unit test must not fetch'); });
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearMemo();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe('resolveRefOrHref on what R emits', () => {
  it('decodes a ref to a typed array of the blob dtype', async () => {
    const st = polygon();
    const idx = await resolveRefOrHref(st, { ref: 'feature_index' });
    expect(idx!.array).toBeInstanceOf(Uint32Array);
    expect(Array.from(idx!.array)).toEqual([0, 0, 1]);
    expect(idx!.dtype).toBe('u32');

    const dict = await resolveRefOrHref(st, { ref: 'fillColor.dict_rgba' });
    expect(dict!.array).toBeInstanceOf(Uint8Array);
    expect(dict!.array.length).toBe(8);
    expect(dict!.size).toBe(4);

    const values = await resolveRefOrHref(st, { ref: 'flt.rng_1.values' });
    expect(values!.array).toBeInstanceOf(Float32Array);
    expect(Array.from(values!.array)).toEqual([10, 10, 1]);
  });

  it('reads through the values wrapper and keeps the size beside it', async () => {
    const st = layerState(circlesPerFeature, 'pts');
    const pos = await resolveRefOrHref(st, st.data_columns!.position);
    expect(pos!.array).toBeInstanceOf(Float32Array);
    expect(pos!.array.length).toBe(6);
    expect(pos!.size).toBe(2);
  });

  it('returns the same array on a second call and keeps it on the blob', async () => {
    const st = polygon();
    const a = await resolveRefOrHref(st, { ref: 'feature_index' });
    const b = await resolveRefOrHref(st, { ref: 'feature_index' });
    expect(b!.array).toBe(a!.array);
    expect(st.dataStore!.blobs![a!.blobId!].__array).toBe(a!.array);
  });

  it('gives two refs to one blob the same array', async () => {
    const st = polygon();
    const refs = st.dataStore!.refs!;
    expect(refs['fillColor.codes']).toBe(refs['vw.views1.scale.fillColor.codes']);
    const a = await resolveRefOrHref(st, { ref: 'fillColor.codes' });
    const b = await resolveRefOrHref(st, { ref: 'vw.views1.scale.fillColor.codes' });
    expect(b!.array).toBe(a!.array);
  });

  it('decodes a blob once for two layer states, until the memo is cleared', async () => {
    const a = await resolveRefOrHref(polygon(), { ref: 'feature_index' });
    const b = await resolveRefOrHref(polygon(), { ref: 'feature_index' });
    expect(b!.array).toBe(a!.array);
    clearMemo();
    const c = await resolveRefOrHref(polygon(), { ref: 'feature_index' });
    expect(c!.array).not.toBe(a!.array);
    expect(Array.from(c!.array)).toEqual([0, 0, 1]);
  });

  it('warns on the layer and gives null for a ref the store does not map', async () => {
    const st = polygon();
    expect(await resolveRefOrHref(st, { ref: 'nope' })).toBeNull();
    expect(st.__warns).toEqual(["Unknown ref 'nope' (missing dataStore.refs mapping)"]);
  });

  it('gives null for no node', async () => {
    expect(await resolveRefOrHref(polygon(), null)).toBeNull();
    expect(await resolveRefOrHref(polygon(), undefined)).toBeNull();
  });
});

// R emits a blob href as { data: <data URI> }. The shapes below are written by hand.
describe('resolveRefOrHref on an href by hand', () => {
  const uri = 'data:application/octet-stream;base64,AAAAAAAAAAABAAAA';
  const store = (href: unknown): LayerState => ({
    id: 'l1',
    dataStore: { blobs: { b1: { dtype: 'u32', href } }, refs: { r: 'b1' } },
  }) as unknown as LayerState;

  it('reads a blob href given as a string', async () => {
    const o = await resolveRefOrHref(store(uri), { ref: 'r' });
    expect(Array.from(o!.array)).toEqual([0, 0, 1]);
  });

  it('warns and gives an empty array of the dtype for an href that is no URL', async () => {
    const o = await resolveRefOrHref(store(42), { ref: 'r' });
    expect(o!.array).toBeInstanceOf(Uint32Array);
    expect(o!.array.length).toBe(0);
    expect(warn).toHaveBeenCalledWith('[maplamina] fetchArray bad href', 42);
  });

  it('warns the same way for an href object without data', async () => {
    const o = await resolveRefOrHref(store({}), { ref: 'r' });
    expect(o!.array.length).toBe(0);
    expect(warn).toHaveBeenCalledWith('[maplamina] fetchArray bad href', {});
  });

  it('reads a node carrying its own href and dtype, and keeps the array on the node', async () => {
    const node = { href: uri, dtype: 'u32' } as unknown as RefNode;
    const st = { id: 'l1' } as unknown as LayerState;
    const a = await resolveRefOrHref(st, node);
    expect(Array.from(a!.array)).toEqual([0, 0, 1]);
    expect(node.array).toBe(a!.array);
    const b = await resolveRefOrHref(st, node);
    expect(b!.array).toBe(a!.array);
  });

  it('gives null for a node with an href and no dtype', async () => {
    const node = { href: uri } as unknown as RefNode;
    expect(await resolveRefOrHref({ id: 'l1' } as unknown as LayerState, node)).toBeNull();
  });
});

describe('resolveActiveOnly', () => {
  it('hydrates polygon geometry, the feature index and the colour scale', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const cols = st.data_columns!;
    expect(cols.polygon!.positions_array).toBeInstanceOf(Float32Array);
    expect(cols.polygon!.ring_starts_array).toBeInstanceOf(Uint32Array);
    expect(cols.polygon!.poly_starts_array).toBeInstanceOf(Uint32Array);
    expect(cols.polygon!.poly_starts_array!.length).toBe(3);
    expect(Array.from(cols.feature_index_array!)).toEqual([0, 0, 1]);
    expect(cols.fillColor!.dict_array).toBeInstanceOf(Uint8Array);
    expect(cols.fillColor!.dict_array!.length).toBe(8);
    expect(Array.from(cols.fillColor!.codes_array!)).toEqual([1, 1, 0]);
    expect(st.base_encodings!.lineWidth!.value).toBe(2);
    expect(st.base_encodings!.lineWidth!.value_array).toBeUndefined();
  });

  it('hydrates point positions and per-feature columns', async () => {
    const st = layerState(circlesPerFeature, 'pts');
    await resolveActiveOnly(st);
    const cols = st.data_columns!;
    expect(cols.position!.array).toBeInstanceOf(Float32Array);
    expect(cols.position!.array!.length).toBe(6);
    expect(Array.from(cols.radius!.array!)).toEqual([1.5, 2, 3.5]);
    expect(Array.from(cols.lineWidth!.array!)).toEqual([1.5, 2, 3.5]);
    expect(cols.fillColor!.codes_array!.length).toBe(3);
    expect(cols.lineColor!.codes_array!.length).toBe(3);
    expect(cols.feature_index_array).toBeUndefined();
  });

  it('hydrates line paths', async () => {
    const st = layerState(linesViews, 'line1');
    await resolveActiveOnly(st);
    const path = st.data_columns!.path!;
    expect(path.positions_array).toBeInstanceOf(Float32Array);
    expect(Array.from(path.path_starts_array!)).toEqual([0, 2]);
    expect(Array.from(st.data_columns!.feature_index_array!)).toEqual([0, 1]);
  });

  it('keeps every array identity when run again', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const cols = st.data_columns!;
    const before = [cols.polygon!.positions_array, cols.polygon!.poly_starts_array, cols.feature_index_array,
      cols.fillColor!.dict_array, cols.fillColor!.codes_array];
    await resolveActiveOnly(st);
    const after = [cols.polygon!.positions_array, cols.polygon!.poly_starts_array, cols.feature_index_array,
      cols.fillColor!.dict_array, cols.fillColor!.codes_array];
    after.forEach((a, i) => expect(a).toBe(before[i]));
  });
});

describe('pruneEmbeddedBlobs', () => {
  it('skips every blob before hydration and drops the base64 of the hydrated ones after', async () => {
    const st = polygon();
    const blobs = st.dataStore!.blobs!;
    const total = Object.keys(blobs).length;
    expect(pruneEmbeddedBlobs(st)).toEqual({ pruned: 0, skipped: total });

    await resolveActiveOnly(st);
    const hydrated = Object.keys(blobs).filter((k) => blobs[k].__array);
    expect(hydrated.length).toBeGreaterThan(0);
    expect(hydrated.length).toBeLessThan(total);
    expect(pruneEmbeddedBlobs(st)).toEqual({ pruned: hydrated.length, skipped: total - hydrated.length });

    for (const k of Object.keys(blobs)) {
      const href = blobs[k].href as { data?: string };
      expect('data' in href).toBe(!blobs[k].__array);
    }
  });

  it('leaves a pruned blob readable, on this state and on the next one', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    pruneEmbeddedBlobs(st);
    const again = await resolveRefOrHref(st, { ref: 'feature_index' });
    expect(again!.array).toBe(st.data_columns!.feature_index_array);
    const next = await resolveRefOrHref(polygon(), { ref: 'feature_index' });
    expect(next!.array).toBe(again!.array);
  });

  it('counts nothing for a state with no data store', () => {
    expect(pruneEmbeddedBlobs({} as LayerState)).toEqual({ pruned: 0, skipped: 0 });
  });
});

describe('getIndexers', () => {
  it('maps a part to its row through the feature index', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const ix = getIndexers(st);
    expect(ix.hasIdxMap).toBe(true);
    expect(ix.nParts).toBe(3);
    expect([0, 1, 2].map(ix.rowIndex)).toEqual([0, 0, 1]);
  });

  it('reads row 0 for a part that is out of range, negative or not a number', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const ix = getIndexers(st);
    expect(ix.rowIndex(3)).toBe(0);
    expect(ix.rowIndex(-1)).toBe(0);
    expect(ix.rowIndex(NaN)).toBe(0);
  });

  it('indexes a per-part array by part and any other array by row', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const ix = getIndexers(st);
    expect(ix.indexForArray(new Float32Array(3), 2)).toBe(2);
    expect(ix.indexForArray(new Float32Array(2), 2)).toBe(1);
    expect(ix.indexForArray([5, 6, 7], 2)).toBe(1);
    expect(ix.indexForArray(null, 2)).toBe(1);
  });

  it('is the identity for a layer with no feature index', async () => {
    const st = layerState(circlesPerFeature, 'pts');
    await resolveActiveOnly(st);
    const ix = getIndexers(st);
    expect(ix.hasIdxMap).toBe(false);
    expect(ix.nParts).toBe(0);
    expect(ix.idxMap).toBeNull();
    expect(ix.rowIndex(2)).toBe(2);
    expect(ix.rowIndex(-1)).toBe(0);
    expect(ix.indexForArray(new Float32Array(3), 2)).toBe(2);
    expect(ix.indexForArray(null, 2)).toBe(2);
  });

  it('takes an index map given by the caller over the layer own', async () => {
    const st = polygon();
    await resolveActiveOnly(st);
    const ix = getIndexers(st, new Uint32Array([1, 0]));
    expect(ix.nParts).toBe(2);
    expect([0, 1].map(ix.rowIndex)).toEqual([1, 0]);
  });

  it('treats an empty index map and a missing state as no map', () => {
    expect(getIndexers({ data_columns: { feature_index_array: new Uint32Array(0) } } as unknown as LayerState).hasIdxMap).toBe(false);
    expect(getIndexers(null).hasIdxMap).toBe(false);
  });

  it('picks the part index from the datum, then the accessor info, then a bare number', () => {
    const { pickPartIndex } = getIndexers(null);
    expect(pickPartIndex({ __source: { index: 4 } }, { index: 9 })).toBe(4);
    expect(pickPartIndex({ i: 3 }, { index: 9 })).toBe(3);
    expect(pickPartIndex(null, { index: 2 })).toBe(2);
    expect(pickPartIndex({}, { index: 2 })).toBe(2);
    expect(pickPartIndex(5)).toBe(5);
    expect(pickPartIndex({}, null)).toBe(0);
    expect(pickPartIndex(undefined)).toBe(0);
  });
});
