# ---- Mapflow v3: layers (rendering-only) ----
# Refactor: split from add_layer.R for navigability.

add_icons <- function(
    map, data = NULL,
    lon = NULL, lat = NULL,
    icon = "marker", size = 18, color = "#3388ff", opacity = 1,
    tooltip = NULL, popup = NULL,
    id = NULL, group = NULL,
    pickable = TRUE,
    size_units = c("pixels", "meters", "common"),
    size_min_pixels = NULL, size_max_pixels = 64,
    icon_anchor = NULL,
    mask = TRUE,
    occlude = FALSE
) {

  size_units <- match.arg(size_units)

  rd <- .ml_resolve_layer_data(map, data, substitute(data))
  data <- rd$data

  dots <- list(
    lon = lon,
    lat = lat,
    size = size,
    fillColor = color,
    fillOpacity = opacity
  )

  cfg_extra <- list(
    sizeUnits     = size_units,
    sizeMinPixels = size_min_pixels,
    sizeMaxPixels = size_max_pixels,
    icon          = icon,
    iconAnchor    = icon_anchor,
    mask          = isTRUE(mask),
    occlude       = isTRUE(occlude)
  )

  add_layer(
    map, "icon", data, geom = "Point", dots = dots,
    id = id, group = group,
    pickable = pickable,
    cfg_extra = cfg_extra,
    tooltip = tooltip, popup = popup
  )
}

add_markers <- function(
    map, data = NULL,
    lon = NULL, lat = NULL,
    size = 18,
    color = "dodgerblue",
    opacity = 1,
    tooltip = NULL,
    popup = NULL,
    id = NULL,
    group = NULL,
    pickable = TRUE,
    size_units = c("pixels", "meters", "common"),
    size_min_pixels = NULL,
    size_max_pixels = NULL
) {

  size_units <- match.arg(size_units)

  rd <- .ml_resolve_layer_data(map, data, substitute(data))
  data <- rd$data

  dots <- list(
    lon = lon,
    lat = lat,
    size = size,
    fillColor = color,
    fillOpacity = opacity
  )

  cfg_extra <- list(
    icon          = "geo_alt_fill",
    iconStroke    = "geo_alt",
    sizeUnits     = size_units,
    sizeMinPixels = size_min_pixels,
    sizeMaxPixels = size_max_pixels,
    iconAnchor    = NULL,
    mask          = TRUE,
    occlude       = FALSE
  )

  add_layer(
    map, "marker", data, geom = "Point", dots = dots,
    id = id, group = group,
    pickable = pickable,
    cfg_extra = cfg_extra,
    tooltip = tooltip, popup = popup
  )
}
