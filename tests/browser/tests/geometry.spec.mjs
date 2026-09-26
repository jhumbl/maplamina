// Scenarios G1, G3, G4, G12 from notes/regression-scenarios.md.
import { test, expect } from '@playwright/test';
import { openWidget, project, screenshot, isDrawnAt, zoomOut, measureDrawnRadius } from '../lib/widget.mjs';

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

// The local extent uses deck's offsets mode, the wide one plain lng/lat; both once vanished.
for (const fixture of ['circles-dateline', 'circles-dateline-wide']) {
  test(`G4: circles with longitudes beyond 180 stay visible while zooming in (${fixture})`, async ({ page }) => {
    await openWidget(page, fixture);
    const seen = {};
    for (const lon of [178.5, 181.0, 183.5]) {
      for (const zoom of [4, 8, 10, 14]) {
        await page.evaluate(([lon, z]) => {
          const map = document.querySelector('.maplamina').__mfGetMap();
          map.jumpTo({ center: [lon, -18], zoom: z });
        }, [lon, zoom]);
        await page.waitForTimeout(600);
        const c = await project(page, lon, -18);
        seen[`${lon}@${zoom}`] = isDrawnAt(await screenshot(page), c.x, c.y);
      }
    }
    const expected = Object.fromEntries(Object.keys(seen).map((k) => [k, true]));
    expect(seen, 'each point visible centred at each zoom').toEqual(expected);
  });
}

test('G12: an icon sized in meters shrinks on zoom out while one in pixels keeps its size', async ({ page }) => {
  const { errors } = await openWidget(page, 'icons-size-units');
  const meters = await project(page, -0.02, 51.5);
  const pixels = await project(page, 0.02, 51.5);
  let png = await screenshot(page);
  const before = [measureDrawnRadius(png, meters.x, meters.y), measureDrawnRadius(png, pixels.x, pixels.y)];
  // The first two levels out are hidden by the 64 px size cap.
  await zoomOut(page, 3);
  const m2 = await project(page, -0.02, 51.5);
  const p2 = await project(page, 0.02, 51.5);
  png = await screenshot(page);
  const after = [measureDrawnRadius(png, m2.x, m2.y), measureDrawnRadius(png, p2.x, p2.y)];
  expect(before[0], `meters radius ${before[0]} before zoom out`).toBeGreaterThan(4);
  expect(after[0], `meters radius ${before[0]} -> ${after[0]}`).toBeLessThan(before[0] / 2);
  expect(Math.abs(after[1] - before[1]), `pixels radius ${before[1]} -> ${after[1]}`).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
