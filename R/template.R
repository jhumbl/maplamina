tmpl <- function(template, ..., html = FALSE) {
  stopifnot(is.character(template), length(template) == 1L)
  bindings <- as.list(substitute(list(...)))[-1L]  # named expressions
  structure(
    list(template = template, html = isTRUE(html), bindings = bindings, env = parent.frame()),
    class = "maplamina_template"
  )
}

# internal: parse {name[:fmt]} occurrences
.ml_parse_placeholders <- function(template) {
  stopifnot(is.character(template), length(template) == 1L)

  m <- gregexpr("\\{([^}:]+)(?::([^}]+))?\\}", template, perl = TRUE)[[1]]
  if (identical(m, -1L)) {
    return(data.frame(
      name  = character(0),
      fmt   = character(0),
      start = integer(0),
      end   = integer(0),
      stringsAsFactors = FALSE
    ))
  }

  match_start <- as.integer(m)
  match_len   <- attr(m, "match.length")
  cap_start   <- attr(m, "capture.start")
  cap_len     <- attr(m, "capture.length")

  n <- length(match_start)
  name <- fmt <- character(n)
  for (i in seq_len(n)) {
    # capture group 1: name
    if (cap_len[i, 1] > 0) {
      s <- cap_start[i, 1]; l <- cap_len[i, 1]
      name[i] <- substr(template, s, s + l - 1L)
    } else name[i] <- ""

    # capture group 2: optional fmt
    if (cap_len[i, 2] > 0) {
      s <- cap_start[i, 2]; l <- cap_len[i, 2]
      fmt[i] <- substr(template, s, s + l - 1L)
    } else fmt[i] <- ""
  }

  data.frame(
    name  = name,
    fmt   = fmt,
    start = match_start,
    end   = match_start + match_len - 1L,
    stringsAsFactors = FALSE
  )
}

# internal: collect one placeholder vector (numeric/u32, categorical codes, or dates)
# NOTE: we keep dict (labels) inline JSON like filters do; only codes get blob-ified.
.ml_collect_placeholder <- function(data, name, fmt, bindings, n, env = parent.frame()) {
  # 1) resolve expression: alias in ... wins; else column by name
  expr <- bindings[[name]]
  if (is.null(expr)) {
    # bare symbol lookup by name
    if (nzchar(name) && name %in% names(data)) expr <- as.name(name)
    else expr <- as.name(name)  # let ml_eval error transparently later
  }
  vals <- ml_eval(data, expr, env = env)

  # Recycle scalars to feature length (common for constants defined in the template env)
  if (!is.null(n) && !is.na(n) && is.numeric(n) && length(vals) == 1L && n > 1L) {
    vals <- rep(vals, as.integer(n))
  }

  # 2) coerce & classify
  if (is.numeric(vals)) {
    # Prefer integer codes as u32 when they are whole numbers
    if (is.integer(vals) || (is.double(vals) && all(is.finite(vals) & (vals == as.integer(vals)), na.rm = TRUE))) {
      return(list(kind = "numeric-u32", name = name, fmt = fmt, values_values = as.integer(vals)))
    } else {
      return(list(kind = "numeric-f32", name = name, fmt = fmt, values_values = as.numeric(vals)))
    }
  }

  # Dates/POSIXct -> seconds since epoch as u32 when safe; else f32
  if (inherits(vals, "Date")) {
    secs <- as.integer(as.numeric(vals) * 86400) # days -> seconds
    return(list(kind = "epoch-u32", name = name, fmt = if (nzchar(fmt)) fmt else "%Y-%m-%d", values_values = secs))
  }
  if (inherits(vals, "POSIXct") || inherits(vals, "POSIXt")) {
    secs <- as.numeric(vals) # seconds since epoch (double)
    # u32 if within safe range; else f32
    if (all(is.finite(secs)) && max(secs, na.rm = TRUE) < 4.29e9) {
      return(list(kind = "epoch-u32", name = name, fmt = if (nzchar(fmt)) fmt else "%Y-%m-%d", values_values = as.integer(secs)))
    } else {
      return(list(kind = "epoch-f32", name = name, fmt = if (nzchar(fmt)) fmt else "%Y-%m-%d", values_values = as.numeric(secs)))
    }
  }

  # Categorical (character/factor) -> dict (JSON) + u32 codes blob
  f <- as.factor(vals)
  dict <- levels(f)
  codes <- as.integer(f) - 1L
  list(kind = "categorical", name = name, fmt = fmt,
       dict = dict, codes_values = as.integer(codes))
}

# internal: pack a template spec into a layer sub-list
.ml_pack_template <- function(data, tmpl, n) {
  if (is.null(tmpl) || !inherits(tmpl, "maplamina_template")) return(NULL)
  ph <- .ml_parse_placeholders(tmpl$template)
  if (!nrow(ph)) return(NULL)

  out <- list(type = "template", template = tmpl$template, html = isTRUE(tmpl$html), placeholders = list())
  # Collect all placeholders; allow duplicates of the same name by spec
  for (i in seq_len(nrow(ph))) {
    info <- ph[i, , drop = FALSE]
    tenv <- tmpl$env %||% parent.frame()
    one  <- .ml_collect_placeholder(data, info$name, info$fmt, tmpl$bindings, n, env = tenv)
    out$placeholders[[length(out$placeholders) + 1L]] <- one
  }
  out
}


# context-aware wrapper (row vs part)
.ml_pack_template_ctx <- function(ctx, tmpl) {
  if (is.null(ctx)) stop("ctx is NULL", call. = FALSE)
  .ml_pack_template(ctx$data_eval, tmpl, ctx$n_part)
}
