# Add MapLibre navigation controls

Adds zoom buttons and/or compass control.

## Usage

``` r
add_navigation(
  map,
  position = "topright",
  compass = TRUE,
  zoom_controls = TRUE,
  ...
)
```

## Arguments

- map:

  A maplamina widget created by
  [`maplamina()`](https://jhumbl.github.io/maplamina/reference/maplamina.md).

- position:

  Control position: `"topleft"`, `"topright"`, `"bottomleft"`,
  `"bottomright"`.

- compass:

  Logical; show compass control.

- zoom_controls:

  Logical; show zoom buttons.

- ...:

  Named options passed through to the underlying MapLibre control.

## Value

The modified map widget.

## Examples

``` r
maplamina() |>
  add_navigation(position = "topright", compass = FALSE)

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}}]},".__layers":[],".__components":{"views":[],"range":[],"select":[],"legends":[],"summaries":[]},".__controls":[],".__panel":null},"evals":[],"jsHooks":[]}
```
