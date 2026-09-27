import { depUrl } from '../core/assets';
import { getControlGroupIdsOrdered, getControlGroups, getPanelSpec } from '../core/spec';
import type { Control, Corner, Panel, PanelSection, Spec } from '../core/spec-types';
import { isFiniteNumber, normText, safeId, widgetKey } from '../core/utils';
import type { MountedControl, WidgetElement, WidgetRuntime } from '../core/widget';
import { ensurePanelHost, ensureStandaloneGroup, removePanelHost, removeStandaloneGroup } from './host';
import { getHandler } from './registry';
import type { ControlJob } from './registry';

// The panel and its sections as the code reads them. R emits neither `key` nor `order` on
// the panel and only `id` on a section; the other fields are read with fallbacks.
type PanelSource = Panel & { readonly key?: string; readonly order?: number };
type SectionSource = PanelSection & { readonly label?: string; readonly order?: number };

interface SlotOptions {
  label?: string;
  order?: number;
}

function ensureTitleRow(panelEl: HTMLElement, titleText: string): HTMLElement {
  let titleEl = panelEl.querySelector<HTMLElement>('.ml-panel-title');
  if (!titleEl) {
    titleEl = document.createElement('div');
    titleEl.className = 'ml-panel-title';
    panelEl.insertBefore(titleEl, panelEl.firstChild);
  }

  let tspan = titleEl.querySelector<HTMLElement>('.ml-panel-title-text');
  if (!tspan) {
    const existingText = (titleEl.textContent || '').trim();
    titleEl.textContent = '';
    tspan = document.createElement('span');
    tspan.className = 'ml-panel-title-text';
    tspan.textContent = existingText;
    titleEl.appendChild(tspan);
  }

  tspan.textContent = normText(titleText);
  return titleEl;
}

// panelSpec.icon is a URL. It is the image of the icon and the destination of its link.
function ensureTitleIconLink(panelEl: HTMLElement | null, panelSpec: Panel | null): void {
  if (!panelEl || !panelSpec) return;

  const resolveStr = (v: unknown): string => {
    const out = depUrl(v);
    return (typeof out === 'string') ? out.trim() : '';
  };

  const iconUrl = resolveStr(panelSpec.icon);
  const titleEl = panelEl.querySelector<HTMLElement>('.ml-panel-title');
  if (!titleEl) return;

  // If no icon URL, remove any previously created elements.
  if (!iconUrl) {
    const existingLink = titleEl.querySelector('.ml-panel-title-link');
    if (existingLink) { try { existingLink.remove(); } catch (_) {} }
    const strayIcon = titleEl.querySelector('.ml-panel-icon');
    if (strayIcon && (!strayIcon.closest || !strayIcon.closest('.ml-panel-title-link'))) {
      try { strayIcon.remove(); } catch (_) {}
    }
    return;
  }

  // Ensure link exists and sits before title text.
  let linkEl = titleEl.querySelector<HTMLAnchorElement>('.ml-panel-title-link');
  if (!linkEl) {
    linkEl = document.createElement('a');
    linkEl.className = 'ml-panel-title-link';
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.setAttribute('aria-label', 'Open icon link');

    const tspan = titleEl.querySelector('.ml-panel-title-text');
    if (tspan) titleEl.insertBefore(linkEl, tspan);
    else titleEl.insertBefore(linkEl, titleEl.firstChild);
  }

  linkEl.href = iconUrl;

  // Ensure image exists inside the link.
  let imgEl = linkEl.querySelector<HTMLImageElement>('.ml-panel-icon');
  if (!imgEl) {
    imgEl = document.createElement('img');
    imgEl.className = 'ml-panel-icon';
    imgEl.alt = '';
    linkEl.appendChild(imgEl);
  }

  imgEl.src = iconUrl;
}

function ensureDescription(panelEl: HTMLElement, descText: unknown): void {
  const txt = normText(descText);
  const existing = panelEl.querySelector('.ml-panel-description');
  if (txt) {
    if (existing) {
      existing.textContent = txt;
    } else {
      const desc = document.createElement('p');
      desc.className = 'ml-panel-description';
      desc.textContent = txt;
      const titleNode = panelEl.querySelector('.ml-panel-title');
      if (titleNode && titleNode.nextSibling) panelEl.insertBefore(desc, titleNode.nextSibling);
      else panelEl.appendChild(desc);
    }
  } else if (existing) {
    existing.remove();
  }
}

