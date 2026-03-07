# Add a line layer

Adds a GPU-rendered line/path layer.

## Usage

``` r
add_lines(
  map,
  data = NULL,
  color = "#3388ff",
  opacity = 1,
  width = 1,
  tooltip = NULL,
  popup = NULL,
  id = NULL,
  group = NULL,
  pickable = TRUE,
  width_units = c("pixels", "meters", "common"),
  width_min_pixels = NULL,
  width_max_pixels = NULL
)
```

## Arguments

- map:

  A maplamina widget created by
  [`maplamina()`](https://jhumbl.github.io/maplamina/reference/maplamina.md).

- data:

  Data for this layer. Typically an `sf` object with LINESTRING
  geometry.

- color, opacity, width:

  Line color/opacity/width.

- tooltip, popup:

  Optional
  [`tmpl()`](https://jhumbl.github.io/maplamina/reference/tmpl.md)
  objects (or `NULL`) for hover/click content.

- id, group:

  Optional layer id and group name.

- pickable:

  Logical; whether features can be picked (tooltip/popup).

- width_units:

  Units for `width`; one of `"meters"`, `"pixels"`, or `"common"`.

- width_min_pixels, width_max_pixels:

  Optional clamp in pixels when using meter/common units.

## Value

The modified map widget.

## Examples

``` r
if (requireNamespace("sf", quietly = TRUE)) {
  ln <- sf::st_sfc(
    sf::st_linestring(matrix(c(-122.4, 37.8, -122.5, 37.85), ncol = 2, byrow = TRUE)),
    crs = 4326
  )
  ln <- sf::st_sf(id = 1, geometry = ln)

  maplamina(ln) |>
    add_lines(color = "black", width = 3)
}

{"x":{"map_options":{"style":"https://basemaps.cartocdn.com/gl/positron-gl-style/style.json","projection":"mercator","dragRotate":false,"fit_bounds":true,"controls":[{"type":"navigation","position":"topright","options":{"showZoom":true,"showCompass":false}}]},".__layers":{"line1":{"id":"line1","type":"line","group":null,"data_columns":{"path":{"positions":{"ref":"path.pos"},"path_starts":{"ref":"path.starts"},"length":1,"size":2},"feature_index":{"values":{"ref":"feature_index"}}},"base_encodings":{"lineWidth":{"value":3},"lineColor":{"value":[0,0,0,255]}},"cfg":{"pickable":true,"stroke":false,"widthUnits":"pixels"},"bbox":[-122.5,37.8,-122.4,37.85],"coordinate_origin":[-122.45,37.825],"dataStore":{"blobs":{"blob_6d9ab5f3e2c0db31":{"dtype":"f32","href":{"data":"data:application/octet-stream;base64,zcxMPc3MzLzNzEy9zczMPA=="},"length":4},"blob_9ce349587b405f2c":{"dtype":"u32","href":{"data":"data:application/octet-stream;base64,AAAAAA=="},"length":1}},"refs":{"path.starts":"blob_9ce349587b405f2c","feature_index":"blob_9ce349587b405f2c","path.pos":"blob_6d9ab5f3e2c0db31"}}}},".__components":{"views":[],"range":[],"select":[],"legends":[],"summaries":[]},".__controls":[],".__panel":null},"evals":[],"jsHooks":[]}
```
