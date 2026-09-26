# Browser regression tests

Playwright tests that open saved maplamina widgets in headless Chromium and check the
behaviours that have regressed before. Scenarios are numbered as in the maintainer's
scenario list (V1, F1, ...). This folder is development tooling; it is excluded from the R
build by `.Rbuildignore`. Run it locally before merging runtime changes.

## Running

    cd tests/browser
    npm install
    npx playwright install chromium
    npm run fixtures     # builds fixtures/out/*.html from R (needs the package loadable)
    npm test

Fixtures are regenerated, never edited. Change `fixtures/make-fixtures.R` and rerun.
Single widgets are saved with `htmlwidgets::saveWidget()`; pages holding several widgets or
a hidden container are written with `htmltools::save_html()`. The basemap needs network.

Tests that fail on the current code because of a known bug carry `test.fail()` and the
problem id from the maintainer's log, so the suite stays green and the failure is on record.
Remove the marker when the bug is fixed; Playwright then reports the test as unexpectedly
passing.

## How assertions work

Rendering is checked from screenshots, not from runtime state, because the historical
bugs included cases where every internal value looked right and nothing was drawn.
`lib/widget.mjs` projects a lon/lat to page pixels and measures the drawn radius or colour
at that point. Transitions are sampled every few frames; "animated" means the sampled
value passed through at least one intermediate value and moved in one direction. Transition
fixtures use 1500 ms so a slow headless frame cannot swallow the whole window. Probe colours
are chosen so a crossfade never passes through a grey the "drawn" test would reject.

Every helper takes a widget index (default 0) so a page with several widgets can be driven.
Icons anchor at their centre and markers at the pin tip; `measureColumnAbove` sizes a marker
by the drawn pixels above its point. The `control:` tests exist to prove
each detector can fail.
