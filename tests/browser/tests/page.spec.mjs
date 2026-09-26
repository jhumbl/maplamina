// Scenarios S1, S2, T5 from notes/regression-scenarios.md: pages rather than single widgets.
import { test, expect } from '@playwright/test';
import {
  openWidget, waitForWidgets, project, screenshot, isDrawnAt, measureDrawnRadius, selectView,
  toggleSelectOption, selectOptionChecked, zoomOut, widgetBox, mapZoom, hoverTooltip, hideTooltip,
  clickPopup, popupBox,
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
  // Known failure: the tooltip registry is module-level and keyed by layer id, and layer ids
  // are deterministic, so the second widget's "circle1" template replaces the first's and
  // hovering widget 1 shows widget 2's rows (P-26-03). Remove test.fail() once the registry
  // is per widget.
  test.fail();
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
