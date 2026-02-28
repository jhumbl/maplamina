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
    .__components = list(views = list(), range = list(), select = list()),
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
