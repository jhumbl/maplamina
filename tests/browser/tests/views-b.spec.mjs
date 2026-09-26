// Priority B view scenarios V7, V8, V9, V10, V11 from notes/regression-scenarios.md.
import { test, expect } from '@playwright/test';
import {
  openWidget, project, screenshot, pixel, measureRadius, measureDrawnRadius, measureColumnAbove,
  sampleAfter, animated, selectView, zoomOut,
} from '../lib/widget.mjs';

const DARKBLUE = [0, 0, 139];

test('V7: switching views mid-transition retargets from the current radius, no jump', async ({ page }) => {
  await openWidget(page, 'circles-views');
  const c = await project(page, 0, 51.5);
  await selectView(page, 'small');
  await page.waitForTimeout(600);
  const mid = measureRadius(await screenshot(page), c.x, c.y, DARKBLUE);
  expect(mid, 'still mid-transition').toBeGreaterThan(4);
  expect(mid).toBeLessThan(12);

  const samples = await sampleAfter(page, () => selectView(page, 'big'), 2200,
    (png) => measureRadius(png, c.x, c.y, DARKBLUE));
  const radii = samples.map((s) => s.v);
  expect(radii[0], `first sample after retarget: ${radii.join(',')}`).toBeGreaterThan(4);
  expect(radii[0]).toBeLessThan(12);
  expect(radii[radii.length - 1]).toBeGreaterThan(10);
  expect(animated(samples), `radii: ${radii.join(',')}`).toBe(true);
});

test('V8: a layer lacking the selected view shows its base style', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-two-layers-views');
  await zoomOut(page, 2);
  const a = await project(page, 0, 51.51);
  const b = await project(page, 0, 51.49);
  let png = await screenshot(page);
  expect(measureDrawnRadius(png, a.x, a.y)).toBeGreaterThan(9);
  expect(measureDrawnRadius(png, b.x, b.y)).toBeGreaterThan(9);

  await selectView(page, 'only-a');
  await page.waitForTimeout(500);
  png = await screenshot(page);
  expect(measureDrawnRadius(png, a.x, a.y), 'layer A keeps the view radius').toBeGreaterThan(9);
  const rb = measureDrawnRadius(png, b.x, b.y);
  expect(rb, 'layer B back to base radius 5').toBeLessThan(7);
  expect(rb).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('V10: icon size and marker size animate on view switch', async ({ page }) => {
  await openWidget(page, 'icons-markers-views');
  await zoomOut(page, 2);
  const icon = await project(page, 0, 51.51);
  // Markers anchor at the pin tip, so their size is the drawn height above the point.
  const marker = await project(page, 0, 51.49);
  const samples = await sampleAfter(page, () => selectView(page, 'big'), 2200,
    (png) => [measureDrawnRadius(png, icon.x, icon.y), measureColumnAbove(png, marker.x, marker.y)]);
  const icons = samples.map((s) => ({ t: s.t, v: s.v[0] }));
  const markers = samples.map((s) => ({ t: s.t, v: s.v[1] }));
  expect(animated(icons), `icon widths: ${icons.map((s) => s.v).join(',')}`).toBe(true);
  // The stroke and fill sublayers scale at different rates, so the column count wobbles.
  expect(animated(markers, 3), `marker heights: ${markers.map((s) => s.v).join(',')}`).toBe(true);
  const first = samples[0].v;
  const last = samples[samples.length - 1].v;
  expect(last[0]).toBeGreaterThan(first[0] * 1.5);
  expect(last[1]).toBeGreaterThan(first[1] * 1.5);
});

test('V11: polygon fill colour animates on view switch', async ({ page }) => {
  await openWidget(page, 'polygons-views-fill');
  await zoomOut(page, 1);
  const c = await project(page, 0, 51.5);
  const samples = await sampleAfter(page, () => selectView(page, 'red'), 2200,
    (png) => pixel(png, c.x, c.y)[0]);
  const reds = samples.map((s) => s.v);
  expect(reds[0]).toBeLessThan(60);
  expect(reds[reds.length - 1]).toBeGreaterThan(200);
  expect(animated(samples), `red channel: ${reds.join(',')}`).toBe(true);
});

test("V9: a view switch on one layer does not restart the other layer's transition", async ({ page }) => {
  await openWidget(page, 'circles-independent-views');
  await zoomOut(page, 2);
  const a = await project(page, 0, 51.51);
  const b = await project(page, 0, 51.49);
  const radioA = page.locator('input[type=radio][value="big"]').nth(0);
  const radioB = page.locator('input[type=radio][value="big"]').nth(1);

  await radioA.check();
  await page.waitForTimeout(500);
  const mid = measureDrawnRadius(await screenshot(page), a.x, a.y);
  expect(mid, 'layer A mid-transition').toBeGreaterThan(4);
  expect(mid).toBeLessThan(14);

  const samples = await sampleAfter(page, () => radioB.check(), 1500,
    (png) => [measureDrawnRadius(png, a.x, a.y), measureDrawnRadius(png, b.x, b.y)]);
  const ra = samples.map((s) => ({ t: s.t, v: s.v[0] }));
  const rb = samples.map((s) => ({ t: s.t, v: s.v[1] }));
  expect(ra[0].v, `layer A did not restart: ${ra.map((s) => s.v).join(',')}`).toBeGreaterThanOrEqual(mid);
  expect(ra.every((s, i) => i === 0 || s.v >= ra[i - 1].v - 1), 'layer A keeps growing').toBe(true);
  expect(ra[ra.length - 1].v).toBeGreaterThan(12);
  expect(animated(rb), `layer B animates: ${rb.map((s) => s.v).join(',')}`).toBe(true);
});
