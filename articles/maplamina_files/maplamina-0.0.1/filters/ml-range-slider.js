(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const noop  = () => {};

  function snapToStep(v, min, step) {
    if (!(step > 0) || !Number.isFinite(step)) return v;
    const k = Math.round((v - min) / step);
    return min + k * step;
  }

  // Map value <-> px helpers (guard zero-length)
  function valueToPx(v, min, max, left, width) {
    const span = Math.max(1e-9, max - min);
    return left + ((v - min) / span) * width;
  }
  function pxToValue(px, min, max, left, width) {
    const span = Math.max(1e-9, max - min);
    return min + ((px - left) / width) * span;
  }

  // ---------- main mount ----------
  function mount(container, opts) {
    const min  = Number.isFinite(opts.min)  ? Number(opts.min)  : 0;
    const max  = Number.isFinite(opts.max)  ? Number(opts.max)  : 1;
    const step = (opts.step == null || !Number.isFinite(+opts.step) || +opts.step <= 0) ? null : Number(opts.step);

    let [lo, hi] = Array.isArray(opts.value) && opts.value.length === 2
      ? [Number(opts.value[0]), Number(opts.value[1])]
      : [min, max];

    lo = clamp(lo, min, max);
    hi = clamp(hi, min, max);
    if (lo > hi) [lo, hi] = [hi, lo];

    const onInput  = typeof opts.onInput  === 'function' ? opts.onInput  : noop;
    const onCommit = typeof opts.onCommit === 'function' ? opts.onCommit : noop;

    // ---- DOM ----
    const wrap  = document.createElement('div'); wrap.className = 'ml-rngs';
    const track = document.createElement('div'); track.className = 'ml-rngs-track';
    const fill  = document.createElement('div'); fill.className  = 'ml-rngs-fill';
    const thLo  = document.createElement('div'); thLo.className  = 'ml-rngs-thumb';
    const thHi  = document.createElement('div'); thHi.className  = 'ml-rngs-thumb';

    // Accessibility attributes
    thLo.tabIndex = 0; thHi.tabIndex = 0;
    thLo.setAttribute('role', 'slider'); thHi.setAttribute('role', 'slider');
    function syncAria() {
      thLo.setAttribute('aria-valuemin', String(min));
      thLo.setAttribute('aria-valuemax', String(max));
      thLo.setAttribute('aria-valuenow', String(lo));
      thHi.setAttribute('aria-valuemin', String(min));
      thHi.setAttribute('aria-valuemax', String(max));
      thHi.setAttribute('aria-valuenow', String(hi));
    }

    wrap.appendChild(track);
    wrap.appendChild(fill);
    wrap.appendChild(thLo);
    wrap.appendChild(thHi);
    container.appendChild(wrap);

    // ---- geometry cache ----
    let rect = track.getBoundingClientRect();
    function refreshRect() { rect = track.getBoundingClientRect(); }

    // Keep UI synced to values
    function render() {
      const xLo = valueToPx(lo, min, max, 0, rect.width);
      const xHi = valueToPx(hi, min, max, 0, rect.width);
      const left = Math.min(xLo, xHi);
      const right = Math.max(xLo, xHi);
      thLo.style.left = xLo + 'px';
      thHi.style.left = xHi + 'px';
      fill.style.left = left + 'px';
      fill.style.width = (right - left) + 'px';
      syncAria();
    }

    // Initial layout (wait a frame so width is correct in flex containers)
    requestAnimationFrame(() => { refreshRect(); render(); });

    // ---- dragging state ----
    let dragging = null; // 'lo' | 'hi' | null
    let pointerId = null;

    function startDrag(which, ev) {
      dragging = which;
      pointerId = ev.pointerId;
      ev.target.setPointerCapture?.(pointerId);
      wrap.classList.add('ml-rngs--dragging');
      if (which === 'lo') { thLo.style.zIndex = '5'; thHi.style.zIndex = '4'; }
      else { thHi.style.zIndex = '5'; thLo.style.zIndex = '4'; }
    }

    function endDrag() {
      if (pointerId != null) {
        try { thLo.releasePointerCapture?.(pointerId); } catch(_) {}
        try { thHi.releasePointerCapture?.(pointerId); } catch(_) {}
      }
      pointerId = null;
      wrap.classList.remove('ml-rngs--dragging');
      dragging = null;
      onCommit([lo, hi]);
    }

    function handleMove(clientX) {
      const px = clamp(clientX - rect.left, 0, rect.width);
      let val  = pxToValue(px, min, max, 0, rect.width);
      val = snapToStep(val, min, step);
      if (dragging === 'lo') {
        lo = clamp(val, min, hi); // do not cross
      } else if (dragging === 'hi') {
        hi = clamp(val, lo, max); // do not cross
      }
      render();
      onInput([lo, hi]);
    }

    // pointer events on thumbs
    thLo.addEventListener('pointerdown', (ev) => { refreshRect(); startDrag('lo', ev); });
    thHi.addEventListener('pointerdown', (ev) => { refreshRect(); startDrag('hi', ev); });

    thLo.addEventListener('pointermove', (ev) => {
      if (dragging === 'lo' && ev.pointerId === pointerId) { handleMove(ev.clientX); ev.preventDefault(); }
    });
    thHi.addEventListener('pointermove', (ev) => {
      if (dragging === 'hi' && ev.pointerId === pointerId) { handleMove(ev.clientX); ev.preventDefault(); }
    });

    thLo.addEventListener('pointerup',   () => { if (dragging === 'lo') endDrag(); });
    thHi.addEventListener('pointerup',   () => { if (dragging === 'hi') endDrag(); });
    thLo.addEventListener('pointercancel', endDrag);
    thHi.addEventListener('pointercancel', endDrag);

    // click/drag on track picks nearest thumb
    track.addEventListener('pointerdown', (ev) => {
      refreshRect();
      const px = clamp(ev.clientX - rect.left, 0, rect.width);
      const val = snapToStep(pxToValue(px, min, max, 0, rect.width), min, step);
      const dLo = Math.abs(val - lo), dHi = Math.abs(val - hi);
      if (dLo <= dHi) { lo = clamp(val, min, hi); render(); onInput([lo, hi]); startDrag('lo', ev); }
      else            { hi = clamp(val, lo, max); render(); onInput([lo, hi]); startDrag('hi', ev); }
    });

    // keyboard support
    function keyStep(which, dir) {
      const delta = step || (max - min) / 100;
      if (which === 'lo') {
        const v = snapToStep(clamp(lo + dir * delta, min, hi), min, step);
        if (v !== lo) { lo = v; render(); onInput([lo, hi]); onCommit([lo, hi]); }
      } else {
        const v = snapToStep(clamp(hi + dir * delta, lo, max), min, step);
        if (v !== hi) { hi = v; render(); onInput([lo, hi]); onCommit([lo, hi]); }
      }
    }
    thLo.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft')  { keyStep('lo', -1); ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { keyStep('lo', +1); ev.preventDefault(); }
    });
    thHi.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft')  { keyStep('hi', -1); ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { keyStep('hi', +1); ev.preventDefault(); }
    });

    // keep in sync with layout changes
    const ro = new ResizeObserver(() => { refreshRect(); render(); });
    ro.observe(wrap);

    // ---- public API ----
    return {
      get isDragging() { return dragging != null; },
      update(newVals) {
        if (!Array.isArray(newVals) || newVals.length !== 2) return;
        let [nlo, nhi] = [Number(newVals[0]), Number(newVals[1])];
        nlo = clamp(nlo, min, max); nhi = clamp(nhi, min, max);
        if (nlo > nhi) [nlo, nhi] = [nhi, nlo];
        lo = snapToStep(nlo, min, step);
        hi = snapToStep(nhi, min, step);
        render();
      },
      destroy() {
        ro.disconnect();
        thLo.replaceWith(thLo.cloneNode(true));
        thHi.replaceWith(thHi.cloneNode(true));
        track.replaceWith(track.cloneNode(true));
        if (wrap.parentNode === container) container.removeChild(wrap);
      }
    };
  }

  root.rangeSlider = { mount };
})(window);
