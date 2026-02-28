# ---- Mapflow v3: aesthetics collectors ----
# Refactor: split from aesthetics.R for readability.

ml_color_to_rgba <- function(col, alpha = 1, n = NULL) {
  # Convert colors to RGBA.
  #
  # - If length(col) == 1: returns integer vector c(r,g,b,a)
  # - If length(col)  > 1: returns raw vector packed as [r,g,b,a, r,g,b,a, ...]
  #
  # `alpha` may be length 1 or length(col).
  if (!is.null(n)) col <- rep_len(col, n)

  if (length(alpha) == 1L) {
    alpha <- rep_len(alpha, length(col))
  }
  if (length(alpha) != length(col)) {
    stop("ml_color_to_rgba(): `alpha` must be length 1 or length(col).", call. = FALSE)
  }

  # clamp alpha and convert to 0-255
  alpha <- pmax(0, pmin(1, as.numeric(alpha)))
  a <- as.integer(round(alpha * 255))

  m <- grDevices::col2rgb(col) # 3 x length(col)

  if (length(col) == 1L) {
    return(c(m[, 1], a[[1L]]))
  }

  ncol_m <- ncol(m)
  out <- raw(4L * ncol_m)
  idx <- seq_len(ncol_m)
  base <- (idx - 1L) * 4L

  out[base + 1L] <- as.raw(m[1L, ])
  out[base + 2L] <- as.raw(m[2L, ])
  out[base + 3L] <- as.raw(m[3L, ])
  out[base + 4L] <- as.raw(a)

  out
}

# ---- internal helpers -------------------------------------------------------

.ml_is_color_scale <- function(x) inherits(x, "maplamina_color_scale")

.ml_palette_resolve <- function(palette, n, reverse = FALSE) {
  # Resolve a palette spec to n colors.
  #
  # - If `palette` is a single string, try grDevices::hcl.colors(n, palette = ...)
  # - If `palette` is a character vector of length >= 2, treat as explicit colors
  #   and interpolate (via colorRampPalette).
  #
  # Returns a character vector of hex colors.
  if (is.null(palette)) {
    pal <- .ml_default_palette(n)
  } else if (is.character(palette) && length(palette) == 1L) {
    pal <- tryCatch(
      grDevices::hcl.colors(n, palette = palette),
      error = function(e) NULL
    )
    if (is.null(pal)) {
      # Fall back: treat the single string as an actual color.
      pal <- rep_len(as.character(palette), n)
    }
  } else if (is.character(palette) && length(palette) >= 2L) {
    pal <- grDevices::colorRampPalette(palette)(n)
  } else {
    stop("Palette must be NULL, a single palette name, or a character vector of colors.", call. = FALSE)
  }

  if (isTRUE(reverse)) pal <- rev(pal)
  pal
}

