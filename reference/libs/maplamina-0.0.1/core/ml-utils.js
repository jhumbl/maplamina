(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  function isTA(v){ return !!(v && typeof v === 'object' && ArrayBuffer.isView(v)); }

  function pushWarn(st, msg) {
    try {
      st.__warns = st.__warns || [];
      if (!st.__warns.includes(String(msg))) st.__warns.push(String(msg)); // de-dupe
      if (console && console.warn) console.warn(`[maplamina][${st.id}] ${msg}`);
    } catch(_) {}
  }

  function assertTA(st, arr, label, behavior /* 'skip' | 'fallback' */ = 'fallback') {
    if (isTA(arr)) return true;
    const hint = (behavior === 'skip')
      ? 'skipping build for this layer'
      : 'falling back to safe defaults';
    pushWarn(st, `${label} is not a TypedArray; ${hint}`);
    return false;
  }

  function now(){ return (global.performance && performance.now) ? performance.now() : Date.now(); }

  // arrayify helper:
  // - arrays         -> unchanged
  // - null/undefined -> []
  // - scalars        -> [scalar]
  // This avoids subtle bugs when htmlwidgets auto_unbox turns length-1 vectors into scalars.
  function asArray(x){ return Array.isArray(x) ? x : (x == null ? [] : [x]); }

  function normText(x) {
    if (x == null) return '';
    return String(x).trim();
  }

  function safeId(x) {
    return normText(x).replace(/[^A-Za-z0-9_-]+/g, '_');
  }

  // ---- DOM-safe stable keys -------------------------------------------------
  // Produces a CSS-selector-safe id fragment for arbitrary strings (e.g. bind/group ids).
  // Always starts with a letter/underscore to be safe for querySelector('#...').
  function hash32(str) {
    str = String(str ?? '');
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function domKey(x) {
    const raw = normText(x);
    const slug0 = safeId(raw);
    const h = hash32(raw).toString(36).slice(0, 6);
    let slug = slug0 || 'k';
    if (!/^[A-Za-z_]/.test(slug)) slug = 'k_' + slug;
    return `${slug}-${h}`;
  }

  // ---- stable pair cache (keeps updateTriggers identities stable across renders) ----
  const __PAIR_CACHE_A = new WeakMap();        // a -> WeakMap(b -> [a,b])

  function stablePairTA(a, b) {
    let m = __PAIR_CACHE_A.get(a);
    if (!m) { m = new WeakMap(); __PAIR_CACHE_A.set(a, m); }
    let arr = m.get(b);
    if (!arr) { arr = [a, b]; m.set(b, arr); }
    return arr;
  }

  // ---- lightweight number formatting --------------------------------------
  // Cache Intl.NumberFormat instances by digits for cheap repeated formatting.
  const __NF_CACHE = new Map();

  function numberFormatter(digits) {
    const d = (Number.isFinite(digits) ? (digits | 0) : 0);
    const key = Math.max(0, Math.min(12, d));
    let nf = __NF_CACHE.get(key);
    if (!nf) {
      try {
        nf = new Intl.NumberFormat(undefined, {
          minimumFractionDigits: key,
          maximumFractionDigits: key
        });
      } catch (_) {
        nf = null;
      }
      __NF_CACHE.set(key, nf);
    }
    return nf;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '';
    const d = (Number.isFinite(digits) ? (digits | 0) : 0);
    const key = Math.max(0, Math.min(12, d));
    const nf = numberFormatter(key);
    if (nf && typeof nf.format === 'function') {
      try { return nf.format(value); } catch (_) {}
    }
    try { return Number(value).toFixed(key); } catch (_) { return String(value); }
  }

  root.utils = { isTA, pushWarn, assertTA, now, asArray, normText, safeId, hash32, domKey, stablePairTA, formatNumber };
})(window);
