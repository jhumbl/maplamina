#' Create a Maplamina map widget
#'
#' Creates an interactive MapLibre + deck.gl map widget. You can add layers and
#' UI components (views/filters/summaries/panel) with the `add_*()` functions.
#'
#' @param data Optional default dataset used by subsequent `add_*()` calls when
#'   their `data` argument is `NULL`.
#' @param style MapLibre style URL (or a named style from `base_tiles`).
#' @param projection Map projection; one of `"mercator"` or `"globe"`.
#' @param dragRotate Logical; whether drag-rotate is enabled (also affects compass).
#' @param fit_bounds Logical; whether the map initially fits the bounds of all layers.
#' @param show_layer_controls Logical; show built-in per-layer visibility controls.
#' @param width,height Widget width/height (CSS units or numeric pixels). If `height`
#'   is `NULL`, a viewer-friendly default is used.
#' @param elementId Optional HTML element id.
#'
#' @return An `htmlwidget` maplamina widget.
#' @export
#'
#' @examples
#' # Minimal widget
#' maplamina()
#'
#' # With default data + a circles layer
#' q <- datasets::quakes
#' maplamina(q) |>
#'   add_circles(fill_color = color_quantile(~depth, "Inferno"))
maplamina <- function(
    data = NULL,
    style = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    projection = c("mercator", "globe"),
    dragRotate = FALSE,
    fit_bounds = TRUE,
    show_layer_controls = TRUE,
    width = NULL,
    height = NULL,
    elementId = NULL
) {

  default_data_name <- NULL
  if (!missing(data) && !is.null(data)) {
    default_data_name <- deparse1(substitute(data))
  }

  projection <- match.arg(projection)

  x <- list(
    map_options = list(
      style = style,
      projection = projection,
      dragRotate = isTRUE(dragRotate),
      fit_bounds = isTRUE(fit_bounds)
    ),

    .__layers = list(),

    # Stage 3 target fields
    .__components = list(views = list(), range = list(), select = list(), legends = list(), summaries = list()),
    .__controls   = list(),
    .__panel      = NULL,

    # Internal-only (compiler input)
    # Stage 3+: raw components are registered as a flat list of records:
    # .__components_raw[[id]] = list(type = <component_type>, id = <id>, layer = <layer_id>, bind = <bind_id>, ...)
    .__components_raw = list(),
    .__data_registry  = list(),
    .__layer_meta     = list(),

    # default-data plumbing (used by add_layer wrappers)
    .__default_data = data,
    .__default_data_name = default_data_name,

    show_layer_controls = isTRUE(show_layer_controls),
    .toggle = 0
  )

  # Leaflet-like sizing:
  # - In documents (Quarto/Rmd): default height is 464px
  # - In the RStudio Viewer / standalone viewer pane: fill available space
  #
  # Note: the RStudio Viewer is effectively an embedded browser. Setting
  # browser.fill=TRUE helps ensure full-height behavior in that context.
  sp <- if (is.null(height)) {
    htmlwidgets::sizingPolicy(
      defaultWidth  = "100%",
      defaultHeight = 464,
      padding       = 0,
      viewer.fill   = TRUE,
      browser.fill  = TRUE
    )
  } else {
    htmlwidgets::sizingPolicy(padding = 0)
  }

  map <- htmlwidgets::createWidget(
    name = "maplamina",
    x = x,
    width = width,
    height = height,
    sizingPolicy = sp,
    package = "maplamina",
    elementId = elementId,
    preRenderHook = .ml_prerender
  )

  # Default NavigationControl: show compass only when dragRotate is enabled
  add_navigation(
    map,
    position = "topright",
    compass = isTRUE(map$x$map_options$dragRotate),
    zoom_controls = TRUE
  )
}

# Note: .ml_prerender() is defined in compiler.R
