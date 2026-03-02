# ---- Maplamina v3: minimal component registry (Stage 3+) ----
#
# Goal: make it easy to add new component families (e.g., timeslider, summaries)
# without editing compiler.R each time.
#
# Raw components are registered as a flat list of records:
#   widget$x$.__components_raw[[id]] <- list(type = <type>, id = <id>, layer = <layer_id>, bind = <bind_id>, ...)
#
# The compiler dispatches by `type` using this registry.

.ml_component_registry <- new.env(parent = emptyenv())

.ml_register_component_type <- function(type, compile_fn) {
  if (is.null(type) || !is.character(type) || length(type) != 1L || !nzchar(type)) {
    stop("Component type must be a single, non-empty string.", call. = FALSE)
  }
  if (!is.function(compile_fn)) {
    stop("compile_fn must be a function.", call. = FALSE)
  }
  .ml_component_registry[[type]] <- compile_fn
  invisible(TRUE)
}

.ml_get_component_compiler <- function(type) {
  if (is.null(type) || !is.character(type) || length(type) != 1L) return(NULL)
  .ml_component_registry[[as.character(type)]] %||% NULL
}

# Register built-in component compilers.
# NOTE: the compile functions are defined in compiler.R.
.ml_register_component_defaults <- function() {
  .ml_register_component_type("views",  .ml_compile_component_views)
  .ml_register_component_type("range",  .ml_compile_component_range)
  .ml_register_component_type("select", .ml_compile_component_select)
  .ml_register_component_type("legends", .ml_compile_component_legends)
  .ml_register_component_type("summaries", .ml_compile_component_summaries)
  invisible(TRUE)
}
