#' Define a select filter
#'
#' Creates a categorical filter specification to be registered with [add_filters()].
#'
#' @param col A formula selecting a column (e.g. `~region`).
#' @param label Optional label for the UI control (defaults to the column name).
#' @param multi Logical; allow multiple selections.
#' @param dropdown Optional UI hint (frontend-specific).
#' @param searchable Logical; allow searching within options.
#' @param default Optional default selection(s).
#' @param max_levels Optional maximum number of levels to show (frontend may truncate).
#' @param id Optional filter id (otherwise generated).
#'
#' @return A filter specification object.
#' @export
#'
#' @examples
#' f <- filter_select(~Species, default = c("setosa", "versicolor"))
#' f
filter_select <- function(col, label = NULL, multi = TRUE, dropdown = NULL, searchable = TRUE,
                          default = NULL, max_levels = NULL, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("filter_select(): `col` must be a formula like ~region.", call. = FALSE)
  }

  structure(list(
    type = "select",
    id = id,
    column = col,
    label = label,
    multi = isTRUE(multi),
    dropdown = dropdown,
    searchable = isTRUE(searchable),
    default = default,
    max_levels = max_levels
  ), class = "ml_filter")
}

#' Define a range filter
#'
#' Creates a numeric range filter specification to be registered with [add_filters()].
#'
#' @param col A formula selecting a numeric column (e.g. `~mag`).
#' @param label Optional label for the UI control (defaults to the column name).
#' @param default Optional default range `c(min, max)` (length 2).
#' @param min,max Optional explicit min/max (otherwise computed from data).
#' @param step Optional step size for the UI slider.
#' @param live Logical; update the map continuously while dragging.
#' @param id Optional filter id (otherwise generated).
#'
#' @return A filter specification object.
#' @export
#'
#' @examples
#' f <- filter_range(~mpg, default = c(15, 30))
#' f
filter_range <- function(col, label = NULL, default = NULL, min = NULL, max = NULL,
                         step = NULL, live = TRUE, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("filter_range(): `col` must be a formula like ~value.", call. = FALSE)
  }

  if (!is.null(default)) {
    if (!is.numeric(default)) {
      stop("filter_range(): `default` must be a numeric vector of length 2 (c(min, max)).", call. = FALSE)
    }
    if (length(default) != 2L) {
      stop(
        "filter_range(): `default` must be a numeric vector of length 2 (c(min, max)); got length ",
        length(default), ".",
        call. = FALSE
      )
    }
    if (anyNA(default) || !all(is.finite(default))) {
      stop("filter_range(): `default` must contain two finite numbers (no NA/Inf).", call. = FALSE)
    }
    # Be forgiving if user supplies (max, min).
    if (default[1] > default[2]) default <- sort(default)
  }

  structure(list(
    type = "range",
    id = id,
    column = col,
    label = label,
    default = default,
    min = min, max = max, step = step,
    live = isTRUE(live)
  ), class = "ml_filter")
}

# ---- Internal: normalize filters to the transport spec ----

