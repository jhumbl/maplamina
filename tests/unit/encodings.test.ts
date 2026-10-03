import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemo } from '../../srcjs/core/assets';
import { colorAccessorFrom, numericAccessorFrom } from '../../srcjs/core/encodings';
import type { LayerState, RgbaTuple } from '../../srcjs/core/layer-state';
import circlesConstant from './spec-samples/circles-constant';
import circlesPerFeature from './spec-samples/circles-per-feature';
import linesViews from './spec-samples/lines-views';
import polygonsComponents from './spec-samples/polygons-components';
import { hydratedLayer } from './support';

const GREY: RgbaTuple = [9, 9, 9, 200];
const at = (index: number): [null, { index: number }] => [null, { index }];

// The colour a dict encoding holds for one entry of its codes.
function dictColor(
  enc: { dict_array?: ArrayLike<number> | null; codes_array?: ArrayLike<number> | null },
  i: number
): number[] {
  const off = enc.codes_array![i] * 4;
  return Array.from({ length: 4 }, (_, k) => enc.dict_array![off + k]);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearMemo();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); });

describe('colorAccessorFrom', () => {
  it('reads a constant colour with the opacity R packed into its alpha', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    expect(colorAccessorFrom(st, 'fillColor', GREY)(...at(0))).toEqual([0, 0, 139, 204]);
    expect(colorAccessorFrom(st, 'lineColor', GREY)(...at(2))).toEqual([0, 0, 139, 255]);
  });

  it('reads a layer scale from the column dict, each feature its own colour', async () => {
    const st = await hydratedLayer(circlesPerFeature, 'pts');
    const cols = st.data_columns!;
    const fill = colorAccessorFrom(st, 'fillColor', GREY);
    const line = colorAccessorFrom(st, 'lineColor', GREY);
    for (const i of [0, 1, 2]) {
      expect(fill(...at(i))).toEqual(dictColor(cols.fillColor!, i));
      expect(line(...at(i))).toEqual(dictColor(cols.lineColor!, i));
    }
    expect(fill(...at(0))).toEqual(fill(...at(2)));
    expect(fill(...at(0))).not.toEqual(fill(...at(1)));
  });

  it('colours each part of a multipolygon by its row', async () => {
    const st = await hydratedLayer(polygonsComponents, 'polygon1');
    const fill = colorAccessorFrom(st, 'fillColor', GREY);
    expect(fill(...at(0))).toEqual([255, 0, 0, 153]);
    expect(fill(...at(1))).toEqual([255, 0, 0, 153]);
    expect(fill(...at(2))).toEqual([0, 0, 255, 153]);
    expect(fill({ __source: { index: 2 } })).toEqual([0, 0, 255, 153]);
  });

  it('reads a view colour formula from the base dict', async () => {
    const st = await hydratedLayer(linesViews, 'line1', 'by value');
    const enc = st.base_encodings!.lineColor!;
    expect(enc.encoding).toBe('dict');
    const line = colorAccessorFrom(st, 'lineColor', GREY);
    expect(line(...at(0))).toEqual(dictColor(enc, 0));
    expect(line(...at(1))).toEqual(dictColor(enc, 1));
    expect(line(...at(0))).not.toEqual(line(...at(1)));
  });

  it('lets a view constant win over the layer scale, and the scale return without the view', async () => {
    const flat = await hydratedLayer(polygonsComponents, 'polygon1', 'flat');
    const fill = colorAccessorFrom(flat, 'fillColor', GREY);
    expect(fill(...at(0)).slice(0, 3)).toEqual([255, 0, 0]);
    expect(fill(...at(2))).toEqual(fill(...at(0)));

    const base = await hydratedLayer(polygonsComponents, 'polygon1');
    expect(colorAccessorFrom(base, 'fillColor', GREY)(...at(2))).toEqual([0, 0, 255, 153]);
  });

  it('reads a view scale over the layer scale', async () => {
    const st = await hydratedLayer(polygonsComponents, 'polygon1', 'scale');
    const enc = st.base_encodings!.fillColor!;
    const fill = colorAccessorFrom(st, 'fillColor', GREY);
    for (const i of [0, 1, 2]) expect(fill(...at(i))).toEqual(dictColor(enc, i));
    expect(fill(...at(0))).not.toEqual(fill(...at(2)));
  });

  it('returns the fallback when the layer has no colour for the key', async () => {
    const st = await hydratedLayer(linesViews, 'line1');
    expect(colorAccessorFrom(st, 'fillColor', GREY)(...at(0))).toEqual(GREY);
    expect(st.__warns).toBeUndefined();
  });

  // R packs opacity into the colour alpha and emits no opacity encoding. The shapes below
  // are written by hand.
  it('scales the fill alpha by a base opacity and leaves the stroke alpha alone', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    st.base_encodings!.opacity = { value: 0.5 };
    expect(colorAccessorFrom(st, 'fillColor', GREY)(...at(0))).toEqual([0, 0, 139, 102]);
    expect(colorAccessorFrom(st, 'lineColor', GREY)(...at(0))).toEqual([0, 0, 139, 255]);
  });

  it('scales the alpha per feature for a typed base opacity array, clamped to 0..1', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    st.base_encodings!.opacity = { value: {}, value_array: new Float32Array([0, 0.5, 4]) };
    const fill = colorAccessorFrom(st, 'fillColor', GREY);
    expect([0, 1, 2].map((i) => fill(...at(i))[3])).toEqual([0, 102, 204]);
  });

  it('warns and uses opacity 1 for a base opacity array that is not typed', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    const enc = st.base_encodings as Record<string, unknown>;
    enc.opacity = { value: [0.5, 0.5, 0.5] };
    expect(colorAccessorFrom(st, 'fillColor', GREY)(...at(0))).toEqual([0, 0, 139, 204]);
    expect(st.__warns).toEqual(['base.opacity.value_array is not typed; using scalar opacity=1']);
  });

  it('warns and returns the fallback for a column dict whose length is no multiple of 4', async () => {
    const st: LayerState = await hydratedLayer(polygonsComponents, 'polygon1');
    st.data_columns!.fillColor!.dict_array = new Uint8Array(7);
    expect(colorAccessorFrom(st, 'fillColor', GREY)(...at(0))).toEqual(GREY);
    expect(st.__warns).toEqual(['cols.fillColor dict/codes not typed or misaligned; using fallback color']);
  });
});

