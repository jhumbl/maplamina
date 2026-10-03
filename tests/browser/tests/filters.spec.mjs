// Scenarios V2, V5, F1, F2, F5 from notes/regression-scenarios.md.
// Fixture grid (lon fastest): x = 1..9, col cycles red, green, blue. Centre is x = 5, green.
import { test, expect } from '@playwright/test';
import {
  openWidget, project, screenshot, pixel, near, isDrawnAt, measureDrawnRadius,
  sampleUntil, animated, selectView, setFilter, toggleSelectOption, selectOptionChecked, zoomOut,
} from '../lib/widget.mjs';

const P = {
  x1: [-0.02, 51.49], x4: [-0.02, 51.5], x5: [0, 51.5], x6: [0.02, 51.5], x9: [0.02, 51.51],
};
const BLUE = [0, 0, 255];
const RED = [255, 0, 0];

async function points(page) {
  await zoomOut(page);
  const out = {};
  for (const [k, [lon, lat]] of Object.entries(P)) out[k] = await project(page, lon, lat);
  return out;
}

test('V5: filter first, with a view setting color and fill_color, keeps the fill', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-views-filters');
  const p = await points(page);
  let png = await screenshot(page);
  expect(near(pixel(png, p.x5.x, p.x5.y), BLUE)).toBe(true);
  expect(near(pixel(png, p.x1.x, p.x1.y), RED)).toBe(true);

  await setFilter(page, 'x', [4, 9]);
  png = await screenshot(page);
  expect(near(pixel(png, p.x5.x, p.x5.y), BLUE), 'centre fill after filter').toBe(true);
  expect(isDrawnAt(png, p.x1.x, p.x1.y), 'x=1 hidden').toBe(false);
  expect(near(pixel(png, p.x4.x, p.x4.y), BLUE), 'x=4 still styled by the view').toBe(true);
  expect(errors).toEqual([]);
});

test('V2: a view switch after a filter interaction animates, and so does the switch back', async ({ page }) => {
  await openWidget(page, 'circles-views-filters');
  const p = await points(page);
  await setFilter(page, 'x', [4, 9]);

  let samples = await sampleUntil(page, () => selectView(page, 'test2'),
    (png) => measureDrawnRadius(png, p.x5.x, p.x5.y), (r) => r < 7);
  let radii = samples.map((s) => s.v);
  expect(radii[radii.length - 1]).toBeLessThan(7);
  expect(animated(samples), `radii: ${radii.join(',')}`).toBe(true);

  // Sampling stopped inside the transition; let it end so the switch back starts from rest.
  await page.waitForTimeout(1500);
  samples = await sampleUntil(page, () => selectView(page, 'test'),
    (png) => measureDrawnRadius(png, p.x5.x, p.x5.y), (r) => r > 7);
  radii = samples.map((s) => s.v);
  expect(radii[radii.length - 1]).toBeGreaterThan(7);
  expect(animated(samples), `radii back: ${radii.join(',')}`).toBe(true);
});

test('F1: each select category, including the first, filters to that category', async ({ page }) => {
  await openWidget(page, 'circles-views-filters');
  const p = await points(page);

  await toggleSelectOption(page, 'green');
  let png = await screenshot(page);
  expect(isDrawnAt(png, p.x5.x, p.x5.y), 'green centre visible').toBe(true);
  expect(isDrawnAt(png, p.x4.x, p.x4.y), 'red x=4 hidden').toBe(false);
  expect(isDrawnAt(png, p.x6.x, p.x6.y), 'blue x=6 hidden').toBe(false);

  await toggleSelectOption(page, 'green');
  await toggleSelectOption(page, 'blue');
  png = await screenshot(page);
  expect(isDrawnAt(png, p.x6.x, p.x6.y), 'blue x=6 visible').toBe(true);
  expect(isDrawnAt(png, p.x5.x, p.x5.y), 'green centre hidden').toBe(false);

  await toggleSelectOption(page, 'blue');
  await toggleSelectOption(page, 'red');
  png = await screenshot(page);
  expect(isDrawnAt(png, p.x4.x, p.x4.y), 'red x=4 visible (first category)').toBe(true);
  expect(isDrawnAt(png, p.x6.x, p.x6.y), 'blue x=6 hidden').toBe(false);
});

