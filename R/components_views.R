#' Define a view
#'
#' A view is a named set of overrides (e.g. radius/opacity) that can be switched
#' via a shared views selector created by [add_views()].
#'
#' @param name View name shown in the UI.
#' @param ... Named overrides for layer aesthetics (e.g. `radius = ~mag * 3`, `opacity = 0.3`).
#'
#' @return A view specification object.
#' @export
#'
#' @examples
#' v <- view("magnitude", radius = ~mag * 3)
#' v
view <- function(name, ...) {
  if (missing(name) || length(name) != 1L) {
    stop("view(): `name` must be a single string (e.g. view('magnitude', ...))")
  }
  if (!is.character(name)) name <- as.character(name)

  dots <- as.list(substitute(list(...)))[-1L]
  if (length(dots) && (is.null(names(dots)) || any(!nzchar(names(dots))))) {
    stop("view(): all view overrides must be named (e.g. view('x', radius = ~mag * 3))")
  }

  # Store the calling env so environment constants inside view() can be resolved.
  attr(dots, "ml_env") <- parent.frame()

  structure(list(
    name = name,
    overrides = dots
  ), class = "ml_view")
}

view_keys <- list(
  circle  = c("radius", "color", "opacity", "width", "fill_color", "fill_opacity"),
  line    = c("color", "opacity", "width"),
  polygon = c("color", "opacity", "width", "fill_color", "fill_opacity", "elevation"),
  icon    = c("size", "color", "opacity"),
  marker  = c("size", "color", "opacity")
)

view_keys_for <- function(layer = NULL) {
  if (is.null(layer)) return(view_keys)
  if (!is.character(layer) || length(layer) != 1L) stop("view_keys_for(): `layer` must be a single string")
  if (!layer %in% names(view_keys)) {
    stop("Unknown layer type '", layer, "'. Known: ", paste(names(view_keys), collapse = ", "))
  }
  view_keys[[layer]]
}

.ml_views_as_named <- function(views) {
  if (is.null(views) || length(views) == 0L) return(NULL)
  if (!is.list(views)) stop("`views` must be a list")

  out <- list()
  nm_in <- names(views)

  for (i in seq_along(views)) {
    v <- views[[i]]
    nm <- if (!is.null(nm_in) && length(nm_in) >= i) nm_in[[i]] else NULL

    if (inherits(v, "ml_view")) {
      vn <- v$name
      if (!is.null(nm) && nzchar(nm) && !identical(nm, vn)) {
        stop("views: name mismatch: list element is named '", nm, "' but view() name is '", vn, "'")
      }
      out[[vn]] <- v$overrides %||% list()
    } else {
      if (is.null(nm) || !nzchar(nm)) {
        stop("views must be either a named list (views = list(name = list(...))) or a list of view() objects")
      }
      if (!is.list(v)) stop("views[['", nm, "']] must be a list of overrides")
      out[[nm]] <- v
    }
  }

  if (anyDuplicated(names(out))) {
    dups <- names(out)[duplicated(names(out))]
    stop("Duplicate view names: ", paste(unique(dups), collapse = ", "))
  }

  out
}

.ml_validate_view_keys <- function(cfg, view_name, layer_type) {
  if (is.null(cfg) || length(cfg) == 0L) return(cfg)
  if (is.null(names(cfg))) return(cfg)

  # Accept a few common aliases quietly (not documented).
  if (!is.null(cfg$fillColor)   && is.null(cfg$fill_color))   cfg$fill_color <- cfg$fillColor
  if (!is.null(cfg$fillOpacity) && is.null(cfg$fill_opacity)) cfg$fill_opacity <- cfg$fillOpacity
  cfg$fillColor <- cfg$fillOpacity <- NULL

  if (!is.null(cfg$stroke_color)   && is.null(cfg$color))   cfg$color <- cfg$stroke_color
  if (!is.null(cfg$stroke_width)   && is.null(cfg$width))   cfg$width <- cfg$stroke_width
  if (!is.null(cfg$stroke_opacity) && is.null(cfg$opacity))  cfg$opacity <- cfg$stroke_opacity
  cfg$stroke_color <- cfg$stroke_width <- cfg$stroke_opacity <- NULL

  allowed <- if (!is.null(layer_type) && layer_type %in% names(view_keys)) {
    view_keys[[layer_type]]
  } else {
    unique(unlist(view_keys, use.names = FALSE))
  }

  unknown <- setdiff(names(cfg), allowed)
  if (length(unknown) > 0L) {
    layer_lbl <- layer_type %||% "<unknown>"
    keys_txt <- paste(sprintf("'%s'", unknown), collapse = ", ")
    see_txt <- if (!is.null(layer_type) && layer_type %in% names(view_keys)) {
      paste0(" See view_keys$", layer_type, ".")
    } else {
      " See view_keys."
    }

    warning(
      sprintf(
        "view '%s': unknown keys for %s layer: %s (ignored).%s",
        view_name, layer_lbl, keys_txt, see_txt
      ),
      call. = FALSE
    )

    cfg[unknown] <- NULL
  }

  cfg
}

