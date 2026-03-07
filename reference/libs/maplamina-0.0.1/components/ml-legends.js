(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const RESERVED_SHAPES = new Set(['circle', 'square', 'line', 'icon']);

  const { asArray, normText } = root.utils;

  function clamp01(x) {
    return x < 0 ? 0 : (x > 1 ? 1 : x);
  }

  // Position ticks/labels in the axis; anchor end labels so they don't clip outside the legend card.
  // Note: CSS uses !important on transform, so we control it via a CSS variable.
  function setAxisPos(node, pct01) {
    const p = clamp01(+pct01 || 0);
    node.style.left = (p * 100) + '%';

    if (p <= 0.0001) node.style.setProperty('--ml-legend-xform', 'translateX(0)');
    else if (p >= 0.9999) node.style.setProperty('--ml-legend-xform', 'translateX(-100%)');
    else node.style.removeProperty('--ml-legend-xform');
  }

  function midColor(gradient) {
    const g = asArray(gradient);
    if (!g.length) return '#666';
    return normalizeColor(g[Math.floor(g.length / 2)] || g[g.length - 1] || '#666');
  }

  // R has color names like "grey40"/"gray40" which browsers don't understand.
  // Support a minimal subset so legends look right without forcing R-side conversion.
  function normalizeColor(c) {
    if (c == null) return c;
    const s = String(c).trim();
    if (!s) return s;

    const m = /^(gr(?:a|e)y)(\d{1,3})$/i.exec(s);
    if (m) {
      let p = parseInt(m[2], 10);
      if (!Number.isFinite(p)) return s;
      p = Math.max(0, Math.min(100, p));
      const v = Math.round(255 * (p / 100));
      return `rgb(${v}, ${v}, ${v})`;
    }

    return s;
  }

  /**
   * NEW: Resolve glyph spec.
   *
   * If shape is one of {circle,square,line,icon}, keep it.
   * Otherwise, treat shape as an ICON ID and return {shape:'icon', icon: shape}.
   *
   * This lets users write shapes=c('circle','square','line','geo_alt_fill') on the R side
   * without needing a separate icons vector.
   */
  function resolveGlyph(shape, icon) {
    const raw = (shape == null) ? '' : String(shape).trim();
    if (!raw) return { shape: 'square', icon: icon || null };

    const low = raw.toLowerCase();
    if (RESERVED_SHAPES.has(low)) {
      if (low === 'icon') return { shape: 'icon', icon: icon || null };
      return { shape: low, icon: icon || null };
    }

    // Not a reserved shape keyword -> treat as icon name
    return { shape: 'icon', icon: raw };
  }

  function makeSwatch(shape, size, color, iconName) {
    const sw = document.createElement('span');
    const sh = String(shape || 'square').toLowerCase();
    const col = normalizeColor(color) || '#666';
    const px = Number.isFinite(+size) ? Math.max(6, +size) : 12;

    sw.className = `ml-legend-swatch ml-legend-swatch--${sh}`;

    if (sh === 'line') {
      sw.style.width = Math.max(18, Math.round(px * 2)) + 'px';
      sw.style.height = Math.max(2, Math.round(px / 6)) + 'px';
      sw.style.background = col;
      sw.style.borderRadius = '2px';
      return sw;
    }

    sw.style.width = px + 'px';
    sw.style.height = px + 'px';

    if (sh === 'circle') sw.style.borderRadius = '50%';
    else if (sh === 'square') sw.style.borderRadius = '2px';

    if (sh === 'icon') {
      const icons = root.icons;
      const resolved = icons && typeof icons.resolveIcon === 'function'
        ? icons.resolveIcon({ cfg: { icon: iconName || 'marker', iconSize: px, mask: true } })
        : null;

      if (resolved && resolved.url && (resolved.mask !== false)) {
        // Use mask-image so we can colorize icons from the local registry
        sw.style.backgroundColor = col; // can be 'currentColor'
        sw.style.webkitMaskImage = `url("${resolved.url}")`;
        sw.style.maskImage = `url("${resolved.url}")`;
        sw.style.webkitMaskRepeat = 'no-repeat';
        sw.style.maskRepeat = 'no-repeat';
        sw.style.webkitMaskPosition = 'center';
        sw.style.maskPosition = 'center';
        sw.style.webkitMaskSize = 'contain';
        sw.style.maskSize = 'contain';
      } else if (resolved && resolved.url) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = resolved.url;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        sw.appendChild(img);
      } else {
        sw.style.backgroundColor = col;
        sw.style.borderRadius = '2px';
      }
      return sw;
    }

    sw.style.background = col;
    return sw;
  }

  function buildCategorical(legend) {
    const items = asArray(legend.items);
    const body = document.createElement('div');
    body.className = 'ml-legend-body ml-legend-body--categorical';

    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'ml-legend-row';

      const size = (it.size != null ? it.size : legend.size) || 12;
      const glyph = resolveGlyph(it.shape || legend.shape || 'square', it.icon || legend.icon);

      const sw = makeSwatch(
        glyph.shape,
        size,
        it.color,
        glyph.icon
      );

      const lab = document.createElement('span');
      lab.className = 'ml-legend-label';
      lab.textContent = normText(it.label);

      row.appendChild(sw);
      row.appendChild(lab);
      body.appendChild(row);
    }

    return body;
  }

  function buildContinuous(legend) {
    const body = document.createElement('div');
    body.className = 'ml-legend-body ml-legend-body--continuous';

    const scale = legend.scale || {};
    const rng = asArray(scale.range);
    const min = (rng.length >= 2) ? +rng[0] : 0;
    const max = (rng.length >= 2) ? +rng[1] : 1;
    const denom = (max - min) || 1;

    const grad = asArray(scale.gradient).map(normalizeColor);
    const labels = asArray(scale.labels);
    const breaks = (scale.breaks == null) ? null : asArray(scale.breaks);

    const wrap = document.createElement('div');
    wrap.className = 'ml-legend-gradient-wrap';

    const barWrap = document.createElement('div');
    barWrap.className = 'ml-legend-gradient-barwrap';

    const bar = document.createElement('div');
    bar.className = 'ml-legend-gradient';

    // Apply legend.size as the thickness of the continuous bar.
    // CSS uses !important, so we drive height via CSS var.
    const barH = Number.isFinite(+legend.size) ? Math.max(2, +legend.size) : 12;
    bar.style.setProperty('--ml-legend-bar-h', barH + 'px');

    if (grad.length >= 2) {
      bar.style.background = `linear-gradient(90deg, ${grad.join(', ')})`;
    } else {
      bar.style.background = midColor(grad);
    }

    // Optional glyph: keep MVP clean; only show for icon ramps.
    // UPDATED: icon ramps can now be expressed as shape = 'icon' OR shape = '<iconName>'.
    const glyph = resolveGlyph(legend.shape || '', legend.icon);
    if (glyph.shape === 'icon') {
      // Use a neutral "ink" color (currentColor) rather than gradient tint.
      const hint = makeSwatch('icon', legend.size || 12, 'currentColor', glyph.icon);
      hint.classList.add('ml-legend-swatch--hint');
      wrap.appendChild(hint);
    }

    barWrap.appendChild(bar);

    // Axis (ticks + labels)
    const axis = document.createElement('div');
    axis.className = 'ml-legend-axis';

    const tickValues = (breaks && breaks.length) ? breaks : null;
    const tickLabels = labels.length ? labels : null;

    if (tickValues && tickValues.length) {
      // Render ticks at break positions
      for (let i = 0; i < tickValues.length; i++) {
        const v = +tickValues[i];
        const pct = Math.max(0, Math.min(1, (v - min) / denom));

        const tick = document.createElement('div');
        tick.className = 'ml-legend-tick';
        setAxisPos(tick, pct);
        axis.appendChild(tick);
      }

      if (tickLabels && tickLabels.length) {
        // Label logic:
        // - If labels length equals breaks length, label every break.
        // - Otherwise, distribute labels across the break list so they align to *some* ticks.
        if (tickLabels.length === tickValues.length) {
          for (let i = 0; i < tickValues.length; i++) {
            const v = +tickValues[i];
            const pct = Math.max(0, Math.min(1, (v - min) / denom));

            const tl = document.createElement('div');
            tl.className = 'ml-legend-tick-label';
            setAxisPos(tl, pct);
            tl.textContent = normText(tickLabels[i]);
            axis.appendChild(tl);
          }
        } else {
          const nT = tickValues.length >>> 0;
          const nL = tickLabels.length >>> 0;

          // If more labels than ticks, label the first nT ticks.
          if (nL >= nT) {
            for (let i = 0; i < nT; i++) {
              const v = +tickValues[i];
              const pct = Math.max(0, Math.min(1, (v - min) / denom));

              const tl = document.createElement('div');
              tl.className = 'ml-legend-tick-label';
              setAxisPos(tl, pct);
              tl.textContent = normText(tickLabels[i]);
              axis.appendChild(tl);
            }
          } else {
            // Choose indices across breaks (rounded), then ensure uniqueness.
            const idxs = [];
            if (nL === 1) {
              idxs.push(Math.floor((nT - 1) / 2));
            } else {
              for (let j = 0; j < nL; j++) {
                idxs.push(Math.round(j * (nT - 1) / (nL - 1)));
              }
            }

            const used = new Set();
            for (let j = 0; j < idxs.length; j++) {
              let k = idxs[j];

              // Bump to nearest available index if duplicate
              while (used.has(k) && k < nT - 1) k++;
              while (used.has(k) && k > 0) k--;

              used.add(k);

              const v = +tickValues[k];
              const pct = Math.max(0, Math.min(1, (v - min) / denom));

              const tl = document.createElement('div');
              tl.className = 'ml-legend-tick-label';
              setAxisPos(tl, pct);
              tl.textContent = normText(tickLabels[j]);
              axis.appendChild(tl);
            }
          }
        }
      }
    } else if (tickLabels && tickLabels.length) {
      // Evenly spaced labels (and ticks)
      for (let i = 0; i < tickLabels.length; i++) {
        const pct = (tickLabels.length === 1) ? 0.5 : (i / (tickLabels.length - 1));

        const tick = document.createElement('div');
        tick.className = 'ml-legend-tick';
        setAxisPos(tick, pct);
        axis.appendChild(tick);

        const tl = document.createElement('div');
        tl.className = 'ml-legend-tick-label';
        setAxisPos(tl, pct);
        tl.textContent = normText(tickLabels[i]);
        axis.appendChild(tl);
      }
    }

    barWrap.appendChild(axis);
    wrap.appendChild(barWrap);
    body.appendChild(wrap);

    return body;
  }


  // v3: legends are stored as components in spec['.__components'].legends:
  //   { id, bind, position, when, legend: { title, type, items, scale, ... } }
  // Normalize the component into a single flat legend spec used by the renderer + visibility logic.
  function normalizeLegendSpec(input) {
    // v3-only: legend specs must arrive as a component object:
    //   { id, bind, position, when, legend: { title, type, items, scale, ... } }
    // We intentionally do NOT support legacy flat payloads here.
    if (!input || typeof input !== 'object') return {};

    const hasLegend = (input.legend && typeof input.legend === 'object');
    if (!hasLegend) {
      try { console.warn('[maplamina][legends] invalid legend component (missing .legend object):', input); } catch (_) {}
      return {};
    }

    const payload = input.legend;
    const out = Object.assign({}, payload);

    // Component-level metadata is authoritative.
    if (input.id != null) out.id = input.id;
    if (input.bind != null) out.bind = input.bind;
    if (input.position != null) out.position = input.position;
    if (input.when != null) out.when = input.when;

    // Ensure id exists if provided only in payload.
    if (out.id == null && payload && payload.id != null) out.id = payload.id;

    return out;
  }


  function buildLegendCard(legend) {
    legend = normalizeLegendSpec(legend);
    const card = document.createElement('div');
    card.className = 'ml-legend';
    card.dataset.legendId = normText(legend.id || '');
    card.__mfLegendSpec = legend;

    if (legend.title) {
      const t = document.createElement('div');
      t.className = 'ml-legend-title';
      t.textContent = normText(legend.title);
      card.appendChild(t);
    }

    const ty = String(legend.type || '').toLowerCase();
    if (ty === 'categorical') {
      card.appendChild(buildCategorical(legend));
    } else if (ty === 'continuous') {
      card.appendChild(buildContinuous(legend));
    } else {
      const msg = document.createElement('div');
      msg.className = 'ml-legend-body';
      msg.textContent = 'Unknown legend type';
      card.appendChild(msg);
    }

    return card;
  }

  function applyVisibility(el, spec) {
    if (!el) return;

    const nodes = el.querySelectorAll('.ml-legend');
    const layers = (spec && spec['.__layers']) || {};
    const controls = (spec && spec['.__controls']) || {};

    const rt = el.__mfRuntime;
    const stateViews = (rt && rt.state && rt.state.views && typeof rt.state.views === 'object')
      ? rt.state.views
      : {};

    // v3: derive per-layer active view from runtime state + views components.
    // This avoids relying on any derived fields being written onto spec['.__layers'].
    let activeByLayer = new Map();
    try {
      const activeByGroup = {};
      const orderedIds = getOrderedControlGroupIds(spec, controls || {});
      for (const gidRaw of orderedIds) {
        const gid = normText(gidRaw);
        const ctl = controls ? controls[gidRaw] : null;
        if (!gid || !ctl || typeof ctl !== 'object') continue;
        if (normText(ctl.type) !== 'views') continue;

        const viewNames = asArray(ctl.view_names).map(normText).filter(Boolean);
        const cur = normText(stateViews[gid]);
        const def = normText(ctl.default);

        let pick = 'base';
        if (cur && (!viewNames.length || viewNames.includes(cur))) pick = cur;
        else if (def && (!viewNames.length || viewNames.includes(def))) pick = def;
        else if (viewNames.length) pick = viewNames[0];

        activeByGroup[gid] = pick;
      }

      if (root.views && typeof root.views.computeViewOpsByLayer === 'function') {
        const ops = root.views.computeViewOpsByLayer(spec, activeByGroup);
        if (ops && ops.activeByLayer && typeof ops.activeByLayer.get === 'function') {
          activeByLayer = ops.activeByLayer;
        }
      }
    } catch (_) {}



    function getOrderedControlGroupIds(spec, controlsObj) {
      const controls = controlsObj || {};
    
      const panel = (spec && spec['.__panel']) || {};
      const sections = Array.isArray(panel.sections) ? panel.sections : [];
    
      const out = [];
      const seen = new Set();
    
      for (const s of sections) {
        if (!s || typeof s !== 'object') continue;
        const sid = normText(s.id != null ? s.id : (s.bind != null ? s.bind : (s.name != null ? s.name : '')));
        if (!sid || seen.has(sid)) continue;
        if (Object.prototype.hasOwnProperty.call(controls, sid)) { out.push(sid); seen.add(sid); }
      }
    
      // Insertion order fallback
      for (const k of Object.keys(controls)) {
        const sid = normText(k);
        if (!sid || seen.has(sid)) continue;
        out.push(sid); seen.add(sid);
      }
    
      return out;
    }

    const asViewList = (x) => {
      if (x == null) return null;
      if (Array.isArray(x)) {
        const out = x.map(v => normText(v)).filter(Boolean);
        return out.length ? out : null;
      }
      // htmlwidgets auto_unbox may give a scalar string for length-1 vectors
      const s = normText(x);
      return s ? [s] : null;
    };

    function pickGlobalActiveView() {
      // Pick a deterministic "global" view selection used when when.view is set
      // but when.layer is not.
      const groups = [];

      const orderedIds = getOrderedControlGroupIds(spec, controls || {});
      for (const gidRaw of orderedIds) {
        const gid = normText(gidRaw);
        const ctl = controls ? controls[gidRaw] : null;
        if (!gid || !ctl || typeof ctl !== 'object') continue;
        if (normText(ctl.type) === 'views') groups.push({ gid, ctl });
      }

      if (!groups.length) return 'base';

      const pref = groups.find(g => g.gid === 'views') || groups[0];
      const gid = pref.gid;
      const ctl = pref.ctl || {};

      const viewNames = asArray(ctl.view_names).map(normText).filter(Boolean);

      const cur = normText(stateViews[gid]);
      if (cur && (!viewNames.length || viewNames.includes(cur))) return cur;

      const def = normText(ctl.default);
      if (def && (!viewNames.length || viewNames.includes(def))) return def;

      if (viewNames.length) return viewNames[0];
      return 'base';
    }

    const globalActiveView = pickGlobalActiveView();

    nodes.forEach(node => {
      const lg = node.__mfLegendSpec;
      let show = true;

      const w = (lg && lg.when && typeof lg.when === 'object') ? lg.when : null;
      if (w) {
        const layerId = normText(w.layer);

        // when.layer => legend only shows if layer exists (and is visible, if that concept exists)
        if (layerId) {
          const st = layers ? layers[layerId] : null;
          if (!st) {
            show = false;
          } else if (st.visible === false) {
            show = false;
          }
        }

        // when.view => legend only shows if active view matches any listed view names
        const views = asViewList(w.view);
        if (show && views && views.length) {
          let active = null;

          if (layerId) {
            active = normText(activeByLayer.get(layerId)) || 'base';
          } else {
            active = globalActiveView || 'base';
          }

          if (!views.includes(active)) show = false;
        }
      }

      node.style.display = show ? '' : 'none';
    });

    // Stage 2.1: hide empty legend containers so control-group shells don't linger when all
    // member legends are hidden by when/view logic.
    try {
      const stacks = el.querySelectorAll('.ml-legend-stack');
      stacks.forEach(stack => {
        // Only auto-hide containers that actually contain legend cards.
        const cards = stack.querySelectorAll(':scope > .ml-legend');
        if (!cards || cards.length === 0) return;

        let anyVisible = false;
        cards.forEach(card => {
          if (anyVisible) return;
          if (card && card.style && card.style.display !== 'none') anyVisible = true;
        });

        // Prefer hiding the outer control shell (panel slot or standalone dock item).
        const wrapper =
          stack.closest('.ml-panel-slot') ||
          stack.closest('[data-ml-control-kind="standalone"]') ||
          stack.closest('.ml-legends-host') ||
          stack;

        if (!wrapper || !wrapper.style) return;
        // Avoid forcing a specific display type; remove inline override when visible.
        wrapper.style.display = anyVisible ? '' : 'none';
      });
    } catch (_) {}
  }

  root.legends = {
  // v3: legends are rendered via the controls system (type: "legends").
  // The old overlay renderer has been disabled; keep no-op stubs for safety.
  render: function () {},
  destroy: function () {},
  applyVisibility,
  buildLegendCard
};
})(window);
