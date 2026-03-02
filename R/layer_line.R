#' Add a line layer
#'
#' Adds a GPU-rendered line/path layer.
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param data Data for this layer. Typically an `sf` object with LINESTRING geometry.
#' @param color,opacity,width Line color/opacity/width.
#' @param tooltip,popup Optional [tmpl()] objects (or `NULL`) for hover/click content.
#' @param id,group Optional layer id and group name.
#' @param pickable Logical; whether features can be picked (tooltip/popup).
#' @param width_units Units for `width`; one of `"meters"`, `"pixels"`, or `"common"`.
#' @param width_min_pixels,width_max_pixels Optional clamp in pixels when using meter/common units.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' if (requireNamespace("sf", quietly = TRUE)) {
#'   ln <- sf::st_sfc(
#'     sf::st_linestring(matrix(c(-122.4, 37.8, -122.5, 37.85), ncol = 2, byrow = TRUE)),
#'     crs = 4326
#'   )
#'   ln <- sf::st_sf(id = 1, geometry = ln)
#'
#'   maplamina(ln) |>
#'     add_lines(color = "black", width = 3)
#' }
add_lines <- function(
    map, data = NULL,
    color = "#3388ff", opacity = 1, width = 1,
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
