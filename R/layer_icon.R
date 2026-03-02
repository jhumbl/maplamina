#' Add an icon layer
#'
#' Adds a point icon layer. Icons are referenced by id (resolved in the frontend icon set).
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param data Data for this layer. If `NULL`, uses the default `data` supplied to [maplamina()].
#' @param lon,lat Longitude/latitude aesthetics (formula or scalar). Required for non-`sf` data.
#' @param icon Icon id string (e.g. `"marker"`).
#' @param size,color,opacity Icon size and color/opacity (can be formulas).
#' @param tooltip,popup Optional [tmpl()] objects (or `NULL`) for hover/click content.
#' @param id,group Optional layer id and group name.
#' @param pickable Logical; whether features can be picked (tooltip/popup).
#' @param size_units Units for `size`; one of `"pixels"`, `"meters"`, or `"common"`.
#' @param size_min_pixels,size_max_pixels Optional clamp in pixels when using meter/common units.
#' @param icon_anchor Optional anchor (frontend-specific).
#' @param mask Logical; whether to mask the icon.
#' @param occlude Logical; whether icons occlude each other.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' d <- data.frame(
#'   lon   = runif(1000, -60, 60),
#'   lat   = runif(1000, -60, 60),
#'   value = runif(1000, 1, 10)
#' )
#' maplamina() |>
#'   add_icons(d, icon = "star", size = 20)
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

#' Add a marker layer
#'
#' Convenience wrapper around [add_icons()] using the default marker icons.
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param data Data for this layer. If `NULL`, uses the default `data` supplied to [maplamina()].
#' @param lon,lat Longitude/latitude aesthetics (formula or scalar). Required for non-`sf` data.
#' @param size,color,opacity Marker size and color/opacity (can be formulas).
#' @param tooltip,popup Optional [tmpl()] objects (or `NULL`) for hover/click content.
#' @param id,group Optional layer id and group name.
#' @param pickable Logical; whether features can be picked (tooltip/popup).
#' @param size_units Units for `size`; one of `"pixels"`, `"meters"`, or `"common"`.
#' @param size_min_pixels,size_max_pixels Optional clamp in pixels when using meter/common units.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' d <- data.frame(
#'   lon   = runif(1000, -60, 60),
#'   lat   = runif(1000, -60, 60),
#'   value = runif(1000, 1, 10)
#' )
#' maplamina() |>
#'   add_markers(d, size = ~value * 3)
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
