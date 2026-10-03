import { GeolocateControl, ScaleControl } from 'maplibre-gl';
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { Spec } from '../../srcjs/core/spec-types';
import type { WidgetRuntime } from '../../srcjs/core/widget';
import { applyMapLibreControls, clearMapLibreControls } from '../../srcjs/runtime/map';
import circlesPerFeature from './spec-samples/circles-per-feature';
import { normalise } from './support';

// deck.gl and MapLibre are imported by runtime/map; their first import takes several seconds.
vi.setConfig({ testTimeout: 60000 });

type Fields = Record<string, unknown>;

interface Call {
  op: 'add' | 'remove';
  control: IControl;
  position?: string;
}

interface MapStub {
  map: MapLibreMap;
  calls: Call[];
  failAdds: number;
}

// By hand: the map is the two methods the controls go through. It records each call and
// throws from addControl() while `failAdds` is above 0.
function mapStub(): MapStub {
  const stub: MapStub = { map: null as unknown as MapLibreMap, calls: [], failAdds: 0 };
  stub.map = {
    addControl(control: IControl, position?: string) {
      if (stub.failAdds > 0) {
        stub.failAdds -= 1;
        throw new Error('addControl failed');
      }
      stub.calls.push({ op: 'add', control, position });
    },
    removeControl(control: IControl) {
      stub.calls.push({ op: 'remove', control });
    }
  } as unknown as MapLibreMap;
  return stub;
}

// The sample has the four control types. Under node the navigation and the fullscreen
// control cannot be constructed (no `window`, no `document`); the scale and the geolocate
// control can.
function setup(): { x: Spec; rt: WidgetRuntime; stub: MapStub; controls: Fields[] } {
  const x = normalise(circlesPerFeature);
  const controls = (x.map_options as unknown as { controls: Fields[] }).controls;
  return { x, rt: {} as WidgetRuntime, stub: mapStub(), controls };
}

const stored = (rt: WidgetRuntime): Record<string, { instance: IControl; sig: string }> => rt._maplibreControls!.byType;
const ops = (stub: MapStub): string[] => stub.calls.map(c => c.op);
const warnings = (warn: MockInstance): unknown[][] => warn.mock.calls.map(c => c.slice(0, 2));

