# ---- Mapflow v3: layers (rendering-only) ----
# Refactor: split from add_layer.R for navigability.

add_circles <- function(
    map, data = NULL,
    lon = NULL, lat = NULL,
    color = "darkblue", opacity = 1, width = 1,
    fill_color = "dodgerblue", fill_opacity = 0.8,
    radius = 6,
    stroke = TRUE,
    tooltip = NULL, popup = NULL,
    id = NULL, group = NULL,
    pickable = TRUE,
    radius_units = c("pixels", "meters", "common"),
    radius_min_pixels = NULL, radius_max_pixels = NULL,
    width_units = c("pixels", "meters", "common"),
    width_min_pixels = NULL, width_max_pixels = NULL
) {

  radius_units <- match.arg(radius_units)
  width_units  <- match.arg(width_units)

  rd <- .ml_resolve_layer_data(map, data, substitute(data))
  data <- rd$data

  dots <- list(
    lon = lon,
    lat = lat,
    radius      = radius,
    lineColor   = color,
    lineWidth   = width,
    opacity     = opacity,
    fillColor   = fill_color,
    fillOpacity = fill_opacity
  )

  cfg_extra <- list(
    radiusUnits         = radius_units,
    radiusMinPixels     = radius_min_pixels,
    radiusMaxPixels     = radius_max_pixels,
    lineWidthUnits      = width_units,
    lineWidthMinPixels  = width_min_pixels,
    lineWidthMaxPixels  = width_max_pixels
  )

  add_layer(
    map, "circle", data, geom = "Point", dots = dots,
    id = id, group = group,
    pickable = pickable,
    stroke = isTRUE(stroke),
    cfg_extra = cfg_extra,
    tooltip = tooltip, popup = popup
  )
}
