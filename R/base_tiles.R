#' Basemap tile styles
#'
#' A named list of MapLibre-compatible style URLs for common open-source
#' basemaps. Pass any entry directly to the \code{style} argument of
#' \code{\link{maplamina}}.
#'
#' @format A named list of character strings (URLs).
#'
#' \describe{
#'   \item{carto_positron}{Light basemap with labels. Good default for thematic maps.}
#'   \item{carto_positron_nolabels}{Light basemap without labels. Clean background for dense data.}
#'   \item{carto_dark_matter}{Dark basemap with labels. Good for glowing point layers.}
#'   \item{carto_dark_matter_nolabels}{Dark basemap without labels.}
#'   \item{carto_voyager}{Colored basemap with labels. More geographic detail than Positron.}
#'   \item{carto_voyager_nolabels}{Colored basemap without labels.}
#'   \item{openfreemap_liberty}{OSM Liberty style hosted by OpenFreeMap. No API key required.}
#'   \item{openfreemap_bright}{OSM Bright style hosted by OpenFreeMap. No API key required.}
#'   \item{openfreemap_positron}{Positron style hosted by OpenFreeMap. No API key required.}
#'   \item{demotiles}{MapLibre demo tiles. Lightweight, no API key, useful for testing.}
#' }
#'
#' @examples
#' # Use the default (Carto Positron)
#' maplamina(nc) |> add_polygons(fill_color = ~BIR74)
#'
#' # Dark basemap
#' maplamina(nc, style = base_tiles$carto_dark_matter) |>
#'   add_polygons(fill_color = ~BIR74)
#'
#' # No-label variant for dense point data
#' maplamina(quakes_sf, style = base_tiles$carto_positron_nolabels) |>
#'   add_circle_markers(radius = ~mag)
#'
#' # Any custom MapLibre style URL also works
#' maplamina(nc, style = "https://my-tiles.example.com/style.json")
#'
#' @export
base_tiles <- list(

  # --- CARTO (free, no API key, vector tiles) ---
  carto_positron           = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  carto_positron_nolabels  = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json",
  carto_dark_matter        = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  carto_dark_matter_nolabels = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
  carto_voyager            = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  carto_voyager_nolabels   = "https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json",

  # --- OpenFreeMap (free, no API key, vector tiles) ---
  openfreemap_liberty      = "https://tiles.openfreemap.org/styles/liberty",
  openfreemap_bright       = "https://tiles.openfreemap.org/styles/bright",
  openfreemap_positron     = "https://tiles.openfreemap.org/styles/positron",
  openfreemap_dark         = "https://tiles.openfreemap.org/styles/dark",

  # --- MapLibre demo tiles (lightweight, good for testing) ---
  demotiles                = "https://demotiles.maplibre.org/style.json"
)
