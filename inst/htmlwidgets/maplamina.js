// maplamina adapter (Stage 4 refactor)
// The implementation lives in ml-runtime-widget.js (MAPLAMINA.runtime.widget.create).

HTMLWidgets.widget({
  name: 'maplamina',
  type: 'output',
  factory: function(el, width, height) {
    const create = window.MAPLAMINA && window.MAPLAMINA.runtime && window.MAPLAMINA.runtime.widget
      ? window.MAPLAMINA.runtime.widget.create
      : null;

    const inst = (typeof create === 'function')
      ? create(el, width, height)
      : null;

    return {
      renderValue: function(x) {
        //console.log(x);
        if (!inst || typeof inst.renderValue !== 'function') return;
        return inst.renderValue(x);
      },
      resize: function(width, height) {
        if (!inst || typeof inst.resize !== 'function') return;
        return inst.resize(width, height);
      },
      destroy: function() {
        if (!inst || typeof inst.destroy !== 'function') return;
        return inst.destroy();
      }
    };
  }
});