.ml_normalize_filters <- function(data, filters, n) {
  if (is.null(filters)) return(NULL)
  sels <- list(); rngs <- list()

  rhs_expr <- function(expr) {
    if (ml_is_formulaish(expr)) {
      if (length(expr) == 2L) return(expr[[2L]])
      return(expr[[3L]])
    }
    expr
  }

  rhs_label <- function(expr) deparse1(rhs_expr(expr))

  for (f in filters) {
    if (is.null(f$type)) next

    if (identical(f$type, "select")) {
      vals <- ml_eval(data, f$column)

      # Normalize / validate length (feature-grain)
      if (!is.null(n) && !is.na(n)) {
        if (length(vals) == 1L && n > 1L) vals <- rep(vals, n)
        if (length(vals) != n) {
          stop(
            "filter_select(): evaluated column '", rhs_label(f$column),
            "' returned length ", length(vals), "; expected 1 or ", n, ".",
            call. = FALSE
          )
        }
      }

      # Map missing values to a concrete level so codes never contain NA
      missing_label <- "(Missing)"
      vals_chr <- vals
      if (is.factor(vals_chr)) vals_chr <- as.character(vals_chr)
      vals_chr <- as.character(vals_chr)
      if (anyNA(vals_chr)) vals_chr[is.na(vals_chr)] <- missing_label
      ff <- factor(vals_chr)
      dict <- levels(ff)
      codes <- as.integer(ff) - 1L

      # counts aligned to dict order
      freq <- tabulate(as.integer(ff), nbins = length(dict))
      top_idx1 <- order(freq, decreasing = TRUE)  # 1-based indices into dict

      sels[[length(sels) + 1L]] <- list(
        type = "select",
        id   = f$id,
        label = f$label %||% rhs_label(f$column),
        multi = f$multi,
        dropdown = f$dropdown,
        searchable = f$searchable,
        dict = dict,
        codes_values = as.integer(codes),
        default = f$default,
        max_levels = f$max_levels,
        freq = as.integer(freq),
        top_indices = as.integer(top_idx1) - 1L    # 0-based for JS
      )

    } else if (identical(f$type, "range")) {
      vals <- ml_eval(data, f$column)

      if (!is.numeric(vals)) {
        stop("filter_range(): column must evaluate to numeric.", call. = FALSE)
      }

      # Normalize / validate length (feature-grain)
      if (!is.null(n) && !is.na(n)) {
        if (length(vals) == 1L && n > 1L) vals <- rep(vals, n)
        if (length(vals) != n) {
          stop(
            "filter_range(): evaluated column '", rhs_label(f$column),
            "' returned length ", length(vals), "; expected 1 or ", n, ".",
            call. = FALSE
          )
        }
      }

      # Warn once per filter element if NA/NaN are present.
      # These values can never fall within a numeric [min, max] range and therefore will
      # be excluded by the filter in the UI.
      if (anyNA(vals)) {
        lid <- f$.__layer_id %||% "<unknown>"
        lab <- f$label %||% rhs_label(f$column)
        warning(
          "[maplamina][", lid, "] Range filter '", lab, "' contains NA/NaN; these rows will be excluded.",
          call. = FALSE
        )
      }

      rngs[[length(rngs) + 1L]] <- list(
        type = "range",
        id   = f$id,
        label = f$label %||% rhs_label(f$column),
        values_values = as.numeric(vals),
        default = f$default,
        min = f$min %||% min(vals, na.rm = TRUE),
        max = f$max %||% max(vals, na.rm = TRUE),
        step = f$step,
        live = f$live
      )
    }
  }

  list(select = sels, range = rngs)
}

