# ---- Summaries capability: DSL + registration ----
#
# MVP scope:
# - summary_*() constructors create declarative summary specs.
# - add_summaries() registers one component per summary row into map$x$.__components_raw.
# - No compilation happens here; values are evaluated during prerender compilation.

#' Summary: count rows (optionally count non-missing values)
#'
#' With no `col`, this counts rows (fast path; no column evaluation).
#' If `col` is provided, the column is validated to exist. When `na_rm = TRUE`,
#' the summary counts non-missing values in that column.
#'
#' @param col Optional formula like `~id`. If omitted, counts rows.
#' @param label Display label for the summary row.
#' @param na_rm If `TRUE` and `col` is provided, count non-missing values (non-NA).
#' @param digits Optional number of digits for formatting (applied in JS).
#' @param prefix Optional prefix string (applied in JS).
#' @param suffix Optional suffix string (applied in JS).
#' @param id Optional component id (otherwise generated deterministically per widget).
#' @export
summary_count <- function(col = NULL, label = NULL, na_rm = FALSE, digits = NULL, prefix = NULL, suffix = NULL, id = NULL) {

  if (!is.null(col) && !ml_is_formulaish(col)) {
    stop("summary_count(): `col` must be NULL or a formula like ~id.", call. = FALSE)
  }

  op <- if (!is.null(col) && isTRUE(na_rm)) "count_non_na" else "count"

  structure(list(
    op = op,
    id = id,
    column = col,
    label = label,
    na_rm = isTRUE(na_rm),
    digits = digits,
    prefix = prefix,
    suffix = suffix
  ), class = "ml_summary")
}

#' Summary: max value
#'
#' @param col A formula like `~income`.
#' @param label Display label for the summary row.
#' @param na_rm Whether to remove missing values.
#' @param digits Optional number of digits for formatting (applied in JS).
#' @param prefix Optional prefix string (applied in JS).
#' @param suffix Optional suffix string (applied in JS).
#' @param id Optional component id (otherwise generated deterministically per widget).
#' @export
summary_max <- function(col, label = NULL, na_rm = TRUE, digits = NULL, prefix = NULL, suffix = NULL, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("summary_max(): `col` must be a formula like ~income.", call. = FALSE)
  }

  structure(list(
    op = "max",
    id = id,
    column = col,
    label = label,
    na_rm = isTRUE(na_rm),
    digits = digits,
    prefix = prefix,
    suffix = suffix
  ), class = "ml_summary")
}

#' Summary: mean value
#'
#' @param col A formula like `~population_density`.
#' @param label Display label for the summary row.
#' @param na_rm Whether to remove missing values.
#' @param digits Optional number of digits for formatting (applied in JS).
#' @param prefix Optional prefix string (applied in JS).
#' @param suffix Optional suffix string (applied in JS).
#' @param id Optional component id (otherwise generated deterministically per widget).
#' @export
summary_mean <- function(col, label = NULL, na_rm = TRUE, digits = NULL, prefix = NULL, suffix = NULL, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("summary_mean(): `col` must be a formula like ~x.", call. = FALSE)
  }

  structure(list(
    op = "mean",
    id = id,
    column = col,
    label = label,
    na_rm = isTRUE(na_rm),
    digits = digits,
    prefix = prefix,
    suffix = suffix
  ), class = "ml_summary")
}


#' Summary: sum of values
#'
#' @param col A formula like `~income`.
#' @param label Display label for the summary row.
#' @param na_rm Whether to remove missing values.
#' @param digits Optional number of digits for formatting (applied in JS).
#' @param prefix Optional prefix string (applied in JS).
#' @param suffix Optional suffix string (applied in JS).
#' @param id Optional component id (otherwise generated deterministically per widget).
#' @export
summary_sum <- function(col, label = NULL, na_rm = TRUE, digits = NULL, prefix = NULL, suffix = NULL, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("summary_sum(): `col` must be a formula like ~x.", call. = FALSE)
  }

  structure(list(
    op = "sum",
    id = id,
    column = col,
    label = label,
    na_rm = isTRUE(na_rm),
    digits = digits,
    prefix = prefix,
    suffix = suffix
  ), class = "ml_summary")
}

