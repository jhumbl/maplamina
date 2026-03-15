(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  const core0 = root.core;
  if (!core0 || typeof core0.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-runtime-scheduler.js");
  }

  const utils0 = core0.require('utils', 'ml-runtime-scheduler.js');
  if (!utils0 || typeof utils0.normText !== 'function') {
    throw new Error("[maplamina] Missing function utils.normText required by ml-runtime-scheduler.js");
  }

  // IMPORTANT: preserve canonical utils.normText semantics (trim only, no lowercasing).
  // Scheduler keys must match ids used across runtime/pipeline.
  const normText = utils0.normText;

  function ensureSched(rt) {
    const s0 = rt._sched;
    const s = (s0 && typeof s0 === 'object') ? s0 : {};
    if (!(s.layers instanceof Set)) s.layers = new Set();
    if (!(s.rehydrate instanceof Set)) s.rehydrate = new Set();
    if (!(s.reasons instanceof Set)) s.reasons = new Set();
    s.legends = !!s.legends;
    s.controls = !!s.controls;
    s.tooltip = !!s.tooltip;
    s.allowMotionViews = !!s.allowMotionViews;
    s.raf = s.raf || null;
    s.chain = s.chain || Promise.resolve();
    s.next = s.next || null;
    s.epoch = Number.isFinite(+s.epoch) ? +s.epoch : 0;
    s.__mfAttached = true;
    rt._sched = s;
    return s;
  }

  function normalizeReason(reason) {
    return normText(reason) || null;
  }

  function pickPrimaryReason(reasons, fallback) {
    const set = Array.isArray(reasons) ? reasons.filter(Boolean) : [];
    if (set.includes('views')) return 'views';
    if (set.includes('filters')) return 'filters';
    if (set.includes('filters-clear')) return 'filters-clear';
    if (set.includes('rebuild')) return 'rebuild';
    return normalizeReason(fallback) || (set.length ? set[set.length - 1] : null);
  }

  function deriveInvalidation(job, reasons) {
    const list = Array.isArray(reasons) ? reasons.filter(Boolean) : [];
    const has = (x) => list.includes(x);
    const rehydrate = !!(job && Array.isArray(job.rehydrate) && job.rehydrate.length);
    const layers = !!(job && Array.isArray(job.layers) && job.layers.length);
    const filters = has('filters') || has('filters-clear');
    const views = has('views');
    const encodings = views || rehydrate;
    const manual = has('rebuild');
    const controls = !!(job && job.controls);
    const legends = !!(job && job.legends);
    const tooltip = !!(job && job.tooltip);
    const visibility = filters || layers;
    const render = encodings || visibility || manual;
    const motionEligible = !!(job && job.allowMotionViews && encodings && !filters && !layers && !manual);

    return {
      reasons: list,
      render,
      encodings,
      filters,
      visibility,
      layers,
      rehydrate,
      controls,
      legends,
      tooltip,
      manual,
      motionEligible
    };
  }

  function idsToArray(ids) {
    if (ids == null) return [];
    if (ids === true) return ['*'];
    return (Array.isArray(ids) ? ids : [ids]).map(v => normText(v)).filter(Boolean);
  }

  function schedAdd(set, ids, rt) {
    if (!set || ids == null) return;

    // ids === true => all known runtime layer ids
    if (ids === true) {
      try {
        for (const k of rt.layers.keys()) set.add(k);
      } catch (_) {}
      return;
    }

    const arr = Array.isArray(ids) ? ids : [ids];
    for (const v of arr) {
      const lid = normText(v);
      if (lid) set.add(lid);
    }
  }

  /**
   * Attach Stage 6 scheduler to a runtime instance (idempotent).
   * Requires rt._flushSnapshot(job) to exist (installed by ml-runtime-pipeline.js).
   */
  function attach(rt) {
    if (!rt || typeof rt !== 'object') return;
    const s = ensureSched(rt);

    // Avoid re-wrapping schedule on hot reload; still keep _sched normalized.
    if (typeof rt.schedule === 'function' && s.__mfScheduleInstalled) return;

    rt.schedule = function (opts) {
      const s = ensureSched(this);
      const o = (opts && typeof opts === 'object') ? opts : {};

      schedAdd(s.layers, o.layers, this);
      schedAdd(s.rehydrate, o.rehydrate, this);

      if (o.legends) s.legends = true;
      if (o.controls) s.controls = true;
      if (o.tooltip) s.tooltip = true;

      const reason = normalizeReason(o.reason);
      if (reason) s.reasons.add(reason);
      if (reason === 'views') s.allowMotionViews = true;

      if (!s.next) {
        s.next = {};
        s.next.promise = new Promise((resolve, reject) => { s.next.resolve = resolve; s.next.reject = reject; });
      }

      if (s.raf) return s.next.promise;

      s.raf = requestAnimationFrame(() => {
        s.raf = null;

        const reasons = Array.from(s.reasons);
        const job = {
          layers: Array.from(s.layers),
          rehydrate: Array.from(s.rehydrate),
          legends: s.legends,
          controls: s.controls,
          tooltip: s.tooltip,
          epoch: ++s.epoch,
          renderEpoch: this._renderEpoch,
          specRef: this.specRef,
          allowMotionViews: !!s.allowMotionViews,
          reason: pickPrimaryReason(reasons, o.reason),
          reasons
        };
        job.invalidation = deriveInvalidation(job, reasons);
        job.motionPolicy = {
          reason: job.reason,
          allowTransitions: !!job.invalidation.motionEligible,
          motionEligible: !!job.invalidation.motionEligible
        };

        s.layers.clear();
        s.rehydrate.clear();
        s.reasons.clear();
        s.legends = false;
        s.controls = false;
        s.tooltip = false;
        s.allowMotionViews = false;

        const done = s.next;
        s.next = null;

        s.chain = s.chain
          .then(() => {
            if (typeof this._flushSnapshot === 'function') return this._flushSnapshot(job);
          })
          .then(() => { if (done && done.resolve) done.resolve(); })
          .catch((e) => { if (done && done.reject) done.reject(e); try { console.error(e); } catch (_) {} });
      });

      return ensureSched(this).next.promise;
    };

    s.__mfScheduleInstalled = true;
  }

  root.runtime.scheduler = { attach };
})(window);
