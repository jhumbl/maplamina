# ---- Maplamina v3: layer evaluation context ----
# Provides a unified "grain" (row vs part) view for evaluating aesthetics/templates
# when geometries are exploded into multiple render parts.

ml_layer_context <- function(data, geom_part, env = parent.frame()) {

  n_row  <- nrow(data)
  n_part <- geom_part$n %||% n_row

  fi0 <- NULL
  if (!is.null(geom_part$feature_index)) {
    fi0 <- geom_part$feature_index$values %||% geom_part$feature_index
  }

  is_multipart <- FALSE
  data_eval <- data

  if (!is.null(fi0) && !is.na(n_part) && length(fi0) == n_part) {
    fi0 <- as.integer(fi0)
    # Only treat as multipart when parts differ from rows
    is_multipart <- (isTRUE(n_part != n_row))
    # Repeat rows so expressions naturally return length n_part
    data_eval <- data[fi0 + 1L, , drop = FALSE]
  }

  list(
    n_row = as.integer(n_row),
    n_part = as.integer(n_part),
    is_multipart = isTRUE(is_multipart),
    feature_index = fi0,   # 0-based (when present)
    data_eval = data_eval
  )
}
