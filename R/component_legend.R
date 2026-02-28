add_legend <- function(
    map,
    title = NULL,
    type = c("categorical", "continuous"),
    position = c("bottomleft", "bottomright", "topleft", "topright"),

    # categorical legend inputs
    values = NULL,
    colors = NULL,
    shapes = "square",   # scalar or length(values); can also contain icon ids
    sizes  = NULL,       # NULL -> default; scalar or length(values)

    # continuous legend inputs
    range = NULL,
    labels = NULL,
    breaks = NULL,
    gradient = NULL,
    shape = "square",    # single string; can also be an icon id
    size  = 12,          # thickness / swatch size for the legend

    # conditional display
    layer = NULL,
    view = NULL,
    bind = NULL,

    id = NULL
) {


  type <- match.arg(type)
  position <- match.arg(position)

  reserved_shapes <- c("circle", "square", "line", "icon")

  # title
  if (!is.null(title)) {
    if (length(title) != 1L) stop("`title` must be NULL or a single string.", call. = FALSE)
    if (!is.character(title)) title <- as.character(title)
    if (!nzchar(title)) title <- NULL
  }
  # id
  if (is.null(id)) {
    existing <- names(map$x$.__components_raw %||% list()) %||% character()
    tmp <- .ml_next_id(map, prefix = "legend", scope = "prefix", existing_ids = existing)
    map <- tmp$map
    id <- tmp$id
  } else {
    if (length(id) != 1L) stop("`id` must be a single string.", call. = FALSE)
    if (!is.character(id)) id <- as.character(id)
  }

  # bind (views-style): default to id
  if (!is.null(bind)) {
    if (length(bind) != 1L) stop("`bind` must be NULL or a single string.", call. = FALSE)
    if (!is.character(bind)) bind <- as.character(bind)
    if (!nzchar(bind)) bind <- NULL
  }
  bind <- bind %||% id

  # when
  when <- NULL
  if (!is.null(layer) || !is.null(view)) {
    if (!is.null(layer)) {
      if (length(layer) != 1L) stop("`layer` must be a single string.", call. = FALSE)
      if (!is.character(layer)) layer <- as.character(layer)
      if (!nzchar(layer)) layer <- NULL
    }
    if (!is.null(view)) {
      if (!is.character(view)) view <- as.character(view)
      view <- as.character(view)
      if (!length(view)) view <- NULL
      if (!is.null(view)) view <- .ml_json_array_chr(view)
    }
    when <- list(layer = layer %||% NULL, view = view %||% NULL)
  }

  # helper: convert shape string to (shape, icon?) rule
  shape_to_spec <- function(s) {
    if (!is.character(s) || length(s) != 1L) s <- as.character(s[[1L]])
    if (!nzchar(s)) stop("Shape values must be non-empty strings.", call. = FALSE)

    if (identical(s, "icon")) {
      stop("Do not use shape = 'icon' directly. Use an icon id string (e.g. 'geo_alt_fill').", call. = FALSE)
    }

    if (s %in% c("circle", "square", "line")) {
      list(shape = s)
    } else {
      list(shape = "icon", icon = s)
    }
  }

  if (type == "categorical") {

    if (is.null(values) || is.null(colors)) {
      stop("For `type = 'categorical'`, provide `values` and `colors`.", call. = FALSE)
    }
    if (!is.character(values)) values <- as.character(values)
    if (!is.character(colors)) colors <- as.character(colors)

    if (length(values) != length(colors)) {
      stop("`values` and `colors` must have the same length.", call. = FALSE)
    }
    n <- length(values)

    # shapes: scalar or vector
    if (is.null(shapes)) shapes <- "square"
    if (!is.character(shapes)) shapes <- as.character(shapes)
    if (length(shapes) == 1L) shapes <- rep(shapes, n)
    if (length(shapes) != n) stop("`shapes` must be length 1 or same length as `values`.", call. = FALSE)

    # sizes: optional scalar or vector
    if (!is.null(sizes)) {
      if (length(sizes) == 1L) sizes <- rep(sizes, n)
      if (length(sizes) != n) stop("`sizes` must be length 1 or same length as `values`.", call. = FALSE)
      sizes <- as.numeric(sizes)
    }

    items <- vector("list", n)
    for (i in seq_len(n)) {
      s <- shapes[[i]]
      ss <- shape_to_spec(s)

      it <- list(
        label = values[[i]],
        color = colors[[i]],
        shape = ss$shape
      )
      if (!is.null(ss$icon)) it$icon <- ss$icon
      if (!is.null(sizes)) it$size <- sizes[[i]]

      items[[i]] <- it
    }
    legend <- list(
      title = title,
      type = "categorical",
      items = items
    )

  } else {

    # continuous
    if (is.null(range) || length(range) != 2L) {
      stop("For `type = 'continuous'`, provide `range = c(min, max)`.", call. = FALSE)
    }
    range <- as.numeric(range)

    if (is.null(gradient) || length(gradient) < 2L) {
      stop("For `type = 'continuous'`, provide `gradient` with 2+ colors.", call. = FALSE)
    }
    if (!is.character(gradient)) gradient <- as.character(gradient)

    if (!is.null(breaks)) {
      breaks <- as.numeric(breaks)
    }

    if (is.null(labels)) {
      labels <- as.character(range)
    } else {
      if (!is.character(labels)) labels <- as.character(labels)
      labels <- as.character(labels)
    }

    if (!is.character(shape)) shape <- as.character(shape)
    if (length(shape) != 1L) stop("`shape` must be a single string.", call. = FALSE)

    size <- as.numeric(size)

    ss <- shape_to_spec(shape)

    scale <- list(
      range = range,
      labels = labels,
      breaks = breaks %||% NULL,
      gradient = gradient
    )
    legend <- list(
      title = title,
      type = "continuous",
      scale = scale,
      shape = ss$shape,
      size = size
    )
    if (!is.null(ss$icon)) legend$icon <- ss$icon

  }
  # Ensure registries exist (Stage 3+: flat component list)
  if (is.null(map$x$.__components_raw)) {
    map$x$.__components_raw <- list()
  }

  if (!is.null(map$x$.__components_raw[[id]])) {
    stop("A component with id '", id, "' already exists.", call. = FALSE)
  }

  map$x$.__components_raw[[id]] <- list(
    type     = "legends",
    id       = id,
    bind     = bind,
    position = position,
    legend   = legend,
    when     = when
  )

  map
}