.ml_resolve_color_scale <- function(spec, data, n, env = parent.frame()) {
  # Resolve a maplamina_color_scale spec into a per-row hex color vector.
  if (!.ml_is_color_scale(spec)) {
    stop(".ml_resolve_color_scale(): `spec` must be a maplamina_color_scale.", call. = FALSE)
  }

  sexpr <- spec$expr
  if (!ml_is_formulaish(sexpr)) {
    stop("Color scale `expr` must be a formula (~col).", call. = FALSE)
  }

  # Ensure we evaluate in the environment captured at construction time.
  senv <- spec$env %||% environment(sexpr) %||% env
  x <- ml_eval_aes(data, sexpr, env = senv)

  # Allow scalar values; recycle to n.
  if (length(x) == 1L) x <- rep_len(x, n)
  if (length(x) != n) {
    stop("Color scale expression must return length 1 or n (", n, ").", call. = FALSE)
  }

  na_color <- as.character(spec$na_color %||% "#00000000")
  kind <- as.character(spec$kind %||% "")
  reverse <- isTRUE(spec$reverse)
  clamp <- isTRUE(spec$clamp %||% TRUE)

  # Helpers
  out_na <- function() rep_len(na_color, n)

  if (all(is.na(x))) return(out_na())

  if (identical(kind, "factor")) {
    # Categorical mapping
    xv <- as.character(x)
    dom <- spec$domain %||% unique(xv[!is.na(xv)])
    dom <- as.character(dom)
    pal <- .ml_palette_resolve(spec$palette, length(dom), reverse = reverse)
    f <- factor(xv, levels = dom)
    col <- pal[as.integer(f)]
    col[is.na(col)] <- na_color
    attr(spec, "levels") <- dom
    attr(spec, "colors") <- pal
    return(col)
  }

  # Numeric mapping (bin / quantile / numeric)
  xnum <- suppressWarnings(as.numeric(x))
  ok <- !is.na(xnum)
  if (!any(ok)) return(out_na())

  # Domain handling
  dom <- spec$domain
  if (is.null(dom)) {
    dom <- range(xnum[ok], na.rm = TRUE)
  }
  if (length(dom) != 2L || any(!is.finite(dom))) {
    stop("`domain` must be a length-2 numeric vector (min, max).", call. = FALSE)
  }
  dom <- as.numeric(dom)
  dmin <- dom[[1L]]
  dmax <- dom[[2L]]

  # Constant domain edge-case
  if (!is.finite(dmin) || !is.finite(dmax) || dmin == dmax) {
    pal <- .ml_palette_resolve(spec$palette, 1L, reverse = reverse)
    col <- rep_len(pal[[1L]], n)
    col[!ok] <- na_color
    attr(spec, "domain") <- c(dmin, dmax)
    attr(spec, "colors") <- pal
    return(col)
  }

  if (identical(kind, "numeric")) {
    steps <- as.integer(spec$steps %||% 256L)
    if (is.na(steps) || steps < 2L) steps <- 256L

    pal <- .ml_palette_resolve(spec$palette, steps, reverse = reverse)
    t <- (xnum - dmin) / (dmax - dmin)

    if (clamp) {
      t <- pmax(0, pmin(1, t))
    } else {
      ok <- ok & t >= 0 & t <= 1
    }

    idx <- as.integer(floor(t * (steps - 1L))) + 1L
    idx[!ok] <- NA_integer_
    col <- pal[idx]
    col[is.na(col)] <- na_color

    attr(spec, "domain") <- c(dmin, dmax)
    attr(spec, "colors") <- pal
    return(col)
  }

  if (identical(kind, "bin")) {
    bins <- spec$bins %||% 5L
    breaks <- NULL
    if (is.numeric(bins) && length(bins) > 1L) {
      breaks <- as.numeric(bins)
    } else {
      k <- as.integer(bins)
      if (is.na(k) || k < 1L) k <- 5L
      breaks <- seq(dmin, dmax, length.out = k + 1L)
    }

    # Guard against non-increasing breaks
    breaks <- unique(breaks)
    if (length(breaks) < 2L) {
      pal <- .ml_palette_resolve(spec$palette, 1L, reverse = reverse)
      col <- rep_len(pal[[1L]], n)
      col[!ok] <- na_color
      attr(spec, "breaks") <- breaks
      attr(spec, "colors") <- pal
      return(col)
    }

    k <- length(breaks) - 1L
    pal <- .ml_palette_resolve(spec$palette, k, reverse = reverse)

    # Use cut to assign bins
    b <- cut(xnum, breaks = breaks, include.lowest = TRUE, right = TRUE, labels = FALSE)

    if (!clamp) {
      ok <- ok & !is.na(b)
    }

    col <- pal[b]
    col[!ok | is.na(col)] <- na_color

    attr(spec, "domain") <- c(dmin, dmax)
    attr(spec, "breaks") <- breaks
    attr(spec, "colors") <- pal
    return(col)
  }

  if (identical(kind, "quantile")) {
    nq <- as.integer(spec$n %||% 5L)
    if (is.na(nq) || nq < 1L) nq <- 5L

    probs <- seq(0, 1, length.out = nq + 1L)
    breaks <- as.numeric(stats::quantile(xnum[ok], probs = probs, na.rm = TRUE, names = FALSE, type = 7))
    breaks <- unique(breaks)

    if (length(breaks) < 2L) {
      pal <- .ml_palette_resolve(spec$palette, 1L, reverse = reverse)
      col <- rep_len(pal[[1L]], n)
      col[!ok] <- na_color
      attr(spec, "breaks") <- breaks
      attr(spec, "colors") <- pal
      return(col)
    }

    k <- length(breaks) - 1L
    pal <- .ml_palette_resolve(spec$palette, k, reverse = reverse)

    b <- cut(xnum, breaks = breaks, include.lowest = TRUE, right = TRUE, labels = FALSE)
    if (!clamp) {
      ok <- ok & !is.na(b)
    }

    col <- pal[b]
    col[!ok | is.na(col)] <- na_color

    attr(spec, "domain") <- c(dmin, dmax)
    attr(spec, "breaks") <- breaks
    attr(spec, "colors") <- pal
    return(col)
  }

  stop("Unknown color scale kind: '", kind, "'.", call. = FALSE)
}

