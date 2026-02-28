# ---- panel section constructors ----

#' Create a panel section that mounts a control by bind id
#'
#' @param id Bind id (e.g. the `bind` supplied to add_views/add_filters, or the component id when bind is omitted)
#' @export
section <- function(id) {
  if (is.null(id) || length(id) != 1L) {
    stop("section(): `id` must be a single string.", call. = FALSE)
  }
  id <- as.character(id)
  if (!nzchar(id)) {
    stop("section(): `id` must be a non-empty string.", call. = FALSE)
  }
  structure(list(id = id), class = "maplamina_panel_section")
}

#' Create a list of panel sections
#'
#' @param ... One or more `section()` objects, character ids, or lists of sections.
#' @export
sections <- function(...) {
  structure(list(...), class = "maplamina_panel_sections")
}

.ml_flatten_panel_sections <- function(x) {
  out <- list()

  push <- function(sec) {
    out[[length(out) + 1L]] <<- sec
  }

  walk <- function(obj) {
    if (is.null(obj)) return()

    if (inherits(obj, "maplamina_panel_sections")) {
      obj <- unclass(obj)
    }

    if (inherits(obj, "maplamina_panel_section")) {
      push(obj)
      return()
    }

    if (is.character(obj)) {
      for (id in as.character(obj)) push(section(id))
      return()
    }

    # allow list(id = "...")
    if (is.list(obj) && !is.null(obj$id) && length(obj$id) == 1L && is.character(obj$id)) {
      push(section(obj$id))
      return()
    }

    # recursively flatten containers
    if (is.list(obj)) {
      for (el in obj) walk(el)
      return()
    }

    stop(
      "sections(): expected section(), character ids, or lists of these.",
      call. = FALSE
    )
  }

  walk(x)
  out
}

.ml_normalize_panel <- function(
    title = NULL,
    description = NULL,
    icon = NULL,
    dividers = TRUE,
    position = NULL,
    sections = NULL
) {

  if (!is.null(title)) {
    if (!is.character(title) || length(title) != 1L) {
      stop("add_panel(): `title` must be NULL or a single string.", call. = FALSE)
    }
    if (!nzchar(title)) title <- NULL
  }

  if (!is.null(description)) {
    if (!is.character(description) || length(description) != 1L) {
      stop("add_panel(): `description` must be NULL or a single string.", call. = FALSE)
    }
    if (!nzchar(description)) description <- NULL
  }

  if (!is.null(icon)) {
    if (!is.character(icon) || length(icon) != 1L) {
      stop("add_panel(): `icon` must be NULL or a single string (URL).")
    }
    if (!nzchar(icon)) icon <- NULL
  }

  if (is.null(dividers)) dividers <- TRUE
  if (!is.logical(dividers) || length(dividers) != 1L) {
    stop("add_panel(): `dividers` must be TRUE/FALSE.", call. = FALSE)
  }

  position <- .ml_ui_validate_position(position)

  sec <- .ml_flatten_panel_sections(sections)

  # Strip S3 classes -> plain lists for JSON
  sec <- lapply(sec, function(s) list(id = s$id))

  list(
    title = title,
    description = description,
    icon = icon,
    dividers = isTRUE(dividers),
    position = position,
    sections = sec
  )
}

#' Add a global, presentation-only panel
#'
#' The panel mounts previously-declared controls by bind id.
#'
#' @param map A maplamina widget.
#' @param title Panel title.
#' @param description Optional panel description.
#' @param icon Optional URL for a small icon shown beside the title.
#' @param dividers Logical; whether to render divider lines between sections.
#' @param position Optional corner position for the panel container. One of "topleft", "topright", "bottomleft", "bottomright".
#' @param sections Panel layout, created with `sections(section("id"), ...)`.
#'
#' @export
add_panel <- function(
    map,
    title = NULL,
    description = NULL,
    icon = NULL,
    dividers = TRUE,
    position = NULL,
    sections = NULL
) {

  if (is.null(map$x) || is.null(map$x$map_options)) {
    stop("add_panel(): `map` must be a maplamina() widget.", call. = FALSE)
  }

  map$x$.__panel <- .ml_normalize_panel(
    title = title,
    description = description,
    icon = icon,
    dividers = dividers,
    position = position,
    sections = sections
  )

  map
}