function reinsertSlot(panelEl: HTMLElement, slotEl: HTMLElement, orderNum: number): void {
  const others = Array.from(panelEl.querySelectorAll<HTMLElement>('.ml-panel-slot')).filter(n => n !== slotEl);
  let inserted = false;
  for (const n of others) {
    const o = Number(n.dataset.order);
    if (isFinite(o) && o > orderNum) {
      panelEl.insertBefore(slotEl, n);
      inserted = true;
      break;
    }
  }
  if (!inserted) panelEl.appendChild(slotEl);
}

function ensureSectionSlot(
  panelEl: HTMLElement,
  sid: string,
  groupId: string,
  opts?: SlotOptions | null
): HTMLElement | null {
  opts = opts || {};
  const label = normText(opts.label) || groupId;
  const orderNum = isFiniteNumber(opts.order) ? opts.order : 100;

  let slot = panelEl.querySelector<HTMLElement>(`#${sid}`);

  if (!slot) {
    slot = document.createElement('div');
    slot.id = sid;
    slot.className = `ml-panel-slot ml-panel-slot--${safeId(groupId)}`;
    slot.dataset.order = String(orderNum);

    const header = document.createElement('div');
    header.className = `ml-panel-section-title ml-panel-section-title--${safeId(groupId)}`;
    header.textContent = label;
    slot.appendChild(header);

    const body = document.createElement('div');
    body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
    slot.appendChild(body);

    panelEl.appendChild(slot);
    reinsertSlot(panelEl, slot, orderNum);
  } else {
    slot.dataset.order = String(orderNum);

    const header = slot.querySelector('.ml-panel-section-title');
    if (header) header.textContent = label;

    let body = slot.querySelector('.ml-panel-slot-body');
    if (!body) {
      body = document.createElement('div');
      body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
      slot.appendChild(body);
    } else {
      body.className = `ml-panel-slot-body ml-panel-${safeId(groupId)}`;
    }

    reinsertSlot(panelEl, slot, orderNum);
  }

  return slot.querySelector<HTMLElement>('.ml-panel-slot-body');
}

function applyBodyClasses(
  bodyEl: HTMLElement | null,
  groupId: string,
  controlSpec: Control | null | undefined
): void {
  if (!bodyEl) return;

  const gid = safeId(groupId);
  const typeRaw = controlSpec && controlSpec.type ? normText(controlSpec.type) : '';
  const typeId = typeRaw ? safeId(typeRaw) : '';

  // Always include group-scoped class; also include type-scoped class so CSS can target
  // `.ml-panel-views` / `.ml-panel-filters` regardless of bind/group id.
  const cls = ['ml-panel-slot-body', `ml-panel-${gid}`];
  if (typeId) {
    cls.push(`ml-panel-${typeId}`);
    cls.push(`ml-panel-type-${typeId}`);
    try { bodyEl.dataset.mfControlType = typeRaw; } catch (_) {}
  } else {
    try { delete bodyEl.dataset.mfControlType; } catch (_) {}
  }
  bodyEl.className = cls.join(' ');
}

function renderPlaceholder(
  mountEl: HTMLElement | null,
  groupId: string,
  controlSpec: Control | null | undefined,
  noteText?: string
): void {
  if (!mountEl) return;
  mountEl.textContent = '';

  const p = document.createElement('div');
  p.className = 'ml-controls-placeholder';

  const type = controlSpec && controlSpec.type ? normText(controlSpec.type) : 'control';

  const meta = document.createElement('div');
  meta.className = 'ml-controls-placeholder-meta';
  meta.textContent = `(${type}) wired via .__controls.${groupId}`;
  p.appendChild(meta);

  const note = document.createElement('div');
  note.className = 'ml-controls-placeholder-note';
  note.textContent = noteText || 'No renderer registered for this control type yet.';
  p.appendChild(note);

  mountEl.appendChild(p);
}

function renderGroup(
  mountEl: HTMLElement | null,
  el: WidgetElement,
  x: Spec,
  groupId: string,
  controlSpec: Control | null | undefined
): void {
  if (!mountEl) return;

  const type = controlSpec && controlSpec.type ? normText(controlSpec.type) : '';

  // Prefer registry dispatch by control type.
  let handler = null;
  if (type) handler = getHandler(type);
  const renderer = (handler && typeof handler.render === 'function') ? handler.render : null;

  if (renderer && typeof renderer === 'function') {
    try { renderer(mountEl, el, x, groupId, controlSpec); return; } catch (e) { console.error(e); return renderPlaceholder(mountEl, groupId, controlSpec, 'Renderer crashed — see console.'); }
  }

  renderPlaceholder(mountEl, groupId, controlSpec);
}