.ml_are_valid_colors <- function(x) {
  # Heuristic: treat `x` as colors if grDevices::col2rgb() can parse
  # a small sample of its unique values.
  #
  # Important: do NOT treat numeric palette indices (e.g. "1", "2") as valid colors,
  # because numeric data often becomes character during processing and would then be
  # mis-detected as "colors".
  x <- as.character(x)
  x <- x[!is.na(x)]
  u <- unique(x)
  if (length(u) == 0L) return(TRUE)
  if (length(u) > 50L) u <- u[seq_len(50L)]

  # Reject numeric-looking strings (including scientific notation)
  num_pat <- "^[+-]?(?:\\d+\\.?\\d*|\\d*\\.?\\d+)(?:[eE][+-]?\\d+)?$"
  if (any(grepl(num_pat, u))) return(FALSE)

  tryCatch({
    grDevices::col2rgb(u)
    TRUE
  }, error = function(e) FALSE)
}

.ml_default_palette <- function(n) {
  # Lightweight base-R palette (no dependencies) using HCL.
  # Returns n hex colors.
  if (n <= 0L) return(character())
  h <- seq(15, 375, length.out = n + 1L)[seq_len(n)]
  grDevices::hcl(h = h, l = 65, c = 100)
}

ml_prepare_color <- function(color, opacity = 1, n, data, env = parent.frame()) {
  if (is.null(color)) return(NULL)

  # Evaluate color and opacity (both support scalar or formula (~col)).
  is_col_fml <- ml_is_formulaish(color)
  colv <- ml_eval_aes(data, color, env = env)

  # Color scale spec: resolve eagerly to hex colors (R-side) before packing.
  # This keeps the JS contract unchanged.
  if (.ml_is_color_scale(colv)) {
    colv <- .ml_resolve_color_scale(colv, data = data, n = n, env = env)
    is_col_fml <- TRUE
  }

  if (is.function(colv)) {
    stop(
      "Color expression resolved to a function. Use a scalar color (e.g. 'red') or a formula (~col).",
      call. = FALSE
    )
  }

  # Stage 3 strict semantics:
  # If the user supplies a formula (~col) for fill/line colors, it must evaluate to
  # actual colors (character/factor). Numeric (or date/logical) vectors are NOT treated
  # as colors; users must use color_bin()/color_quantile()/color_numeric()/color_factor().
  if (is_col_fml && (is.numeric(colv) || is.logical(colv) ||
                     inherits(colv, "Date") || inherits(colv, "POSIXt"))) {
    stop(
      "`~col` in fill_color/line_color must evaluate to actual colors (e.g. '#RRGGBB', 'red'). ",
      "To map values to colors, use `fill_color = color_bin(~col, ...)`, `color_quantile(~col, ...)`, ",
      "`color_numeric(~col, ...)`, or `color_factor(~col, ...)`.",
      call. = FALSE
    )
  }


  # No precomputed vectors: non-formulas must be scalar
  if (!is_col_fml && length(colv) != 1L) {
    stop(
      "Color must be a scalar (e.g. 'red' or PRIMARY_COLOR) or a formula (~col). ",
      "Precomputed vectors are not supported; add them as a column and use ~col.",
      call. = FALSE
    )
  }

  is_op_fml <- ml_is_formulaish(opacity)
  opv <- if (is_op_fml) ml_eval_aes(data, opacity, env = env) else opacity

  if (!is_op_fml && length(opv) != 1L) {
    stop(
      "Opacity must be a scalar (or a formula (~col) returning length 1 or n).",
      call. = FALSE
    )
  }
  if (is_op_fml && !(length(opv) %in% c(1L, n))) {
    stop("Opacity formula must return length 1 or n (", n, ").", call. = FALSE)
  }

  opv <- as.numeric(opv)

  # ---- scalar color ----
  if (length(colv) == 1L) {
    if (length(opv) == 1L) {
      rgba <- ml_color_to_rgba(colv, opv)
      return(list(constant = as.integer(rgba)))
    }

    # Per-feature opacity: bake alpha into per-row RGBA values.
    rgba_raw <- ml_color_to_rgba(rep_len(colv, n), opv)
    return(list(rgba_values = rgba_raw))
  }

  # ---- per-row colors (formula) ----
  colv_chr <- as.character(colv)

  # If the vector isn't parsable as colors, treat it as categorical labels and
  # assign a default palette.
  is_colors <- .ml_are_valid_colors(colv_chr)

  if (length(opv) == 1L) {
    if (is_colors) {
      # Encode via dict + codes (dedupe actual colors).
      f <- as.factor(colv_chr)
      dict_levels <- levels(f)
      dict_rgba_raw <- ml_color_to_rgba(dict_levels, opv, n = length(dict_levels))
      codes <- as.integer(f) - 1L
      return(list(dict_rgba = dict_rgba_raw, codes = as.integer(codes)))
    }

    # Categorical labels: assign palette colors by level.
    levs <- unique(colv_chr)
    f <- factor(colv_chr, levels = levs)
    pal <- .ml_default_palette(length(levs))
    dict_rgba_raw <- ml_color_to_rgba(pal, opv, n = length(pal))
    codes <- as.integer(f) - 1L
    return(list(dict_rgba = dict_rgba_raw, codes = as.integer(codes)))
  }

  # Per-feature alpha: emit direct RGBA values.
  if (!is_colors) {
    levs <- unique(colv_chr)
    f <- factor(colv_chr, levels = levs)
    pal <- .ml_default_palette(length(levs))
    colv_chr <- pal[as.integer(f)]
  }
  rgba_raw <- ml_color_to_rgba(colv_chr, opv)
  list(rgba_values = rgba_raw)
}

