// Scenarios C3 and C7: legends, standalone and inside a panel.
import { test, expect } from '@playwright/test';
import { openWidget, selectView } from '../lib/widget.mjs';

// Every legend card of the first widget, by title: what it drew, whether it is shown, and
// whether the shell around its group (panel section or standalone dock item) is shown.
async function readLegends(page) {
  return page.evaluate(() => {
    const shown = (n) => !!n && getComputedStyle(n).display !== 'none';
    const out = {};
    for (const card of document.querySelectorAll('.maplamina .ml-legend')) {
      const title = card.querySelector('.ml-legend-title');
      const shell = card.closest('.ml-panel-slot') || card.closest('[data-mf-control-kind="standalone"]');
      const bar = card.querySelector('.ml-legend-gradient');
      out[title ? title.textContent : ''] = {
        card: shown(card),
        shell: shown(shell),
        kind: shell && shell.classList.contains('ml-panel-slot') ? 'panel' : 'standalone',
        rows: Array.from(card.querySelectorAll('.ml-legend-row')).map((row) => {
          const sw = row.querySelector('.ml-legend-swatch');
          const mask = sw.style.maskImage || sw.style.webkitMaskImage || '';
          return {
            label: row.querySelector('.ml-legend-label').textContent,
            shape: Array.from(sw.classList).filter((c) => c.startsWith('ml-legend-swatch--')).join(' '),
            icon: mask.includes('data:image/svg+xml'),
            colour: sw.style.backgroundColor,
          };
        }),
        gradient: bar ? bar.style.background.includes('linear-gradient') : false,
        ticks: card.querySelectorAll('.ml-legend-tick').length,
        tickLabels: Array.from(card.querySelectorAll('.ml-legend-tick-label')).map((n) => n.textContent),
      };
    }
    return out;
  });
}

test('C3: legend cards draw their rows, swatches, gradient and ticks', async ({ page }) => {
  const { errors } = await openWidget(page, 'legends-views');
  const legends = await readLegends(page);
  expect(Object.keys(legends).sort()).toEqual(['Gated', 'Kind', 'Scale']);
  expect(legends.Kind.rows).toEqual([
    { label: 'low', shape: 'ml-legend-swatch--circle', icon: false, colour: 'darkblue' },
    { label: 'high', shape: 'ml-legend-swatch--icon', icon: true, colour: 'red' },
  ]);
  expect(legends.Gated.rows).toEqual([
    { label: 'only', shape: 'ml-legend-swatch--square', icon: false, colour: 'green' },
  ]);
  expect(legends.Scale.rows).toEqual([]);
  expect(legends.Scale.gradient, 'gradient bar').toBe(true);
  expect(legends.Scale.ticks).toBe(3);
  expect(legends.Scale.tickLabels).toEqual(['0', '5', '10']);
  expect(errors).toEqual([]);
});

const cards = (legends) => Object.fromEntries(
  Object.entries(legends).map(([title, l]) => [title, l.card]),
);

// The shell of each group by view: as rendered (view a), after switching to b, and back.
async function shellsByView(page, fixture, kind) {
  const { errors } = await openWidget(page, fixture);
  const first = await readLegends(page);
  expect(Object.values(first).map((l) => l.kind)).toEqual([kind, kind, kind]);
  const read = async () => {
    const l = await readLegends(page);
    return { lg: l.Kind.shell, solo: l.Gated.shell };
  };
  const out = { a: await read() };
  await selectView(page, 'b');
  await page.waitForTimeout(500);
  out.b = await read();
  await selectView(page, 'a');
  await page.waitForTimeout(500);
  out.again = await read();
  return { errors, out };
}

const SHELLS = {
  a: { lg: true, solo: false },
  b: { lg: true, solo: true },
  again: { lg: true, solo: false },
};

for (const [fixture, kind] of [['legends-views', 'standalone'], ['legends-panel', 'panel']]) {
  test(`C3: a legend gated on a view shows only while that view is active (${kind})`, async ({ page }) => {
    const { errors } = await openWidget(page, fixture);
    const viewA = { Kind: true, Scale: false, Gated: false };
    const viewB = { Kind: true, Scale: true, Gated: true };
    expect(cards(await readLegends(page)), 'view a, as rendered').toEqual(viewA);

    await selectView(page, 'b');
    await page.waitForTimeout(500);
    expect(cards(await readLegends(page)), 'view b').toEqual(viewB);

    await selectView(page, 'a');
    await page.waitForTimeout(500);
    expect(cards(await readLegends(page)), 'view a again').toEqual(viewA);
    expect(errors).toEqual([]);
  });
}

test('C3: a standalone group whose legends are all hidden hides with them', async ({ page }) => {
  const { errors, out } = await shellsByView(page, 'legends-views', 'standalone');
  expect(out).toEqual(SHELLS);
  expect(errors).toEqual([]);
});

test('C3: a panel section whose legends are all hidden hides with them', async ({ page }) => {
  const { errors, out } = await shellsByView(page, 'legends-panel', 'panel');
  expect(out).toEqual(SHELLS);
  expect(errors).toEqual([]);
});

test('C7: mounting the controls again keeps the legend cards and leaves the empty group hidden', async ({ page }) => {
  const { errors } = await openWidget(page, 'legends-views');
  const before = await readLegends(page);
  await page.evaluate(() => {
    const el = document.querySelector('.maplamina');
    MAPLAMINA.controls.panel.sync(el, el.__mfRuntime.specRef);
  });
  expect(await page.locator('.maplamina .ml-legend').count()).toBe(3);
  expect(await page.locator('.ml-dock-item.ml-control-standalone').count(), 'views, lg and solo').toBe(3);
  expect(await readLegends(page)).toEqual(before);
  expect(before.Gated.shell, 'empty group hidden').toBe(false);
  expect(errors).toEqual([]);
});
