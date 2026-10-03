// Helpers for driving a saved maplamina widget in Playwright.
import { PNG } from 'pngjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixtureUrl(name) {
  return pathToFileURL(path.resolve(here, '../fixtures/out', `${name}.html`)).href;
}

// Open a fixture and wait until `count` widgets have a runtime and a loaded basemap.
export async function openWidget(page, name, count = 1) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixtureUrl(name));
  await waitForWidgets(page, count);
  await page.waitForTimeout(1000);
  return { errors };
}

export async function waitForWidgets(page, count = 1) {
  await page.waitForFunction((n) => {
    const els = document.querySelectorAll('.maplamina');
    return els.length >= n && Array.from(els).slice(0, n).every((el) =>
      el.__mfRuntime && typeof el.__mfGetMap === 'function' && el.__mfGetMap().loaded());
  }, count, { timeout: 30000 });
}

// Screen position of a lon/lat in page coordinates, for the nth widget on the page.
export async function project(page, lon, lat, i = 0) {
  return page.evaluate(([lon, lat, i]) => {
    const el = document.querySelectorAll('.maplamina')[i];
    const map = el.__mfGetMap();
    const p = map.project([lon, lat]);
    const box = map.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, [lon, lat, i]);
}

export async function widgetBox(page, i = 0) {
  return page.evaluate((i) => {
    const r = document.querySelectorAll('.maplamina')[i].getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, i);
}

export async function mapZoom(page, i = 0) {
  return page.evaluate((i) => document.querySelectorAll('.maplamina')[i].__mfGetMap().getZoom(), i);
}

export async function screenshot(page) {
  return PNG.sync.read(await page.screenshot({ type: 'png' }));
}

export function pixel(png, x, y) {
  const i = (Math.round(y) * png.width + Math.round(x)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

export function near(rgb, target, tol = 40) {
  return rgb.slice(0, 3).every((v, i) => Math.abs(v - target[i]) < tol);
}

// Drawn radius of a filled circle centred at (x, y), in CSS px, by walking right from the
// centre until the fill colour ends. 0 if the centre is not the fill colour.
export function measureRadius(png, x, y, fill, tol = 40) {
  if (!near(pixel(png, x, y), fill, tol)) return 0;
  let r = 0;
  while (r < 80 && near(pixel(png, x + r + 1, y), fill, tol)) r++;
  return r;
}

// Sample fn(png) repeatedly for `ms` milliseconds after `action` runs.
export async function sampleAfter(page, action, ms, fn) {
  const t0 = Date.now();
  await action();
  const out = [];
  while (Date.now() - t0 < ms) {
    out.push({ t: Date.now() - t0, v: fn(await screenshot(page)) });
  }
  return out;
}

// Sample fn(png) once before `action` runs and then repeatedly after it, until done(value, first)
// holds or `cap` milliseconds have passed. The first sample is the state before the action, and
// a transition that starts late is followed to its end rather than cut off by a fixed window.
export async function sampleUntil(page, action, fn, done, cap = 8000) {
  const out = [{ t: 0, v: fn(await screenshot(page)) }];
  await action();
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    const v = fn(await screenshot(page));
    out.push({ t: Date.now() - t0, v });
    if (done(v, out[0].v)) break;
  }
  return out;
}

// True when a series of samples interpolated rather than jumped: at least one sample lies
// strictly between the first and last value, and the series moves in one direction (a wobble
// of `tol` px from anti-aliasing is tolerated). Robust to a slow frame eating part of the window.
export function animated(samples, tol = 1) {
  const v = samples.map((s) => s.v);
  const first = v[0], last = v[v.length - 1];
  if (first === last) return false;
  const lo = Math.min(first, last), hi = Math.max(first, last);
  const between = v.some((x) => x > lo && x < hi);
  const dir = Math.sign(last - first);
  const monotone = v.every((x, i) => i === 0 || (x - v[i - 1]) * dir >= -tol);
  return between && monotone;
}

export async function selectView(page, name, i = 0) {
  await widget(page, i).locator(`input[type=radio][value="${name}"]`).check();
}

// Locator for the nth widget root.
export function widget(page, i = 0) {
  return page.locator('.maplamina').nth(i);
}

// A pixel is "drawn" when it is saturated; the Positron basemap is grey and white.
export function drawn(rgb) {
  const [r, g, b] = rgb;
  return Math.max(r, g, b) - Math.min(r, g, b) > 60;
}

export function isDrawnAt(png, x, y) {
  return drawn(pixel(png, x, y));
}

// Drawn radius using the saturation test rather than one fill colour.
export function measureDrawnRadius(png, x, y) {
  if (!drawn(pixel(png, x, y))) return 0;
  let r = 0;
  while (r < 80 && drawn(pixel(png, x + r + 1, y))) r++;
  return r;
}

// Programmatic filter change through the runtime API (default filters group).
export async function setFilter(page, label, value) {
  await page.evaluate(([label, value]) => {
    document.querySelector('.maplamina').__mfRuntime.setFilter(label, value);
  }, [label, value]);
  await page.waitForTimeout(300);
}

// Toggle a select-filter option by its visible text (checkbox list or dropdown).
export async function toggleSelectOption(page, text, i = 0) {
  const root = widget(page, i);
  const option = root.locator('.ml-filter-option, .ml-dd-option').filter({ hasText: text }).first();
  if (!(await option.isVisible())) {
    await root.locator('.ml-dd-toggle').first().click();
    await option.waitFor({ state: 'visible', timeout: 5000 });
  }
  await option.locator('input').setChecked(!(await option.locator('input').isChecked()));
  await page.waitForTimeout(300);
}

export async function selectOptionChecked(page, text, i = 0) {
  return widget(page, i).locator('.ml-filter-option, .ml-dd-option').filter({ hasText: text }).first()
    .locator('input').isChecked();
}

// fit_bounds pins data to the viewport edges, where the panel and attribution cover it.
export async function zoomOut(page, delta = 2, i = 0) {
  await page.evaluate(([d, i]) => {
    const map = document.querySelectorAll('.maplamina')[i].__mfGetMap();
    map.jumpTo({ zoom: map.getZoom() - d });
  }, [delta, i]);
  await page.waitForTimeout(400);
}

// Hover a page point and return the tooltip text shown, or null. Icons are anchored above
// their point, so a few vertical offsets are tried before giving up.
export async function hoverTooltip(page, x, y, offsets = [0]) {
  for (const dy of offsets) {
    await page.mouse.move(x, y + dy);
    await page.waitForTimeout(250);
    const tt = page.locator('.ml-tt2:visible .ml-tt2__inner');
    if (await tt.count()) return (await tt.first().textContent()).trim();
  }
  return null;
}

export async function hideTooltip(page) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
}

// Click a page point and return the popup texts present afterwards (one entry per popup).
export async function clickPopup(page, x, y, offsets = [0]) {
  for (const dy of offsets) {
    await page.mouse.click(x, y + dy);
    await page.waitForTimeout(300);
    const texts = await popupTexts(page);
    if (texts.length) return texts;
  }
  return [];
}

export async function popupTexts(page) {
  return page.locator('.ml-popup').allTextContents().then((t) => t.map((s) => s.trim()));
}

export async function popupBox(page) {
  return page.locator('.ml-popup').first().boundingBox();
}

// Number of drawn pixels in the column above (x, y), for glyphs anchored at their bottom.
export function measureColumnAbove(png, x, y, up = 80) {
  let n = 0;
  for (let dy = 0; dy < up; dy++) if (drawn(pixel(png, x, y - dy))) n++;
  return n;
}

// Drawn thickness of a horizontal line through (x, y), in CSS px, walking up and down.
export function measureThickness(png, x, y) {
  if (!drawn(pixel(png, x, y))) return 0;
  let up = 0, down = 0;
  while (up < 80 && drawn(pixel(png, x, y - up - 1))) up++;
  while (down < 80 && drawn(pixel(png, x, y + down + 1))) down++;
  return up + down + 1;
}