test('F2: deselecting every category shows everything again', async ({ page }) => {
  await openWidget(page, 'circles-views-filters');
  const p = await points(page);
  await toggleSelectOption(page, 'red');
  await toggleSelectOption(page, 'red');
  const png = await screenshot(page);
  for (const k of Object.keys(P)) expect(isDrawnAt(png, p[k].x, p[k].y), `${k} visible`).toBe(true);
});

test('F5: filter defaults apply on first render, in the map and in the controls', async ({ page }) => {
  await openWidget(page, 'circles-filter-defaults');
  const p = await points(page);
  const png = await screenshot(page);
  expect(isDrawnAt(png, p.x1.x, p.x1.y), 'x=1 outside range default').toBe(false);
  expect(isDrawnAt(png, p.x4.x, p.x4.y), 'x=4 red, outside select default').toBe(false);
  expect(isDrawnAt(png, p.x5.x, p.x5.y), 'x=5 green, inside both').toBe(true);
  expect(isDrawnAt(png, p.x6.x, p.x6.y), 'x=6 blue, inside both').toBe(true);
  expect(await selectOptionChecked(page, 'green')).toBe(true);
  expect(await selectOptionChecked(page, 'red')).toBe(false);
});

test('F3: bound select with disjoint categories hides the whole other layer', async ({ page }) => {
  await openWidget(page, 'circles-bound-select');
  await zoomOut(page, 2);
  const a = [await project(page, -0.02, 51.49), await project(page, 0, 51.49), await project(page, 0.02, 51.49)];
  const b = [await project(page, -0.02, 51.51), await project(page, 0, 51.51), await project(page, 0.02, 51.51)];

  await toggleSelectOption(page, 'A');
  let png = await screenshot(page);
  expect(isDrawnAt(png, a[0].x, a[0].y), 'A visible').toBe(true);
  expect(isDrawnAt(png, a[1].x, a[1].y), 'B hidden').toBe(false);
  for (const q of b) expect(isDrawnAt(png, q.x, q.y), 'other layer hidden').toBe(false);

  await toggleSelectOption(page, 'A');
  await toggleSelectOption(page, 'P');
  png = await screenshot(page);
  for (const q of a) expect(isDrawnAt(png, q.x, q.y), 'first layer hidden').toBe(false);
  expect(isDrawnAt(png, b[0].x, b[0].y), 'P visible').toBe(true);
  expect(isDrawnAt(png, b[2].x, b[2].y), 'P visible').toBe(true);
  expect(isDrawnAt(png, b[1].x, b[1].y), 'Q hidden').toBe(false);
});

test('F4, G2: multipolygon parts filter and colour by their own row', async ({ page }) => {
  await openWidget(page, 'polygons-multipart');
  await zoomOut(page, 2);
  const part1 = await project(page, -0.026, 51.494);
  const part2 = await project(page, 0.024, 51.494);
  const single = await project(page, -0.001, 51.514);

  let png = await screenshot(page);
  expect(near(pixel(png, part1.x, part1.y), [139, 0, 0]), 'part 1 darkred').toBe(true);
  expect(near(pixel(png, part2.x, part2.y), [139, 0, 0]), 'part 2 darkred').toBe(true);
  expect(near(pixel(png, single.x, single.y), [0, 100, 0]), 'single darkgreen').toBe(true);

  await setFilter(page, 'value', [3, 5]);
  png = await screenshot(page);
  expect(isDrawnAt(png, part1.x, part1.y), 'part 1 hidden').toBe(false);
  expect(isDrawnAt(png, part2.x, part2.y), 'part 2 hidden').toBe(false);
  expect(isDrawnAt(png, single.x, single.y), 'single visible').toBe(true);

  await setFilter(page, 'value', [1, 3]);
  png = await screenshot(page);
  expect(isDrawnAt(png, part1.x, part1.y), 'part 1 visible').toBe(true);
  expect(isDrawnAt(png, part2.x, part2.y), 'part 2 visible').toBe(true);
  expect(isDrawnAt(png, single.x, single.y), 'single hidden').toBe(false);
});
