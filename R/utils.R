`%||%` <- function(x, y) if (is.null(x)) y else x

.ml_compact <- function(x) x[!vapply(x, is.null, logical(1))]

ml_is_formula <- function(x) inherits(x, "formula")

ml_is_tilde_call <- function(x) {
  is.call(x) && length(x) >= 2L && identical(x[[1L]], as.name("~"))
}

ml_is_formulaish <- function(x) ml_is_formula(x) || ml_is_tilde_call(x)

# General evaluator (kept for geometry / legacy behavior)
ml_eval <- function(data, expr, env = parent.frame()) {
  if (missing(expr) || is.null(expr)) return(NULL)

  if (ml_is_formulaish(expr)) {
    rhs <- if (length(expr) == 2L) expr[[2L]] else expr[[3L]]
    env <- environment(expr) %||% env
    return(eval(rhs, envir = data, enclos = env))
  }

  if (is.symbol(expr) || is.name(expr) || is.call(expr) || is.language(expr)) {
    return(eval(expr, envir = data, enclos = env))
  }

  expr
}

# Aesthetics evaluator: formulas map to data; everything else is treated as a literal
# (or an environment constant), never as a data-column selector.
ml_eval_aes <- function(data, expr, env = parent.frame()) {
  if (missing(expr) || is.null(expr)) return(NULL)

  if (ml_is_formulaish(expr)) {
    rhs <- if (length(expr) == 2L) expr[[2L]] else expr[[3L]]
    fenv <- environment(expr) %||% env
    return(eval(rhs, envir = data, enclos = fenv))
  }

  if (is.symbol(expr) || is.name(expr)) {
    nm <- as.character(expr)
    if (!is.null(names(data)) && nm %in% names(data)) {
      stop("Bare column reference `", nm, "` is not supported here. Use ~", nm, " instead.", call. = FALSE)
    }
    return(eval(expr, envir = env))
  }

  if (is.call(expr) || is.language(expr)) {
    return(eval(expr, envir = env))
  }

  expr
}

ml_js_round <- function(x, digits = 6L) {
  round(x, digits = digits)
}

ml_gen_id <- local({
  c <- 0L
  function(prefix = "layer") {
    c <<- c + 1L
    paste0(prefix, c)
  }
})


# ---- internal: widget-scoped deterministic ids ----
# Stage 3+ contract: ids must be deterministic per widget and not depend on the R session.
# We store counters under map$x$.__id_counters, and strip them during prerender.
#
# scope = "global": a single counter shared across prefixes (preserves old ml_gen_id behavior,
#                   but resets per widget).
# scope = "prefix": separate counters per prefix (used for filter element ids like sel_1).
.ml_next_id <- function(map, prefix, scope = c("global", "prefix"), existing_ids = NULL) {
  scope <- match.arg(scope)
  if (is.null(map$x$.__id_counters) || !is.list(map$x$.__id_counters)) {
    map$x$.__id_counters <- list()
  }

  # Normalize existing ids
  existing <- existing_ids %||% character()
  if (is.list(existing)) existing <- unlist(existing, use.names = FALSE)
  existing <- as.character(existing %||% character())

  # Helper: scan max trailing integer from a set of ids
  scan_max_suffix <- function(ids) {
    if (is.null(ids) || !length(ids)) return(0L)
    m <- regmatches(ids, regexpr("[0-9]+$", ids))
    nums <- suppressWarnings(as.integer(m))
    nums <- nums[!is.na(nums)]
    if (!length(nums)) 0L else max(nums)
  }

  if (identical(scope, "global")) {
    key <- ".global"
    cur <- suppressWarnings(as.integer(map$x$.__id_counters[[key]] %||% NA_integer_))
    if (is.na(cur)) cur <- scan_max_suffix(existing)

    nxt <- as.integer(cur) + 1L
    cand <- paste0(prefix, nxt)
    while (cand %in% existing) {
      nxt <- nxt + 1L
      cand <- paste0(prefix, nxt)
    }

    map$x$.__id_counters[[key]] <- as.integer(nxt)
    return(list(map = map, id = cand))
  }

  # scope == "prefix"
  key <- as.character(prefix)
  cur <- suppressWarnings(as.integer(map$x$.__id_counters[[key]] %||% NA_integer_))
  if (is.na(cur)) {
    # Continue from the max suffix already present for this prefix
    # Escape regex metacharacters in prefix
    esc <- gsub("([\\.^$|()\\[\\]{}*+?\\\\])", "\\\\\\1", key, perl = TRUE)
    re_pat <- paste0("^", esc, "([0-9]+)$")
    hits <- existing[grepl(re_pat, existing)]
    if (length(hits)) {
      nums <- suppressWarnings(as.integer(sub(re_pat, "\\1", hits)))
      nums <- nums[!is.na(nums)]
      cur <- if (length(nums)) max(nums) else 0L
    } else {
      cur <- 0L
    }
  }

  nxt <- as.integer(cur) + 1L
  cand <- paste0(prefix, nxt)
  while (cand %in% existing) {
    nxt <- nxt + 1L
    cand <- paste0(prefix, nxt)
  }

  map$x$.__id_counters[[key]] <- as.integer(nxt)
  list(map = map, id = cand)
}


# ---- internal: resolve a target layer id (default = last layer) ----
.ml_target_layer_id <- function(map, layer_id = NULL) {
  if (is.null(map$x) || is.null(map$x$.__layers)) {
    stop("No layers have been added yet.", call. = FALSE)
  }

  layers <- map$x$.__layers %||% list()
  ids <- names(layers)
  if (is.null(ids) || length(ids) == 0L) {
    stop("No layers have been added yet.", call. = FALSE)
  }

  if (is.null(layer_id)) {
    return(utils::tail(ids, 1L))
  }

  if (!is.character(layer_id) || length(layer_id) != 1L) {
    stop("`layer_id` must be a single string.", call. = FALSE)
  }
  layer_id <- as.character(layer_id)

  if (!layer_id %in% ids) {
    stop(
      "Unknown layer_id '", layer_id, "'. Known layer ids: ",
      paste(ids, collapse = ", "),
      call. = FALSE
    )
  }

  layer_id
}

# ---- internal: JSON-safe arrays (avoid auto_unbox scalar collapse) ----
.ml_json_array_chr <- function(x) {
  if (is.null(x)) return(list())
  if (is.list(x)) return(as.list(as.character(unlist(x, use.names = FALSE))))
  as.list(as.character(x))
}

.ml_json_array_int <- function(x) {
  if (is.null(x)) return(list())
  if (is.list(x)) return(as.list(as.integer(unlist(x, use.names = FALSE))))
  as.list(as.integer(x))
}

# ---- internal: UI placement positions ----
.ml_ui_allowed_positions <- c("topleft", "topright", "bottomleft", "bottomright")

.ml_ui_validate_position <- function(position, arg = "position") {
  if (is.null(position)) return(NULL)

  if (!is.character(position) || length(position) != 1L || is.na(position)) {
    stop("`", arg, "` must be NULL or a single string.", call. = FALSE)
  }

  position <- as.character(position)

  if (!nzchar(position)) {
    stop("`", arg, "` must be a non-empty string.", call. = FALSE)
  }

  if (!position %in% .ml_ui_allowed_positions) {
    stop(
      "`", arg, "` must be one of: ",
      paste(.ml_ui_allowed_positions, collapse = ", "),
      call. = FALSE
    )
  }

  position
}
