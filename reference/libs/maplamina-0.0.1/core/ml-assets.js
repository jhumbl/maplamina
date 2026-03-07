(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-assets.js");
  }

  const utils = core.require('utils', 'ml-assets.js');
  const pushWarn = utils.pushWarn;

  let __DEP_BASE = '';
  try {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; --i) {
      const s = scripts[i].src || '';
      // Prefer the module name if present; fall back to ml-core.js for legacy builds.
      const m = s.match(/(.*\/)(?:ml-assets|ml-core)\.js(?:\?.*)?$/);
      if (m) { __DEP_BASE = m[1]; break; }
    }
  } catch (_) {}

  function depUrl(x) {
    const norm = (y) =>
      (typeof y === "string") ? y
      : (y && typeof y === "object" && typeof y.href === "string") ? y.href
      : (y && y.href && typeof y.href.data === "string") ? y.href.data
      : (y && typeof y.data === "string") ? y.data
      : y;

    const raw = norm(x);
    if (!raw || typeof raw !== "string") return raw;

    // Absolute-ish URLs we must not prefix
    if (
      raw.startsWith("data:") ||
      raw.startsWith("blob:") ||
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("/")
    ) {
      return raw;
    }

    return (__DEP_BASE || "") + raw;
  }

  const __ric = window.requestIdleCallback || (cb => setTimeout(() => cb({didTimeout:false,timeRemaining:()=>0}), 0));
  const __cic = window.cancelIdleCallback || clearTimeout;

  // ------------------------ blob pruning ------------------------
  function pruneEmbeddedBlobs(st){
    const blobs = st?.dataStore?.blobs; if (!blobs) return {pruned:0, skipped:0};
    let pruned = 0, skipped = 0;
    for (const k of Object.keys(blobs)) {
      const b = blobs[k];
      if (b && b.href && typeof b.href === 'object' && 'data' in b.href) {
        if (b.__array && ArrayBuffer.isView(b.__array)) { delete b.href.data; pruned++; }
        else { skipped++; }
      }
    }
    return {pruned, skipped};
  }

  function pruneEmbeddedBlobsIdle(st){
    return __ric(() => {
      try {
        
        pruneEmbeddedBlobs(st);

      } catch (e) {
        console.warn('[maplamina] prune error', e);
      }
    });
  }

  function cancelIdlePrune(id){ if (id) __cic(id); }

  // ------------------------ fetch + hydration helpers ------------------------
  const MEMO = new Map();
  async function fetchArray(href, dtype) {
    const url = depUrl(href);
    const dt = (dtype || '').toLowerCase();

    const key = url + '|' + dt;

    const empty = () => {
      switch (dt) {
        case 'u32': return new Uint32Array(0);
        case 'u8':  return new Uint8Array(0);
        case 'f32': return new Float32Array(0);
        default:    return new Float32Array(0);
      }
    };

    if (typeof url !== 'string') {
      console.warn('[maplamina] fetchArray bad href', href);
      return empty();
    }
    if (MEMO.has(key)) return MEMO.get(key);

    try {
      const res = await fetch(url);
      if (!res || !res.ok) {
        const status = res ? `${res.status} ${res.statusText || ''}`.trim() : 'no response';
        console.warn('[maplamina] fetchArray failed', status, url);
        return empty();
      }
      const buf = await res.arrayBuffer();
      let arr;
      switch (dt) {
        case 'f32': arr = new Float32Array(buf); break;
        case 'u32': arr = new Uint32Array(buf); break;
        case 'u8':  arr = new Uint8Array(buf);  break;
        default:    arr = new Float32Array(buf); break;
      }
      MEMO.set(key, arr);
      return arr;
    } catch (e) {
      console.warn('[maplamina] fetchArray error', url, e);
      return empty();
    }
  }

  async function resolveRefOrHref(layerSpec, obj) {
  if (!obj) return null;

  const outerSize = (obj && typeof obj === 'object') ? obj.size : undefined;

  // Unwrap common wrapper shapes emitted by the spec:
  // - { values: { ref|href|dtype|... }, size: ... }
  // - { value:  { ref|href|dtype|... } }
  // We keep the original object for size/metadata, but resolve using the inner node.
  let node = obj;
  for (let i = 0; i < 3; i++) {
    const v = (node && typeof node === 'object') ? (node.values || node.value) : null;
    const isObj = v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);
    if (isObj && (v.ref || v.href || v.dtype || v.values || v.value)) { node = v; continue; }
    break;
  }

  const ds = layerSpec && layerSpec.dataStore;

  // ------------------------------------------------------------
  // Semantic ref -> blobId via dataStore.refs (v3 spec)
  // ------------------------------------------------------------
  if (node.ref && ds && ds.blobs) {
    const semantic = node.ref;
    const blobId = (ds.refs && ds.refs[semantic]) ? ds.refs[semantic] : null;
    const blob = (blobId && ds.blobs) ? ds.blobs[blobId] : null;

    if (!blob) {
      pushWarn && pushWarn(layerSpec, `Unknown ref '${semantic}' (missing dataStore.refs mapping)`);
      return null;
    }

    // already hydrated once (cache by blob id via blob object)
    if (blob.__array && ArrayBuffer.isView(blob.__array)) {
      return { array: blob.__array, dtype: blob.dtype, size: (blob.size != null ? blob.size : outerSize), blobId };
    }

    // hydrate now, then cache on the blob (so view switches never fetch/decode)
    const arr = await fetchArray(blob.href, blob.dtype);
    blob.__array = arr;
    return { array: arr, dtype: blob.dtype, size: (blob.size != null ? blob.size : outerSize), blobId };
  }

  // ------------------------------------------------------------
  // Direct href (external or inline); cache on the node itself.
  // ------------------------------------------------------------
  if (node.href && node.dtype) {
    if (node.array && ArrayBuffer.isView(node.array)) {
      return { array: node.array, dtype: node.dtype, size: (node.size != null ? node.size : outerSize) };
    }
    const arr = await fetchArray(node.href, node.dtype);
    node.array = arr;
    return { array: arr, dtype: node.dtype, size: (node.size != null ? node.size : outerSize) };
  }

  return null;
}

  root.assets = { depUrl, fetchArray, resolveRefOrHref, pruneEmbeddedBlobs, pruneEmbeddedBlobsIdle, cancelIdlePrune };
})(window);
