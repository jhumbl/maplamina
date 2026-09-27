import type { Control, ControlType, Panel, Spec, WireMap } from './spec-types';
import { isFiniteNumber, normText } from './utils';

export type Bounds = [[number, number], [number, number]];

type Dict = Record<string, unknown>;

interface BboxObject {
  readonly xmin: unknown;
  readonly ymin: unknown;
  readonly xmax: unknown;
  readonly ymax: unknown;
}

// --- bbox utils (abs lon/lat coming from R) ---
export function unionBboxFromSpec(x: Spec): Bounds | null {
  const specs = x && x['.__layers'] || {};
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const id of Object.keys(specs)) {
    const st0 = specs[id];
    const b: unknown = st0 && st0.bbox;

    if (Array.isArray(b) && b.length === 4) {
      const [x0, y0, x1, y1]: unknown[] = b;
      if (isFiniteNumber(x0) && isFiniteNumber(y0) && isFiniteNumber(x1) && isFiniteNumber(y1)) {
        if (x0 < minX) minX = x0; if (y0 < minY) minY = y0;
        if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
      }
    } else if (b && typeof b === 'object') {
      const o = b as BboxObject;
      const x0 = +(o.xmin as number), y0 = +(o.ymin as number), x1 = +(o.xmax as number), y1 = +(o.ymax as number);
      if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1)) {
        if (x0 < minX) minX = x0; if (y0 < minY) minY = y0;
        if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1;
      }
    }
  }

  if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
    return [[minX, minY], [maxX, maxY]];
  }
  return null;
}

export function hashBbox(bb: Bounds | null | undefined): string {
  return bb ? (bb[0][0] + ',' + bb[0][1] + ',' + bb[1][0] + ',' + bb[1][1]) : '';
}

// A keyed list from the spec, read by key. An empty one arrives as [].
export function wireMap<T>(m: WireMap<T> | null | undefined): Readonly<Record<string, T>> {
  return (m || {}) as Readonly<Record<string, T>>;
}

// --- small object helpers ---
export function normPlainObject(x: unknown): Dict {
  return (x && typeof x === 'object' && !Array.isArray(x)) ? x as Dict : {};
}

// Stable stringify for small option objects (avoid churn from key ordering).
export function stableStringify(x: unknown): string {
  if (x == null) return 'null';
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : 'null';
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  if (typeof x === 'object') {
    const o = x as Dict;
    const keys = Object.keys(o).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i) out += ',';
      out += JSON.stringify(k) + ':' + stableStringify(o[k]);
    }
    out += '}';
    return out;
  }
  // Functions/other types shouldn't appear from R; coerce defensively.
  try { return JSON.stringify(String(x)); } catch (_) { return 'null'; }
}

// --- v3 controls helpers ---
export function getControlGroups(x: Spec): Spec['.__controls'] {
  const c = x && x['.__controls'];
  return (c && typeof c === 'object') ? c : {};
}

export function getPanelSpec(x: Spec): Panel | null {
  const p = x && x['.__panel'];
  return (p && typeof p === 'object') ? p : null;
}

function getPanelSections(x: Spec): Panel['sections'] {
  const p = getPanelSpec(x);
  const s = p && Array.isArray(p.sections) ? p.sections : null;
  return s || [];
}

