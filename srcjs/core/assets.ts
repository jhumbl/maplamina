import type { Href, LayerState, RefNode, ResolvedArray, TypedArray } from './layer-state';
import { pushWarn } from './utils';

// Relative URLs resolve against core/ in the folder the built file is served from.
let __DEP_BASE = '';
try {
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; --i) {
    const s = scripts[i].src || '';
    const m = s.match(/(.*\/)maplamina-modules\.js(?:\?.*)?$/);
    if (m) { __DEP_BASE = m[1] + 'core/'; break; }
  }
} catch (_) {}

export function depUrl(x: string): string;
export function depUrl(x: unknown): unknown;
export function depUrl(x: unknown): unknown {
  const norm = (y: unknown): unknown => {
    if (typeof y === "string") return y;
    const o = y as { href?: string | { data?: unknown }; data?: unknown } | null | undefined;
    if (o && typeof o === "object" && typeof o.href === "string") return o.href;
    if (o && o.href && typeof o.href === "object" && typeof o.href.data === "string") return o.href.data;
    if (o && typeof o.data === "string") return o.data;
    return y;
  };

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

const __ric: (cb: IdleRequestCallback) => number =
  globalThis.requestIdleCallback || ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0));
const __cic: (id: number) => void = globalThis.cancelIdleCallback || clearTimeout;

// ------------------------ blob pruning ------------------------
export function pruneEmbeddedBlobs(st: Pick<LayerState, 'dataStore'>): { pruned: number; skipped: number } {
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

export function pruneEmbeddedBlobsIdle(st: Pick<LayerState, 'dataStore'>): number {
  return __ric(() => {
    try {
      pruneEmbeddedBlobs(st);
    } catch (e) {
      console.warn('[maplamina] prune error', e);
    }
  });
}

export function cancelIdlePrune(id: number | null | undefined): void { if (id) __cic(id); }

// ------------------------ fetch + hydration helpers ------------------------
// Decoded arrays by blob id, so a column shared by several layers is decoded once. Keyed on
// the id rather than the data URI so pruning the embedded base64 actually frees it.
const MEMO = new Map<string, TypedArray>();
export function clearMemo(): void { MEMO.clear(); }

function typedArray(buf: ArrayBuffer, dt: string): TypedArray {
  switch (dt) {
    case 'u32': return new Uint32Array(buf);
    case 'u8':  return new Uint8Array(buf);
    default:    return new Float32Array(buf);
  }
}

function decodeBase64DataUri(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function fetchArray(
  href: Href | undefined,
  dtype: string | undefined,
  memoKey?: string | null
): Promise<TypedArray> {
  const url = depUrl(href);
  const dt = (dtype || '').toLowerCase();

  if (typeof url !== 'string') {
    console.warn('[maplamina] fetchArray bad href', href);
    return typedArray(new ArrayBuffer(0), dt);
  }
  if (memoKey && MEMO.has(memoKey)) return MEMO.get(memoKey)!;

  try {
    let buf;
    if (/^data:[^,]*;base64,/.test(url)) {
      buf = decodeBase64DataUri(url);
    } else {
      const res = await fetch(url);
      if (!res || !res.ok) {
        const status = res ? `${res.status} ${res.statusText || ''}`.trim() : 'no response';
        console.warn('[maplamina] fetchArray failed', status, url);
        return typedArray(new ArrayBuffer(0), dt);
      }
      buf = await res.arrayBuffer();
    }
    const arr = typedArray(buf, dt);
    if (memoKey) MEMO.set(memoKey, arr);
    return arr;
  } catch (e) {
    console.warn('[maplamina] fetchArray error', url, e);
    return typedArray(new ArrayBuffer(0), dt);
  }
}

function isRefNode(v: unknown): v is RefNode {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);
}

export async function resolveRefOrHref(
  layerSpec: LayerState,
  obj: RefNode | null | undefined
): Promise<ResolvedArray | null> {
  if (!obj) return null;

  const outerSize = (obj && typeof obj === 'object') ? obj.size : undefined;

  // Unwrap common wrapper shapes emitted by the spec:
  // - { values: { ref|href|dtype|... }, size: ... }
  // - { value:  { ref|href|dtype|... } }
  // We keep the original object for size/metadata, but resolve using the inner node.
  let node = obj;
  for (let i = 0; i < 3; i++) {
    const v = (node && typeof node === 'object') ? (node.values || node.value) : null;
    if (isRefNode(v) && (v.ref || v.href || v.dtype || v.values || v.value)) { node = v; continue; }
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

    if (!blobId || !blob) {
      pushWarn(layerSpec, `Unknown ref '${semantic}' (missing dataStore.refs mapping)`);
      return null;
    }

    // already hydrated once (cache by blob id via blob object)
    if (blob.__array && ArrayBuffer.isView(blob.__array)) {
      return { array: blob.__array, dtype: blob.dtype, size: (blob.size != null ? blob.size : outerSize), blobId };
    }

    // hydrate now, then cache on the blob (so view switches never fetch/decode)
    const arr = await fetchArray(blob.href, blob.dtype, blobId);
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
