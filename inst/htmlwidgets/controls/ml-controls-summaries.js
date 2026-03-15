(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.controls = root.controls || {};
  root.controls.summaries = root.controls.summaries || {};

  const core = root.core;
  const utils = (core && typeof core.require === 'function')
    ? core.require('utils', 'ml-controls-summaries.js')
    : root.utils;

  const assets = (core && typeof core.require === 'function')
    ? core.require('assets', 'ml-controls-summaries.js')
    : root.assets;

  const dataMod = (core && typeof core.require === 'function')
    ? core.require('data', 'ml-controls-summaries.js')
    : root.data;

  const runtimeAssembly = root.runtime && root.runtime.assembly;

  const normText = utils && utils.normText ? utils.normText : (x => (x == null ? '' : String(x).trim()));
  const formatNumber = utils && typeof utils.formatNumber === 'function'
    ? utils.formatNumber
    : (v, digits) => {
        if (!Number.isFinite(v)) return '';
        const d = Number.isFinite(digits) ? Math.max(0, Math.min(12, digits | 0)) : 0;
        try { return Number(v).toFixed(d); } catch (_) { return String(v); }
      };

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function inferFeatureCount(st) {
    const cols = st && st.data_columns ? st.data_columns : {};

    // points/icons/markers
    const pos = cols && cols.position;
    if (pos && pos.array && ArrayBuffer.isView(pos.array)) {
      const sz = Number.isFinite(+pos.size) ? (+pos.size) : 2;
      return Math.floor(pos.array.length / (sz || 2)) >>> 0;
    }

    // paths
    const p = cols && cols.path;
    if (p && p.path_starts_array && ArrayBuffer.isView(p.path_starts_array)) {
      return (p.path_starts_array.length >>> 0);
    }
    if (p && p.start_indices && ArrayBuffer.isView(p.start_indices)) {
      return (p.start_indices.length >>> 0);
    }

    // polygons
    const poly = cols && cols.polygon;
    if (poly && poly.poly_starts_array && ArrayBuffer.isView(poly.poly_starts_array)) {
      return (poly.poly_starts_array.length >>> 0);
    }
    if (poly && poly.start_indices && ArrayBuffer.isView(poly.start_indices)) {
      return (poly.start_indices.length >>> 0);
    }
    if (poly && typeof poly.length === 'number') {
      return (poly.length >>> 0);
    }

    // fallback: feature_index length (when present)
    const idx = cols?.feature_index_array || cols?.feature_index?.array;
    if (idx && ArrayBuffer.isView(idx)) return (idx.length >>> 0);

    return 0;
  }

  function buildRowOrder(rows, orderRaw) {
    const keys = Object.keys(rows || {});
    if (!keys.length) return [];

    const byNorm = new Map();
    for (const k of keys) byNorm.set(normText(k), k);

    const seen = new Set();
    const out = [];
    const push = (k) => {
      if (!k) return;
      if (seen.has(k)) return;
      if (!Object.prototype.hasOwnProperty.call(rows, k)) return;
      seen.add(k);
      out.push(k);
    };

    if (Array.isArray(orderRaw) && orderRaw.length) {
      for (const raw of orderRaw) {
        const s = String(raw == null ? '' : raw);
        push(Object.prototype.hasOwnProperty.call(rows, s) ? s : byNorm.get(normText(s)));
      }
    }

    for (const k of keys) push(k);
    return out;
  }

  function ensureLocalState(mountEl) {
    const s = (mountEl && mountEl.__mlSummaries && typeof mountEl.__mlSummaries === 'object')
      ? mountEl.__mlSummaries
      : null;
    if (s) return s;
    const out = { seq: 0, nodes: new Map(), order: [] };
    try { mountEl.__mlSummaries = out; } catch (_) {}
    return out;
  }

  function render(mountEl, el, x, groupId, controlSpec) {
    if (!mountEl) return;

    const gid = (groupId != null) ? String(groupId) : 'summaries';
    const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
    if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'summaries') {
      clearNode(mountEl);
      return;
    }

    const rows = (ctl.rows && typeof ctl.rows === 'object') ? ctl.rows : {};
    const keys = Object.keys(rows);

    clearNode(mountEl);

    // Reset local state for this mount.
    const local = ensureLocalState(mountEl);
    local.nodes = new Map();
    local.order = [];

    if (!keys.length) {
      const msg = document.createElement('div');
      msg.className = 'ml-controls-placeholder';
      msg.textContent = 'No summaries available.';
      mountEl.appendChild(msg);
      return;
    }

    // Respect authored order from the compiled spec.
    const order = buildRowOrder(rows, ctl.order);
    local.order = order.slice();

    const box = document.createElement('div');
    box.className = 'ml-summaries';
    mountEl.appendChild(box);

    for (const k of order) {
      const rowSpec = rows[k] || {};

      const row = document.createElement('div');
      row.className = 'ml-summary-row';
      row.dataset.mfSummaryLabel = normText(rowSpec.label) || normText(k);
      row.dataset.mfSummaryOp = normText(rowSpec.op) || '';

      const lab = document.createElement('div');
      lab.className = 'ml-summary-label';
      lab.textContent = normText(rowSpec.label) || normText(k) || 'Summary';

      const val = document.createElement('div');
      val.className = 'ml-summary-value';

      // Stage 1: values are computed later (Stage 3). Provide a safe placeholder.
      const op = normText(rowSpec.op);
      val.textContent = (op === 'count' || op === 'count_non_na') ? '0' : '—';

      row.appendChild(lab);
      row.appendChild(val);
      box.appendChild(row);

      // Fast lookup for update(). Use the resolved row label as the key.
      const rowKey = normText(rowSpec.label) || normText(k);
      if (rowKey) local.nodes.set(rowKey, val);
    }

    // If a runtime is present, do an immediate best-effort update.
    // (Pipeline will also call update() on the next scheduled flush.)
    try {
      const rt = el && el.__mfRuntime;
      if (rt && typeof root.controls?.summaries?.update === 'function') {
        root.controls.summaries.update(mountEl, el, x, rt, gid, ctl, { reason: 'mount' });
      }
    } catch (_) {}
  }

  function renderValue(rowSpec, value, state) {
    const digits = Number.isFinite(+rowSpec.digits) ? (+rowSpec.digits | 0) : 0;
    const prefix = (rowSpec.prefix == null) ? '' : String(rowSpec.prefix);
    const suffix = (rowSpec.suffix == null) ? '' : String(rowSpec.suffix);

    if (value === null) return '—';
    if (value === 'NA') return 'NA';
    if (!Number.isFinite(value)) return '—';

    const txt = formatNumber(value, digits);
    return `${prefix}${txt}${suffix}`;
  }

  async function computeLayerMask(rt, x, layerId) {
    const entry = rt && rt.layers && typeof rt.layers.get === 'function' ? rt.layers.get(layerId) : null;
    const getRenderState = runtimeAssembly && typeof runtimeAssembly.getRenderState === 'function'
      ? runtimeAssembly.getRenderState
      : null;
    const getLogicalLayer = runtimeAssembly && typeof runtimeAssembly.getLogicalLayer === 'function'
      ? runtimeAssembly.getLogicalLayer
      : null;
    const readRenderField = runtimeAssembly && typeof runtimeAssembly.readRenderField === 'function'
      ? runtimeAssembly.readRenderField
      : null;

    const st = (getRenderState && entry ? getRenderState(entry) : null)
      || (getLogicalLayer && entry ? getLogicalLayer(entry) : null)
      || (x && x['.__layers'] ? x['.__layers'][layerId] : null);
    if (!st || typeof st !== 'object') {
      return { st: null, n: 0, passCount: 0, mask: null, indexers: null };
    }

    const n = inferFeatureCount(st) >>> 0;
    if (!n) return { st, n: 0, passCount: 0, mask: null, indexers: null };

    const indexers = (dataMod && typeof dataMod.getIndexers === 'function') ? dataMod.getIndexers(st) : null;
    const indexForArray = indexers && typeof indexers.indexForArray === 'function'
      ? indexers.indexForArray
      : ((arr, p) => (Number.isFinite(p) ? (p >>> 0) : 0));

    // If layer is force-hidden (e.g. select dim has no overlapping values), nothing passes.
    const forceHidden = readRenderField ? !!readRenderField(st, 'forceHidden') : !!st.__forceHidden;
    if (forceHidden) {
      const z = new Uint8Array(n);
      return { st, n, passCount: 0, mask: z, indexers };
    }

    const idx = rt && rt._filterIndex;
    const entryIdx = idx && idx.byLayer && typeof idx.byLayer.get === 'function' ? idx.byLayer.get(layerId) : null;
    const selDims = (entryIdx && Array.isArray(entryIdx.select)) ? entryIdx.select.slice(0, 4) : [];
    const rngDims = (entryIdx && Array.isArray(entryIdx.range))  ? entryIdx.range.slice(0, 4)  : [];

    if (!selDims.length && !rngDims.length) {
      // No filters affect this layer.
      return { st, n, passCount: n, mask: null, indexers };
    }

    const stateAll = (rt && rt.state && rt.state.filters && typeof rt.state.filters === 'object') ? rt.state.filters : {};
    const mask = new Uint8Array(n);
    mask.fill(1);

    // --- Select dims ---
    for (const dim of selDims) {
      const comp = dim && dim.comp ? dim.comp : {};
      const gid = normText(dim.groupId);
      const label = normText(dim.label);
      const groupState = (gid && stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
      const sel = groupState[label];

      // Empty selection disables the dim.
      let selected = null;
      if (sel instanceof Set && sel.size) selected = new Set(Array.from(sel, v => String(v)));
      else if (Array.isArray(sel) && sel.length) selected = new Set(sel.map(v => String(v)));
      if (!selected) continue;

      const dict = Array.isArray(comp.dict) ? comp.dict : [];
      const allowed = new Set();
      for (let i = 0; i < dict.length; i++) {
        if (selected.has(String(dict[i]))) allowed.add(i);
      }
      if (allowed.size === 0) {
        // Deterministic match-nothing.
        mask.fill(0);
        return { st, n, passCount: 0, mask, indexers };
      }

      let res = null;
      try {
        if (assets && typeof assets.resolveRefOrHref === 'function') {
          res = await assets.resolveRefOrHref(st, comp.codes || comp.values);
        }
      } catch (_) { res = null; }
      const codes = res && res.array;
      if (!codes || !ArrayBuffer.isView(codes)) continue;

      for (let p = 0; p < n; p++) {
        if (mask[p] === 0) continue;
        const ii = indexForArray(codes, p);
        const code = (codes && codes[ii] != null) ? (codes[ii] >>> 0) : 0;
        if (!allowed.has(code)) mask[p] = 0;
      }
    }

    // Early exit
    let passCount = 0;
    for (let i = 0; i < n; i++) passCount += (mask[i] ? 1 : 0);
    if (!passCount) return { st, n, passCount: 0, mask, indexers };

    // --- Range dims ---
    for (const dim of rngDims) {
      const comp = dim && dim.comp ? dim.comp : {};
      const gid = normText(dim.groupId);
      const label = normText(dim.label);

      const groupState = (gid && stateAll[gid] && typeof stateAll[gid] === 'object') ? stateAll[gid] : {};
      const r = groupState[label];
      let lo = null, hi = null;
      if (Array.isArray(r) && r.length >= 2) { lo = +r[0]; hi = +r[1]; }
      else {
        lo = Number.isFinite(+comp.min) ? +comp.min : (Number.isFinite(+comp.domain?.min) ? +comp.domain.min : 0);
        hi = Number.isFinite(+comp.max) ? +comp.max : (Number.isFinite(+comp.domain?.max) ? +comp.domain.max : lo);
      }
      if (!Number.isFinite(lo)) lo = 0;
      if (!Number.isFinite(hi)) hi = lo;
      if (lo > hi) { const t = lo; lo = hi; hi = t; }

      let res = null;
      try {
        if (assets && typeof assets.resolveRefOrHref === 'function') {
          res = await assets.resolveRefOrHref(st, comp.values || comp.codes);
        }
      } catch (_) { res = null; }
      const vals = res && res.array;
      if (!vals || !ArrayBuffer.isView(vals)) continue;

      for (let p = 0; p < n; p++) {
        if (mask[p] === 0) continue;
        const ii = indexForArray(vals, p);
        let v = vals ? vals[ii] : 0;
        // Mirror GPU accessor behavior (non-finite -> 0).
        if (!Number.isFinite(v)) v = 0;
        if (v < lo || v > hi) mask[p] = 0;
      }
    }

    passCount = 0;
    for (let i = 0; i < n; i++) passCount += (mask[i] ? 1 : 0);
    return { st, n, passCount, mask, indexers };
  }

  async function computeMemberPartial(op, rowSpec, comp, layerCtx) {
    const naRm = !!rowSpec.na_rm;
    const n = layerCtx.n >>> 0;
    const mask = layerCtx.mask;
    const indexers = layerCtx.indexers;
    const indexForArray = indexers && typeof indexers.indexForArray === 'function'
      ? indexers.indexForArray
      : ((arr, p) => (Number.isFinite(p) ? (p >>> 0) : 0));

    // count does not require values
    if (op === 'count') {
      return { kind: 'count', n: layerCtx.passCount >>> 0, empty: false, na: false };
    }

    const st = layerCtx.st;
    if (!st) return { kind: 'empty', empty: true, na: false };

    // Resolve values array
    let res = null;
    try {
      if (assets && typeof assets.resolveRefOrHref === 'function') {
        res = await assets.resolveRefOrHref(st, comp.values || comp.codes);
      }
    } catch (_) { res = null; }
    const arr = res && res.array;
    if (!arr || !ArrayBuffer.isView(arr)) {
      return { kind: 'empty', empty: true, na: false };
    }

    // Helpers
    const passes = (p) => (mask ? (mask[p] === 1) : true);

    if (op === 'count_non_na') {
      let nn = 0;
      for (let p = 0; p < n; p++) {
        if (!passes(p)) continue;
        const ii = indexForArray(arr, p);
        const v = arr[ii];
        if (Number.isFinite(v) && v > 0) nn += v;
      }
      return { kind: 'count', n: nn, empty: false, na: false };
    }

    if (op === 'sum' || op === 'mean') {
      let s = 0;
      let nn = 0;
      let sawNA = false;
      for (let p = 0; p < n; p++) {
        if (!passes(p)) continue;
        const ii = indexForArray(arr, p);
        const v = arr[ii];
        if (Number.isFinite(v)) {
          s += v;
          nn += 1;
        } else {
          if (!naRm) { sawNA = true; break; }
        }
      }
      if (sawNA) return { kind: 'na', na: true, empty: false };
      if (nn === 0) return { kind: 'empty', empty: true, na: false };
      return (op === 'sum')
        ? { kind: 'sum', s, n: nn, empty: false, na: false }
        : { kind: 'mean', s, n: nn, empty: false, na: false };
    }

    if (op === 'min' || op === 'max') {
      let best = (op === 'min') ? Infinity : -Infinity;
      let has = false;
      let sawNA = false;
      for (let p = 0; p < n; p++) {
        if (!passes(p)) continue;
        const ii = indexForArray(arr, p);
        const v = arr[ii];
        if (Number.isFinite(v)) {
          if (!has) { best = v; has = true; }
          else {
            if (op === 'min') { if (v < best) best = v; }
            else { if (v > best) best = v; }
          }
        } else {
          if (!naRm) { sawNA = true; break; }
        }
      }
      if (sawNA) return { kind: 'na', na: true, empty: false };
      if (!has) return { kind: 'empty', empty: true, na: false };
      return { kind: op, v: best, empty: false, na: false };
    }

    return { kind: 'empty', empty: true, na: false };
  }

  async function updateAsync(mountEl, el, x, rt, groupId, controlSpec, job) {
    if (!mountEl || !x || !rt) return;

    const gid = (groupId != null) ? String(groupId) : 'summaries';
    const ctl = controlSpec || (x && x['.__controls'] && x['.__controls'][gid]);
    if (!ctl || typeof ctl !== 'object' || String(ctl.type) !== 'summaries') return;

    const rows = (ctl.rows && typeof ctl.rows === 'object') ? ctl.rows : {};
    const order = buildRowOrder(rows, ctl.order);

    const local = ensureLocalState(mountEl);
    const seq = ++local.seq;

    // Build missing node index if needed
    if (!local.nodes || typeof local.nodes.get !== 'function' || !local.nodes.size) {
      local.nodes = new Map();
      try {
        const nodes = mountEl.querySelectorAll('.ml-summary-row');
        nodes && nodes.forEach(r => {
          const label = normText(r.dataset.mfSummaryLabel);
          const v = r.querySelector('.ml-summary-value');
          if (label && v) local.nodes.set(label, v);
        });
      } catch (_) {}
    }

    // Cache per-layer masks within this update
    const layerCache = new Map();
    const getLayer = async (layerId) => {
      const lid = normText(layerId);
      if (!lid) return { st: null, n: 0, passCount: 0, mask: null, indexers: null };
      if (layerCache.has(lid)) return layerCache.get(lid);
      const ctx = await computeLayerMask(rt, x, lid);
      layerCache.set(lid, ctx);
      return ctx;
    };

    const compsAll = (x && x['.__components'] && x['.__components'].summaries) ? x['.__components'].summaries : {};

    for (const k of order) {
      if (local.seq !== seq) return; // stale

      const rowSpec = rows[k] || {};
      const label = normText(rowSpec.label) || normText(k);
      const op = normText(rowSpec.op);
      const members = Array.isArray(rowSpec.members) ? rowSpec.members : [];

      const node = local.nodes.get(label);
      if (!node) continue;

      // Compute row value from members
      let outVal = null; // null => empty
      let outNA = false;

      if (op === 'count' || op === 'count_non_na') {
        let total = 0;
        for (const midRaw of members) {
          const mid = normText(midRaw);
          const comp = mid ? compsAll[mid] : null;
          if (!comp) continue;
          const ctx = await getLayer(comp.layer);
          if (local.seq !== seq) return;

          const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
          if (local.seq !== seq) return;

          if (partial.na) { outNA = true; break; }
          if (partial.kind === 'count') total += (+partial.n || 0);
        }
        if (outNA) outVal = 'NA';
        else outVal = total;
      } else if (op === 'sum') {
        let sTot = 0;
        let hasAny = false;
        for (const midRaw of members) {
          const mid = normText(midRaw);
          const comp = mid ? compsAll[mid] : null;
          if (!comp) continue;
          const ctx = await getLayer(comp.layer);
          if (local.seq !== seq) return;

          const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
          if (local.seq !== seq) return;

          if (partial.na) { outNA = true; break; }
          if (!partial.empty && partial.kind === 'sum') {
            sTot += (+partial.s || 0);
            hasAny = true;
          }
        }
        outVal = outNA ? 'NA' : (hasAny ? sTot : null);
      } else if (op === 'min' || op === 'max') {
        let best = (op === 'min') ? Infinity : -Infinity;
        let has = false;
        for (const midRaw of members) {
          const mid = normText(midRaw);
          const comp = mid ? compsAll[mid] : null;
          if (!comp) continue;
          const ctx = await getLayer(comp.layer);
          if (local.seq !== seq) return;

          const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
          if (local.seq !== seq) return;

          if (partial.na) { outNA = true; break; }
          if (!partial.empty && partial.kind === op) {
            const v = +partial.v;
            if (!Number.isFinite(v)) continue;
            if (!has) { best = v; has = true; }
            else {
              if (op === 'min') { if (v < best) best = v; }
              else { if (v > best) best = v; }
            }
          }
        }
        outVal = outNA ? 'NA' : (has ? best : null);
      } else if (op === 'mean') {
        let sTot = 0;
        let nTot = 0;
        for (const midRaw of members) {
          const mid = normText(midRaw);
          const comp = mid ? compsAll[mid] : null;
          if (!comp) continue;
          const ctx = await getLayer(comp.layer);
          if (local.seq !== seq) return;

          const partial = await computeMemberPartial(op, rowSpec, comp, ctx);
          if (local.seq !== seq) return;

          if (partial.na) { outNA = true; break; }
          if (!partial.empty && (partial.kind === 'mean')) {
            sTot += (+partial.s || 0);
            nTot += (+partial.n || 0);
          }
        }
        outVal = outNA ? 'NA' : (nTot > 0 ? (sTot / nTot) : null);
      } else {
        outVal = null;
      }

      const txt = renderValue(rowSpec, outVal, rt);
      if (node.textContent !== txt) node.textContent = txt;
    }
  }

  function update(mountEl, el, x, rt, groupId, controlSpec, job) {
    // Fire-and-forget async update; pipeline does not await.
    void updateAsync(mountEl, el, x, rt, groupId, controlSpec, job);
  }

  root.controls.summaries.render = render;
  root.controls.summaries.update = update;

  // Register with controls registry (if present)
  try {
    const reg = root.controls && root.controls.registry;
    if (reg && typeof reg.register === 'function') reg.register('summaries', { render, update });
  } catch (_) {}
})(window);
