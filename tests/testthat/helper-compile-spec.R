# Helper for Mapflow tests: compile widget spec WITHOUT calling .ml_prerender()
# (avoids any prerender side-effects like writing files).
#
# Returns the compiled outgoing spec list (x) containing:
#   .__layers, .__components, .__controls
#
ml_test_compile_spec <- function(widget) {
  testthat::skip_if_not(
    requireNamespace("maplamina", quietly = TRUE),
    message = "maplamina package is not available"
  )

  # Ensure internal compiler functions exist (Stage 3+)
  ns <- asNamespace("maplamina")
  for (fn in c(".ml_compile_layers", ".ml_compile_components", ".ml_finalize_layers")) {
    testthat::skip_if_not(exists(fn, envir = ns, inherits = FALSE),
                          message = paste("Missing internal compiler function:", fn)
    )
  }

  layers <- widget$x$.__layers

  pass1 <- maplamina:::.ml_compile_layers(layers)
  layers1 <- pass1$layers
  stores  <- pass1$stores

  pass2 <- maplamina:::.ml_compile_components(widget, layers1, stores)
  compiled <- pass2$compiled
  controls <- pass2$controls

  layers2 <- maplamina:::.ml_finalize_layers(layers1, stores)

  x <- widget$x
  x$.__layers <- layers2
  x$.__components <- compiled
  x$.__controls <- controls

  # Mirror prerender stripping so validation matches outgoing spec expectations
  x$.__components_raw <- NULL
  x$.__data_registry  <- NULL
  x$.__layer_meta     <- NULL
  x$.__id_counters    <- NULL
  x$show_layer_controls <- NULL
  x$.toggle <- NULL

  # These are present on some widgets but are not part of the public top-level spec contract.
  # .ml_prerender() strips/handles them before validation; we do the same here.
  x$.__default_data <- NULL
  x$.__default_data_name <- NULL

  # Validate if available (keeps tests aligned with the contract)
  if (exists("ml_validate_spec", envir = ns, inherits = FALSE)) {
    maplamina:::ml_validate_spec(x)
  }

  x
}
