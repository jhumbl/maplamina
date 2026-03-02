#' Add a circle layer
#'
#' Adds a GPU-rendered circle layer (points). Use formulas (e.g. `~mag * 2`) to
#' map columns to aesthetics.
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param data Data for this layer. If `NULL`, uses the default `data` supplied to [maplamina()].
#' @param lon,lat Longitude/latitude aesthetics (formula or scalar). Required for non-`sf` data.
#' @param color,opacity,width Stroke color/opacity/width.
#' @param fill_color,fill_opacity Fill color/opacity. `fill_color` can be a single color,
#'   a vector of colors, or a color scale spec such as [color_quantile()].
#' @param radius Circle radius (numeric or formula).
#' @param stroke Logical; draw circle stroke.
#' @param tooltip,popup Optional [tmpl()] objects (or `NULL`) for hover/click content.
#' @param id,group Optional layer id and group name.
#' @param pickable Logical; whether features can be picked (tooltip/popup).
#' @param radius_units Units for `radius`; one of `"pixels"`, `"meters"`, or `"common"`.
#' @param radius_min_pixels,radius_max_pixels Optional clamp in pixels when using meter/common units.
#' @param width_units Units for stroke `width`; one of `"pixels"`, `"meters"`, or `"common"`.
#' @param width_min_pixels,width_max_pixels Optional clamp in pixels when using meter/common units.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' q <- datasets::quakes
#' maplamina(q) |>
#'   add_circles(radius = ~mag * 2, fill_color = "dodgerblue")
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
