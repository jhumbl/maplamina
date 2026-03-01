#' Add a polygon layer
#'
#' Adds a polygon layer (fill + optional stroke). For data-driven fills, use a
#' color scale spec such as [color_quantile()] or [color_factor()].
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param data Data for this layer. Typically an `sf` object with POLYGON/MULTIPOLYGON geometry.
#' @param color,opacity,width Stroke color/opacity/width.
#' @param fill_color,fill_opacity Fill color/opacity. `fill_color` can be a single color,
#'   a vector of colors, or a color scale spec such as [color_quantile()].
#' @param stroke Logical; draw polygon stroke.
#' @param elevation,elevation_scale Optional extrusion height (numeric or formula) and scale.
#' @param tooltip,popup Optional [tmpl()] objects (or `NULL`) for hover/click content.
#' @param id,group Optional layer id and group name.
#' @param pickable Logical; whether features can be picked (tooltip/popup).
#' @param width_units Units for stroke `width`; one of `"pixels"`, `"meters"`, or `"common"`.
#' @param width_min_pixels,width_max_pixels Optional clamp in pixels when using meter/common units.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' if (requireNamespace("sf", quietly = TRUE)) {
#'   nc <- sf::st_read(system.file("shape/nc.shp", package = "sf"), quiet = TRUE)
#'   maplamina(nc) |>
#'     add_polygons(fill_color = color_quantile(~BIR74), stroke = FALSE)
#' }
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
