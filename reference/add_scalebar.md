# Add MapLibre scale bar

Add MapLibre scale bar

## Usage

``` r
add_scalebar(
  map,
  position = "bottomleft",
  unit = c("metric", "imperial", "nautical"),
  max_width = 100,
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

- unit:

  Units for the scale bar.

- max_width:

  Maximum scale bar width (pixels).

- ...:

  Named options passed through to the underlying MapLibre control.

## Value

The modified map widget.

## Examples

``` r
maplamina() |>
  add_scalebar(unit = "metric")

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}},{"type":"scale","position":"bottomleft","options":{"maxWidth":100,"unit":"metric"}}]},".__layers":[],".__components":{"views":[],"range":[],"select":[],"legends":[],"summaries":[]},".__controls":[],".__panel":null},"evals":[],"jsHooks":[]}
```
