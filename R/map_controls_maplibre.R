# ---- MapLibre built-in controls (map_options.controls) ----
#
# Stages 1–3 (MVP): internal upsert primitive + navigation/scale/fullscreen/geolocate helpers.
#
# Contract (R-side):
#   map$x$map_options$controls = list(
#     list(type = "navigation", position = "topright", options = list(showZoom=TRUE, showCompass=TRUE))
#   )
#
# Notes:
# - position uses maplamina's corner strings: topleft/topright/bottomleft/bottomright
# - options may be NULL/omitted; JS should treat missing/NULL (or even []) as {}
# - replacement semantics: last call wins per `type`

.ml_map_controls_allowed_positions <- c("topleft", "topright", "bottomleft", "bottomright")

.ml_map_controls_validate_position <- function(position) {
  if (is.null(position) || length(position) != 1L) {
    stop("`position` must be a single string.", call. = FALSE)
  }
  position <- as.character(position)
  match.arg(position, .ml_map_controls_allowed_positions)
}

.ml_map_controls_normalize_options <- function(options) {
  if (is.null(options)) return(NULL)

  if (!is.list(options)) {
    stop("`options` must be a named list.", call. = FALSE)
  }

  # Drop NULLs (common when building options incrementally)
  options <- .ml_compact(options)
  if (!length(options)) return(NULL)

  nm <- names(options)
  if (is.null(nm) || any(!nzchar(nm))) {
    stop("`options` must be a named list (all option keys must be named).", call. = FALSE)
  }

  options
}

# Internal primitive: upsert by type (last call wins)
.ml_map_controls_upsert <- function(map, type, position, options = NULL) {
  if (is.null(map$x) || is.null(map$x$map_options)) {
    stop("add_navigation(): `map` must be a maplamina() widget.", call. = FALSE)
  }

  if (is.null(type) || length(type) != 1L) {
    stop("`type` must be a single string.", call. = FALSE)
  }
  type <- as.character(type)
  if (!nzchar(type)) {
    stop("`type` must be a non-empty string.", call. = FALSE)
  }

  position <- .ml_map_controls_validate_position(position)
  options  <- .ml_map_controls_normalize_options(options)

  controls <- map$x$map_options$controls %||% list()
  if (!is.list(controls)) {
    stop("map_options$controls must be a list.", call. = FALSE)
  }

  # Remove existing entries with the same type
  keep <- list()
  for (rec in controls) {
    if (!is.list(rec) || is.null(rec$type)) {
      keep[[length(keep) + 1L]] <- rec
      next
    }

    rec_type <- as.character(rec$type)
    if (!identical(rec_type, type)) {
      keep[[length(keep) + 1L]] <- rec
    }
  }

  new_rec <- .ml_compact(list(
    type = type,
    position = position,
    options = options
  ))

  map$x$map_options$controls <- c(keep, list(new_rec))
  map
}


.ml_map_controls_collect_dots <- function(...) {
  dots <- list(...)
  if (length(dots)) {
    nm <- names(dots)
    if (is.null(nm) || any(!nzchar(nm))) {
      stop("All `...` arguments must be named (these are passed through as options).", call. = FALSE)
    }
  }
  dots
}


add_navigation <- function(
    map,
    position = "topright",
    compass = TRUE,
    zoom_controls = TRUE,
    ...
) {

  if (!is.null(compass) && length(compass) != 1L) {
    stop("`compass` must be a single logical value.", call. = FALSE)
  }
  if (!is.null(zoom_controls) && length(zoom_controls) != 1L) {
    stop("`zoom_controls` must be a single logical value.", call. = FALSE)
  }

  dots <- list(...)
  if (length(dots)) {
    nm <- names(dots)
    if (is.null(nm) || any(!nzchar(nm))) {
      stop("All `...` arguments must be named (these are passed through as options).", call. = FALSE)
    }
  }

  # Base options from ... then override with explicit helper args
  options <- dots
  options$showZoom    <- isTRUE(zoom_controls)
  options$showCompass <- isTRUE(compass)

  .ml_map_controls_upsert(
    map,
    type = "navigation",
    position = position,
    options = options
  )
}
add_scalebar <- function(
    map,
    position = "bottomleft",
    unit = c("metric", "imperial", "nautical"),
    max_width = 100,
    ...
) {

  unit <- match.arg(unit)

  if (is.null(max_width) || length(max_width) != 1L || !is.numeric(max_width) || !is.finite(max_width) || max_width <= 0) {
    stop("`max_width` must be a single positive number.", call. = FALSE)
  }

  dots <- .ml_map_controls_collect_dots(...)

  options <- dots
  options$maxWidth <- as.integer(round(max_width))
  options$unit <- unit

  .ml_map_controls_upsert(
    map,
    type = "scale",
    position = position,
    options = options
  )
}

add_fullscreen <- function(
    map,
    position = "topright",
    ...
) {

  options <- .ml_map_controls_collect_dots(...)

  .ml_map_controls_upsert(
    map,
    type = "fullscreen",
    position = position,
    options = options
  )
}

add_geolocate <- function(
    map,
    position = "topright",
    track_user_location = FALSE,
    ...
) {

  if (!is.null(track_user_location) && length(track_user_location) != 1L) {
    stop("`track_user_location` must be a single logical value.", call. = FALSE)
  }

  dots <- .ml_map_controls_collect_dots(...)

  options <- dots
  options$trackUserLocation <- isTRUE(track_user_location)

  .ml_map_controls_upsert(
    map,
    type = "geolocate",
    position = position,
    options = options
  )
}
