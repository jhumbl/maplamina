(function (global) {
  'use strict';
  const root = global.MAPLAMINA = global.MAPLAMINA || {};
  const core = root.core;
  if (!core || typeof core.require !== 'function') {
    throw new Error("[maplamina] Missing core.require; ensure ml-core.js is loaded before ml-icons.js");
  }

  const assets = core.require('assets', 'ml-icons.js');
  const depUrl = assets.depUrl;

  // Small curated set; add more as you like (128px+ intrinsic for crispness)
  // Anchors are [0..1] in icon box coords; "pin" tip anchor is (0.5, 1.0)
  const REG = {
    marker:           { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22marker%22%3E%0A%20%20%3Cpath%20d%3D%22M7.5%201C5.42312%201%203%202.2883%203%205.56759C3%207.79276%206.46156%2012.7117%207.5%2014C8.42309%2012.7117%2012%207.90993%2012%205.56759C12%202.2883%209.57688%201%207.5%201Z%22%2F%3E%0A%3C%2Fsvg%3E',  anchor: [0.5, 1.0], mask: true,  intrinsic: 128 },
    marker_stroked:   { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22marker-stroked%22%3E%0A%20%20%3Cpath%20d%3D%22M5.11697%202.81756C5.76952%202.26561%206.65195%202%207.5%202C8.34805%202%209.23048%202.26561%209.88303%202.81756C10.5075%203.34579%2011%204.20017%2011%205.56759C11%205.94031%2010.8461%206.52407%2010.5105%207.29145C10.1859%208.03354%209.73523%208.85087%209.24257%209.65811C8.64175%2010.6426%207.999%2011.5793%207.48195%2012.3097C6.96023%2011.5798%206.31599%2010.6233%205.71947%209.62296C5.2343%208.80934%204.79303%207.98717%204.47608%207.24844C4.14708%206.48162%204%205.91216%204%205.56759C4%204.20017%204.49248%203.34579%205.11697%202.81756ZM8.10767%2013.1554C9.45904%2011.2632%2012%207.54181%2012%205.56759C12%202.2883%209.57688%201%207.5%201C5.42312%201%203%202.2883%203%205.56759C3%207.44926%205.47533%2011.2572%206.86751%2013.1671C7.12165%2013.5157%207.3397%2013.8011%207.5%2014C7.55627%2013.9215%207.62241%2013.8299%207.697%2013.7266C7.81469%2013.5636%207.95343%2013.3714%208.10767%2013.1554Z%22%2F%3E%0A%3C%2Fsvg%3E',  anchor: [0.5, 1.0], mask: true,  intrinsic: 128 },
    circle:           { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20version%3D%221.1%22%20id%3D%22circle%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%3E%0A%20%20%3Cpath%20d%3D%22M14%2C7.5c0%2C3.5899-2.9101%2C6.5-6.5%2C6.5S1%2C11.0899%2C1%2C7.5S3.9101%2C1%2C7.5%2C1S14%2C3.9101%2C14%2C7.5z%22%2F%3E%0A%3C%2Fsvg%3E',  anchor: [0.5, 0.5], mask: true,  intrinsic: 128 },
    square:           { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22square%22%3E%0A%20%20%3Cpath%20d%3D%22M12%2013H3C2.4477%2013%202%2012.5523%202%2012V3C2%202.4477%202.4477%202%203%202H12C12.5523%202%2013%202.4477%2013%203V12C13%2012.5523%2012.5523%2013%2012%2013Z%22%2F%3E%0A%3C%2Fsvg%3E', anchor: [0.5, 0.5], mask: true,  intrinsic: 128 },
    triangle:         { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20width%3D%2215%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22triangle%22%3E%0A%20%20%3Cpath%20d%3D%22m7.5385%201c-.2948%200-.4883.1772-.6154.3846l-5.8462%209.5385c-.0769.0769-.0769.2307-.0769.3846%200%20.5385.3846.6923.6923.6923h11.6154c.3846%200%20.6923-.1538.6923-.6923%200-.1538%200-.2308-.0769-.3846l-5.7693-9.5385c-.1258-.2081-.3656-.3846-.6153-.3846z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.5], mask: true, intrinsic:128 },
    star:             { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20version%3D%221.1%22%20id%3D%22star%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%3E%0A%20%20%3Cpath%20id%3D%22path4749-2-8-2%22%20d%3D%22M7.5%2C0l-2%2C5h-5l4%2C3.5l-2%2C6l5-3.5%26%23xA%3B%26%23x9%3Bl5%2C3.5l-2-6l4-3.5h-5L7.5%2C0z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.5], mask: true, intrinsic:128 },
    heart:            { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20width%3D%2215%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22heart%22%3E%0A%20%20%3Cpath%20d%3D%22m13.91%207.75001c-1.17%202.24999-4.30002%205.30999-6.07002%206.93999-.1903.1718-.4797.1718-.67%200-1.78-1.63-4.91-4.69-6.08-6.93999-2.57-4.95%203.91-8.250002%206.41-3.3%202.5-4.950002%208.98002-1.65%206.41002%203.3z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.9], mask:true, intrinsic:128 },
    bicycle:          { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20version%3D%221.1%22%20id%3D%22bicycle%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%3E%0A%20%20%3Cpath%20id%3D%22path4668%22%20d%3D%22%26%23xA%3B%26%23x9%3BM7.5%2C2c-0.6761-0.01-0.6761%2C1.0096%2C0%2C1H9v1.2656l-2.8027%2C2.334L5.2226%2C4H5.5c0.6761%2C0.01%2C0.6761-1.0096%2C0-1h-2%26%23xA%3B%26%23x9%3Bc-0.6761-0.01-0.6761%2C1.0096%2C0%2C1h0.6523L5.043%2C6.375C4.5752%2C6.1424%2C4.0559%2C6%2C3.5%2C6C1.5729%2C6%2C0%2C7.5729%2C0%2C9.5S1.5729%2C13%2C3.5%2C13%26%23xA%3B%26%23x9%3BS7%2C11.4271%2C7%2C9.5c0-0.6699-0.2003-1.2911-0.5293-1.8242L9.291%2C5.3262l0.4629%2C1.1602C8.7114%2C7.0937%2C8%2C8.2112%2C8%2C9.5%26%23xA%3B%26%23x9%3Bc0%2C1.9271%2C1.5729%2C3.5%2C3.5%2C3.5S15%2C11.4271%2C15%2C9.5S13.4271%2C6%2C11.5%2C6c-0.2831%2C0-0.5544%2C0.0434-0.8184%2C0.1074L10%2C4.4023V2.5%26%23xA%3B%26%23x9%3Bc0-0.2761-0.2239-0.5-0.5-0.5H7.5z%20M3.5%2C7c0.5923%2C0%2C1.1276%2C0.2119%2C1.5547%2C0.5527l-1.875%2C1.5625%26%23xA%3B%26%23x9%3Bc-0.5109%2C0.4273%2C0.1278%2C1.1945%2C0.6406%2C0.7695l1.875-1.5625C5.8835%2C8.674%2C6%2C9.0711%2C6%2C9.5C6%2C10.8866%2C4.8866%2C12%2C3.5%2C12S1%2C10.8866%2C1%2C9.5%26%23xA%3B%26%23x9%3BS2.1133%2C7%2C3.5%2C7L3.5%2C7z%20M11.5%2C7C12.8866%2C7%2C14%2C8.1134%2C14%2C9.5S12.8866%2C12%2C11.5%2C12S9%2C10.8866%2C9%2C9.5c0-0.877%2C0.4468-1.6421%2C1.125-2.0879%26%23xA%3B%26%23x9%3Bl0.9102%2C2.2734c0.246%2C0.6231%2C1.1804%2C0.2501%2C0.9297-0.3711l-0.9082-2.2695C11.2009%2C7.0193%2C11.3481%2C7%2C11.5%2C7L11.5%2C7z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.5], mask:true, intrinsic:128 },
    car:              { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20id%3D%22car%22%20width%3D%2215%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%3E%0A%20%20%3Cpath%20d%3D%22M13.84%2C6.852%2C12.6%2C5.7%2C11.5%2C3.5a1.05%2C1.05%2C0%2C0%2C0-.9-.5H4.4a1.05%2C1.05%2C0%2C0%2C0-.9.5L2.4%2C5.7%2C1.16%2C6.852A.5.5%2C0%2C0%2C0%2C1%2C7.219V11.5a.5.5%2C0%2C0%2C0%2C.5.5h2c.2%2C0%2C.5-.2.5-.4V11h7v.5c0%2C.2.2.5.4.5h2.1a.5.5%2C0%2C0%2C0%2C.5-.5V7.219A.5.5%2C0%2C0%2C0%2C13.84%2C6.852ZM4.5%2C4h6l1%2C2h-8ZM5%2C8.6c0%2C.2-.3.4-.5.4H2.4C2.2%2C9%2C2%2C8.7%2C2%2C8.5V7.4c.1-.3.3-.5.6-.4l2%2C.4c.2%2C0%2C.4.3.4.5Zm8-.1c0%2C.2-.2.5-.4.5H10.5c-.2%2C0-.5-.2-.5-.4V7.9c0-.2.2-.5.4-.5l2-.4c.3-.1.5.1.6.4Z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.5], mask:true, intrinsic:128 },
    charging_station: { href: 'data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20id%3D%22charging-station%22%20height%3D%2215%22%20viewBox%3D%220%200%2015%2015%22%20width%3D%2215%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%20%20%3Cpath%20d%3D%22M2.64585%207.80112L7.75248%200.837532C7.90807%200.625354%208.15545%200.5%208.41856%200.5C8.9632%200.5%209.35876%201.01788%209.21546%201.54333L8.08612%205.68422C8.04275%205.84326%208.16247%206%208.32731%206H11.7466C12.1627%206%2012.5%206.3373%2012.5%206.75337C12.5%206.91361%2012.4489%207.06967%2012.3542%207.19888L7.24752%2014.1625C7.09193%2014.3746%206.84455%2014.5%206.58144%2014.5C6.0368%2014.5%205.64124%2013.9821%205.78454%2013.4567L6.91388%209.31578C6.95725%209.15674%206.83753%209%206.67269%209H3.25337C2.83729%209%202.5%208.66271%202.5%208.24663C2.5%208.08639%202.55109%207.93033%202.64585%207.80112Z%22%2F%3E%0A%3C%2Fsvg%3E', anchor:[0.5,0.5], mask:true, intrinsic:128 },
    geo_alt:          { href: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20fill%3D%22currentColor%22%20class%3D%22bi%20bi-geo-alt%22%20viewBox%3D%220%200%2016%2016%22%3E%0A%20%20%3Cpath%20d%3D%22M12.166%208.94c-.524%201.062-1.234%202.12-1.96%203.07A32%2032%200%200%201%208%2014.58a32%2032%200%200%201-2.206-2.57c-.726-.95-1.436-2.008-1.96-3.07C3.304%207.867%203%206.862%203%206a5%205%200%200%201%2010%200c0%20.862-.305%201.867-.834%202.94M8%2016s6-5.686%206-10A6%206%200%200%200%202%206c0%204.314%206%2010%206%2010%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M8%208a2%202%200%201%201%200-4%202%202%200%200%201%200%204m0%201a3%203%200%201%200%200-6%203%203%200%200%200%200%206%22%2F%3E%0A%3C%2Fsvg%3E%0A', anchor:[0.5,1.0], mask:true, intrinsic:128 },
    geo_alt_fill:     { href: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20fill%3D%22currentColor%22%20class%3D%22bi%20bi-geo-alt-fill%22%20viewBox%3D%220%200%2016%2016%22%3E%0A%20%20%3Cpath%20d%3D%22M8%2016s6-5.686%206-10A6%206%200%200%200%202%206c0%204.314%206%2010%206%2010m0-7a3%203%200%201%201%200-6%203%203%200%200%201%200%206%22%2F%3E%0A%3C%2Fsvg%3E%0A', anchor:[0.5,1.07], mask:true, intrinsic:128 }
  };

  function looksUrl(x){ return typeof x === 'string' && /^(https?:|data:)/i.test(x); }

  function resolveIcon(st){
    const cfg = (st && st.cfg) || {};
    const nameOrUrl = cfg.icon;

    // Helper: turn [0..1] ratios into pixel anchors given a side length
    const toPxAnchor = (ratio, side) => {
      const [rx, ry] = Array.isArray(ratio) ? ratio : [0.5, 1.0];
      return [Math.round(rx * side), Math.round(ry * side)];
    };

    // CHANGED: DPR-aware raster size (capped for perf)
    const dprCap = 2;
    const dpr    = Math.min(dprCap, (global.devicePixelRatio || 1));

    // Desired on-screen CSS size; fall back to entry.intrinsic (128) if not provided
    const cssSize = Number.isFinite(cfg.iconSize) ? cfg.iconSize : undefined;

    if (looksUrl(nameOrUrl)) {
      // External URL or data: URI
      const box   = cssSize || 128;                        // default CSS box
      const cell  = Math.ceil(box * dpr);                  // atlas cell size
      const arat  = Array.isArray(cfg.iconAnchor) ? cfg.iconAnchor : [0.5, 0.5];
      const [ax, ay] = toPxAnchor(arat, cell);
      const mask  = (cfg.mask !== false);
      return { url: depUrl(nameOrUrl), width: cell, height: cell, anchorX: ax, anchorY: ay, mask };
    }

    const ent = REG[String(nameOrUrl || 'marker').toLowerCase()] || null;
    if (ent) {
      const base  = cssSize || ent.intrinsic || 128;
      const cell  = Math.ceil(base * dpr);                 // CHANGED
      const arat  = Array.isArray(cfg.iconAnchor) ? cfg.iconAnchor : (ent.anchor || [0.5, 1.0]);
      const [ax, ay] = toPxAnchor(arat, cell);
      const mask  = (cfg.mask != null) ? !!cfg.mask : !!ent.mask;
      return { url: ent.href, width: cell, height: cell, anchorX: ax, anchorY: ay, mask }; // CHANGED: no depUrl() for data:
    }

    // CHANGED: Fallback to built-in marker data: URI, not a relative file
    console.warn('[maplamina][icons] unknown icon name, falling back to marker:', nameOrUrl);
    const base = cssSize || 128;
    const cell = Math.ceil(base * dpr);
    const [ax, ay] = toPxAnchor([0.5, 1.0], cell);
    return { url: REG.marker.href, width: cell, height: cell, anchorX: ax, anchorY: ay, mask: true };
  }

  root.icons = { resolveIcon };
})(window);
