# ---- Mapflow v3: spec validation (entrypoint) ----
# Refactor: split ml_validate_spec() into domain-focused helpers.

ml_validate_spec <- function(x) {
  .ml_validate_top_level_invariants(x)
  layers <- x$.__layers %||% list()
  .ml_validate_layers(layers)
  .ml_validate_panel_mounts(x)
  .ml_validate_controls_and_components(x, layers)
  invisible(TRUE)
}
