# ---- maplamina v3: layers (rendering-only) ----
# Refactor: split from add_layer.R for navigability.

.ml_infer_lonlat_formulas <- function(data, env = parent.frame()) {
  nm <- names(data)
  if (is.null(nm) || !length(nm)) return(NULL)

  nml <- tolower(nm)

  pairs <- list(
    c("lon", "lat"),
    c("lng", "lat"),
    c("longitude", "latitude"),
    c("long", "lat"),
    c("x", "y")
  )

  pick <- function(key) {
    i <- which(nml == key)
    if (length(i)) nm[[i[[1L]]]] else NULL
  }

  quote_name <- function(s) {
    if (isTRUE(all.equal(make.names(s), s))) s else paste0("`", s, "`")
  }

  for (p in pairs) {
    lon_nm <- pick(p[[1L]])
    lat_nm <- pick(p[[2L]])
    if (!is.null(lon_nm) && !is.null(lat_nm)) {
      lon_rhs <- quote_name(lon_nm)
      lat_rhs <- quote_name(lat_nm)
      return(list(
        lon = stats::as.formula(paste0("~", lon_rhs), env = env),
        lat = stats::as.formula(paste0("~", lat_rhs), env = env)
      ))
    }
  }

  NULL
}

.ml_resolve_layer_data <- function(map, data, data_expr) {

  # explicit data provided (non-NULL)
  if (!is.null(data)) {
    nm <- if (!is.null(data_expr)) deparse1(data_expr) else "data"
    return(list(data = data, name = nm))
  }

  # otherwise use map default data
  default_data <- map$x$.__default_data %||% NULL
  if (is.null(default_data)) {
    stop("No `data` supplied. Provide `data = ...` or call `maplamina(data)` first.", call. = FALSE)
  }

  nm <- map$x$.__default_data_name %||% "data"
  list(data = default_data, name = nm)
}


.ml_collect_layer_aesthetics <- function(ctx, type, data, dots, env = parent.frame()) {

  # NOTE: ctx$data_eval may be "part-grain" (rows repeated for multipart geometries).
  # For choropleth color scales we must compute breaks at row-grain (original data),
  # then expand to parts using ctx$feature_index, otherwise multipart features would
  # be overweighted.
  n_row  <- ctx$n_row  %||% nrow(data)
  n_part <- ctx$n_part %||% n_row

  data_eval <- ctx$data_eval %||% data
  dots_eval <- dots

  expand_to_parts <- function(x_row) {
    fi <- ctx$feature_index %||% NULL
    if (is.null(fi) || n_part == n_row) return(x_row)
    x_row[fi + 1L]
  }

  tmp_name <- function(base) {
    nm <- names(data_eval) %||% character()
    cand <- base
    i <- 1L
    while (cand %in% nm) {
      cand <- paste0(base, '_', i)
      i <- i + 1L
    }
    cand
  }

  # Resolve scale specs to actual per-part colors by injecting a temporary column
  # into data_eval and rewriting the aesthetic to a formula referencing that column.
  if (.ml_is_color_scale(dots$fillColor)) {
    col_row  <- .ml_resolve_color_scale(dots$fillColor, data = data, n = n_row, env = env)
    col_part <- expand_to_parts(col_row)
    cn <- tmp_name('.__ml_fillColor')
    data_eval[[cn]] <- col_part
    dots_eval$fillColor <- stats::as.formula(paste0('~', cn), env = env)
  }

  if (.ml_is_color_scale(dots$lineColor)) {
    col_row  <- .ml_resolve_color_scale(dots$lineColor, data = data, n = n_row, env = env)
    col_part <- expand_to_parts(col_row)
    cn <- tmp_name('.__ml_lineColor')
    data_eval[[cn]] <- col_part
    dots_eval$lineColor <- stats::as.formula(paste0('~', cn), env = env)
  }

  aes <- ml_collect_aesthetics(type, data_eval, dots_eval, n_part)

  eval_opacity_scalar <- function(x, default = 1) {
    if (is.null(x)) return(as.numeric(default))
    v <- ml_eval_aes(data, x, env = env)
    if (length(v) != 1L) return(as.numeric(default))
    as.numeric(v)
  }

  base_stroke_opacity <- eval_opacity_scalar(dots$opacity, default = 1)
  base_fill_opacity   <- eval_opacity_scalar(dots$fillOpacity, default = 1)

  list(
    aes = aes,
    view_base = list(
      base_fill_opacity   = base_fill_opacity,
      base_stroke_opacity = base_stroke_opacity,
      base_stroke_color   = dots$lineColor,
      base_fill_color     = dots$fillColor
    )
  )
}

.ml_collect_layer_templates <- function(ctx, tooltip = NULL, popup = NULL) {
  list(
    tooltip = .ml_pack_template_ctx(ctx, tooltip),
    popup   = .ml_pack_template_ctx(ctx, popup)
  )
}