// Update hook for mounted control groups (no re-mount).
// Called by runtime pipeline when job.controls is set.
export function update(
  el: WidgetElement | null | undefined,
  x: Spec,
  rt: WidgetRuntime | null | undefined,
  job?: ControlJob | null
): void {
  if (!el) return;

  const mounted = (el.__mlMountedControls && typeof el.__mlMountedControls === 'object')
    ? el.__mlMountedControls
    : null;

  if (!mounted) return;

  for (const gid of Object.keys(mounted)) {
    const rec = mounted[gid];
    if (!rec || !rec.mountEl) continue;
    const controlSpec = rec.controlSpec;
    const type = controlSpec && controlSpec.type ? normText(controlSpec.type) : '';
    if (!type) continue;

    const handler = getHandler(type);
    const updater = (handler && typeof handler.update === 'function') ? handler.update : null;

    if (typeof updater === 'function') {
      try {
        updater(rec.mountEl, el, x, rt, gid, controlSpec, job);
      } catch (e) {
        try { console.error(e); } catch (_) {}
      }
    }
  }
}

// Standalone positioning: allow each control group to choose its own dock corner.
const ALL_CORNERS: readonly Corner[] = ['topleft', 'topright', 'bottomright', 'bottomleft'];

function normalizeCorner(pos: unknown, fallback: unknown): Corner {
  const p = String(pos || '').toLowerCase().trim();
  if (p === 'topleft' || p === 'topright' || p === 'bottomleft' || p === 'bottomright') return p;
  const fb = String(fallback || '').toLowerCase().trim();
  if (fb === 'topleft' || fb === 'topright' || fb === 'bottomleft' || fb === 'bottomright') return fb;
  return 'topleft';
}

function removeStandaloneOtherCorners(el: HTMLElement, groupId: string, keepCorner: unknown): void {
  const keep = normalizeCorner(keepCorner, 'topleft');
  for (const c of ALL_CORNERS) {
    if (c === keep) continue;
    try { removeStandaloneGroup(el, groupId, { corner: c }); } catch (_) {}
  }
}

function removeStandaloneAllCorners(el: HTMLElement, groupId: string): void {
  for (const c of ALL_CORNERS) {
    try { removeStandaloneGroup(el, groupId, { corner: c }); } catch (_) {}
  }
}

