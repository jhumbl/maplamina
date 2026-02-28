(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};

  // v3: Layers are rendering-only and MUST NOT own/define transitions.
  // Runtime helper module for motion (e.g. Views motion injected at patch-time).

  // NOTE: keys are lowercased to make matching case-insensitive.
  const EASINGS = {
    linear: (t) => t,
    easein: (t) => t * t,
    easeout: (t) => 1 - Math.pow(1 - t, 2),
    // cosine-based ease-in-out (close to browser "ease-in-out")
    easeinout: (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
    smoothstep: (t) => t * t * (3 - 2 * t),
    // cubic ease-in-out (matches "easeInOutCubic" key from R)
    easeinoutcubic: (t) => (t < 0.5) ? (4 * t * t * t) : (1 - Math.pow(-2 * t + 2, 3) / 2)
  };

  function normKey(x) {
    return (typeof x === 'string') ? x.trim().toLowerCase() : '';
  }

  // Public: parse an easing key (string) into a function.
  function parseEasingKey(e) {
    if (typeof e === 'function') return e;
    const k = normKey(e) || 'smoothstep';
    return EASINGS[k];
  }

  // Public: build a deck.gl transition entry from motion metadata and optional callbacks.
  // motion: { duration, easing, delay? }
  // callbacks: { onEnd, onInterrupt }
  function buildTransitionEntry(motion, callbacks) {
    const m = (motion && typeof motion === 'object') ? motion : {};
    const out = {};

    // duration: >= 0. If missing, default 750ms (R default).
    const d = Number.isFinite(+m.duration) ? +m.duration : 750;
    out.duration = Math.max(0, d);

    if (Number.isFinite(+m.delay)) out.delay = +m.delay;

    const easing = parseEasingKey(m.easing);
    if (easing) out.easing = easing;

    const cb = (callbacks && typeof callbacks === 'object') ? callbacks : null;
    if (cb && typeof cb.onEnd === 'function') out.onEnd = cb.onEnd;
    if (cb && typeof cb.onInterrupt === 'function') out.onInterrupt = cb.onInterrupt;

    return out;
  }

// Public: create a "disabled/primed" transition entry from an existing entry.
// - duration is forced to 0 (no animation)
// - callbacks are intentionally omitted (avoid immediate end/interrupt loops)
// - easing/delay are preserved only if present (harmless at duration 0)
function disableTransitionEntry(entry) {
  const e = normEntry(entry);
  e.duration = 0;
  try { delete e.onEnd; delete e.onInterrupt; } catch (_) {}
  return e;
}

// Public: disable an entire transitions map (per-prop) by forcing duration=0 entries.
// Returns a new object (does not mutate the input).
function disableTransitionsMap(transitionsMap) {
  const t = (transitionsMap && typeof transitionsMap === 'object') ? transitionsMap : null;
  if (!t) return null;
  const out = {};
  for (const k of Object.keys(t)) out[k] = disableTransitionEntry(t[k]);
  return out;
}

// Public: create a "primed" transition entry from motion metadata (duration=0, no callbacks).
function primeTransitionEntryFromMotion(motion) {
  const m = (motion && typeof motion === 'object') ? motion : {};
  const out = { duration: 0 };
  if (Number.isFinite(+m.delay)) out.delay = +m.delay;
  const easing = parseEasingKey(m.easing);
  if (easing) out.easing = easing;
  return out;
}

// Public: ensure specified props exist in a transitions map as primed (duration=0) entries.
// - Does not override armed entries (duration > 0).
// - Only creates missing entries; existing disabled entries are normalized to remove callbacks.
function primeTransitionsForProps(transitionsMap, props, motion) {
  const t = (transitionsMap && typeof transitionsMap === 'object') ? transitionsMap : null;
  if (!t) return null;
  const arr = Array.isArray(props) ? props : (props ? [props] : []);
  for (const raw of arr) {
    const k = String(raw || '');
    if (!k) continue;
    const cur = t[k];
    if (cur == null) {
      t[k] = primeTransitionEntryFromMotion(motion);
      continue;
    }
    // Preserve armed entries
    const d = (cur && typeof cur === 'object' && Number.isFinite(+cur.duration)) ? +cur.duration : (Number.isFinite(cur) ? +cur : 0);
    if (d > 0) continue;
    // Normalize to a disabled/primed entry (strips callbacks)
    t[k] = disableTransitionEntry(cur);
  }
  return t;
}

// Public: disable specified props in place (duration=0, no callbacks). If props omitted, disables all.
function disableTransitionsForProps(transitionsMap, props) {
  const t = (transitionsMap && typeof transitionsMap === 'object') ? transitionsMap : null;
  if (!t) return null;
  const keys = (props == null)
    ? Object.keys(t)
    : (Array.isArray(props) ? props.map(p => String(p || '')).filter(Boolean) : [String(props || '')].filter(Boolean));
  for (const k of keys) {
    if (!k) continue;
    if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
    t[k] = disableTransitionEntry(t[k]);
  }
  return t;
}

  function normEntry(x) {
    if (Number.isFinite(x)) return { duration: Number(x) };
    if (x && typeof x === 'object') {
      const out = {};
      if (Number.isFinite(x.duration)) out.duration = Number(x.duration);
      if (Number.isFinite(x.delay))    out.delay    = Number(x.delay);
      const easing = parseEasingKey(x.easing);
      if (easing) out.easing = easing;
      return out;
    }
    return { duration: 300 };
  }
  

  root.transitions = { parseEasingKey, buildTransitionEntry, disableTransitionEntry, disableTransitionsMap, primeTransitionEntryFromMotion, primeTransitionsForProps, disableTransitionsForProps };
})(window);