describe('numericAccessorFrom', () => {
  it('reads a constant', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    expect(numericAccessorFrom(st, 'radius', 99)(...at(1))).toBe(6);
    expect(numericAccessorFrom(st, 'lineWidth', 99)(...at(1))).toBe(1);
  });

  it('reads a per-feature column', async () => {
    const st = await hydratedLayer(circlesPerFeature, 'pts');
    const radius = numericAccessorFrom(st, 'radius', 99);
    expect([0, 1, 2].map((i) => radius(...at(i)))).toEqual([1.5, 2, 3.5]);
    expect(radius({ __source: { index: 2 } })).toBe(3.5);
  });

  it('reads a view constant and a view formula over the base value', async () => {
    const base = await hydratedLayer(linesViews, 'line1');
    expect(numericAccessorFrom(base, 'lineWidth', 99)(...at(1))).toBe(4);
    const thin = await hydratedLayer(linesViews, 'line1', 'thin');
    expect(numericAccessorFrom(thin, 'lineWidth', 99)(...at(1))).toBe(2);
    const byValue = await hydratedLayer(linesViews, 'line1', 'by value');
    const width = numericAccessorFrom(byValue, 'lineWidth', 99);
    expect([0, 1].map((i) => width(...at(i)))).toEqual([1, 2]);
  });

  it('keeps the base value under a view that does not set it', async () => {
    const flat = await hydratedLayer(linesViews, 'line1', 'flat');
    expect(numericAccessorFrom(flat, 'lineWidth', 99)(...at(0))).toBe(4);
  });

  it('returns the fallback for a key the layer does not carry, and 1 for a fallback that is not finite', async () => {
    const st = await hydratedLayer(circlesConstant, 'circle1');
    expect(numericAccessorFrom(st, 'size', 7)(...at(0))).toBe(7);
    expect(numericAccessorFrom(st, 'size', NaN)(...at(0))).toBe(1);
  });

  // A column R writes holds no NaN for these keys; this one is put there by hand.
  it('returns the fallback for a value that is not finite', async () => {
    const st = await hydratedLayer(circlesPerFeature, 'pts');
    st.data_columns!.radius!.array = new Float32Array([1.5, NaN, 3.5]);
    const radius = numericAccessorFrom(st, 'radius', 99);
    expect([0, 1, 2].map((i) => radius(...at(i)))).toEqual([1.5, 99, 3.5]);
  });
});
