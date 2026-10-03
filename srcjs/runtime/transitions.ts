import type { TransitionEntry, TransitionsMap } from '../core/layer-state';
import { isArray, isFiniteNumber } from '../core/utils';

export type EasingFn = (t: number) => number;

// Motion as a view carries it; easing is a key of EASINGS or a function.
export interface MotionInput {
  readonly duration?: number;
  readonly delay?: number;
  readonly easing?: string | EasingFn | null;
}

export interface TransitionCallbacks {
  onEnd?: () => void;
  onInterrupt?: () => void;
}

type PropNames = readonly string[] | string | null | undefined;

// Layers do not own transitions; motion is injected at patch time.

// Keys are lowercased to make matching case-insensitive.
const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  easein: (t) => t * t,
  easeout: (t) => 1 - Math.pow(1 - t, 2),
  // cosine-based ease-in-out (close to browser "ease-in-out")
  easeinout: (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
  smoothstep: (t) => t * t * (3 - 2 * t),
  // cubic ease-in-out (matches "easeInOutCubic" key from R)
  easeinoutcubic: (t) => (t < 0.5) ? (4 * t * t * t) : (1 - Math.pow(-2 * t + 2, 3) / 2)
};

function normKey(x: unknown): string {
  return (typeof x === 'string') ? x.trim().toLowerCase() : '';
}

// Parse an easing key (string) into a function.
function parseEasingKey(e: unknown): EasingFn | undefined {
  if (typeof e === 'function') return e as EasingFn;
  const k = normKey(e) || 'smoothstep';
  return EASINGS[k];
}

// Build a deck.gl transition entry from motion metadata and optional callbacks.
export function buildTransitionEntry(
  motion: MotionInput | null | undefined,
  callbacks?: TransitionCallbacks | null
): TransitionEntry {
  const m: MotionInput = (motion && typeof motion === 'object') ? motion : {};
  const out: TransitionEntry = {};

  // duration: >= 0. If missing, default 750ms (R default).
  const d = Number.isFinite(+m.duration!) ? +m.duration! : 750;
  out.duration = Math.max(0, d);

  if (Number.isFinite(+m.delay!)) out.delay = +m.delay!;

  const easing = parseEasingKey(m.easing);
  if (easing) out.easing = easing;

  const cb = (callbacks && typeof callbacks === 'object') ? callbacks : null;
  if (cb && typeof cb.onEnd === 'function') out.onEnd = cb.onEnd;
  if (cb && typeof cb.onInterrupt === 'function') out.onInterrupt = cb.onInterrupt;

  return out;
}

// Create a "disabled/primed" transition entry from an existing entry.
// - duration is forced to 0 (no animation)
// - callbacks are intentionally omitted (avoid immediate end/interrupt loops)
// - easing/delay are preserved only if present (harmless at duration 0)
export function disableTransitionEntry(entry: TransitionEntry | number | null | undefined): TransitionEntry {
  const e = normEntry(entry);
  e.duration = 0;
  delete e.onEnd; delete e.onInterrupt;
  return e;
}

// Create a "primed" transition entry from motion metadata (duration=0, no callbacks).
function primeTransitionEntryFromMotion(motion: MotionInput | null | undefined): TransitionEntry {
  const m: MotionInput = (motion && typeof motion === 'object') ? motion : {};
  const out: TransitionEntry = { duration: 0 };
  if (Number.isFinite(+m.delay!)) out.delay = +m.delay!;
  const easing = parseEasingKey(m.easing);
  if (easing) out.easing = easing;
  return out;
}

// Ensure specified props exist in a transitions map as primed (duration=0) entries.
// - Does not override armed entries (duration > 0).
// - Only creates missing entries; existing disabled entries are normalized to remove callbacks.
export function primeTransitionsForProps(
  transitionsMap: TransitionsMap | null | undefined,
  props: PropNames,
  motion: MotionInput | null | undefined
): TransitionsMap | null {
  const t = (transitionsMap && typeof transitionsMap === 'object') ? transitionsMap : null;
  if (!t) return null;
  const arr = isArray(props) ? props : (props ? [props] : []);
  for (const raw of arr) {
    const k = String(raw || '');
    if (!k) continue;
    const cur = t[k];
    if (cur == null) {
      t[k] = primeTransitionEntryFromMotion(motion);
      continue;
    }
    // Preserve armed entries
    const d = (cur && typeof cur === 'object' && Number.isFinite(+cur.duration!)) ? +cur.duration! : (isFiniteNumber(cur) ? +cur : 0);
    if (d > 0) continue;
    // Normalize to a disabled/primed entry (strips callbacks)
    t[k] = disableTransitionEntry(cur);
  }
  return t;
}

// Disable specified props in place (duration=0, no callbacks). If props omitted, disables all.
export function disableTransitionsForProps(
  transitionsMap: TransitionsMap | null | undefined,
  props?: PropNames
): TransitionsMap | null {
  const t = (transitionsMap && typeof transitionsMap === 'object') ? transitionsMap : null;
  if (!t) return null;
  const keys = (props == null)
    ? Object.keys(t)
    : (isArray(props) ? props.map(p => String(p || '')).filter(Boolean) : [String(props || '')].filter(Boolean));
  for (const k of keys) {
    if (!k) continue;
    if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
    t[k] = disableTransitionEntry(t[k]);
  }
  return t;
}

function normEntry(x: TransitionEntry | number | null | undefined): TransitionEntry {
  if (isFiniteNumber(x)) return { duration: Number(x) };
  if (x && typeof x === 'object') {
    const out: TransitionEntry = {};
    if (isFiniteNumber(x.duration)) out.duration = Number(x.duration);
    if (isFiniteNumber(x.delay))    out.delay    = Number(x.delay);
    const easing = parseEasingKey(x.easing);
    if (easing) out.easing = easing;
    return out;
  }
  return { duration: 300 };
}
