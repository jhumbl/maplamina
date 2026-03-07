# Add a legend component

Adds a categorical or continuous legend. Legends can be conditionally
displayed based on layer/view, and can be mounted via the panel by
`bind`.

## Usage

``` r
add_legend(
  map,
  title = NULL,
  type = c("categorical", "continuous"),
  position = c("bottomleft", "bottomright", "topleft", "topright"),
  values = NULL,
  colors = NULL,
  shapes = "square",
  sizes = NULL,
  range = NULL,
  labels = NULL,
  breaks = NULL,
  gradient = NULL,
  shape = "square",
  size = 12,
  layer = NULL,
  view = NULL,
  bind = NULL,
  id = NULL
)
```

## Arguments

- map:

  A maplamina widget created by
  [`maplamina()`](https://jhumbl.github.io/maplamina/reference/maplamina.md).

- title:

  Optional legend title.

- type:

  Legend type: `"categorical"` or `"continuous"`.

- position:

  Legend position hint: `"bottomleft"`, `"bottomright"`, `"topleft"`,
  `"topright"`.

- values, colors:

  Categorical legend labels and colors (same length).

- shapes, sizes:

  Optional categorical shapes/sizes (length 1 or length(values)).

- range, labels, breaks:

  Continuous legend range/labels/breaks.

- gradient:

  Vector of 2+ colors for the continuous legend.

- shape, size:

  Continuous legend swatch/shape and size.

- layer, view:

  Optional conditional display rule.

- bind:

  Bind group id for mounting in the panel (defaults to legend id).

- id:

  Optional component id (otherwise generated).

## Value

The modified map widget.

## Examples

``` r
maplamina() |>
  add_legend(
    title = "Magnitude",
    type = "continuous",
    range = c(3, 7),
    gradient = c("lightyellow", "red")
  )

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}}]},".__layers":[],".__components":{"views":[],"range":[],"select":[],"legends":{"legend1":{"type":"legends","id":"legend1","bind":"legend1","position":"bottomleft","legend":{"title":"Magnitude","type":"continuous","scale":{"range":[3,7],"labels":["3","7"],"breaks":null,"gradient":["lightyellow","red"]},"shape":"square","size":12},"when":null}},"summaries":[]},".__controls":{"legend1":{"type":"legends","members":["legend1"],"position":"bottomleft"}},".__panel":null},"evals":[],"jsHooks":[]}
```