// Controls group ordering contract:
// 1) If a panel is present, its sections order is authoritative for card order and
//    is also used as the precedence order for group application (e.g. views).
// 2) Any remaining groups not referenced by the panel follow insertion order in .__controls.
export function getControlGroupIdsOrdered(x: Spec): string[] {
  const groups = getControlGroups(x);
  const ids: string[] = [];
  const seen = new Set<string>();

  // Panel order first.
  const sections = getPanelSections(x);
  for (const sec of sections) {
    const gid = normText(sec && sec.id);
    if (!gid || !groups[gid] || seen.has(gid)) continue;
    seen.add(gid);
    ids.push(gid);
  }

  // Then any remaining control groups in insertion order.
  for (const gid of Object.keys(groups)) {
    const id = normText(gid);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function getControlSpec(x: Spec, groupId: unknown): Control | null {
  const gid = normText(groupId);
  if (!gid) return null;
  const groups = getControlGroups(x);
  const spec = groups[gid];
  return (spec && typeof spec === 'object') ? spec : null;
}

export interface ControlGroup<C extends Control = Control> {
  groupId: string;
  spec: C;
}

export function getControlGroupsByType<T extends ControlType>(
  x: Spec,
  type: T
): ControlGroup<Extract<Control, { type: T }>>[] {
  const want = normText(type);
  if (!want) return [];
  const groups = getControlGroups(x);
  const out: ControlGroup<Extract<Control, { type: T }>>[] = [];
  const order = getControlGroupIdsOrdered(x);
  for (const gid of order) {
    const spec = groups[gid];
    if (!spec || typeof spec !== 'object') continue;
    const t = spec.type ? normText(spec.type) : '';
    if (t === want) out.push({ groupId: gid, spec: spec as Extract<Control, { type: T }> });
  }
  return out;
}

function isDict(x: unknown): x is Dict {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

// An empty R list() arrives as []. The three top-level containers become objects before the
// spec is validated.
export function normalizeSpec(x: unknown): void {
  try {
    if (x && typeof x === 'object') {
      const o = x as Dict;
      const hasV3Keys = Object.keys(o).some(k => k.startsWith('.__'));
      if (hasV3Keys) {
        if (!isDict(o['.__layers'])) o['.__layers'] = {};
        if (!isDict(o['.__components'])) o['.__components'] = {};
        if (!isDict(o['.__controls'])) o['.__controls'] = {};
      }
    }
  } catch (_) {}
}

// Throws if the incoming spec is not in the expected shape.
export function assertV3Spec(x: unknown, where?: string): true {
  const loc = where ? ` (${where})` : '';
  if (!x || typeof x !== 'object') {
    throw new Error(`[maplamina] v3 spec required${loc}: expected an object`);
  }
  const spec = x as Dict;

  const layers = spec['.__layers'];
  if (!isDict(layers)) {
    throw new Error(`[maplamina] v3 spec required${loc}: missing .__layers object`);
  }

  const comps = spec['.__components'];
  if (!isDict(comps)) {
    throw new Error(`[maplamina] v3 spec required${loc}: missing .__components object`);
  }

  // Validate known component buckets (if present). In v3, component buckets are plain objects keyed by component id.
  // Note: R may emit unused buckets as NULL (→ null) or omit them entirely; both are valid.
  const knownBuckets = ['views', 'legends', 'select', 'range', 'summaries'];
  for (const k of knownBuckets) {
    if (Object.prototype.hasOwnProperty.call(comps, k)) {
      const b = comps[k];
      if (b == null) continue; // allow null/undefined for unused buckets
      // R may serialize an empty unnamed list() as [] (array). Treat empty arrays as unused buckets.
      if (Array.isArray(b)) {
        if (b.length === 0) continue;
        throw new Error(`[maplamina] v3 spec required${loc}: .__components.${k} must be an object (or empty when unused)`);
      }
      if (typeof b !== 'object') {
        throw new Error(`[maplamina] v3 spec required${loc}: .__components.${k} must be an object (or null when unused)`);
      }
    }
  }

  const ctrls = spec['.__controls'];
  if (!isDict(ctrls)) {
    throw new Error(`[maplamina] v3 spec required${loc}: missing .__controls object`);
  }

  // Validate control group specs.
  for (const gid of Object.keys(ctrls)) {
    const g = ctrls[gid];
    if (!g || typeof g !== 'object') {
      throw new Error(`[maplamina] v3 spec required${loc}: control group "${gid}" is not an object`);
    }
    const type = (g as Dict).type;
    const t = type ? normText(type) : '';
    if (!t) {
      throw new Error(`[maplamina] v3 spec required${loc}: control group "${gid}" missing type`);
    }
  }

  // Optional panel validation.
  const panel = spec['.__panel'];
  if (panel != null) {
    if (!isDict(panel)) {
      throw new Error(`[maplamina] v3 spec required${loc}: .__panel must be an object`);
    }
    if (panel.sections != null && !Array.isArray(panel.sections)) {
      throw new Error(`[maplamina] v3 spec required${loc}: .__panel.sections must be an array`);
    }
    const sections: unknown[] = Array.isArray(panel.sections) ? panel.sections : [];
    for (const sec of sections) {
      const id = normText(sec && (sec as Dict).id);
      if (!id) {
        throw new Error(`[maplamina] v3 spec required${loc}: panel section missing id`);
      }
      if (!Object.prototype.hasOwnProperty.call(ctrls, id)) {
        throw new Error(`[maplamina] v3 spec required${loc}: panel section "${id}" has no matching control group in .__controls`);
      }
    }
  }

  // Layers must not carry UI or component fields.
  const legacyKeys = ['views', 'filters', 'panel', 'controls', 'transitions'];
  for (const lid of Object.keys(layers)) {
    const st = layers[lid];
    if (!st || typeof st !== 'object') {
      throw new Error(`[maplamina] v3 spec required${loc}: layer "${lid}" is not an object`);
    }
    const layerType = (st as Dict).type;
    const type = layerType ? normText(layerType) : '';
    if (!type) {
      throw new Error(`[maplamina] v3 spec required${loc}: layer "${lid}" missing type`);
    }
    for (const k of legacyKeys) {
      if (Object.prototype.hasOwnProperty.call(st, k)) {
        throw new Error(`[maplamina] v3 spec required${loc}: legacy per-layer field "${k}" found in layer "${lid}"`);
      }
    }
  }

  return true;
}
