// Scenarios T1, T2 from notes/regression-scenarios.md.
import { test, expect } from '@playwright/test';
import {
  openWidget, project, zoomOut, hoverTooltip, hideTooltip, clickPopup, popupTexts,
} from '../lib/widget.mjs';

test('T1: popup opens on click, closes on background click and Escape, second click opens a second popup', async ({ page }) => {
  const { errors } = await openWidget(page, 'tooltips-circles');
  await zoomOut(page, 2);
  const a = await project(page, -0.02, 51.5);
  const b = await project(page, 0.02, 51.5);
  const bg = await project(page, 0, 51.51);

  expect(await clickPopup(page, a.x, a.y)).toEqual(['P alpha']);
  await page.mouse.click(bg.x, bg.y);
  await page.waitForTimeout(300);
  expect(await popupTexts(page), 'closed by background click').toEqual([]);

  expect(await clickPopup(page, a.x, a.y)).toEqual(['P alpha']);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await popupTexts(page), 'closed by Escape').toEqual([]);

  expect(await clickPopup(page, a.x, a.y)).toEqual(['P alpha']);
  expect(await clickPopup(page, b.x, b.y), 'second feature replaces the popup').toEqual(['P beta']);
  expect(errors).toEqual([]);
});

const ICON_OFFSETS = [0, -6, -12, -18];

const FEATURES = [
  ['circle-a', -0.02, 51.52, [0]],
  ['icon-b', 0.02, 51.53, ICON_OFFSETS],
  ['marker-a', -0.02, 51.54, ICON_OFFSETS],
  ['line-b', -0.01, 51.51, [0]],
  ['poly-b', 0.015, 51.495, [0]],
];

test('T2: tooltip and popup work on circle, line, polygon, icon and marker layers', async ({ page }) => {
  const { errors } = await openWidget(page, 'tooltips-layers');
  await zoomOut(page, 1);
  for (const [name, lon, lat, offsets] of FEATURES) {
    const p = await project(page, lon, lat);
    expect(await hoverTooltip(page, p.x, p.y, offsets), `tooltip ${name}`).toBe(name);
    await hideTooltip(page);
    expect(await clickPopup(page, p.x, p.y, offsets), `popup ${name}`).toEqual([`P ${name}`]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  expect(errors).toEqual([]);
});

test('T2: hovering a polygon stroke edge shows that polygon, not row 0', async ({ page }) => {
  await openWidget(page, 'tooltips-layers');
  await zoomOut(page, 1);
  // The right edge of poly-b (x = 0.03) is not shared with poly-a; hover it exactly.
  const edge = await project(page, 0.03, 51.495);
  const seen = new Set();
  for (const dx of [-1, 0, 1]) {
    const t = await hoverTooltip(page, edge.x + dx, edge.y);
    if (t) seen.add(t);
    await hideTooltip(page);
  }
  expect([...seen], 'stroke edge picks').toEqual(['poly-b']);
});
