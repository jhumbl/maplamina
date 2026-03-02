# ---- Maplamina v3: transitions (removed) ----

# transition() previously created per-layer transition specs.
# As of v3, motion is authored by components (e.g. views) and resolved in JS.

#' Deprecated transition helper
#'
#' `transition()` has been removed. Configure animated view switching via
#' [add_views()] using `duration` and `easing`.
#'
#' @param ... Ignored.
#'
#' @return This function always errors with `Defunct`.
#' @export
transition <- function(...) {
  .Defunct(
    new = "add_views(duration =, easing =)",
    msg = "transition() has been removed. Configure animated view switching via add_views(duration=..., easing=...)."
  )
}
