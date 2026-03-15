(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  root.runtime.motion = root.runtime.motion || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-runtime-motion.js");
  }

  const utils = core.require('utils', 'ml-runtime-motion.js');
  if (!utils || typeof utils.normText !== 'function') {
    throw new Error("[maplamina] Missing function utils.normText required by ml-runtime-motion.js");
  }

  const normText = utils.normText;

  function deckPropsTouchedByEncodingPatch(layerType, encPatch) {
    try {
      const lp = root.layerProps;
      if (lp && typeof lp.deckPropsTouchedByEncodingPatch === 'function') {
        return lp.deckPropsTouchedByEncodingPatch(layerType, encPatch) || [];
      }
    } catch (_) {}
    return [];
  }

  function normalizeReason(reason) {
    return normText(reason) || null;
  }

  function deriveMotionPolicy(job) {
    const j = (job && typeof job === 'object') ? job : {};
    const reason = normalizeReason(j.reason || (j.motionPolicy && j.motionPolicy.reason));
    const invalidation = (j.invalidation && typeof j.invalidation === 'object') ? j.invalidation : null;
    const allowTransitions = !!(
      (j.motionPolicy && j.motionPolicy.allowTransitions) ||
      j.allowMotionViews ||
      (invalidation && invalidation.motionEligible) ||
      reason === 'views'
    );
    const policy = {
      reason,
      allowTransitions,
      motionEligible: allowTransitions,
      invalidation
    };
    return policy;
  }

  function transitionsForBuild(rt, layerId, jobOrPolicy) {
    const policy = (jobOrPolicy && typeof jobOrPolicy === 'object' && Object.prototype.hasOwnProperty.call(jobOrPolicy, 'allowTransitions'))
      ? jobOrPolicy
      : deriveMotionPolicy(jobOrPolicy);
    const lid = normText(layerId);
    if (!lid) return null;
    const t = (rt && rt._layerTransitions && typeof rt._layerTransitions.get === 'function')
      ? rt._layerTransitions.get(lid)
      : null;
    const transitionKeys = (t && typeof t === 'object') ? Object.keys(t) : [];
    return transitionKeys.length ? t : null;
  }

  function syncJobTransitions(rt, layerIds, jobOrPolicy) {
    const policy = (jobOrPolicy && typeof jobOrPolicy === 'object' && Object.prototype.hasOwnProperty.call(jobOrPolicy, 'allowTransitions'))
      ? jobOrPolicy
      : deriveMotionPolicy(jobOrPolicy);
    if (!policy.allowTransitions) disableRuntimeTransitions(rt, layerIds);
    return policy;
  }

  function ensureLayerTransitions(rt, layerId) {
    if (!rt) return null;
    if (!rt._layerTransitions || typeof rt._layerTransitions.get !== 'function') rt._layerTransitions = new Map();
    const lid = normText(layerId);
    if (!lid) return null;
    let t = rt._layerTransitions.get(lid);
    if (!t || typeof t !== 'object') {
      t = {};
      rt._layerTransitions.set(lid, t);
    }
    return t;
  }

  function ensureTransitionTokens(rt, layerId) {
    if (!rt) return null;
    if (!rt._transitionTokens || typeof rt._transitionTokens.get !== 'function') rt._transitionTokens = new Map();
    const lid = normText(layerId);
    if (!lid) return null;
    let tok = rt._transitionTokens.get(lid);
    if (!tok || typeof tok !== 'object') {
      tok = {};
      rt._transitionTokens.set(lid, tok);
    }
    return tok;
  }

  function nextTransitionToken(rt) {
    if (!rt) return 0;
    if (!Number.isFinite(rt._transitionTokenSeq)) rt._transitionTokenSeq = 0;
    rt._transitionTokenSeq += 1;
    return rt._transitionTokenSeq;
  }

  function clearRuntimeTransition(rt, layerId, prop, token) {
    try {
      const lid = normText(layerId);
      const p = String(prop || '');
      if (!lid || !p) return;

      const tok = (rt._transitionTokens && rt._transitionTokens.get) ? rt._transitionTokens.get(lid) : null;
      if (!tok || tok[p] !== token) return;

      try { delete tok[p]; } catch (_) {}
      if (!Object.keys(tok).length) {
        try { rt._transitionTokens.delete(lid); } catch (_) {}
      }

      const t = (rt._layerTransitions && rt._layerTransitions.get) ? rt._layerTransitions.get(lid) : null;
      if (!t || !Object.prototype.hasOwnProperty.call(t, p)) return;

      const prev = t[p];
      const prevDur =
        (prev && typeof prev === 'object' && Number.isFinite(+prev.duration)) ? +prev.duration
        : (Number.isFinite(prev) ? +prev : 0);
      const prevHadCb = !!(prev && typeof prev === 'object' && (typeof prev.onEnd === 'function' || typeof prev.onInterrupt === 'function'));
      const alreadyDisabled = (prevDur <= 0) && !prevHadCb;

      if (!alreadyDisabled) {
        let disabled = null;
        try {
          const tr = root.transitions;
          if (tr && typeof tr.disableTransitionEntry === 'function') {
            disabled = tr.disableTransitionEntry(prev);
          }
        } catch (_) {}
        if (!disabled) disabled = { duration: 0 };
        t[p] = disabled;
      }
    } catch (_) {}
  }

  function disableRuntimeTransitions(rt, layerIds) {
    try {
      if (!rt) return;
      const ids = Array.isArray(layerIds) ? layerIds : (layerIds ? [layerIds] : []);
      for (const raw of ids) {
        const lid = normText(raw);
        if (!lid) continue;
        const t = (rt._layerTransitions && rt._layerTransitions.get) ? rt._layerTransitions.get(lid) : null;
        if (!t || typeof t !== 'object') continue;

        try { rt._transitionTokens && rt._transitionTokens.delete && rt._transitionTokens.delete(lid); } catch (_) {}

        try {
          const tr = root.transitions;
          if (tr && typeof tr.disableTransitionsForProps === 'function') {
            tr.disableTransitionsForProps(t);
          } else {
            for (const k of Object.keys(t)) t[k] = { duration: 0 };
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  function primeRuntimeTransitions(rt, layerId, layerType, encTouch) {
    const touched = deckPropsTouchedByEncodingPatch(layerType, encTouch);
    if (!touched.length) return;

    const t = ensureLayerTransitions(rt, layerId);
    if (!t) return;

    try {
      const tr = root.transitions;
      if (tr && typeof tr.primeTransitionsForProps === 'function') {
        tr.primeTransitionsForProps(t, touched, null);
        return;
      }
    } catch (_) {}

    for (const p of touched) {
      const prev = t[p];
      const prevDur = (prev && typeof prev === 'object' && Number.isFinite(+prev.duration)) ? +prev.duration
                    : (Number.isFinite(prev) ? +prev : 0);
      if (prevDur > 0) continue;
      if (prev && typeof prev === 'object') {
        let disabled = null;
        try {
          const tr = root.transitions;
          if (tr && typeof tr.disableTransitionEntry === 'function') {
            disabled = tr.disableTransitionEntry(prev);
          }
        } catch (_) {}
        t[p] = disabled || { duration: 0 };
        continue;
      }
      t[p] = { duration: 0 };
    }
  }

  function injectMotionTransitions(rt, layerId, layerType, encPatch, motion) {
    const touched = deckPropsTouchedByEncodingPatch(layerType, encPatch);
    if (!touched.length) {
      return;
    }

    const m = (motion && typeof motion === 'object') ? motion : {};
    const duration = Number.isFinite(+m.duration) ? +m.duration : 750;
    if (duration <= 0) {
      return;
    }

    const easingKey = (m.easing != null) ? m.easing : 'smoothstep';

    const t = ensureLayerTransitions(rt, layerId);
    const tok = ensureTransitionTokens(rt, layerId);
    if (!t || !tok) return;

    for (const p of touched) {
      const token = nextTransitionToken(rt);
      tok[p] = token;

      const onEnd = () => clearRuntimeTransition(rt, layerId, p, token);
      const onInterrupt = () => clearRuntimeTransition(rt, layerId, p, token);

      let entry = null;
      try {
        const tr = root.transitions;
        if (tr && typeof tr.buildTransitionEntry === 'function') {
          entry = tr.buildTransitionEntry({ duration, easing: easingKey }, { onEnd, onInterrupt });
        }
      } catch (_) {}

      if (!entry) {
        let easing = null;
        try { const tr = root.transitions; if (tr && typeof tr.parseEasingKey === 'function') easing = tr.parseEasingKey(easingKey); } catch (_) {}
        entry = Object.assign({ duration, onEnd, onInterrupt }, (typeof easing === 'function') ? { easing } : null);
      }

      t[p] = entry;
    }
  }

  function attach(rt) {
    if (!rt || typeof rt !== 'object') return rt;
    if (!rt._layerTransitions || typeof rt._layerTransitions.get !== 'function') rt._layerTransitions = new Map();
    if (!rt._transitionTokens || typeof rt._transitionTokens.get !== 'function') rt._transitionTokens = new Map();
    if (!Number.isFinite(rt._transitionTokenSeq)) rt._transitionTokenSeq = 0;
    return rt;
  }

  root.runtime.motion.attach = attach;
  root.runtime.motion.normalizeReason = normalizeReason;
  root.runtime.motion.deriveMotionPolicy = deriveMotionPolicy;
  root.runtime.motion.transitionsForBuild = transitionsForBuild;
  root.runtime.motion.syncJobTransitions = syncJobTransitions;
  root.runtime.motion.ensureLayerTransitions = ensureLayerTransitions;
  root.runtime.motion.disableRuntimeTransitions = disableRuntimeTransitions;
  root.runtime.motion.primeRuntimeTransitions = primeRuntimeTransitions;
  root.runtime.motion.injectMotionTransitions = injectMotionTransitions;
})(window);