let warn: MockInstance;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyMapLibreControls', () => {
  it('adds each control it can construct at its corner and stores it with its signature', () => {
    const { x, rt, stub } = setup();
    applyMapLibreControls(stub.map, x, rt);

    expect(stub.calls.map(c => [c.op, c.position])).toEqual([['add', 'bottom-left'], ['add', 'top-right']]);
    expect(stub.calls[0].control).toBeInstanceOf(ScaleControl);
    expect(stub.calls[1].control).toBeInstanceOf(GeolocateControl);
    expect(Object.keys(stored(rt))).toEqual(['scale', 'geolocate']);
    expect(stored(rt).scale.instance).toBe(stub.calls[0].control);
    expect(stored(rt).scale.sig).toBe('scale|bottom-left|{"maxWidth":100,"unit":"metric"}');
    expect(stored(rt).geolocate.sig).toBe('geolocate|top-right|{"trackUserLocation":false}');
  });

  it('warns about a control it cannot construct and does not store it', () => {
    const { x, rt, stub } = setup();
    applyMapLibreControls(stub.map, x, rt);
    expect(warnings(warn)).toEqual([
      ['[maplamina] Failed to create MapLibre control:', 'navigation'],
      ['[maplamina] Failed to create MapLibre control:', 'fullscreen']
    ]);
    expect(stored(rt).navigation).toBeUndefined();
    expect(stored(rt).fullscreen).toBeUndefined();
  });

  it('leaves an unchanged control on the map', () => {
    const { x, rt, stub } = setup();
    applyMapLibreControls(stub.map, x, rt);
    const scale = stored(rt).scale.instance;
    const geolocate = stored(rt).geolocate.instance;
    stub.calls.length = 0;

    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls).toEqual([]);
    expect(stored(rt).scale.instance).toBe(scale);
    expect(stored(rt).geolocate.instance).toBe(geolocate);
  });

  it('replaces a control whose position or options change', () => {
    const { x, rt, stub, controls } = setup();
    applyMapLibreControls(stub.map, x, rt);
    const scale = stored(rt).scale.instance;
    const geolocate = stored(rt).geolocate.instance;
    stub.calls.length = 0;

    // By hand: the scale moved to another corner.
    controls[1].position = 'bottomright';
    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls.map(c => [c.op, c.position])).toEqual([['remove', undefined], ['add', 'bottom-right']]);
    expect(stub.calls[0].control).toBe(scale);
    expect(stub.calls[1].control).not.toBe(scale);
    expect(stored(rt).scale.instance).toBe(stub.calls[1].control);
    expect(stored(rt).scale.sig).toBe('scale|bottom-right|{"maxWidth":100,"unit":"metric"}');
    expect(stored(rt).geolocate.instance).toBe(geolocate);
    stub.calls.length = 0;

    // By hand: an option of the geolocate control changed.
    controls[3].options = { trackUserLocation: true };
    applyMapLibreControls(stub.map, x, rt);
    expect(ops(stub)).toEqual(['remove', 'add']);
    expect(stub.calls[0].control).toBe(geolocate);
    expect(stored(rt).geolocate.sig).toBe('geolocate|top-right|{"trackUserLocation":true}');
  });

  it('takes the options in any key order as the same signature', () => {
    const { x, rt, stub, controls } = setup();
    applyMapLibreControls(stub.map, x, rt);
    stub.calls.length = 0;
    // By hand: the same options with their keys the other way round.
    controls[1].options = { unit: 'metric', maxWidth: 100 };
    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls).toEqual([]);
  });

  it('removes a control the spec no longer has', () => {
    const { x, rt, stub, controls } = setup();
    applyMapLibreControls(stub.map, x, rt);
    const scale = stored(rt).scale.instance;
    stub.calls.length = 0;

    // By hand: the spec without its scale control.
    controls.splice(1, 1);
    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls).toEqual([{ op: 'remove', control: scale }]);
    expect(Object.keys(stored(rt))).toEqual(['geolocate']);

    // By hand: no controls at all.
    controls.length = 0;
    stub.calls.length = 0;
    applyMapLibreControls(stub.map, x, rt);
    expect(ops(stub)).toEqual(['remove']);
    expect(stored(rt)).toEqual({});
  });

  it('does not store a control whose addControl() throws, tries it again and never removes it', () => {
    const { x, rt, stub } = setup();
    stub.failAdds = 1;
    applyMapLibreControls(stub.map, x, rt);
    expect(Object.keys(stored(rt))).toEqual(['geolocate']);
    expect(stub.calls.map(c => [c.op, c.position])).toEqual([['add', 'top-right']]);
    expect(warnings(warn)).toContainEqual(['[maplamina] Failed to add MapLibre control:', 'scale']);
    stub.calls.length = 0;

    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls.map(c => [c.op, c.position])).toEqual([['add', 'bottom-left']]);
    expect(stub.calls[0].control).toBeInstanceOf(ScaleControl);
    expect(Object.keys(stored(rt)).sort()).toEqual(['geolocate', 'scale']);
    stub.calls.length = 0;

    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls).toEqual([]);
  });

  it('removes nothing for a control that never got onto the map', () => {
    const { x, rt, stub, controls } = setup();
    stub.failAdds = 2;
    applyMapLibreControls(stub.map, x, rt);
    expect(stored(rt)).toEqual({});

    // By hand: no controls at all.
    controls.length = 0;
    applyMapLibreControls(stub.map, x, rt);
    clearMapLibreControls(stub.map, rt);
    expect(stub.calls).toEqual([]);
  });

  it('warns about a type it does not know and skips it', () => {
    const { x, rt, stub, controls } = setup();
    // By hand: a control type the compiler does not emit, and entries that are no controls.
    controls.splice(0, controls.length, { type: 'compass', position: 'topleft' }, { position: 'topleft' }, null as unknown as Fields);
    applyMapLibreControls(stub.map, x, rt);
    expect(warnings(warn)).toEqual([['[maplamina] Unknown map control type:', 'compass']]);
    expect(stub.calls).toEqual([]);
    expect(stored(rt)).toEqual({});
  });

  it('puts a control in the top right for a bad position, with a warning, or for none, without', () => {
    const { x, rt, stub, controls } = setup();
    // By hand: a position the compiler does not emit, and a control without one.
    controls.splice(0, controls.length, { type: 'scale', position: 'middle' }, { type: 'geolocate' });
    applyMapLibreControls(stub.map, x, rt);
    expect(stub.calls.map(c => [c.op, c.position])).toEqual([['add', 'top-right'], ['add', 'top-right']]);
    expect(warnings(warn)).toEqual([['[maplamina] Invalid map control position:', 'middle']]);
    expect(stored(rt).scale.sig).toBe('scale|top-right|{}');
    expect(stored(rt).geolocate.sig).toBe('geolocate|top-right|{}');
  });

  it('does nothing without a map or a spec', () => {
    const { x, rt, stub } = setup();
    applyMapLibreControls(null, x, rt);
    applyMapLibreControls(stub.map, null, rt);
    expect(stub.calls).toEqual([]);
    expect(rt._maplibreControls).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('clearMapLibreControls', () => {
  it('removes every control it stored and forgets them', () => {
    const { x, rt, stub } = setup();
    applyMapLibreControls(stub.map, x, rt);
    const instances = [stored(rt).scale.instance, stored(rt).geolocate.instance];
    stub.calls.length = 0;

    clearMapLibreControls(stub.map, rt);
    expect(stub.calls).toEqual([{ op: 'remove', control: instances[0] }, { op: 'remove', control: instances[1] }]);
    expect(stored(rt)).toEqual({});

    applyMapLibreControls(stub.map, x, rt);
    expect(ops(stub)).toEqual(['remove', 'remove', 'add', 'add']);
    expect(stub.calls[2].control).not.toBe(instances[0]);
  });

  it('does nothing without a map or before anything was stored', () => {
    const { x, rt, stub } = setup();
    clearMapLibreControls(stub.map, rt);
    clearMapLibreControls(stub.map, null);
    applyMapLibreControls(stub.map, x, rt);
    stub.calls.length = 0;
    clearMapLibreControls(null, rt);
    expect(stub.calls).toEqual([]);
    expect(Object.keys(stored(rt))).toEqual(['scale', 'geolocate']);
  });
});
