# ---- Mapflow v3: layers (rendering-only) ----
# Refactor: split from add_layer.R for navigability.

add_lines <- function(
    map, data = NULL,
    color = "#3388ff", opacity = 1, width = 1,
    tooltip = NULL, popup = NULL,
    id = NULL, group = NULL,
    pickable = TRUE,
    width_units = c("meters", "pixels", "common"),
    width_min_pixels = NULL, width_max_pixels = NULL
) {

  width_units <- match.arg(width_units)

  rd <- .ml_resolve_layer_data(map, data, substitute(data))
  data <- rd$data

  dots <- list(
    lineColor = color,
    lineWidth = width,
    opacity   = opacity
  )

  cfg_extra <- list(
    widthUnits     = width_units,
    widthMinPixels = width_min_pixels,
    widthMaxPixels = width_max_pixels
  )

  add_layer(
    map, "line", data, geom = "Line", dots = dots,
    id = id, group = group,
    pickable = pickable,
    stroke = FALSE,
    cfg_extra = cfg_extra,
    tooltip = tooltip, popup = popup
  )
}
