// Scenarios S1, S2, S8, T5, C5, C7, C8 from notes/regression-scenarios.md: pages rather than single widgets.
import { test, expect } from '@playwright/test';
import {
  openWidget, waitForWidgets, project, screenshot, isDrawnAt, measureDrawnRadius, selectView,
  toggleSelectOption, selectOptionChecked, zoomOut, widgetBox, mapZoom, hoverTooltip, hideTooltip,
  clickPopup, popupBox, setFilter,
} from '../lib/widget.mjs';

async function twoWidgets(page) {
  const { errors } = await openWidget(page, 'page-two-widgets', 2);
  await zoomOut(page, 2, 0);
  await zoomOut(page, 2, 1);
  const w1 = { a: await project(page, -0.02, 51.5, 0), b: await project(page, 0.02, 51.5, 0) };
  const w2 = { a: await project(page, -0.02, 51.5, 1), b: await project(page, 0.02, 51.5, 1) };
  return { errors, w1, w2 };
}

test('S2: view controls on one widget do not drive the other', async ({ page }) => {
  const { errors, w1, w2 } = await twoWidgets(page);
  let png = await screenshot(page);
  const r1 = measureDrawnRadius(png, w1.a.x, w1.a.y);
  const r2 = measureDrawnRadius(png, w2.a.x, w2.a.y);
  expect(r1).toBeGreaterThan(8);
  expect(r2).toBeGreaterThan(8);

  await selectView(page, 'small', 1);
  await page.waitForTimeout(500);
  png = await screenshot(page);
  expect(measureDrawnRadius(png, w2.a.x, w2.a.y), 'second widget shrank').toBeLessThan(6);
  expect(measureDrawnRadius(png, w1.a.x, w1.a.y), 'first widget unchanged').toBe(r1);
  expect(errors).toEqual([]);
});

test('S2: select filters on one widget do not filter the other', async ({ page }) => {
  const { w1, w2 } = await twoWidgets(page);
  await toggleSelectOption(page, 'gamma', 1);
  const png = await screenshot(page);
  expect(isDrawnAt(png, w2.a.x, w2.a.y), 'gamma visible').toBe(true);
  expect(isDrawnAt(png, w2.b.x, w2.b.y), 'delta hidden').toBe(false);
  expect(isDrawnAt(png, w1.a.x, w1.a.y), 'alpha still visible').toBe(true);
  expect(isDrawnAt(png, w1.b.x, w1.b.y), 'beta still visible').toBe(true);
  expect(await selectOptionChecked(page, 'alpha', 0)).toBe(false);
});

test('S2: two widgets on one page produce no duplicate DOM ids', async ({ page }) => {
  await openWidget(page, 'page-two-widgets', 2);
  const dupes = await page.evaluate(() => {
    const seen = new Map();
    for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id).sort();
  });
  expect(dupes).toEqual([]);
});

test("S2: tooltips on each widget show that widget's data", async ({ page }) => {
  const { w1, w2 } = await twoWidgets(page);
  expect(await hoverTooltip(page, w1.a.x, w1.a.y), 'first widget tooltip').toBe('alpha');
  await hideTooltip(page);
  expect(await hoverTooltip(page, w2.b.x, w2.b.y), 'second widget tooltip').toBe('delta');
});

test('T5: a popup opened on the second widget anchors to the second map', async ({ page }) => {
  const { w2 } = await twoWidgets(page);
  expect(await clickPopup(page, w2.a.x, w2.a.y)).toEqual(['P gamma']);
  const box = await popupBox(page);
  const host = await widgetBox(page, 1);
  expect(box.x + box.width / 2, 'popup centred on the feature').toBeCloseTo(w2.a.x, -1);
  expect(box.y + box.height, 'popup sits above the feature').toBeLessThan(w2.a.y);
  expect(box.x, 'popup inside the second widget').toBeGreaterThan(host.left);
});

test('S1: a widget created in a hidden container fits its bounds once shown', async ({ page }) => {
  const { errors } = await openWidget(page, 'page-hidden');
  const hiddenZoom = await mapZoom(page);
  await page.evaluate(() => window.showMap());
  await page.waitForTimeout(1500);
  const shownZoom = await mapZoom(page);
  expect(shownZoom, `zoom before ${hiddenZoom}, after ${shownZoom}`).toBeGreaterThan(9);
  await zoomOut(page, 2);
  const c = await project(page, 0, 51.5);
  const box = await widgetBox(page);
  expect(c.x).toBeGreaterThan(box.left);
  expect(c.x).toBeLessThan(box.right);
  expect(isDrawnAt(await screenshot(page), c.x, c.y), 'centre circle drawn').toBe(true);
  expect(errors).toEqual([]);
});

test('S8: the widget entry script loads and registers once', async ({ page }) => {
  const { errors } = await openWidget(page, 'page-two-widgets', 2);
  const found = await page.evaluate(() => ({
    scripts: Array.from(document.scripts).filter((s) => /\/maplamina\.js$/.test(s.src)).length,
    bindings: window.HTMLWidgets.widgets.filter((w) => w.name === 'maplamina').length,
  }));
  expect(found).toEqual({ scripts: 1, bindings: 1 });
  expect(errors).toEqual([]);
});

test('C7: mounting the controls a second time keeps one dock item per group', async ({ page }) => {
  await openWidget(page, 'circles-views');
  const count = () => page.locator('.ml-dock-item.ml-control-standalone').count();
  expect(await count()).toBe(1);
  await page.evaluate(() => {
    const el = document.querySelector('.maplamina');
    MAPLAMINA.controls.panel.sync(el, el.__mfRuntime.specRef);
  });
  expect(await count(), 'second sync reused the dock item').toBe(1);
  expect(await page.locator('input[type=radio][value="big"]').count()).toBe(1);
});

test('C5: the panel and a standalone control sit in the corners they were given', async ({ page }) => {
  const { errors } = await openWidget(page, 'panel-corners');
  const box = await widgetBox(page);
  const midX = (box.left + box.right) / 2;
  const midY = (box.top + box.bottom) / 2;
  const panel = await page.locator('.ml-control-panel').first().boundingBox();
  expect(panel.x + panel.width / 2, 'panel is on the right').toBeGreaterThan(midX);
  expect(panel.y + panel.height / 2, 'panel is at the bottom').toBeGreaterThan(midY);
  const standalone = await page.locator('.ml-control-standalone').first().boundingBox();
  expect(standalone.x + standalone.width / 2, 'standalone is on the right').toBeGreaterThan(midX);
  expect(standalone.y + standalone.height / 2, 'standalone is at the top').toBeLessThan(midY);
  expect(errors).toEqual([]);
});

test('C8: summaries count rows rather than parts on multipart geometry', async ({ page }) => {
  const { errors } = await openWidget(page, 'polygons-multipart-summaries');
  const read = async () => {
    const rows = await page.locator('.ml-summary-row').all();
    const out = {};
    for (const r of rows) {
      out[(await r.locator('.ml-summary-label').innerText()).trim()] = (await r.locator('.ml-summary-value').innerText()).trim();
    }
    return out;
  };
  expect(await read()).toEqual({ n: '2', sum: '11', mean: '5.5', min: '1' });
  await setFilter(page, 'v', [5, 10]);
  await page.waitForTimeout(500);
  expect(await read()).toEqual({ n: '1', sum: '10', mean: '10.0', min: '10' });
  expect(errors).toEqual([]);
});
