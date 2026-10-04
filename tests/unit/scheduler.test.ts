import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransitionEntry } from '../../srcjs/core/layer-state';
import type { Spec } from '../../srcjs/core/spec-types';
import type { WidgetRuntime } from '../../srcjs/core/widget';
import * as motion from '../../srcjs/runtime/motion';
import * as pipeline from '../../srcjs/runtime/pipeline';
import type { RenderJob, ScheduleOptions } from '../../srcjs/runtime/scheduler';
import { attach } from '../../srcjs/runtime/scheduler';

// deck.gl is imported by the pipeline; its first import takes several seconds.
vi.setConfig({ testTimeout: 60000 });

interface Fixture {
  rt: WidgetRuntime;
  jobs: RenderJob[];
  // Schedules each request, runs the frame they share and waits for its flush.
  frame: (...asks: ScheduleOptions[]) => Promise<RenderJob>;
}

// By hand: the runtime holds two layer ids and a spec with no layers, so the flush of the
// pipeline reaches the transitions and builds nothing. The frame is run by the test.
function setup(): Fixture {
  let run: (() => void) | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { run = cb; return 1; });
  const rt = motion.attach({
    specRef: { '.__layers': {} } as unknown as Spec,
    layers: new Map([['a', {}], ['b', {}]]),
    state: {},
    _renderEpoch: 0
  } as unknown as WidgetRuntime)!;
  pipeline.attach(rt, {
    getOverlay: () => ({}) as never,
    applyOverlayReplacements: () => {},
    pickActiveViews: () => ({}),
    computeViewOpsByLayerV3: () => null as never,
    syncJobTransitions: motion.syncJobTransitions,
    transitionsForBuild: motion.transitionsForBuild
  });
  const jobs: RenderJob[] = [];
  const flush = rt._flushSnapshot!;
  rt._flushSnapshot = function (job) { jobs.push(job); return flush.call(this, job); };
  attach(rt);
  const frame = async (...asks: ScheduleOptions[]): Promise<RenderJob> => {
    let done: Promise<void> | undefined;
    for (const o of asks) done = rt.schedule!(o);
    run!();
    await done;
    return jobs.at(-1)!;
  };
  return { rt, jobs, frame };
}

// Both layers armed as a view switch on radius arms them.
function arm(rt: WidgetRuntime): void {
  for (const id of ['a', 'b']) motion.injectMotionTransitions(rt, id, 'circle', { radius: 1 }, { duration: 300 });
}
const duration = (rt: WidgetRuntime, id: string): number | undefined =>
  (rt._layerTransitions!.get(id)!.getRadius as TransitionEntry).duration;

const viewSwitch: ScheduleOptions = { rehydrate: ['b'], reason: 'views' };
const filterChange: ScheduleOptions = { layers: ['a'], reason: 'filters' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the motion policy of a flush', () => {
  it('allows transitions for a view switch alone and leaves what is armed alone', async () => {
    const f = setup();
    arm(f.rt);
    const job = await f.frame(viewSwitch);
    expect(job.motionPolicy).toEqual({ reason: 'views', allowTransitions: true, motionEligible: true });
    expect(job.invalidation.motionEligible).toBe(true);
    expect(duration(f.rt, 'b')).toBe(300);
    expect(f.rt._transitionTokens!.has('b')).toBe(true);
  });

  it.each([
    ['a filter change', filterChange, 'filters'],
    ['cleared filters', { layers: ['a'], reason: 'filters-clear' }, 'filters-clear'],
    ['a rebuild', { layers: ['a'], reason: 'rebuild' }, 'rebuild'],
    ['a rehydrate that is no view switch', { rehydrate: ['a'], reason: 'rebuild' }, 'rebuild'],
    ['no reason', { layers: ['a'] }, null]
  ] as [string, ScheduleOptions, string | null][])('does not allow them for %s, and the flush disables the layers of the job', async (_name, ask, reason) => {
    const f = setup();
    arm(f.rt);
    const job = await f.frame(ask);
    expect(job.motionPolicy).toEqual({ reason, allowTransitions: false, motionEligible: false });
    expect(duration(f.rt, 'a')).toBe(0);
    expect(f.rt._transitionTokens!.has('a')).toBe(false);
    expect(duration(f.rt, 'b')).toBe(300);
  });

  it('does not allow them when a filter change and a view switch share a frame', async () => {
    for (const asks of [[filterChange, viewSwitch], [viewSwitch, filterChange]]) {
      const f = setup();
      arm(f.rt);
      const job = await f.frame(...asks);
      expect(f.jobs.length).toBe(1);
      expect(job.reason).toBe('views');
      expect(job.motionPolicy).toEqual({ reason: 'views', allowTransitions: false, motionEligible: false });
      expect(duration(f.rt, 'a')).toBe(0);
      expect(duration(f.rt, 'b')).toBe(0);
      expect(f.rt._transitionTokens!.size).toBe(0);
    }
  });

  it('is derived anew for each flush', async () => {
    const f = setup();
    expect((await f.frame(filterChange)).motionPolicy.allowTransitions).toBe(false);
    expect((await f.frame(viewSwitch)).motionPolicy.allowTransitions).toBe(true);
    expect((await f.frame(filterChange)).motionPolicy.allowTransitions).toBe(false);
  });
});
