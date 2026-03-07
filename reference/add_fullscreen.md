# Add MapLibre fullscreen control

Add MapLibre fullscreen control

## Usage

``` r
add_fullscreen(map, position = "topright", ...)
```

## Arguments

- map:

  A maplamina widget created by
  [`maplamina()`](https://jhumbl.github.io/maplamina/reference/maplamina.md).

- position:

  Control position: `"topleft"`, `"topright"`, `"bottomleft"`,
  `"bottomright"`.

- ...:

  Named options passed through to the underlying MapLibre control.

## Value

The modified map widget.

## Examples

``` r
maplamina() |>
  add_fullscreen()

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}},{"type":"fullscreen","position":"topright"}]},".__layers":[],".__components":{"views":[],"range":[],"select":[],"legends":[],"summaries":[]},".__controls":[],".__panel":null},"evals":[],"jsHooks":[]}
```