#' Summary: min value
#'
#' @param col A formula like `~income`.
#' @param label Display label for the summary row.
#' @param na_rm Whether to remove missing values.
#' @param digits Optional number of digits for formatting (applied in JS).
#' @param prefix Optional prefix string (applied in JS).
#' @param suffix Optional suffix string (applied in JS).
#' @param id Optional component id (otherwise generated deterministically per widget).
#' @export
summary_min <- function(col, label = NULL, na_rm = TRUE, digits = NULL, prefix = NULL, suffix = NULL, id = NULL) {

  if (missing(col) || is.null(col) || !ml_is_formulaish(col)) {
    stop("summary_min(): `col` must be a formula like ~x.", call. = FALSE)
  }

  structure(list(
    op = "min",
    id = id,
    column = col,
    label = label,
    na_rm = isTRUE(na_rm),
    digits = digits,
    prefix = prefix,
    suffix = suffix
  ), class = "ml_summary")
}


# ---- Internal: normalize summary specs to the transport spec ----
#
# Returns a list of normalized summary items suitable for compilation.
# Each item is a plain list with:
# - op, id, label, digits/prefix/suffix, na_rm (where relevant)
# - for non-count ops: values_values (numeric vector length n)
.ml_normalize_summaries <- function(data, summaries, n) {
  if (is.null(summaries)) return(NULL)

  rhs_expr <- function(expr) {
    if (ml_is_formulaish(expr)) {
      if (length(expr) == 2L) return(expr[[2L]])
      return(expr[[3L]])
    }
    expr
  }

  rhs_label <- function(expr) deparse1(rhs_expr(expr))

  out <- list()

  for (s in summaries) {
    if (is.null(s$op)) next

    op <- as.character(s$op)

    # Determine label default
lbl <- s$label %||% if (op %in% c("count", "count_non_na")) "Count" else rhs_label(s$column)

item <- list(
  op = op,
  id = s$id,
  label = lbl,
  digits = s$digits,
  prefix = s$prefix,
  suffix = s$suffix
)

if (op %in% c("count", "count_non_na")) {

  # Fast path: row count requires no column evaluation.
  if (is.null(s$column)) {
    item$na_rm <- isTRUE(s$na_rm %||% FALSE)

  } else {
    # If a column is provided, always evaluate it at least once to validate
    # that it exists (so typos fail early).
    vals <- ml_eval(data, s$column)

    # Normalize / validate length (feature-grain)
    if (!is.null(n) && !is.na(n)) {
      if (length(vals) == 1L && n > 1L) vals <- rep(vals, n)
      if (length(vals) != n) {
        stop(
          "summary_", op, "(): evaluated column '", rhs_label(s$column),
          "' returned length ", length(vals), "; expected 1 or ", n, ".",
          call. = FALSE
        )
      }
    }

    # When na_rm = TRUE (op == count_non_na), store a non-missing mask so the
    # runtime can compute a non-NA count under the active filter mask.
    if (identical(op, "count_non_na")) {
      item$values_values <- as.numeric(!is.na(vals))
      item$na_rm <- TRUE
    } else {
      item$na_rm <- isTRUE(s$na_rm %||% FALSE)
    }
  }

} else {
  vals <- ml_eval(data, s$column)

  if (!is.numeric(vals)) {
    stop("summary_", op, "(): column must evaluate to numeric.", call. = FALSE)
  }

  # Normalize / validate length (feature-grain)
  if (!is.null(n) && !is.na(n)) {
    if (length(vals) == 1L && n > 1L) vals <- rep(vals, n)
    if (length(vals) != n) {
      stop(
        "summary_", op, "(): evaluated column '", rhs_label(s$column),
        "' returned length ", length(vals), "; expected 1 or ", n, ".",
        call. = FALSE
      )
    }
  }

  item$values_values <- as.numeric(vals)
  item$na_rm <- isTRUE(s$na_rm %||% TRUE)
}

out[[length(out) + 1L]] <- item
  }

  out
}