.ml_view_opacity_expr <- function(data, expr, default = 1, env = parent.frame()) {
  if (is.null(expr)) return(as.numeric(default))

  # For formulas we defer evaluation to ml_prepare_color(), which already
  # supports length 1 or n.
  if (ml_is_formulaish(expr)) return(expr)

  v <- ml_eval_aes(data, expr, env = env)

  if (length(v) != 1L) {
    stop(
      "Opacity in views must be a scalar or a formula (~col) returning length 1 or n. ",
      "Precomputed vectors are not supported; add them as a column and use ~col.",
      call. = FALSE
    )
  }

  as.numeric(v)
}

.ml_rgba_values_to_dict <- function(rgba_values) {
  if (is.null(rgba_values)) return(NULL)

  if (!is.raw(rgba_values)) {
    stop(".ml_rgba_values_to_dict(): `rgba_values` must be a raw vector.", call. = FALSE)
  }
  if (length(rgba_values) %% 4L != 0L) {
    stop(".ml_rgba_values_to_dict(): `rgba_values` length must be a multiple of 4.", call. = FALSE)
  }

  n <- length(rgba_values) / 4L
  m <- matrix(as.integer(rgba_values), ncol = 4L, byrow = TRUE)

  keys <- paste(m[, 1L], m[, 2L], m[, 3L], m[, 4L], sep = ",")
  ukeys <- unique(keys)
  codes <- match(keys, ukeys) - 1L

  first_idx <- match(ukeys, keys)
  dict_m <- m[first_idx, , drop = FALSE]
  dict_rgba <- as.raw(as.integer(as.vector(t(dict_m))))

  list(dict_rgba = dict_rgba, codes = as.integer(codes))
}

.ml_encode_color <- function(cobj) {
  if (is.null(cobj)) return(NULL)

  if (!is.null(cobj$constant)) {
    return(list(value = as.integer(cobj$constant)))
  }

  if (!is.null(cobj$dict_rgba) && !is.null(cobj$codes)) {
    return(list(encoding = "dict", dict_rgba = cobj$dict_rgba, codes = cobj$codes))
  }

  if (!is.null(cobj$rgba_values)) {
    tmp <- .ml_rgba_values_to_dict(cobj$rgba_values)
    return(list(encoding = "dict", dict_rgba = tmp$dict_rgba, codes = tmp$codes))
  }

  stop("Unexpected color object returned from ml_prepare_color().", call. = FALSE)
}

.ml_normalize_views <- function(data, views, n, layer_type = NULL,
                                base_fill_opacity = 1,
                                base_stroke_opacity = 1,
                                base_stroke_color = NULL,
                                base_fill_color = NULL) {
  if (is.null(views) || length(views) == 0L) return(NULL)

  views_named <- .ml_views_as_named(views)
  if (is.null(views_named) || length(views_named) == 0L) return(NULL)

  out <- list()

  push_view_numeric <- function(enc, key, expr, env) {
    if (is.null(expr)) return()

    is_fml <- ml_is_formulaish(expr)
    v <- ml_eval_aes(data, expr, env = env)

    if (!is_fml && length(v) != 1L) {
      stop(
        key, " in views must be a scalar or a formula (~col). Precomputed vectors are not supported; ",
        "add them as a column and use ~col.",
        call. = FALSE
      )
    }

    if (length(v) == 1L) enc[[key]] <<- list(value = as.numeric(v))
    else if (length(v) == n) enc[[key]] <<- list(value_values = as.numeric(v))
    else stop(key, " formula must return length 1 or n (", n, ").", call. = FALSE)
  }

  for (nm in names(views_named)) {
    cfg <- views_named[[nm]] %||% list()
    cfg <- .ml_validate_view_keys(cfg, view_name = nm, layer_type = layer_type)

    venv <- attr(cfg, "ml_env") %||% parent.frame()

    enc <- list()

    push_view_numeric(enc, "radius",    cfg$radius,    venv)
    push_view_numeric(enc, "size",      cfg$size,      venv)
    push_view_numeric(enc, "lineWidth", cfg$width,     venv)
    push_view_numeric(enc, "elevation", cfg$elevation, venv)

    stroke_op <- .ml_view_opacity_expr(
      data, cfg$opacity,
      default = base_stroke_opacity %||% 1,
      env = venv
    )

    # STRICT: fill opacity does NOT inherit from stroke opacity
    fill_op   <- .ml_view_opacity_expr(
      data, cfg$fill_opacity,
      default = base_fill_opacity %||% 1,
      env = venv
    )

    # Stroke overrides
    has_stroke_override <- !is.null(cfg$color) || !is.null(cfg$opacity)

    # Fill overrides (STRICT: cfg$color does NOT imply fill)
    has_fill_override   <- !is.null(cfg$fill_color) || !is.null(cfg$fill_opacity)

    # Icons/markers: "color/opacity" is the fill color/opacity (no separate fill_* keys)
    if (layer_type %in% c("icon", "marker")) {
      if (has_stroke_override) {
        fill_expr <- cfg$color %||% base_fill_color
        cobj <- ml_prepare_color(fill_expr, opacity = stroke_op, n = n, data = data, env = venv)
        col_enc <- .ml_encode_color(cobj)
        if (!is.null(col_enc)) enc$fillColor <- col_enc
      }
      out[[nm]] <- list(encodings = enc)
      next
    }

    # Lines: only stroke
    if (identical(layer_type, "line")) {
      if (has_stroke_override) {
        stroke_expr <- cfg$color %||% base_stroke_color
        cobj <- ml_prepare_color(stroke_expr, opacity = stroke_op, n = n, data = data, env = venv)
        col_enc <- .ml_encode_color(cobj)
        if (!is.null(col_enc)) enc$lineColor <- col_enc
      }
      out[[nm]] <- list(encodings = enc)
      next
    }

    # Circles / Polygons: stroke + fill kept separate
    if (has_stroke_override) {
      stroke_expr <- cfg$color %||% base_stroke_color
      cobj <- ml_prepare_color(stroke_expr, opacity = stroke_op, n = n, data = data, env = venv)
        col_enc <- .ml_encode_color(cobj)
        if (!is.null(col_enc)) enc$lineColor <- col_enc
    }

    if (has_fill_override) {
      fill_expr <- cfg$fill_color %||% base_fill_color
      cobj <- ml_prepare_color(fill_expr, opacity = fill_op, n = n, data = data, env = venv)
        col_enc <- .ml_encode_color(cobj)
        if (!is.null(col_enc)) enc$fillColor <- col_enc
    }

    out[[nm]] <- list(encodings = enc)
  }

  out
}

