# ---- Maplamina v3: validation (map_options.controls) ----
#
# MapLibre built-in controls are encoded under:
#   x$map_options$controls = list(list(type, position, options?))
#
# MVP types supported on R side (attribution intentionally excluded for now):
#   navigation | scale | fullscreen | geolocate
#
# position uses Maplamina corner strings:
#   topleft | topright | bottomleft | bottomright
#
# options must be NULL/missing or a *named* list (empty list is not allowed, as it can
# serialize to [] rather than {}).

.ml_validate_map_options <- function(map_options) {
  if (is.null(map_options)) return(invisible(TRUE))
  if (!is.list(map_options)) stop("map_options must be a list.", call. = FALSE)

  proj <- map_options$projection %||% NULL
  if (!is.null(proj)) {
    if (!is.character(proj) || length(proj) != 1L || !nzchar(proj)) {
      stop("map_options.projection must be a non-empty string.", call. = FALSE)
    }
    allowed_proj <- c("mercator", "globe")
    if (!proj %in% allowed_proj) {
      stop("map_options has invalid projection '", proj,
           "'. Must be one of: 'mercator', 'globe'.", call. = FALSE)
    }
  }


  controls <- map_options$controls %||% NULL
  if (is.null(controls)) return(invisible(TRUE))

  .ml_validate_map_options_controls(controls)
  invisible(TRUE)
}

.ml_validate_map_options_controls <- function(controls) {
  if (!is.list(controls)) stop("map_options.controls must be a list.", call. = FALSE)

  allowed_types <- c("navigation", "scale", "fullscreen", "geolocate")
  allowed_pos   <- c("topleft", "topright", "bottomleft", "bottomright")

  seen <- character()

  for (i in seq_along(controls)) {
    rec <- controls[[i]]

    if (!is.list(rec)) {
      stop("map_options.controls[[", i, "]] must be a list.", call. = FALSE)
    }

    type <- rec$type %||% NULL
    if (is.null(type) || !is.character(type) || length(type) != 1L || !nzchar(type)) {
      stop("map_options.controls[[", i, "]] is missing a valid `type`.", call. = FALSE)
    }
    if (!type %in% allowed_types) {
      stop("map_options.controls has invalid control type '", type, "'.", call. = FALSE)
    }
    if (type %in% seen) {
      stop("map_options.controls has duplicate control type '", type, "'. Use add_*() helpers.", call. = FALSE)
    }
    seen <- c(seen, type)

    pos <- rec$position %||% NULL
    if (is.null(pos) || !is.character(pos) || length(pos) != 1L || !nzchar(pos)) {
      stop("map_options.controls[[", i, "]] is missing a valid `position`.", call. = FALSE)
    }
    if (!pos %in% allowed_pos) {
      stop("map_options.controls has invalid position '", pos, "'.", call. = FALSE)
    }

    opt <- rec$options %||% NULL
    if (is.null(opt)) next

    if (!is.list(opt)) {
      stop("map_options.controls[[", i, "]] `options` must be a named list or NULL.", call. = FALSE)
    }
    if (!length(opt)) {
      stop("map_options.controls[[", i, "]] `options` must be NULL or a named list; empty list is not allowed.", call. = FALSE)
    }
    nm <- names(opt)
    if (is.null(nm) || any(!nzchar(nm))) {
      stop("map_options.controls[[", i, "]] `options` must be a named list.", call. = FALSE)
    }
  }

  invisible(TRUE)
}
