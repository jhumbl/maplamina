# ---- Maplamina v3: aesthetics collectors ----
# Refactor: split from aesthetics.R for readability.

ml_collect_aesthetics <- function(type, data, dots, n) {
  aes <- list(base_encodings = list(), data_columns = list())

  push_numeric <- function(key, expr, env = parent.frame()) {
    if (is.null(expr)) return()

    is_fml <- ml_is_formulaish(expr)
    v <- ml_eval_aes(data, expr, env = env)

    if (!is_fml && length(v) != 1L) {
      stop(
        key, " must be a scalar or a formula (~col). Precomputed vectors are not supported; ",
        "add them as a column and use ~col.",
        call. = FALSE
      )
    }

    if (length(v) == 1L) {
      aes$base_encodings[[key]] <<- list(value = as.numeric(v))
    } else if (length(v) == n) {
      aes$data_columns[[key]] <<- list(values = as.numeric(v))
    } else {
      stop(key, " formula must return length 1 or n (", n, ").", call. = FALSE)
    }
  }

  # numeric channels
  push_numeric("radius",    dots$radius)
  push_numeric("lineWidth", dots$lineWidth)
  push_numeric("size",      dots$size)
  push_numeric("elevation", dots$elevation)


  # STRICT semantics:
  # - lineColor + opacity -> stroke RGBA (alpha baked)
  # - fillColor + fillOpacity -> fill RGBA (alpha baked)
  # - fillOpacity does NOT inherit from opacity
  stroke_op_expr <- dots$opacity     %||% 1
  fill_op_expr   <- dots$fillOpacity %||% 1


  if (!is.null(dots$fillColor)) {
    cobj <- ml_prepare_color(dots$fillColor, opacity = fill_op_expr, n = n, data = data)
    if (!is.null(cobj$constant)) {
      aes$base_encodings$fillColor <- list(value = as.integer(cobj$constant))
    } else if (!is.null(cobj$rgba_values)) {
      aes$data_columns$fillColor <- list(values = cobj$rgba_values, size = 4L)
    } else {
      aes$data_columns$fillColor <- list(encoding = "dict", dict_rgba = cobj$dict_rgba, codes = cobj$codes)
    }
  }

  if (!is.null(dots$lineColor)) {
    cobj <- ml_prepare_color(dots$lineColor, opacity = stroke_op_expr, n = n, data = data)
    if (!is.null(cobj$constant)) {
      aes$base_encodings$lineColor <- list(value = as.integer(cobj$constant))
    } else if (!is.null(cobj$rgba_values)) {
      aes$data_columns$lineColor <- list(values = cobj$rgba_values, size = 4L)
    } else {
      aes$data_columns$lineColor <- list(encoding = "dict", dict_rgba = cobj$dict_rgba, codes = cobj$codes)
    }
  }

  aes
}
