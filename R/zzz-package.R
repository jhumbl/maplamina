.onLoad <- function(...) {
  # Ensure built-in component types are registered.
  # This keeps compiler.R free of a growing "switch" statement.
  .ml_register_component_defaults()
}
