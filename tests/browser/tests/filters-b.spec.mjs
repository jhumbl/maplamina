// Priority B filter and template scenarios F6, F9, F10, F12, F14, F18, T3, T4.
import { test, expect } from '@playwright/test';
import {
  openWidget, project, screenshot, isDrawnAt, measureDrawnRadius, setFilter, toggleSelectOption,
  selectView, zoomOut, widget, hoverTooltip, clickPopup,
} from '../lib/widget.mjs';

test('F6: a range and a select filter on one layer apply together', async ({ page }) => {
  await openWidget(page, 'circles-views-filters');
  await zoomOut(page);
  const x2 = await project(page, 0, 51.49);
  const x4 = await project(page, -0.02, 51.5);
  const x5 = await project(page, 0, 51.5);
  const x8 = await project(page, 0, 51.51);
  await setFilter(page, 'x', [4, 9]);
  await toggleSelectOption(page, 'green');
  const png = await screenshot(page);
  expect(isDrawnAt(png, x5.x, x5.y), 'x=5 green in range').toBe(true);
  expect(isDrawnAt(png, x8.x, x8.y), 'x=8 green in range').toBe(true);
  expect(isDrawnAt(png, x2.x, x2.y), 'x=2 green out of range').toBe(false);
  expect(isDrawnAt(png, x4.x, x4.y), 'x=4 red in range').toBe(false);
});

test('F9: dragging a range thumb never changes the active view', async ({ page }) => {
  await openWidget(page, 'circles-views-filters');
  await zoomOut(page);
  const x5 = await project(page, 0, 51.5);
  await selectView(page, 'test2');
  await page.waitForTimeout(2000);
  const before = measureDrawnRadius(await screenshot(page), x5.x, x5.y);
  expect(before).toBeLessThan(7);

  const thumb = widget(page).locator('.ml-rngs-thumb').first();
  const box = await thumb.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + i * 8, cy);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await widget(page).locator('input[type=radio][value="test2"]').isChecked()).toBe(true);
  expect(measureDrawnRadius(await screenshot(page), x5.x, x5.y), 'view radius unchanged').toBe(before);
});

test('F10: a marker layer filters immediately, before any view switch', async ({ page }) => {
  await openWidget(page, 'icons-markers-views');
  await zoomOut(page, 2);
  // Markers anchor at the pin tip; probe the body above the point.
  const m1 = await project(page, -0.02, 51.49).then((p) => ({ x: p.x, y: p.y - 8 }));
  const m3 = await project(page, 0.02, 51.49).then((p) => ({ x: p.x, y: p.y - 8 }));
  const i1 = await project(page, -0.02, 51.51);
  let png = await screenshot(page);
  expect(isDrawnAt(png, m1.x, m1.y)).toBe(true);
  expect(isDrawnAt(png, i1.x, i1.y)).toBe(true);
  await setFilter(page, 'v', [2, 3]);
  png = await screenshot(page);
  expect(isDrawnAt(png, m1.x, m1.y), 'marker v=1 hidden').toBe(false);
  expect(isDrawnAt(png, m3.x, m3.y), 'marker v=3 visible').toBe(true);
  expect(isDrawnAt(png, i1.x, i1.y), 'icon v=1 hidden').toBe(false);
});

test('T3, T4: a template without placeholders and a constant string column', async ({ page }) => {
  await openWidget(page, 'tooltips-constant');
  await zoomOut(page, 2);
  const a = await project(page, -0.02, 51.5);
  expect(await hoverTooltip(page, a.x, a.y)).toBe('plain tooltip');
  expect(await clickPopup(page, a.x, a.y)).toEqual(['constant text']);
});

test('F12: filter labels with "/" and spaces render and work', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-filter-labels');
  await zoomOut(page);
  const x1 = await project(page, -0.02, 51.49);
  const x5 = await project(page, 0, 51.5);
  const x4 = await project(page, -0.02, 51.5);
  await expect(widget(page).getByText('speed / rate')).toBeVisible();
  await expect(widget(page).getByText('colour group')).toBeVisible();
  await setFilter(page, 'speed / rate', [4, 9]);
  await toggleSelectOption(page, 'green');
  const png = await screenshot(page);
  expect(isDrawnAt(png, x5.x, x5.y), 'x=5 green in range').toBe(true);
  expect(isDrawnAt(png, x1.x, x1.y), 'x=1 out of range').toBe(false);
  expect(isDrawnAt(png, x4.x, x4.y), 'x=4 red').toBe(false);
  expect(errors).toEqual([]);
});

test('F14: an NA row stays hidden from a range filter whose range includes 0', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-range-na');
  const count = async () => (await page.locator('.ml-summary-value').first().innerText()).trim();
  const check = async (when) => {
    const png = await screenshot(page);
    const at = async (lon) => { const p = await project(page, lon, 51.5); return isDrawnAt(png, p.x, p.y); };
    expect(await at(-0.02), `${when}: v = -1 drawn`).toBe(true);
    expect(await at(0.02), `${when}: v = 1 drawn`).toBe(true);
    expect(await at(0), `${when}: NA row drawn`).toBe(false);
    expect(await count(), `${when}: count`).toBe('2');
  };
  await check('initial');
  await setFilter(page, 'v', [-1, 1]);
  await page.waitForTimeout(500);
  await check('after set');
  expect(errors).toEqual([]);
});

test('F18: a count beside a range filter equals the circles drawn when the range ends are not exact in float32', async ({ page }) => {
  const { errors } = await openWidget(page, 'circles-range-float32');
  await zoomOut(page, 1);
  const count = async () => (await page.locator('.ml-summary-value').first().innerText()).trim();
  const circles = async () => {
    const png = await screenshot(page);
    let n = 0;
    for (const lon of [-0.03, -0.01, 0.01, 0.03]) {
      const p = await project(page, lon, 51.5);
      if (isDrawnAt(png, p.x, p.y)) n++;
    }
    return n;
  };
  expect(await circles(), 'initial: circles').toBe(4);
  expect(await count(), 'initial: count').toBe('4');
  // 1.1 is held above the bound 1.1, 0.9 below the bound 0.9.
  for (const [range, n] of [[[0.5, 1.1], 3], [[0.9, 1.1], 2], [[0.3, 0.9], 3]]) {
    await setFilter(page, 'v', range);
    await page.waitForTimeout(500);
    expect(await circles(), `${range}: circles`).toBe(n);
    expect(await count(), `${range}: count`).toBe(String(n));
  }
  expect(errors).toEqual([]);
});