#' Add filters to a layer
#'
#' Registers one or more filters for a layer. When multiple layers share the same `bind`,
#' controls merge across layers by (bind, label, type).
#'
#' @param map A maplamina widget created by [maplamina()].
#' @param ... One or more [filter_range()] / [filter_select()] objects (or a single list of them).
#' @param id Optional id used as a shorthand bind id when `bind` is omitted.
#' @param bind Bind group id for shared UI control.
#' @param position Optional UI position hint (applied to the control group).
#' @param layer_id Target layer id (defaults to the most recently added layer).
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
#'   add_circles(d) |>
#'   add_filters(
#'     filter_range(~value, default = c(4, 6)),
#'     bind = "filters"
#'   )
add_filters <- function(
    map,
    ...,
    id = NULL,
    bind = NULL,
    position = NULL,
    layer_id = NULL
) {

  target <- .ml_target_layer_id(map, layer_id)

  position <- .ml_ui_validate_position(position)

  # Deterministic ids per-widget (avoid session-global counters / runif).
  #
  # IMPORTANT: `add_filters()` may be called multiple times in a pipeline (often once per layer).
  # Therefore default ids must be unique across the whole widget, not just within a single call.
  #
  # Strategy:
  # 1) Scan existing registered filter component ids to find the current max numeric suffix for
  #    this prefix (e.g., sel_12 -> 12).
  # 2) Optionally persist the counter on the widget for faster subsequent allocations.

# Deterministic ids per-widget (avoid session-global counters).
# Uses map$x$.__id_counters (stripped during prerender).
next_id <- function(prefix) {
  existing <- names(map$x$.__components_raw %||% list()) %||% character()
  tmp <- .ml_next_id(map, prefix = prefix, scope = "prefix", existing_ids = existing)
  map <<- tmp$map
  tmp$id
}

  # NOTE: `id` is accepted for API symmetry with add_views(). In v3 we
  # register one component per filter element (filter_range()/filter_select()).
  # The `id` argument is therefore reserved for future grouping/meta and is
  # currently used only to avoid accidental capture into `...`.

  # Bind semantics:
  # - If `bind` is omitted, all filters in this call are placed into a single, auto-created group
  #   (or `id` if supplied as a shorthand).
  # - If `bind = NULL` is supplied explicitly, each filter goes to its own group (bind = filter id).
  # - Otherwise, `bind` may be a single string, a character vector matching the number of filters,
  #   or a named mapping keyed by filter id.
  if (missing(bind)) {
    if (!is.null(id)) {
      bind <- id
    } else {
      bind <- next_id("filters_")
    }
  }

  filters <- list(...)
  if (length(filters) == 1L && is.list(filters[[1L]]) && !inherits(filters[[1L]], "ml_filter")) {
    filters <- filters[[1L]]
  }

  if (!length(filters)) {
    stop("add_filters() requires at least one filter_*() object.", call. = FALSE)
  }
  if (!all(vapply(filters, inherits, logical(1), "ml_filter"))) {
    stop("add_filters() expects filter_*() objects.", call. = FALSE)
  }

  # Ensure registries exist (Stage 3+: flat component list)
  if (is.null(map$x$.__components_raw)) {
    map$x$.__components_raw <- list()
  }

  # Bind handling (after defaulting above):
  # - NULL (explicit): each filter goes to its own group (bind = filter id)
  # - scalar string: places all filters into the same group
  # - character vector same length as filters: one bind per filter, in order
  # - named vector/list: bind by filter$id
  resolve_bind <- function(i, f) {
    if (is.null(bind)) {
      return(f$id)
    }

    if (is.character(bind) && length(bind) == 1L) {
      return(bind)
    }

    if (is.character(bind) && length(bind) == length(filters)) {
      return(bind[[i]])
    }

    if (is.list(bind) || (is.character(bind) && !is.null(names(bind)))) {
      if (is.null(names(bind)) || !nzchar(names(bind)[[1L]])) {
        stop("If `bind` is a list, it must be named by filter id.", call. = FALSE)
      }
      if (!f$id %in% names(bind)) {
        stop("No bind mapping provided for filter id '", f$id, "'.", call. = FALSE)
      }
      return(bind[[f$id]])
    }

    stop("`bind` must be NULL, a single string, a character vector matching the number of filters, or a named list/vector keyed by filter id.", call. = FALSE)
  }


  # In v3, `bind` identifies a *filter group* (mounted by the panel via section(bind)).
  # A single group may contain multiple filter controls (e.g., select + range).
  # Cross-layer binding happens later in the compiler by matching `label` within the group.
  for (i in seq_along(filters)) {
    f <- filters[[i]]

    # Attach target layer id for downstream diagnostics (e.g., NA warnings).
    # This field is ignored by JS and does not affect compilation semantics.
    f$.__layer_id <- target

    # Ensure each filter element has a deterministic, unique component id
    if (is.null(f$id) || !is.character(f$id) || length(f$id) != 1L || !nzchar(f$id)) {
      pref <- if (identical(f$type, "select")) "sel_" else if (identical(f$type, "range")) "rng_" else "flt_"
      f$id <- next_id(pref)
    }

    b <- resolve_bind(i, f)

    comp_id <- f$id
    if (!is.null(map$x$.__components_raw[[comp_id]])) {
      stop("A component with id '", comp_id, "' already exists.", call. = FALSE)
    }

    map$x$.__components_raw[[comp_id]] <- list(
      type  = f$type,
      id    = comp_id,
      layer = target,
      bind  = b,
      position = position,
      spec  = f
    )
  }

  map
}