# ---- public: color scale specifications ------------------------------------

# These helpers return a lightweight "scale spec" object that the compiler
# resolves during prerender into a per-row color vector, which is then packed
# via ml_prepare_color() using the existing dict_rgba/codes machinery.

#' Continuous color scale specification (resolved during compilation).
#'
#' @export

color_numeric <- function(expr, palette = NULL, domain = NULL, steps = 256L,
                          na_color = "#00000000", reverse = FALSE, clamp = TRUE) {
  if (!ml_is_formulaish(expr)) {
    stop("color_numeric(): `expr` must be a formula like ~population.", call. = FALSE)
  }

  structure(
    list(
      kind = "numeric",
      expr = expr,
      palette = palette,
      domain = domain,
      steps = as.integer(steps),
      na_color = na_color,
      reverse = reverse,
      clamp = clamp,
      env = parent.frame()
    ),
    class = "maplamina_color_scale"
  )
}

#' Binned (equal-interval or manual breaks) color scale specification (resolved during compilation).
#'
#' @export

color_bin <- function(expr, palette = NULL, bins = 5,
                      domain = NULL,
                      na_color = "#00000000", reverse = FALSE, clamp = TRUE) {
  if (!ml_is_formulaish(expr)) {
    stop("color_bin(): `expr` must be a formula like ~population.", call. = FALSE)
  }

  structure(
    list(
      kind = "bin",
      expr = expr,
      palette = palette,
      bins = bins,
      domain = domain,
      na_color = na_color,
      reverse = reverse,
      clamp = clamp,
      env = parent.frame()
    ),
    class = "maplamina_color_scale"
  )
}

#' Quantile color scale specification (resolved during compilation).
#'
#' @export

color_quantile <- function(expr, palette = NULL, n = 5,
                           domain = NULL,
                           na_color = "#00000000", reverse = FALSE, clamp = TRUE) {
  if (!ml_is_formulaish(expr)) {
    stop("color_quantile(): `expr` must be a formula like ~population.", call. = FALSE)
  }

  structure(
    list(
      kind = "quantile",
      expr = expr,
      palette = palette,
      n = as.integer(n),
      domain = domain,
      na_color = na_color,
      reverse = reverse,
      clamp = clamp,
      env = parent.frame()
    ),
    class = "maplamina_color_scale"
  )
}

#' Categorical color scale specification (resolved during compilation).
#'
#' @export

color_factor <- function(expr, palette = NULL, domain = NULL,
                         na_color = "#00000000", reverse = FALSE) {
  if (!ml_is_formulaish(expr)) {
    stop("color_factor(): `expr` must be a formula like ~region.", call. = FALSE)
  }

  structure(
    list(
      kind = "factor",
      expr = expr,
      palette = palette,
      domain = domain,
      na_color = na_color,
      reverse = reverse,
      clamp = TRUE,
      env = parent.frame()
    ),
    class = "maplamina_color_scale"
  )
}
