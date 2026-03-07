# Getting started with maplamina

`maplamina` is an interactive mapping package for R built on MapLibre GL
and deck.gl, with a pipe-friendly, R-native API. It does not require a
Mapbox token.

A common pattern in interactive mapping is to duplicate layers in order
to compare the same geography across different years or metrics. For
example, you might create one layer for 2020, another for 2021, and
another for 2022, then switch between them with a layer control.

In `maplamina`, those are often better thought of as different **views**
of the same layer. Instead of repeating the layer definition, you define
the layer once and then describe how that layer should change across
views.

## The core idea: one layer, multiple views

The contrast looks like this.

``` r
# Repeating the layer for each year
rmap() |>
  add_circles(data, radius = ~value_2020, group = "2020") |>
  add_circles(data, radius = ~value_2021, group = "2021") |>
  add_circles(data, radius = ~value_2022, group = "2022") |>
  add_layer_control(base_groups = c("2020", "2021", "2022"))
```

In `maplamina`, the same idea becomes:

``` r
maplamina() |>
  add_circles(data) |>
  add_views(
    view("2020", radius = ~value_2020),
    view("2021", radius = ~value_2021),
    view("2022", radius = ~value_2022)
  )
```

This is the core mental model of the package: a single layer can have
multiple named states, and the user can move between them without
duplicating the layer definition.

## A minimal example

We’ll make a small point dataset with coordinates, a region, and three
yearly values.

``` r
set.seed(1)

n <- 2000

d <- data.frame(
  lon = runif(n, -3, 1),
  lat = runif(n, 51, 55),
  region = sample(c("North", "Midlands", "South"), n, replace = TRUE),
  value_2020 = runif(n, 1, 10),
  value_2021 = runif(n, 1, 10),
  value_2022 = runif(n, 1, 10)
)

head(d)
#>          lon      lat   region value_2020 value_2021 value_2022
#> 1 -1.9379653 54.48722 Midlands   8.505067   5.406469   7.937521
#> 2 -1.5115044 54.86879    North   1.946421   5.490478   6.388170
#> 3 -0.7085865 54.46767 Midlands   1.125321   1.689280   3.957612
#> 4  0.6328312 52.75086 Midlands   8.683088   6.476601   2.289228
#> 5 -2.1932723 51.76775 Midlands   9.768683   4.955372   5.907861
#> 6  0.5935587 51.32918    South   4.138881   3.583699   3.125425
```

Now create a circle layer and define three views that map radius to a
different column each time.

``` r
maplamina() |>
  add_circles(
    d,
    stroke = FALSE,
    fill_color = "darkblue"
  ) |>
  add_views(
    view("2020", radius = ~value_2020),
    view("2021", radius = ~value_2021),
    view("2022", radius = ~value_2022)
  )
```

Even in this small example, the code stays compact because the layer is
defined once and only the view-specific mapping changes.

## Adding filters

Here we add:

- a range filter for the 2022 values
- a select filter for region

``` r
maplamina() |>
  add_circles(
    d,
    stroke = FALSE,
    fill_color = "darkblue"
  ) |>
  add_views(
    view("2020", radius = ~value_2020),
    view("2021", radius = ~value_2021),
    view("2022", radius = ~value_2022)
  ) |>
  add_filters(
    filter_range(~value_2022),
    filter_select(~region)
  )
```

This is often a useful pattern for exploratory work: one shared layer,
several views, and a small number of filters that help narrow the data
interactively.

## Why views matter

Treating views as a first-class concept keeps the code closer to the
underlying analysis problem.

When you are comparing:

- years
- scenarios
- metrics
- model outputs
- alternative classifications

you often are **not** dealing with different layers in a conceptual
sense. You are looking at the same layer under different states.
Expressing that directly tends to make code shorter, easier to maintain,
and easier to extend.

This becomes especially helpful when the number of comparisons grows.
Adding a fourth or fifth view is just another `view(...)` call, rather
than another duplicated layer block.

## Where to go next

This vignette focuses on the basic pattern of:

1.  create a map
2.  add a layer
3.  define one or more views
4.  add filters

From here, the next useful functions to explore are:

- [`add_summaries()`](https://jhumbl.github.io/maplamina/reference/add_summaries.md)
  for headline summary values
- [`add_legend()`](https://jhumbl.github.io/maplamina/reference/add_legend.md)
  for map legends
- [`add_panel()`](https://jhumbl.github.io/maplamina/reference/add_panel.md)
  with
  [`section()`](https://jhumbl.github.io/maplamina/reference/section.md)
  /
  [`sections()`](https://jhumbl.github.io/maplamina/reference/sections.md)
  for optional UI layout
- other layer types such as
  [`add_lines()`](https://jhumbl.github.io/maplamina/reference/add_lines.md),
  [`add_polygons()`](https://jhumbl.github.io/maplamina/reference/add_polygons.md),
  [`add_icons()`](https://jhumbl.github.io/maplamina/reference/add_icons.md),
  and
  [`add_markers()`](https://jhumbl.github.io/maplamina/reference/add_markers.md)