export function sync(el: WidgetElement, x: Spec): void {
  // Rebuild the mounted-groups index on each sync.
  const mountedNow: Record<string, MountedControl> = {};

  const controls = getControlGroups(x);

  // Panel order first (if present), then insertion order in .__controls.
  const allGroups = getControlGroupIdsOrdered(x);

  const panelSpec: PanelSource | null = getPanelSpec(x);
  const sections: readonly SectionSource[] | null = panelSpec && Array.isArray(panelSpec.sections) ? panelSpec.sections : null;

  // PANEL MOUNTING
  const panelGroups = new Set<string>();
  if (panelSpec && sections && sections.length) {
    const corner = normText(panelSpec.position) || 'topleft';
    const key = normText(panelSpec.key) || 'controls-panel';

    const panelHost = ensurePanelHost(el, {
      corner,
      key,
      order: isFiniteNumber(panelSpec.order) ? panelSpec.order : 10,
      className: 'ml-layer-panel ml-control-panel'
    });

    if (panelHost) {
      panelHost.id = panelHost.id || `ml-controls-panel-${widgetKey(el)}`;
      ensureTitleRow(panelHost, normText(panelSpec.title) || 'controls');
      ensureDescription(panelHost, panelSpec.description);

      try { ensureTitleIconLink(panelHost, panelSpec); } catch (e) { console.error(e); }

      // Create/update slots in declared order
      const seenSlots = new Set<string>();
      for (let i = 0; i < sections.length; i++) {
        const sec: Partial<SectionSource> = sections[i] || {};
        const gid = normText(sec.id);
        if (!gid) continue;

        panelGroups.add(gid);
        const sid = `ml-controls-slot-${widgetKey(el)}-${safeId(gid)}`;
        const body = ensureSectionSlot(panelHost, sid, gid, {
          label: normText(sec.label) || gid,
          order: isFiniteNumber(sec.order) ? sec.order : (10 + i * 10)
        });

        seenSlots.add(sid);

        // Ensure both group- and type-scoped classes are applied (e.g. ml-panel-views)
        applyBodyClasses(body, gid, controls[gid]);

        renderGroup(body, el, x, gid, controls[gid]);

        mountedNow[gid] = { mountEl: body, controlSpec: controls[gid] };
      }

      // Remove any slots not referenced anymore
      const existingSlots = Array.from(panelHost.querySelectorAll('.ml-panel-slot'));
      for (const slot of existingSlots) {
        if (!slot || !slot.id) continue;
        if (!seenSlots.has(slot.id)) {
          try { slot.remove(); } catch (_) {}
        }
      }
    }

    // Suppress standalone for panel-mounted groups (remove in all corners)
    for (const gid of panelGroups) {
      try { removeStandaloneAllCorners(el, gid); } catch (_) {}
    }
  } else {
    // No panel requested: remove panel host in all corners (best effort)
    for (const corner of ['topleft','topright','bottomright','bottomleft']) {
      try { removePanelHost(el, { corner, key: 'controls-panel' }); } catch (_) {}
    }
  }

  // STANDALONE MOUNTING
  const standaloneGroups = allGroups.filter(g => !panelGroups.has(g));
  const defaultStandaloneCorner = (panelSpec && normText(panelSpec.position)) ? normText(panelSpec.position) : 'topleft';

  // Track order per corner so each corner stacks deterministically.
  const cornerCount: Record<Corner, number> = { topleft: 0, topright: 0, bottomright: 0, bottomleft: 0 };

  // Ensure desired standalone groups exist
  for (let i = 0; i < standaloneGroups.length; i++) {
    const gid = standaloneGroups[i];
    const controlSpec: { readonly position?: Corner } = controls[gid] || {};
    const desiredCorner = normalizeCorner(controlSpec.position, defaultStandaloneCorner);

    // Avoid duplicates across corners: keep only the desired corner.
    try { removeStandaloneOtherCorners(el, gid, desiredCorner); } catch (_) {}

    const idx = Number.isFinite(cornerCount[desiredCorner]) ? cornerCount[desiredCorner] : 0;
    cornerCount[desiredCorner] = idx + 1;

    const container = ensureStandaloneGroup(el, gid, {
      corner: desiredCorner,
      order: 20 + idx * 5,
      className: 'ml-layer-panel ml-control-standalone'
    });

    if (container) {
      container.id = container.id || `ml-controls-standalone-${widgetKey(el)}-${safeId(gid)}`;

      // Standalone controls should be "bare": no bind-id title, no description,
      // and no slot wrapper (which would trigger divider chrome).
      try {
        const title = container.querySelector(':scope > .ml-panel-title');
        if (title) title.remove();
        const desc = container.querySelector(':scope > .ml-panel-description');
        if (desc) desc.remove();

        const slots = container.querySelectorAll(':scope > .ml-panel-slot');
        slots && slots.forEach(s => { try { s.remove(); } catch (_) {} });
      } catch (_) {}

      // Mount directly into a single body node.
      let body = container.querySelector<HTMLElement>(':scope > .ml-panel-slot-body');
      if (!body) {
        body = document.createElement('div');
        body.className = 'ml-panel-slot-body';
        container.appendChild(body);
      } else {
        body.className = 'ml-panel-slot-body';
      }

      // Apply group- and type-scoped classes so styling works even when bind != 'views'
      applyBodyClasses(body, gid, controls[gid]);

      renderGroup(body, el, x, gid, controls[gid]);

      mountedNow[gid] = { mountEl: body, controlSpec: controls[gid] };
    }
  }

  // Remove stale standalone nodes in the DOM (fallback path)
  try {
    const nodes = el.querySelectorAll<HTMLElement>('[data-mf-control-kind="standalone"]');
    nodes && nodes.forEach(n => {
      const gid = n.dataset.mfControlGroup;
      if (!gid) return;
      if (!standaloneGroups.includes(gid)) {
        try { removeStandaloneAllCorners(el, gid); } catch (_) {}
        try { n.remove(); } catch (_) {}
      }
    });
  } catch (_) {}

  // Expose mounted groups for update() calls.
  try { el.__mlMountedControls = mountedNow; } catch (_) {}
}

export function clear(el: WidgetElement): void {
  // Remove the panel host in all corners (best effort)
  for (const corner of ['topleft','topright','bottomright','bottomleft']) {
    try { removePanelHost(el, { corner, key: 'controls-panel' }); } catch (_) {}
  }

  // Remove standalone hosts (best-effort via attributes)
  try {
    const nodes = el.querySelectorAll<HTMLElement>('[data-mf-control-kind="standalone"]');
    nodes && nodes.forEach(n => {
      const gid = n.dataset.mfControlGroup;
      if (gid) {
        for (const corner of ['topleft','topright','bottomright','bottomleft']) {
          try { removeStandaloneGroup(el, gid, { corner }); } catch (_) {}
        }
      }
      try { n.remove(); } catch (_) {}
    });
  } catch (_) {}

  try { el.__mlMountedControls = {}; } catch (_) {}
}
