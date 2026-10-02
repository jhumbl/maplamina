import type { TypedArray, WarnTarget } from './layer-state';

export function isTA(v: unknown): v is TypedArray {
  return !!(v && typeof v === 'object' && ArrayBuffer.isView(v));
}

// Array.isArray() narrows a readonly array or a union to any[]; this keeps the element type.
export function isArray(v: unknown): v is readonly unknown[] {
  return Array.isArray(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return Number.isFinite(v);
}

export function escapeHtml(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function pushWarn(st: WarnTarget, msg: unknown): void {
  try {
    st.__warns = st.__warns || [];
    if (!st.__warns.includes(String(msg))) st.__warns.push(String(msg)); // de-dupe
    if (console && console.warn) console.warn(`[maplamina][${st.id}] ${msg}`);
  } catch (_) {}
}

export function assertTA(
  st: WarnTarget,
  arr: unknown,
  label: string,
  behavior: 'skip' | 'fallback' = 'fallback'
): arr is TypedArray {
  if (isTA(arr)) return true;
  const hint = (behavior === 'skip')
    ? 'skipping build for this layer'
    : 'falling back to safe defaults';
  pushWarn(st, `${label} is not a TypedArray; ${hint}`);
  return false;
}

export function now(): number {
  return (globalThis.performance && performance.now) ? performance.now() : Date.now();
}

// arrayify helper:
// - arrays         -> unchanged
// - null/undefined -> []
// - scalars        -> [scalar]
// This avoids subtle bugs when htmlwidgets auto_unbox turns length-1 vectors into scalars.
export function asArray<T>(x: T | readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(x) ? x : (x == null ? [] : [x as T]);
}

export function normText(x: unknown): string {
  if (x == null) return '';
  return String(x).trim();
}

export function safeId(x: unknown): string {
  return normText(x).replace(/[^A-Za-z0-9_-]+/g, '_');
}

// Prefix for DOM ids and radio group names so two widgets on one page never share them.
export function widgetKey(el: { readonly id?: string } | null | undefined): string {
  return safeId(el && el.id ? el.id : 'maplamina');
}

// ---- DOM-safe stable keys -------------------------------------------------
// Produces a CSS-selector-safe id fragment for arbitrary strings (e.g. bind/group ids).
// Always starts with a letter/underscore to be safe for querySelector('#...').
function hash32(x: unknown): number {
  const str = String(x ?? '');
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function domKey(x: unknown): string {
  const raw = normText(x);
  const slug0 = safeId(raw);
  const h = hash32(raw).toString(36).slice(0, 6);
  let slug = slug0 || 'k';
  if (!/^[A-Za-z_]/.test(slug)) slug = 'k_' + slug;
  return `${slug}-${h}`;
}

// ---- stable pair cache (keeps updateTriggers identities stable across renders) ----
const __PAIR_CACHE_A = new WeakMap<object, WeakMap<object, [object, object]>>(); // a -> WeakMap(b -> [a,b])

export function stablePairTA<A extends object, B extends object>(a: A, b: B): [A, B] {
  let m = __PAIR_CACHE_A.get(a);
  if (!m) { m = new WeakMap(); __PAIR_CACHE_A.set(a, m); }
  let arr = m.get(b);
  if (!arr) { arr = [a, b]; m.set(b, arr); }
  return arr as [A, B];
}

// ---- lightweight number formatting --------------------------------------
// Cache Intl.NumberFormat instances by digits for cheap repeated formatting.
const __NF_CACHE = new Map<number, Intl.NumberFormat | null>();

function numberFormatter(digits: number): Intl.NumberFormat | null {
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

export function formatNumber(value: number, digits?: number | null): string {
  if (!Number.isFinite(value)) return '';
  const d = (typeof digits === 'number' && Number.isFinite(digits) ? (digits | 0) : 0);
  const key = Math.max(0, Math.min(12, d));
  const nf = numberFormatter(key);
  if (nf && typeof nf.format === 'function') {
    try { return nf.format(value); } catch (_) {}
  }
  try { return Number(value).toFixed(key); } catch (_) { return String(value); }
}