#' Add views to a layer
#'
#' Registers a per-layer views component. When multiple layers share the same `bind`,
#' a single selector control is created.
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param ... One or more [view()] objects (or a single list of them).
#' @param id Optional component id (also used as the default bind id).
#' @param bind Bind group id for shared UI control. If omitted, defaults to `id` (or an auto id).
#' @param position Optional UI position hint (applied to the control group).
#' @param layer_id Target layer id (defaults to the most recently added layer).
#' @param duration Animation duration (ms) for switching views.
#' @param easing Easing function name for switching views.
#'
#' @return The modified map widget.
#' @export
#'
#' @examples
#' q <- datasets::quakes
#' maplamina(q) |>
#'   add_circles(lon = ~long, lat = ~lat, radius = 5) |>
#'   add_views(
#'     view("magnitude", radius = ~mag * 3),
#'     view("faint", fill_opacity = 0.2),
#'     bind = "views"
#'   )
add_views <- function(
    map,
    ...,
    id = NULL,
    bind = NULL,
    position = NULL,
    layer_id = NULL,
    duration = 750,
    easing = c("smoothstep", "linear", "easein", "easeout", "easeinout", "easeInOutCubic")
) {

  if (is.null(id)) {
    existing <- names(map$x$.__components_raw %||% list()) %||% character()
    tmp <- .ml_next_id(map, prefix = "views", scope = "prefix", existing_ids = existing)
    map <- tmp$map
    id <- tmp$id
  }
  bind <- bind %||% id

  position <- .ml_ui_validate_position(position)

  target <- .ml_target_layer_id(map, layer_id)

  # Motion for view switching (authored by this views component instance)
  if (!is.numeric(duration) || length(duration) != 1L || !is.finite(duration) || duration < 0) {
    stop("add_views(): `duration` must be a single non-negative number (milliseconds).", call. = FALSE)
  }
  easing <- match.arg(easing)


  # Ensure registries exist (Stage 3+: flat component list)
  if (is.null(map$x$.__components_raw)) {
    map$x$.__components_raw <- list()
  }

  # Ensure only one add_views() per layer
  existing <- map$x$.__components_raw %||% list()
  if (length(existing)) {
    already <- vapply(
      existing,
      function(x) is.list(x) && identical(x$type %||% NULL, "views") && identical(x$layer %||% NULL, target),
      logical(1)
    )
    if (any(already)) {
      stop("Only one add_views() may be specified per layer (layer_id = '", target, "').", call. = FALSE)
    }
  }

  views <- list(...)
  # allow add_views(list(...)) as a single argument
  if (length(views) == 1L && is.list(views[[1L]]) && !inherits(views[[1L]], "ml_view")) {
    views <- views[[1L]]
  }

  if (!length(views)) {
    stop("add_views() requires at least one view(...).", call. = FALSE)
  }
  if (!all(vapply(views, inherits, logical(1), "ml_view"))) {
    stop("add_views() expects view(...) objects.", call. = FALSE)
  }

  if (!is.null(map$x$.__components_raw[[id]])) {
    stop("A component with id '", id, "' already exists.", call. = FALSE)
  }

  map$x$.__components_raw[[id]] <- list(
    type  = "views",
    id    = id,
    layer = target,
    bind  = bind,
    position = position,
    views = views,
    motion = list(duration = as.numeric(duration), easing = easing)
  )

  map
}
