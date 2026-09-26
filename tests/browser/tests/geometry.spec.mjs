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
