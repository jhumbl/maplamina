# Add MapLibre geolocate control

Add MapLibre geolocate control

## Usage

``` r
add_geolocate(map, position = "topright", track_user_location = FALSE, ...)
```

## Arguments

- map:

  A maplamina widget created by
  [`maplamina()`](https://jhumbl.github.io/maplamina/reference/maplamina.md).

- position:

  Control position: `"topleft"`, `"topright"`, `"bottomleft"`,
  `"bottomright"`.

- track_user_location:

  Logical; keep tracking after initial locate.

- ...:

  Named options passed through to the underlying MapLibre control.

## Value

The modified map widget.

## Examples

``` r
maplamina() |>
  add_geolocate()

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}},{"type":"geolocate","position":"topright","options":{"trackUserLocation":false}}]},".__layers":[],".__components":{"views":[],"range":[],"select":[],"legends":[],"summaries":[]},".__controls":[],".__panel":null},"evals":[],"jsHooks":[]}
```