add_layer <- function(
    map, type, data, geom = NULL, dots = list(),
    id = NULL,
    group = NULL,
    pickable = TRUE,
    stroke = FALSE,
    cfg_extra = NULL,
    tooltip = NULL,
    popup = NULL
){

  env <- parent.frame()

  if (is.null(id)) {
    existing <- names(map$x$.__layers %||% list()) %||% character()
  tmp <- .ml_next_id(map, prefix = type, scope = "prefix", existing_ids = existing)
  map <- tmp$map
  id <- tmp$id

  }
  # Guard: IconLayer-based layers are not currently supported on globe projection
  # due to an upstream deck.gl IconLayer limitation with MapLibre globe + MapboxOverlay.
  proj <- map$x$map_options$projection %||% "mercator"
  if (identical(proj, "globe") && type %in% c("icon", "marker")) {
    msg <- sprintf(
      "[maplamina] projection='globe' does not support icon/marker layers (layer='%s', type='%s').",
      id, type
    )
    stop(
      paste0(
        msg, "\n",
        "This is due to an upstream deck.gl IconLayer limitation with MapLibre globe.\n",
        "Use add_circle_markers() instead, or set projection='mercator'."
      ),
      call. = FALSE
    )
  }

  if (type %in% c("circle", "icon", "marker") && !inherits(data, "sf")) {

    if (is.null(dots$lon) || is.null(dots$lat)) {
      inferred <- .ml_infer_lonlat_formulas(data, env = env)
      if (is.null(inferred)) {
        stop(
          "For non-sf point data, pass lon = ~<col> and lat = ~<col>, ",
          "or include recognizable columns (lon/lat, lng/lat, longitude/latitude, x/y).",
          call. = FALSE
        )
      }
      dots$lon <- inferred$lon
      dots$lat <- inferred$lat
    }

    if (!ml_is_formulaish(dots$lon) || !ml_is_formulaish(dots$lat)) {
      stop("lon/lat must be formulas like ~lon and ~lat.", call. = FALSE)
    }
  }

  force_use_offsets <- if (identical(proj, "globe")) FALSE else NULL

  geom_part <- switch(
    type,
    circle  = ml_collect_geometry_points(data, dots$lon, dots$lat, use_offsets = force_use_offsets),
    icon    = ml_collect_geometry_points(data, dots$lon, dots$lat, use_offsets = force_use_offsets),
    marker  = ml_collect_geometry_points(data, dots$lon, dots$lat, use_offsets = force_use_offsets),
    line    = ml_collect_geometry_lines(data, use_offsets = force_use_offsets),
    polygon = ml_collect_geometry_polygons(data, use_offsets = force_use_offsets),
    stop("Unknown layer type: ", type)
  )

  ctx <- ml_layer_context(data, geom_part, env = env)
  n <- ctx$n_part %||% NA_integer_

  # TEMP DEBUG: report coordinate system selection (remove once globe stabilizes)
  coord_sys <- if (!is.null(geom_part$coordinate_origin)) "LNGLAT_OFFSETS" else "LNGLAT"
  if (identical(proj, "globe") && !is.null(geom_part$coordinate_origin)) {
    coord_sys <- "LNGLAT_OFFSETS (UNEXPECTED in globe)"
  } else if (identical(proj, "globe")) {
    coord_sys <- "LNGLAT (offsets disabled)"
  }

  message(sprintf(
    "[maplamina] layer=%s type=%s projection=%s coord=%s n_row=%s n_part=%s",
    id, type, proj, coord_sys,
    ctx$n_row %||% NA_integer_,
    ctx$n_part %||% NA_integer_
  ))

  aes_out <- .ml_collect_layer_aesthetics(ctx, type, data, dots, env = env)
  aes <- aes_out$aes

  tpl <- .ml_collect_layer_templates(ctx, tooltip = tooltip, popup = popup)

  # NOTE: views/filters are now registered as separate components (.__components)
  # and compiled later. Layers remain rendering-only.

  cfg <- c(list(pickable = pickable, stroke = stroke), .ml_compact(cfg_extra %||% list()))

  bbox   <- geom_part$bbox %||% NULL
  origin <- geom_part$coordinate_origin %||% NULL
  dc <- geom_part[setdiff(names(geom_part), c("n", "bbox", "coordinate_origin"))]

  tt_spec <- tpl$tooltip
  pp_spec <- tpl$popup

  layer <- list(
    id = id,
    type = type,
    group = group,
    data_columns   = c(dc, aes$data_columns),
    base_encodings = aes$base_encodings,
    cfg            = cfg,
    bbox           = bbox,
    coordinate_origin = origin,
    tooltip        = tt_spec,
    popup          = pp_spec
  )

  if (is.null(map$x$.__layers)) map$x$.__layers <- list()
  map$x$.__layers[[id]] <- layer

  # Internal-only: keep original data + metadata for later compilation (Stage 3)
  if (is.null(map$x$.__data_registry)) map$x$.__data_registry <- list()
  map$x$.__data_registry[[id]] <- data

  if (is.null(map$x$.__layer_meta)) map$x$.__layer_meta <- list()
  map$x$.__layer_meta[[id]] <- list(
    n = as.integer(n),
    n_row = ctx$n_row,
    n_part = ctx$n_part,
    is_multipart = ctx$is_multipart,
    # 0-based feature index of length n_part, mapping each part back to its source row.
    # Used by the compiler to expand per-row view/filter vectors to per-part vectors.
    feature_index = ctx$feature_index,
    type = type,
    group = group,
    view_base = aes_out$view_base
  )

  map
}
