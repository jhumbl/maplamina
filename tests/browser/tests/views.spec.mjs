// Scenarios V1, V3, V4, V6 from notes/regression-scenarios.md.
import { test, expect } from '@playwright/test';
import {
  openWidget, project, screenshot, pixel, near, measureRadius, measureDrawnRadius, measureThickness,
  sampleAfter, sampleUntil, animated, selectView, zoomOut,
} from '../lib/widget.mjs';

const DARKBLUE = [0, 0, 139];

test('V1: the very first view switch animates', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-views');
  const c = await project(page, 0, 51.5);
  const before = measureRadius(await screenshot(page), c.x, c.y, DARKBLUE);
  expect(before).toBeGreaterThan(8);

  const samples = await sampleUntil(page, () => selectView(page, 'small'),
    (png) => measureRadius(png, c.x, c.y, DARKBLUE), (r) => r < 6);
  const radii = samples.map((s) => s.v);

  expect(radii[radii.length - 1]).toBeLessThan(6);
  expect(animated(samples), `radii over time: ${radii.join(',')}`).toBe(true);
  expect(errors).toEqual([]);
});

test('control: a 1 ms duration reads as a snap', async ({ page }) => {
  await openWidget(page, 'circles-views-instant');
  const c = await project(page, 0, 51.5);
  const samples = await sampleAfter(page, () => selectView(page, 'small'), 600,
    (png) => measureRadius(png, c.x, c.y, DARKBLUE));
  const radii = samples.map((s) => s.v);
  expect(radii[radii.length - 1]).toBeLessThan(6);
  expect(animated(samples), `radii over time: ${radii.join(',')}`).toBe(false);
});

test('V3: a view that omits a prop animates the revert to base', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-views-omit');
  const c = await project(page, 0, 51.5);
  expect(measureRadius(await screenshot(page), c.x, c.y, DARKBLUE)).toBeGreaterThan(10);
  const samples = await sampleUntil(page, () => selectView(page, 'plain'),
    (png) => measureDrawnRadius(png, c.x, c.y), (r) => r < 8);
  const radii = samples.map((s) => s.v);
  expect(radii[radii.length - 1]).toBeLessThan(8);
  expect(animated(samples), `radii: ${radii.join(',')}`).toBe(true);
  expect(errors).toEqual([]);
});

test('V4: line width omitted in the first view still animates on the first switch', async ({ page }) => {
  await openWidget(page, 'lines-views-width');
  await zoomOut(page, 2);
  const c = await project(page, 0, 51.5);
  const before = measureThickness(await screenshot(page), c.x, c.y);
  expect(before).toBeGreaterThan(3);
  const samples = await sampleUntil(page, () => selectView(page, 'thick'),
    (png) => measureThickness(png, c.x, c.y), (w, first) => w > first * 2);
  const widths = samples.map((s) => s.v);
  expect(widths[widths.length - 1]).toBeGreaterThan(before * 2);
  expect(animated(samples), `widths: ${widths.join(',')}`).toBe(true);
});

test('V6: a formula fill is still drawn after the first transition completes', async ({ page }) => {
  await openWidget(page, 'circles-views-formula-fill');
  await zoomOut(page, 2);
  const c5 = await project(page, 0, 51.5);
  const c1 = await project(page, -0.02, 51.49);
  expect(near(pixel(await screenshot(page), c5.x, c5.y), [139, 0, 0])).toBe(true);
  await selectView(page, 'formula');
  await page.waitForTimeout(2500);
  const png = await screenshot(page);
  expect(near(pixel(png, c5.x, c5.y), [0, 100, 0]), 'x=5 darkgreen after transition').toBe(true);
  expect(near(pixel(png, c1.x, c1.y), [0, 0, 139]), 'x=1 darkblue after transition').toBe(true);
});