# add_summaries(): register per-layer summary components (no layer mutation)
#'
#' Add one or more summary rows that can be bound into a shared summaries card.
#'
#' @param map A maplamina widget.
#' @param ... One or more `summary_*()` objects (or a list of them).
#' @param id Optional id used as a shorthand bind id when `bind` is omitted.
#' @param bind Bind group id. Controls merge across layers by (bind, label, op).
#' @param position Optional UI position hint (applied to the control group).
#' @param layer_id Target layer id (defaults to the most recently added layer).
#' @export
add_summaries <- function(
    map,
    ...,
    id = NULL,
    bind = NULL,
    position = NULL,
    layer_id = NULL
) {

  target <- .ml_target_layer_id(map, layer_id)

  position <- .ml_ui_validate_position(position)

  # Deterministic ids per-widget (avoid session-global counters).
  # Uses map$x$.__id_counters (stripped during prerender).
  next_id <- function(prefix) {
    existing <- names(map$x$.__components_raw %||% list()) %||% character()
    tmp <- .ml_next_id(map, prefix = prefix, scope = "prefix", existing_ids = existing)
    map <<- tmp$map
    tmp$id
  }

  # Bind semantics:
  # - If `bind` is omitted, all summaries in this call are placed into a single, auto-created group
  #   (or `id` if supplied as a shorthand).
  # - If `bind = NULL` is supplied explicitly, each summary goes to its own group (bind = summary id).
  # - Otherwise, `bind` may be a single string, a character vector matching the number of summaries,
  #   or a named mapping keyed by summary id.
  if (missing(bind)) {
    if (!is.null(id)) {
      bind <- id
    } else {
      bind <- next_id("summaries_")
    }
  }

  summaries <- list(...)
  if (length(summaries) == 1L && is.list(summaries[[1L]]) && !inherits(summaries[[1L]], "ml_summary")) {
    summaries <- summaries[[1L]]
  }

  if (!length(summaries)) {
    stop("add_summaries() requires at least one summary_*() object.", call. = FALSE)
  }
  if (!all(vapply(summaries, inherits, logical(1), "ml_summary"))) {
    stop("add_summaries() expects summary_*() objects.", call. = FALSE)
  }

  # Ensure registries exist (Stage 3+: flat component list)
  if (is.null(map$x$.__components_raw)) {
    map$x$.__components_raw <- list()
  }

  resolve_bind <- function(i, s) {
    if (is.null(bind)) {
      return(s$id)
    }

    if (is.character(bind) && length(bind) == 1L) {
      return(bind)
    }

    if (is.character(bind) && length(bind) == length(summaries)) {
      return(bind[[i]])
    }

    if (is.list(bind) || (is.character(bind) && !is.null(names(bind)))) {
      if (is.null(names(bind)) || !nzchar(names(bind)[[1L]])) {
        stop("If `bind` is a list, it must be named by summary id.", call. = FALSE)
      }
      if (!s$id %in% names(bind)) {
        stop("No bind mapping provided for summary id '", s$id, "'.", call. = FALSE)
      }
      return(bind[[s$id]])
    }

    stop("`bind` must be NULL, a single string, a character vector matching the number of summaries, or a named list/vector keyed by summary id.", call. = FALSE)
  }

  # In v3, `bind` identifies a *summaries group* (mounted by the panel via section(bind)).
  # Cross-layer binding happens later in the compiler by matching (label, op) within the group.
  for (i in seq_along(summaries)) {
    s <- summaries[[i]]

    # Ensure each summary element has a deterministic, unique component id
    if (is.null(s$id) || !is.character(s$id) || length(s$id) != 1L || !nzchar(s$id)) {
      s$id <- next_id("sum_")
    }

    b <- resolve_bind(i, s)

    comp_id <- s$id
    if (!is.null(map$x$.__components_raw[[comp_id]])) {
      stop("A component with id '", comp_id, "' already exists.", call. = FALSE)
    }

    map$x$.__components_raw[[comp_id]] <- list(
      type = "summaries",
      id = comp_id,
      layer = target,
      bind = b,
      position = position,
      spec = s
    )
  }

  map
}
