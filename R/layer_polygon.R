# ---- Mapflow v3: layers (rendering-only) ----
# Refactor: split from add_layer.R for navigability.

add_polygons <- function(
    map, data = NULL,
    color = "darkblue", opacity = 1, width = 1,
    fill_color = "dodgerblue", fill_opacity = 0.6,
    stroke = TRUE,
    elevation = NULL, elevation_scale = 1,
    tooltip = NULL, popup = NULL,
    id = NULL, group = NULL,
    pickable = TRUE,
    width_units = c("pixels", "meters", "common"),
    width_min_pixels = NULL, width_max_pixels = NULL
) {

  width_units <- match.arg(width_units)

  rd <- .ml_resolve_layer_data(map, data, substitute(data))
  data <- rd$data

  dots <- list(
    fillColor   = fill_color,
    fillOpacity = fill_opacity,
    lineColor   = color,
    lineWidth   = width,
    opacity     = opacity,
    elevation   = elevation
  )

  cfg_extra <- list(
    lineWidthUnits     = width_units,
    lineWidthMinPixels = width_min_pixels,
    lineWidthMaxPixels = width_max_pixels,
    elevationScale     = elevation_scale
  )

  add_layer(
    map, "polygon", data, geom = "Polygon", dots = dots,
    id = id, group = group,
    pickable = pickable,
    stroke = isTRUE(stroke),
    cfg_extra = cfg_extra,
    tooltip = tooltip, popup = popup
  )
}
