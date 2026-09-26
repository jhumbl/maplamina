// Scenarios G1, G3, G4 from notes/regression-scenarios.md.
import { test, expect } from '@playwright/test';
import { openWidget, project, screenshot, isDrawnAt, zoomOut } from '../lib/widget.mjs';

test('G1: a polygon with a hole renders the ring and leaves the hole empty', async ({ page }) => {
  const { errors } = await openWidget(page, 'polygons-hole');
  await zoomOut(page, 1);
  const ring = await project(page, -0.028, 51.5);
  const hole = await project(page, -0.02, 51.5);
  const plain = await project(page, 0.02, 51.5);
  const png = await screenshot(page);
  expect(isDrawnAt(png, ring.x, ring.y), 'ring drawn').toBe(true);
  expect(isDrawnAt(png, hole.x, hole.y), 'hole empty').toBe(false);
  expect(isDrawnAt(png, plain.x, plain.y), 'plain square drawn').toBe(true);
  expect(errors).toEqual([]);
});

test('G3: a layer with exactly one polygon renders', async ({ page }) => {
  await openWidget(page, 'polygon-single');
  await zoomOut(page, 1);
  const c = await project(page, 0, 51.5);
  expect(isDrawnAt(await screenshot(page), c.x, c.y)).toBe(true);
});

test('G4: circles with longitudes beyond 180 stay visible while zooming in', async ({ page }) => {
  // Known failure on 0.1.0: the circle layer has no wrapLongitude, so the point at 181E is
  // drawn one world away and leaves the viewport from zoom 10 (P-21-07). Remove test.fail()
  // once the layer builders handle world copies.
  test.fail();
  await openWidget(page, 'circles-dateline');
  const seen = {};
  for (const zoom of [4, 6, 8, 10, 12, 14]) {
    await page.evaluate((z) => {
      const map = document.querySelector('.maplamina').__mfGetMap();
      map.jumpTo({ center: [181.0, -18], zoom: z });
    }, zoom);
    await page.waitForTimeout(600);
    const c = await project(page, 181.0, -18);
    seen[zoom] = isDrawnAt(await screenshot(page), c.x, c.y);
  }
  expect(seen, 'visible at each zoom').toEqual({ 4: true, 6: true, 8: true, 10: true, 12: true, 14: true });
});
