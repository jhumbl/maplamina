(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  root.runtime = root.runtime || {};
  root.runtime.assembly = root.runtime.assembly || {};

  function ensureRenderBucket(st) {
    if (!st || typeof st !== 'object') return null;
    const r0 = st.__render;
    const r = (r0 && typeof r0 === 'object') ? r0 : {};
    st.__render = r;
    return r;
  }

  function readRenderField(st, key) {
    const render = ensureRenderBucket(st);
    if (!render) return null;
    return Object.prototype.hasOwnProperty.call(render, key) ? render[key] : null;
  }

  function applyRenderPatch(st, patch) {
    if (!st || typeof st !== 'object') return st;
    const render = ensureRenderBucket(st);
    if (!render) return st;
    const p = (patch && typeof patch === 'object') ? patch : {};

    function setField(key, value) {
      if (value == null || value === false) {
        try { delete render[key]; } catch (_) {}
        return;
      }
      render[key] = value;
    }

    if (Object.prototype.hasOwnProperty.call(p, 'transitions')) setField('transitions', p.transitions);
    if (Object.prototype.hasOwnProperty.call(p, 'gpuFiltering')) setField('gpuFiltering', p.gpuFiltering);
    if (Object.prototype.hasOwnProperty.call(p, 'gpuMeta')) setField('gpuMeta', p.gpuMeta);
    if (Object.prototype.hasOwnProperty.call(p, 'forceHidden')) {
      if (p.forceHidden) render.forceHidden = true;
      else try { delete render.forceHidden; } catch (_) {}
    }

    return st;
  }

  function isPlainObject(x) {
    if (!x || typeof x !== 'object') return false;
    const proto = Object.getPrototypeOf(x);
    return proto === Object.prototype || proto === null;
  }

  function cloneLayerValue(x) {
    if (ArrayBuffer.isView(x)) return x;
    if (Array.isArray(x)) return x.map(cloneLayerValue);
    if (isPlainObject(x)) {
      const out = {};
      for (const k of Object.keys(x)) out[k] = cloneLayerValue(x[k]);
      return out;
    }
    return x;
  }

  function cloneLogicalLayer(logical, layerId) {
    if (!logical || typeof logical !== 'object') return null;
    const st = cloneLayerValue(logical);
    st.id = st.id || layerId || logical.id || null;
    return st;
  }

  async function prepareLogicalLayer(st0, layerId, core) {
    const st = cloneLogicalLayer(st0, layerId);
    if (!st) return null;
    if (core && typeof core.resolveActiveOnly === 'function') {
      await core.resolveActiveOnly(st);
    }
    return st;
  }

  function ensureLayerEntry(entry, logical) {
    const out = (entry && typeof entry === 'object') ? entry : {};
    if (!out.runtime || typeof out.runtime !== 'object') out.runtime = {};
    if (!out.cache || typeof out.cache !== 'object') out.cache = {};
    if (arguments.length > 1) out.logical = logical || null;
    if (!Object.prototype.hasOwnProperty.call(out, 'logical')) out.logical = null;
    if (!Object.prototype.hasOwnProperty.call(out.cache, 'lastRenderState')) out.cache.lastRenderState = null;
    return out;
  }

  function createLayerEntry(logical) {
    return ensureLayerEntry({}, logical || null);
  }

  function getLogicalLayer(entry) {
    return (entry && typeof entry === 'object') ? (entry.logical || null) : null;
  }

  function getRenderState(entry) {
    if (!entry || !entry.cache || typeof entry.cache !== 'object') return null;
    return entry.cache.lastRenderState || null;
  }

  function attachFilterContribution(st, contribution) {
    const c = (contribution && typeof contribution === 'object') ? contribution : null;
    return applyRenderPatch(st, {
      gpuFiltering: c ? c.gpuFiltering : null,
      gpuMeta: c ? c.gpuMeta : null,
      forceHidden: !!(c && c.forceHidden)
    });
  }

  async function collectFilterContribution(opts) {
    const getGPUFilterContribution = opts && opts.getGPUFilterContribution;
    if (typeof getGPUFilterContribution !== 'function') return null;
    return await getGPUFilterContribution(
      opts && opts.renderState,
      opts && opts.layerId,
      opts && opts.x,
      opts && opts.rt
    );
  }

  function attachTransitions(st, transitions) {
    return applyRenderPatch(st, { transitions: transitions || null });
  }

  async function assembleRenderState(opts) {
    const layerId = opts && opts.layerId;
    const core = opts && opts.core;
    const spec = opts && opts.spec;
    const rt = opts && opts.rt;
    const sourceState = opts && opts.sourceState;
    const logicalIn = (opts && Object.prototype.hasOwnProperty.call(opts, 'logical')) ? opts.logical : null;
    const prepareLogical = (opts && opts.prepareLogicalLayer) || prepareLogicalLayer;
    const cloneLayer = (opts && opts.cloneLogicalLayer) || cloneLogicalLayer;

    let logical = logicalIn || null;
    let logicalChanged = false;

    if (!logical) {
      logical = (typeof prepareLogical === 'function')
        ? await prepareLogical(sourceState, layerId, core)
        : (cloneLayer(sourceState, layerId) || Object.assign({}, sourceState || {}));
      logicalChanged = true;
    }

    let renderState = cloneLayer(logical, layerId) || Object.assign({}, logical || {});
    renderState.id = renderState.id || layerId;
    // Builder/runtime caches should live outside layer state (for example in widget ctx caches),
    // so renderState stays focused on render content rather than retained build artifacts.

    let viewOps = [];
    if (typeof (opts && opts.applyOrderedViewOps) === 'function') {
      const res = opts.applyOrderedViewOps(spec, renderState, layerId, opts.opsByLayer, opts.mergeEncodings, {
        prevByGroup: opts.prevByGroup,
        onOp: opts.onViewOp
      });
      renderState = (res && res.state) ? res.state : renderState;
      viewOps = (res && Array.isArray(res.ops)) ? res.ops : [];
    }

    if (viewOps.length && core && typeof core.resolveActiveOnly === 'function') {
      await core.resolveActiveOnly(renderState);
    }

    const filterContribution = await collectFilterContribution({
      renderState,
      layerId,
      x: opts && opts.x,
      rt,
      getGPUFilterContribution: opts && opts.getGPUFilterContribution
    });
    attachFilterContribution(renderState, filterContribution);
    attachTransitions(renderState, opts && opts.transitions);

    return {
      logical,
      renderState,
      logicalChanged,
      viewOps,
      filterContribution: filterContribution || null
    };
  }

  async function buildRenderArtifacts(opts) {
    const out = await assembleRenderState(opts || {});
    const layer = (opts && typeof opts.buildLayer === 'function') ? opts.buildLayer(out.renderState) : null;

    const entry = ensureLayerEntry(opts && opts.entry, out.logical);
    entry.logical = out.logical;
    entry.cache.lastRenderState = out.renderState || null;

    const pruneEmbeddedBlobs = (opts && opts.pruneEmbeddedBlobs)
      || (root.assets && typeof root.assets.pruneEmbeddedBlobs === 'function' ? root.assets.pruneEmbeddedBlobs : null);
    if (out.logicalChanged && typeof pruneEmbeddedBlobs === 'function') {
      try { pruneEmbeddedBlobs(out.logical); } catch (_) {}
    }
    if (opts && opts.core && typeof opts.core.resolveRemainingViewsIdle === 'function' && out.renderState) {
      opts.core.resolveRemainingViewsIdle(out.renderState);
    }

    return {
      logical: out.logical,
      renderState: out.renderState,
      logicalChanged: out.logicalChanged,
      viewOps: out.viewOps,
      filterContribution: out.filterContribution,
      layer,
      entry
    };
  }

  root.runtime.assembly.ensureRenderBucket = ensureRenderBucket;
  root.runtime.assembly.readRenderField = readRenderField;
  root.runtime.assembly.applyRenderPatch = applyRenderPatch;
  root.runtime.assembly.cloneLogicalLayer = cloneLogicalLayer;
  root.runtime.assembly.prepareLogicalLayer = prepareLogicalLayer;
  root.runtime.assembly.ensureLayerEntry = ensureLayerEntry;
  root.runtime.assembly.createLayerEntry = createLayerEntry;
  root.runtime.assembly.getLogicalLayer = getLogicalLayer;
  root.runtime.assembly.getRenderState = getRenderState;
  root.runtime.assembly.attachFilterContribution = attachFilterContribution;
  root.runtime.assembly.collectFilterContribution = collectFilterContribution;
  root.runtime.assembly.assembleRenderState = assembleRenderState;
  root.runtime.assembly.buildRenderArtifacts = buildRenderArtifacts;
})(window);
