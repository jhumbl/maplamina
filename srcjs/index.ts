// htmlwidgets entry point.

HTMLWidgets.widget({
  name: 'maplamina',
  type: 'output',
  factory(el, width, height) {
    const create = window.MAPLAMINA && window.MAPLAMINA.runtime && window.MAPLAMINA.runtime.widget
      ? window.MAPLAMINA.runtime.widget.create
      : null;

    const inst = (typeof create === 'function')
      ? create(el, width, height)
      : null;

    return {
      renderValue(x) {
        if (!inst || typeof inst.renderValue !== 'function') return;
        return inst.renderValue(x);
      },
      resize(width, height) {
        if (!inst || typeof inst.resize !== 'function') return;
        return inst.resize(width, height);
      },
      destroy() {
        if (!inst || typeof inst.destroy !== 'function') return;
        return inst.destroy();
      }
    };
  }
});
