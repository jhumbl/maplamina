# maplamina [![maplamina logo](reference/figures/maplamina_logo.svg)](https://jhumbl.github.io/maplamina/)

GPU-accelerated interactive maps for R (MapLibre GL + deck.gl via
htmlwidgets).

Documentation:
<https://jhumbl.github.io/maplamina/articles/maplamina.html>

- **Fast:** WebGL rendering with binary (typed-array) attributes for
  smooth interaction with millions of features.
- **R-native syntax:** pipe-friendly `add_*()` verbs plus formula
  mappings like `radius = ~value`.
- **First-class components:** views, filters, and summaries are built
  in - no more layer-control workarounds.
- **Composable UI:** bind components into shared controls, and mount
  them in an optional panel UI.
- **sf-friendly:** works naturally with `sf` objects for points, lines,
  and polygons.
- **Quarto/R Markdown ready:** designed to drop into reports and
  dashboards.

![Demo](reference/figures/recording_demo.gif)

Demo

## Installation

Install from CRAN:

``` r
install.packages("maplamina")
```

Or install the development version from GitHub:

``` r
# install.packages("devtools")
devtools::install_github("jhumbl/maplamina")
```

## Quick start (views)

A minimal example of a layer with multiple views transitioning between
different **radius** sizes, and a GPU-accelerated filter.

``` r
set.seed(1)
n <- 2000
d <- data.frame(
  lon   = runif(n, -60, 60),
  lat   = runif(n, -60, 60),
  value = runif(n, 1, 10)
)

maplamina() |>
  add_circles(d, stroke = FALSE, fill_color = "darkblue") |>
  add_views(
    view("Value",         radius = ~value),
    view("Inverse Value", radius = ~(max(value) - value + 1))
  ) |>
  add_filters(
      filter_range(~value)
  )
```

## Other components

- [`add_filters()`](https://jhumbl.github.io/maplamina/reference/add_filters.md)
  - [`filter_range()`](https://jhumbl.github.io/maplamina/reference/filter_range.md)
    numeric slider
  - [`filter_select()`](https://jhumbl.github.io/maplamina/reference/filter_select.md)
    categorical selector
- [`add_summaries()`](https://jhumbl.github.io/maplamina/reference/add_summaries.md)
  - [`summary_count()`](https://jhumbl.github.io/maplamina/reference/summary_count.md),
    [`summary_mean()`](https://jhumbl.github.io/maplamina/reference/summary_mean.md),
    [`summary_min()`](https://jhumbl.github.io/maplamina/reference/summary_min.md),
    [`summary_max()`](https://jhumbl.github.io/maplamina/reference/summary_max.md),
    [`summary_sum()`](https://jhumbl.github.io/maplamina/reference/summary_sum.md)
- Tooltips/popups:
  [`tmpl()`](https://jhumbl.github.io/maplamina/reference/tmpl.md)
- Optional UI:
  [`add_panel()`](https://jhumbl.github.io/maplamina/reference/add_panel.md) +
  [`section()`](https://jhumbl.github.io/maplamina/reference/section.md)
  /
  [`sections()`](https://jhumbl.github.io/maplamina/reference/sections.md)
- Legends:
  [`add_legend()`](https://jhumbl.github.io/maplamina/reference/add_legend.md)

## Layers

- [`add_circles()`](https://jhumbl.github.io/maplamina/reference/add_circles.md)
  points/circles
- [`add_lines()`](https://jhumbl.github.io/maplamina/reference/add_lines.md)
  paths/lines
- [`add_polygons()`](https://jhumbl.github.io/maplamina/reference/add_polygons.md)
  filled polygons (+ stroke)
- [`add_icons()`](https://jhumbl.github.io/maplamina/reference/add_icons.md)
  /
  [`add_markers()`](https://jhumbl.github.io/maplamina/reference/add_markers.md)
  point icons/markers

## Hardware-dependent demo: filtering 10 Million points

``` r
maplamina() |>
  add_circles(big_dataset, radius=~value) |>
  add_filters(
    filter_range(~value)
  )
```

![Demo](reference/figures/performance_demo.gif)

Demo

## Getting help

- Browse the function docs:
  [`?maplamina`](https://jhumbl.github.io/maplamina/reference/maplamina.md),
  [`?add_circles`](https://jhumbl.github.io/maplamina/reference/add_circles.md),
  [`?add_views`](https://jhumbl.github.io/maplamina/reference/add_views.md),
  [`?add_filters`](https://jhumbl.github.io/maplamina/reference/add_filters.md),
  [`?add_summaries`](https://jhumbl.github.io/maplamina/reference/add_summaries.md).
- Found a bug or want a feature? Please open an issue on GitHub:
  <https://github.com/jhumbl/maplamina/issues>

## Roadmap

Planned improvements include more layer types, additional components,
and alternative themes.

## License

MIT.
