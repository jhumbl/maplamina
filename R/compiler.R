# ---- v3 prerender compiler (preRenderHook) ----
# Refactor: keep behavior the same, but structure the compiler into explicit passes
# and promote small helpers to file-scope for easier maintenance/testing.

.ml_compiler_union_ordered <- function(x, y) {
  if (is.list(x)) x <- unlist(x, use.names = FALSE)
  if (is.list(y)) y <- unlist(y, use.names = FALSE)
  x <- x %||% character()
  y <- y %||% character()
  for (v in y) if (!v %in% x) x <- c(x, v)
  x
}

.ml_compiler_layer_data <- function(widget, layers, layer_id) {
  # Prefer explicit registry (Stage 2+ design), else fall back to legacy per-layer metadata.
  d <- widget$x$.__data_registry[[layer_id]] %||% NULL
  if (!is.null(d)) return(d)

  st <- layers[[layer_id]] %||% NULL
  if (!is.null(st) && !is.null(st$.__data)) return(st$.__data)

  NULL
}

.ml_compiler_layer_n <- function(widget, layers, layer_id, data) {
  st <- layers[[layer_id]] %||% NULL
  n <- NULL

  # Prefer registry meta if present
  meta <- widget$x$.__layer_meta[[layer_id]] %||% NULL
  if (!is.null(meta) && !is.null(meta$n)) n <- meta$n

  # Else legacy per-layer n
  if (is.null(n) && !is.null(st) && !is.null(st$.__n)) n <- st$.__n

  if (is.null(n) && !is.null(data)) n <- nrow(data)

  as.integer(n %||% NA_integer_)
}

# Stage 3: layers may be multipart (e.g., MULTIPOLYGON / MULTILINESTRING).
# Views and filters are authored at feature (row) grain, but GPU attributes must be
# emitted at part grain. We persist a 0-based feature_index in layer_meta to expand
# per-row vectors to per-part vectors.
.ml_compiler_layer_meta2 <- function(widget, layers, layer_id, data) {
  meta <- widget$x$.__layer_meta[[layer_id]] %||% NULL

  n_row  <- NULL
  n_part <- NULL
  fi     <- NULL

  if (!is.null(meta)) {
    n_row  <- meta$n_row  %||% NULL
    n_part <- meta$n_part %||% meta$n %||% NULL
    fi     <- meta$feature_index %||% NULL
  }

  if (is.null(n_row) && !is.null(data)) n_row <- nrow(data)
  if (is.null(n_part)) n_part <- n_row

  list(
    n_row  = as.integer(n_row  %||% NA_integer_),
    n_part = as.integer(n_part %||% NA_integer_),
    feature_index = if (is.null(fi)) NULL else as.integer(fi)
  )
}

.ml_compiler_expand_to_parts <- function(x, meta2) {
  if (is.null(x)) return(NULL)

  fi <- meta2$feature_index %||% NULL
  if (is.null(fi)) return(x)

  n_row  <- meta2$n_row
  n_part <- meta2$n_part
  if (is.na(n_row) || is.na(n_part) || n_row == n_part) return(x)

  # Only expand the common case: vectors evaluated at row-grain.
  if (length(x) == n_row) {
    return(x[fi + 1L])
  }

  x
}

.ml_compiler_view_base <- function(widget, layers, layer_id) {
  meta <- widget$x$.__layer_meta[[layer_id]] %||% NULL
  if (!is.null(meta) && !is.null(meta$view_base)) return(meta$view_base)

  st <- layers[[layer_id]] %||% NULL
  st$.__view_base %||% list()
}

.ml_compiler_controls_add_member <- function(controls, bind, type, member_id) {
  if (is.null(controls[[bind]])) {
    # NOTE: keep members as a list-of-strings so jsonlite::write_json(auto_unbox=TRUE)
    # will still emit JSON arrays for length-1 membership.
    controls[[bind]] <- list(type = type, members = list())
  } else {
    if (!identical(controls[[bind]]$type, type)) {
      stop(
        "Bind id '", bind, "' is reused across incompatible control types: existing '",
        controls[[bind]]$type, "' vs new '", type, "'.",
        call. = FALSE
      )
    }
  }

  m <- controls[[bind]]$members
  if (is.null(m)) m <- list()

  # tolerate older shapes
  if (!is.list(m)) m <- as.list(as.character(m))

  mid <- as.character(member_id)
  present <- unlist(m, use.names = FALSE)
  if (!mid %in% present) m <- c(m, list(mid))

  controls[[bind]]$members <- m
  controls
}

.ml_compiler_controls_apply_position <- function(controls, bind, position) {
  position <- .ml_ui_validate_position(position)
  if (is.null(position)) return(controls)

  # Ensure bind group exists (should, if called after add_member/group_add)
  if (is.null(controls[[bind]])) controls[[bind]] <- list()

  # First position wins (subsequent differing positions are ignored).
  if (is.null(controls[[bind]]$position)) {
    controls[[bind]]$position <- position
  }

  controls
}



.ml_compiler_filter_group_add <- function(controls, bind, label, type, member_id, meta) {
  if (is.null(bind) || !is.character(bind) || length(bind) != 1L || !nzchar(bind)) {
    stop("Invalid filter bind id while compiling controls.", call. = FALSE)
  }
  if (is.null(label) || !is.character(label) || length(label) != 1L || !nzchar(label)) {
    stop("Invalid filter label while compiling controls for bind '", bind, "'.", call. = FALSE)
  }
  label <- as.character(label)

  # Ensure the bind id is not reused across incompatible top-level control types
  if (is.null(controls[[bind]])) {
    controls[[bind]] <- list(type = "filters", controls = list(), order = list())
  } else {
    if (!identical(controls[[bind]]$type, "filters")) {
      stop(
        "Bind id '", bind, "' is reused across incompatible control types: existing '",
        controls[[bind]]$type, "' vs new 'filters'.",
        call. = FALSE
      )
    }
  }

  grp <- controls[[bind]]
  items <- grp$controls %||% list()

  # Maintain deterministic UI order (list-of-strings to preserve JSON arrays under auto_unbox=TRUE)
  ord <- grp$order %||% list()
  if (!is.list(ord)) ord <- as.list(as.character(ord))
  present_ord <- unlist(ord, use.names = FALSE)
  if (!label %in% present_ord) ord <- c(ord, list(label))
  grp$order <- ord

  cur <- items[[label]]
  created <- is.null(cur)

  if (created) {
    cur <- list(type = type, label = label, members = list())

    if (identical(type, "range")) {
      cur$domain  <- list(min = meta$min, max = meta$max)
      cur$default <- meta$default
      cur$step    <- meta$step
      cur$live    <- meta$live

    } else if (identical(type, "select")) {
      cur$dict       <- .ml_json_array_chr(meta$dict %||% character())
      cur$default    <- meta$default
      cur$multi      <- meta$multi
      cur$dropdown   <- meta$dropdown
      cur$searchable <- meta$searchable
      cur$max_levels <- meta$max_levels
      cur$freq       <- .ml_json_array_int(meta$freq %||% integer())
      cur$top_indices <- .ml_json_array_int(meta$top_indices %||% integer())

    } else {
      stop("Unknown filter control type '", type, "'.", call. = FALSE)
    }

  } else {
    if (!identical(cur$type, type)) {
      stop(
        "Within bind group '", bind, "', filter label '", label,
        "' is reused across incompatible filter types: existing '", cur$type,
        "' vs new '", type, "'.",
        call. = FALSE
      )
    }
  }

  # Add member id (preserve JSON arrays for length-1)
  m <- cur$members %||% list()
  if (!is.list(m)) m <- as.list(as.character(m))
  mid <- as.character(member_id)
  present <- unlist(m, use.names = FALSE)
  if (!mid %in% present) m <- c(m, list(mid))
  cur$members <- m

  # Merge control metadata across members
  if (identical(type, "range")) {
    if (is.null(cur$domain)) cur$domain <- list(min = meta$min, max = meta$max)
    cur$domain$min <- min(cur$domain$min, meta$min, na.rm = TRUE)
    cur$domain$max <- max(cur$domain$max, meta$max, na.rm = TRUE)

    # UI fields: require consistency if user set them differently
    if (!is.null(cur$step) && !is.null(meta$step) && !identical(cur$step, meta$step)) {
      stop("Range filter '", label, "' under bind '", bind, "' has inconsistent `step` across layers.", call. = FALSE)
    }
    if (!is.null(cur$live) && !is.null(meta$live) && !identical(cur$live, meta$live)) {
      stop("Range filter '", label, "' under bind '", bind, "' has inconsistent `live` across layers.", call. = FALSE)
    }

  } else if (identical(type, "select")) {

    # Skip merging for the first member (prevents doubled freq/top_indices)
    if (!created) {
      # UI fields: require consistency
      if (!identical(cur$multi, meta$multi)) {
        stop("Select filter '", label, "' under bind '", bind, "' has inconsistent `multi` across layers.", call. = FALSE)
      }
      if (!identical(cur$searchable, meta$searchable)) {
        stop("Select filter '", label, "' under bind '", bind, "' has inconsistent `searchable` across layers.", call. = FALSE)
      }
      if (!identical(cur$dropdown, meta$dropdown)) {
        stop("Select filter '", label, "' under bind '", bind, "' has inconsistent `dropdown` across layers.", call. = FALSE)
      }
      if (!identical(cur$max_levels, meta$max_levels)) {
        stop("Select filter '", label, "' under bind '", bind, "' has inconsistent `max_levels` across layers.", call. = FALSE)
      }

      old_dict <- cur$dict %||% list()
      if (is.list(old_dict)) old_dict <- unlist(old_dict, use.names = FALSE)
      old_dict <- as.character(old_dict %||% character())

      meta_dict <- meta$dict %||% character()
      if (is.list(meta_dict)) meta_dict <- unlist(meta_dict, use.names = FALSE)
      meta_dict <- as.character(meta_dict)

      new_dict <- .ml_compiler_union_ordered(old_dict, meta_dict)

      # aggregate freq by level (aligned to dict order)
      cur_freq <- cur$freq
      if (is.list(cur_freq)) cur_freq <- unlist(cur_freq, use.names = FALSE)
      cur_freq <- as.integer(cur_freq %||% integer(length(old_dict)))

      meta_freq <- meta$freq
      if (is.list(meta_freq)) meta_freq <- unlist(meta_freq, use.names = FALSE)
      meta_freq <- as.integer(meta_freq %||% integer(length(meta_dict)))

      freq_named <- setNames(cur_freq, old_dict)
      add_named  <- setNames(meta_freq, meta_dict)
      for (lvl in names(add_named)) {
        curv <- freq_named[lvl]
        if (is.na(curv)) curv <- 0L
        freq_named[lvl] <- as.integer(curv) + as.integer(add_named[[lvl]])
      }

      cur$dict <- .ml_json_array_chr(new_dict)
      cur$freq <- .ml_json_array_int(as.integer(unname(freq_named[new_dict])))

      # recompute top_indices from aggregated freq (0-based)
      freq_vec <- unlist(cur$freq, use.names = FALSE)
      if (!is.null(freq_vec) && length(freq_vec)) {
        ord2 <- order(as.integer(freq_vec), decreasing = TRUE)
        cur$top_indices <- .ml_json_array_int(as.integer(ord2) - 1L)
      } else {
        cur$top_indices <- .ml_json_array_int(integer())
      }
    }
  }

  items[[label]] <- cur
  grp$controls <- items
  controls[[bind]] <- grp
  controls
}


.ml_compiler_pack_numeric_encoding <- function(store, id_hint, e) {
  # normalize to either scalar value, or value={ref}
  if (!is.null(e$value_values)) {
    return(list(value = ml_store_ref_numeric(store, id_hint, e$value_values)))
  }
  if (!is.null(e$value)) {
    return(list(value = e$value))
  }
  NULL
}

.ml_compiler_pack_color_encoding <- function(store, dict_hint, codes_hint, e) {
  if (!is.null(e$encoding) && identical(e$encoding, "dict")) {
    dict_ref  <- ml_store_ref_u8(store,  dict_hint,  e$dict_rgba, size = 4L)
    codes_ref <- ml_store_ref_u32(store, codes_hint, e$codes)
    return(list(
      encoding  = "dict",
      dict_rgba = dict_ref,
      codes     = codes_ref,
      dict_rgba_ref_hint = dict_hint,
      codes_ref_hint     = codes_hint
    ))
  }
  if (!is.null(e$value)) {
    return(list(value = e$value))
  }
  NULL
}

.ml_compile_layers <- function(layers) {
  stores <- list()

  for (id in names(layers)) {
    st <- layers[[id]]
    store <- ml_store_begin(st)

    # ---- data_columns → refs (geometry + per-feature columns) ----
    if (!is.null(st$data_columns)) {
      for (nm in names(st$data_columns)) {
        col <- st$data_columns[[nm]]

        # polygon geometry (positions + starts)
        if (identical(nm, "polygon") && is.list(col)) {
          poly <- col

          pos   <- poly$positions_values   %||% poly$positions
          rings <- poly$ring_starts_values %||% poly$ring_starts
          polys <- poly$poly_starts_values %||% poly$poly_starts

          if (!is.null(pos)   && !is.list(pos))   poly$positions   <- ml_store_ref_numeric(store, "poly.pos", pos)
          if (!is.null(rings) && !is.list(rings)) poly$ring_starts <- ml_store_ref_u32(store, "poly.rings", rings)
          if (!is.null(polys) && !is.list(polys)) poly$poly_starts <- ml_store_ref_u32(store, "poly.starts", polys)

          poly$positions_values <- poly$ring_starts_values <- poly$poly_starts_values <- NULL
          st$data_columns[[nm]] <- poly
          next
        }

        # path/line geometry (positions + path_starts)
        if (identical(nm, "path") && is.list(col)) {
          path <- col

          pos    <- path$positions_values    %||% path$positions
          starts <- path$path_starts_values  %||% path$path_starts

          if (!is.null(pos)    && !is.list(pos))    path$positions   <- ml_store_ref_numeric(store, "path.pos", pos)
          if (!is.null(starts) && !is.list(starts)) path$path_starts <- ml_store_ref_u32(store, "path.starts", starts)

          path$positions_values <- path$path_starts_values <- NULL
          st$data_columns[[nm]] <- path
          next
        }

        # feature_index (u32)
        if (identical(nm, "feature_index") && is.list(col) && !is.null(col$values) && !is.list(col$values)) {
          col$values <- ml_store_ref_u32(store, "feature_index", col$values)
          st$data_columns[[nm]] <- col
          next
        }

        # dict encoding columns (e.g., fillColor/lineColor)
        if (!is.null(col$encoding) && identical(col$encoding, "dict")) {

          # canonical fields
          if (!is.null(col$dict_rgba) && !is.list(col$dict_rgba)) {
            col$dict_rgba <- ml_store_ref_u8(store, paste0(nm, ".dict_rgba"), col$dict_rgba, size = 4L)
          }
          if (!is.null(col$codes) && !is.list(col$codes)) {
            col$codes <- ml_store_ref_u32(store, paste0(nm, ".codes"), col$codes)
          }

          # legacy *_values fields (if present)
          if (!is.null(col$dict_rgba_values)) {
            col$dict_rgba <- ml_store_ref_u8(store, paste0(nm, ".dict_rgba"), col$dict_rgba_values, size = 4L)
            col$dict_rgba_values <- NULL
          }
          if (!is.null(col$codes_values)) {
            col$codes <- ml_store_ref_u32(store, paste0(nm, ".codes"), col$codes_values)
            col$codes_values <- NULL
          }

          # older naming: dict -> dict_rgba
          if (!is.null(col$dict) && is.null(col$dict_rgba)) {
            col$dict_rgba <- col$dict
            col$dict <- NULL
          }

          st$data_columns[[nm]] <- col
          next
        }
        # raw u8 column: values → {ref} (e.g., per-feature RGBA)
        # NOTE: `raw` vectors are byte buffers and must NOT go through ml_store_ref_numeric(),
        # otherwise they get coerced to float32 which breaks deck.gl color attributes and bloats payloads.
        if (!is.null(col$values) && is.raw(col$values)) {
          col$values <- ml_store_ref_u8(store, nm, col$values, size = col$size %||% NULL)
          st$data_columns[[nm]] <- col
          next
        }


        # generic numeric column: values → {ref}
        if (!is.null(col$values) && !is.list(col$values)) {
          col$values <- ml_store_ref_numeric(store, nm, col$values)
          st$data_columns[[nm]] <- col
          next
        }

        # legacy shape: values_values → value {ref}
        if (!is.null(col$values_values)) {
          col$value <- ml_store_ref_numeric(store, nm, col$values_values)
          col$values_values <- NULL
          st$data_columns[[nm]] <- col
          next
        }

        # legacy shape: values_u32 → value {ref}
        if (!is.null(col$values_u32)) {
          col$value <- ml_store_ref_u32(store, nm, col$values_u32)
          col$values_u32 <- NULL
          st$data_columns[[nm]] <- col
          next
        }
      }
    }

    # ---- base_encodings numeric vectors → refs ----
    if (!is.null(st$base_encodings)) {
      for (nm in names(st$base_encodings)) {
        be <- st$base_encodings[[nm]]
        if (!is.null(be$value_values)) {
          be$value <- ml_store_ref_numeric(store, paste0("be.", nm), be$value_values)
          be$value_values <- NULL
        }
        st$base_encodings[[nm]] <- be
      }
    }

    # ---- tooltip/popup placeholders → refs (if any) ----
    # ---- tooltip/popup placeholders → refs (if any) ----
    # Template placeholders come from R/template.R (.ml_pack_template()) and do not carry an `id`.
    # We generate a stable, unique semantic ref per placeholder occurrence and store values/codes
    # into the layer's dataStore blobs.
    pack_template <- function(tt, prefix) {
      if (is.null(tt)) return(NULL)
      ph <- tt$placeholders %||% list()
      if (!length(ph)) return(tt)

      for (i in seq_along(ph)) {

        nm  <- ph[[i]]$name %||% ""
        nm2 <- if (nzchar(nm)) make.names(nm) else "x"
        pid <- paste0(prefix, ".", i, ".", nm2)

        if (!is.null(ph[[i]]$values_values)) {
          sem <- paste0("tpl.", pid)

          # Respect kind classification from template.R
          if (!is.null(ph[[i]]$kind) && ph[[i]]$kind %in% c("numeric-u32", "epoch-u32")) {
            ph[[i]]$value <- ml_store_ref_u32(store, sem, as.integer(ph[[i]]$values_values))
          } else {
            ph[[i]]$value <- ml_store_ref_numeric(store, sem, as.numeric(ph[[i]]$values_values))
          }

          ph[[i]]$values_values <- NULL
        }

        if (!is.null(ph[[i]]$codes_values)) {
          sem <- paste0("tpl.", pid, ".codes")
          ph[[i]]$codes <- ml_store_ref_u32(store, sem, as.integer(ph[[i]]$codes_values))
          ph[[i]]$codes_values <- NULL
        }
      }

      tt$placeholders <- ph
      tt
    }

    st$tooltip <- pack_template(st$tooltip, "tooltip")
    st$popup   <- pack_template(st$popup,   "popup")
    # Stage 3: layers are rendering-only
    st$panel <- NULL
    st$views <- NULL
    st$filters <- NULL
    st$active_view <- NULL

    st$dataStore <- NULL

    stores[[id]] <- store
    layers[[id]] <- st
  }

  list(layers = layers, stores = stores)
}

.ml_compiler_flatten_components_raw <- function(raw) {
  raw <- raw %||% list()
  if (!is.list(raw)) return(list())

  # IMPORTANT: avoid `$` partial matching here.
  # In a flat registry, component ids like "views1" would make `raw$views` non-NULL
  # and could cause accidental legacy-bucket detection.
  nms <- names(raw) %||% character()
  has_views_key   <- "views"   %in% nms
  has_filters_key <- "filters" %in% nms

  views_val   <- if (has_views_key)   raw[["views"]]   else NULL
  filters_val <- if (has_filters_key) raw[["filters"]] else NULL

  # Helper: does an object look like a single component record?
  is_component_record <- function(x) {
    tp <- NULL
    if (is.list(x)) tp <- x[["type"]] %||% NULL
    is.character(tp) && length(tp) == 1L && nzchar(tp)
  }

  views_is_legacy_bucket   <- has_views_key   && is.list(views_val)   && !is_component_record(views_val)
  filters_is_legacy_bucket <- has_filters_key && is.list(filters_val) && !is_component_record(filters_val)

  # If neither key exists, or both keys exist but they are component records (not buckets),
  # treat as already-flat.
  if (!views_is_legacy_bucket && !filters_is_legacy_bucket) {
    return(raw)
  }

  # Legacy Stage 3 shape (optionally mixed with already-flat entries during transition).
  out <- list()

  if (views_is_legacy_bucket && length(views_val)) {
    for (cid in names(views_val)) out[[cid]] <- views_val[[cid]]
  }
  if (filters_is_legacy_bucket && length(filters_val)) {
    for (cid in names(filters_val)) out[[cid]] <- filters_val[[cid]]
  }

  # Preserve any already-flat entries that may co-exist (e.g., after refactor but before
  # all call-sites stopped initializing legacy buckets).
  for (cid in nms) {
    if (identical(cid, "views") && views_is_legacy_bucket) next
    if (identical(cid, "filters") && filters_is_legacy_bucket) next
    if (is.null(out[[cid]])) out[[cid]] <- raw[[cid]]
  }

  out
}

.ml_compile_component_views <- function(widget, layers, stores, c, compiled, controls) {
  cid <- c$id %||% NULL
  if (is.null(cid) || !is.character(cid) || length(cid) != 1L || !nzchar(cid)) {
    stop("views component missing a valid `id`.", call. = FALSE)
  }

  layer_id <- c$layer %||% c$layer_id %||% c$target_layer %||% NULL
  bind     <- c$bind  %||% c$bind_id  %||% cid

  position <- .ml_ui_validate_position(c$position %||% NULL)

  if (is.null(layer_id) || is.null(layers[[layer_id]])) {
    stop("views component '", cid, "' targets missing layer '", layer_id %||% "<NULL>", "'.", call. = FALSE)
  }

  data <- .ml_compiler_layer_data(widget, layers, layer_id)
  if (is.null(data)) {
    stop("Missing data for layer '", layer_id, "' while compiling views component '", cid, "'.", call. = FALSE)
  }

  meta2 <- .ml_compiler_layer_meta2(widget, layers, layer_id, data)
  n_row <- meta2$n_row
  st <- layers[[layer_id]]
  base <- .ml_compiler_view_base(widget, layers, layer_id)

  v_in <- c$views %||% c$spec %||% NULL
  if (is.null(v_in) && is.list(c) && length(c) && inherits(c[[1L]], "ml_view")) v_in <- c
  if (is.null(v_in)) {
    stop("views component '", cid, "' has no `views` payload.", call. = FALSE)
  }

  # Normalize at feature (row) grain; expand to part grain when packing.
  vws <- .ml_normalize_views(
    data, v_in, n_row,
    layer_type = st$type,
    base_fill_opacity   = base$base_fill_opacity   %||% 1,
    base_stroke_opacity = base$base_stroke_opacity %||% 1,
    base_stroke_color   = base$base_stroke_color,
    base_fill_color     = base$base_fill_color
  ) %||% list()

  member_view_names <- names(vws %||% list())
  store <- stores[[layer_id]]

  compiled_views <- list()
  for (vn in member_view_names) {
    enc <- vws[[vn]]$encodings %||% list()
    out_enc <- list()

    for (nm in names(enc)) {
      e <- enc[[nm]]

      # numeric encodings
      if (!is.null(e$value_values) || !is.null(e$value)) {
        if (!is.null(e$value_values)) {
          e$value_values <- .ml_compiler_expand_to_parts(e$value_values, meta2)
        }
        out_enc[[nm]] <- .ml_compiler_pack_numeric_encoding(store, paste0("vw.", cid, ".", vn, ".", nm), e)
        next
      }

      # dict color encodings
      if (!is.null(e$encoding) && identical(e$encoding, "dict")) {
        if (!is.null(e$codes)) {
          e$codes <- .ml_compiler_expand_to_parts(e$codes, meta2)
        }
        out_enc[[nm]] <- .ml_compiler_pack_color_encoding(
          store,
          dict_hint  = paste0("vw.", cid, ".", vn, ".", nm, ".dict"),
          codes_hint = paste0("vw.", cid, ".", vn, ".", nm, ".codes"),
          e
        )
        next
      }
    }

    compiled_views[[vn]] <- list(encodings = out_enc)
  }


  # Motion authored by this views component instance (resolved at patch time in JS).
  motion_in <- c$motion %||% NULL
  allowed_easing <- c("smoothstep", "linear", "easein", "easeout", "easeinout", "easeInOutCubic")
  if (is.null(motion_in)) motion_in <- list(duration = 750, easing = "smoothstep")
  if (!is.list(motion_in)) {
    stop("views component '", cid, "' has invalid `motion`.", call. = FALSE)
  }
  dur <- motion_in$duration %||% 750
  eas <- motion_in$easing   %||% "smoothstep"
  if (!is.numeric(dur) || length(dur) != 1L || !is.finite(dur) || dur < 0) {
    stop("views component '", cid, "' has invalid motion.duration.", call. = FALSE)
  }
  if (!is.character(eas) || length(eas) != 1L || !nzchar(eas) || !eas %in% allowed_easing) {
    stop("views component '", cid, "' has invalid motion.easing.", call. = FALSE)
  }
  motion <- list(duration = as.numeric(dur), easing = eas)
  compiled$views[[cid]] <- list(
    type  = "views",
    id    = cid,
    layer = layer_id,
    bind  = bind,
    position = position,
    motion = motion,
    views = compiled_views
  )

  # build control (union view names)
  controls <- .ml_compiler_controls_add_member(controls, bind, "views", cid)
  controls <- .ml_compiler_controls_apply_position(controls, bind, position)

  if (is.null(controls[[bind]]$view_names)) {
    controls[[bind]]$view_names <- .ml_json_array_chr(member_view_names)
    controls[[bind]]$default    <- member_view_names[[1L]] %||% "base"
  } else {
    merged <- .ml_compiler_union_ordered(controls[[bind]]$view_names, member_view_names)
    controls[[bind]]$view_names <- .ml_json_array_chr(merged)
    if (is.null(controls[[bind]]$default)) {
      controls[[bind]]$default <- member_view_names[[1L]] %||% "base"
    }
  }

  list(compiled = compiled, controls = controls)
}

.ml_compiler_filter_common <- function(widget, layers, stores, cid, c) {
  layer_id <- c$layer %||% c$layer_id %||% c$target_layer %||% NULL
  bind     <- c$bind  %||% c$bind_id  %||% cid

  if (is.null(layer_id) || is.null(layers[[layer_id]])) {
    stop("filter component '", cid, "' targets missing layer '", layer_id %||% "<NULL>", "'.", call. = FALSE)
  }

  data <- .ml_compiler_layer_data(widget, layers, layer_id)
  if (is.null(data)) {
    stop("Missing data for layer '", layer_id, "' while compiling filter component '", cid, "'.", call. = FALSE)
  }

  meta2 <- .ml_compiler_layer_meta2(widget, layers, layer_id, data)
  n_row <- meta2$n_row
  store <- stores[[layer_id]]

  spec <- c$spec %||% c$filter %||% c$filters %||% NULL
  if (is.null(spec) && inherits(c, "ml_filter")) spec <- c
  if (is.null(spec)) spec <- c$payload %||% NULL

  filters_in <- NULL
  if (inherits(spec, "ml_filter")) {
    filters_in <- list(spec)
  } else if (is.list(spec) && length(spec) && all(vapply(spec, inherits, logical(1), "ml_filter"))) {
    filters_in <- spec
  } else if (is.list(spec) && !is.null(spec$type) && !is.null(spec$column)) {
    filters_in <- list(structure(spec, class = "ml_filter"))
  }

  if (is.null(filters_in)) {
    stop("filter component '", cid, "' has no valid filter spec.", call. = FALSE)
  }

  nf <- .ml_normalize_filters(data, filters_in, n_row) %||% list(select = list(), range = list())
  total <- length(nf$select %||% list()) + length(nf$range %||% list())
  if (total != 1L) {
    stop(
      "filter component '", cid, "' must contain exactly 1 filter element after normalization; got ", total, ".",
      call. = FALSE
    )
  }

  list(layer_id = layer_id, bind = bind, data = data, meta2 = meta2, store = store, nf = nf)
}

.ml_compile_component_range <- function(widget, layers, stores, c, compiled, controls) {
  cid <- c$id %||% NULL
  if (is.null(cid) || !is.character(cid) || length(cid) != 1L || !nzchar(cid)) {
    stop("range component missing a valid `id`.", call. = FALSE)
  }

  common <- .ml_compiler_filter_common(widget, layers, stores, cid, c)
  layer_id <- common$layer_id
  bind     <- common$bind
  position <- .ml_ui_validate_position(c$position %||% NULL)
  meta2    <- common$meta2
  store    <- common$store
  nf       <- common$nf

  if (length(nf$range %||% list()) != 1L) {
    stop("range component '", cid, "' did not normalize to a range filter.", call. = FALSE)
  }
  r <- nf$range[[1L]]

  vals_part  <- .ml_compiler_expand_to_parts(r$values_values, meta2)
  values_ref <- ml_store_ref_numeric(store, paste0("flt.", cid, ".values"), vals_part)

  compiled$range[[cid]] <- list(
    type    = "range",
    id      = cid,
    layer   = layer_id,
    bind    = bind,
    position = position,
    label   = r$label,
    default = r$default,
    min     = r$min,
    max     = r$max,
    step    = r$step,
    live    = r$live,
    values  = values_ref,
    values_ref_hint = paste0("flt.", cid, ".values")
  )

  controls <- .ml_compiler_filter_group_add(
    controls,
    bind  = bind,
    label = r$label,
    type  = "range",
    member_id = cid,
    meta = list(min = r$min, max = r$max, default = r$default, step = r$step, live = r$live)

  )
  controls <- .ml_compiler_controls_apply_position(controls, bind, position)

  list(compiled = compiled, controls = controls)
}

.ml_compile_component_select <- function(widget, layers, stores, c, compiled, controls) {
  cid <- c$id %||% NULL
  if (is.null(cid) || !is.character(cid) || length(cid) != 1L || !nzchar(cid)) {
    stop("select component missing a valid `id`.", call. = FALSE)
  }

  common <- .ml_compiler_filter_common(widget, layers, stores, cid, c)
  layer_id <- common$layer_id
  bind     <- common$bind
  position <- .ml_ui_validate_position(c$position %||% NULL)
  meta2    <- common$meta2
  store    <- common$store
  nf       <- common$nf

  if (length(nf$select %||% list()) != 1L) {
    stop("select component '", cid, "' did not normalize to a select filter.", call. = FALSE)
  }
  s <- nf$select[[1L]]

  codes_part <- .ml_compiler_expand_to_parts(s$codes_values, meta2)
  codes_ref  <- ml_store_ref_u32(store, paste0("flt.", cid, ".codes"), codes_part)

  compiled$select[[cid]] <- list(
    type       = "select",
    id         = cid,
    layer      = layer_id,
    bind       = bind,
    position   = position,
    label      = s$label,
    multi      = s$multi,
    dropdown   = s$dropdown,
    searchable = s$searchable,
    dict       = .ml_json_array_chr(s$dict),
    default    = s$default,
    max_levels = s$max_levels,
    freq       = .ml_json_array_int(s$freq),
    top_indices = .ml_json_array_int(s$top_indices),
    codes      = codes_ref,
    codes_ref_hint = paste0("flt.", cid, ".codes")
  )

  controls <- .ml_compiler_filter_group_add(
    controls,
    bind  = bind,
    label = s$label,
    type  = "select",
    member_id = cid,
    meta = list(
      dict = s$dict,
      default = s$default,
      multi = s$multi,
      dropdown = s$dropdown,
      searchable = s$searchable,
      max_levels = s$max_levels,
      freq = s$freq,
      top_indices = s$top_indices
    )

  )
  controls <- .ml_compiler_controls_apply_position(controls, bind, position)

  list(compiled = compiled, controls = controls)
}

.ml_compile_component_legends <- function(widget, layers, stores, c, compiled, controls) {
  cid <- c$id %||% NULL
  if (is.null(cid) || !is.character(cid) || length(cid) != 1L || !nzchar(cid)) {
    stop("legends component missing a valid `id`.", call. = FALSE)
  }

  bind <- c$bind %||% c$bind_id %||% cid
  if (is.null(bind) || !is.character(bind) || length(bind) != 1L || !nzchar(bind)) {
    stop("legends component '", cid, "' has an invalid `bind`.", call. = FALSE)
  }

  position <- .ml_ui_validate_position(c$position %||% NULL)


  legend <- c$legend %||% c$spec %||% NULL
  if (is.null(legend) || !is.list(legend)) {
    stop("legends component '", cid, "' has no valid `legend` payload.", call. = FALSE)
  }

  when <- c$when %||% NULL
  if (!is.null(when) && !is.list(when)) {
    stop("legends component '", cid, "' has an invalid `when` payload.", call. = FALSE)
  }

  compiled$legends[[cid]] <- list(
    type     = "legends",
    id       = cid,
    bind     = bind,
    position = position,
    legend   = legend,
    when     = when
  )

  controls <- .ml_compiler_controls_add_member(controls, bind, "legends", cid)

  controls <- .ml_compiler_controls_apply_position(controls, bind, position)

  list(compiled = compiled, controls = controls)
}

.ml_compile_components <- function(widget, layers, stores) {

  # Safety: when running in development contexts (e.g., sourcing files)
  # the .onLoad hook may not have executed yet.
  if (is.null(.ml_get_component_compiler("views"))) {
    .ml_register_component_defaults()
  }

  raw <- .ml_compiler_flatten_components_raw(widget$x$.__components_raw)

  compiled <- list(views = list(), range = list(), select = list(), legends = list())
  controls <- list()

  if (!length(raw)) {
    return(list(compiled = compiled, controls = controls))
  }

  # Compile deterministically (component ids are deterministic)
  for (cid in names(raw)) {
    c <- raw[[cid]]
    if (!is.list(c)) next

    # Ensure `id` is present and stable
    if (is.null(c$id)) c$id <- cid
    if (!identical(c$id, cid)) {
      # tolerate mismatch but keep the list key as the canonical id
      c$id <- cid
    }

    type <- c$type %||% NULL
    fn <- .ml_get_component_compiler(type)
    if (is.null(fn)) {
      stop("Unknown component type '", type %||% "<NULL>", "' for component '", cid, "'.", call. = FALSE)
    }

    res <- fn(widget, layers, stores, c, compiled, controls)
    compiled <- res$compiled
    controls <- res$controls
  }

  list(compiled = compiled, controls = controls)
}

.ml_finalize_layers <- function(layers, stores) {
  for (id in names(layers)) {
    st <- layers[[id]]
    st$dataStore <- ml_store_finalize(stores[[id]])

    # remove any legacy/internal metadata fields
    internal <- grep("^\\.__", names(st), value = TRUE)
    for (nm in internal) st[[nm]] <- NULL

    # enforce Stage 3: layers are rendering-only
    st$panel <- NULL
    st$views <- NULL
    st$filters <- NULL
    st$active_view <- NULL

    layers[[id]] <- st
  }
  layers
}

.ml_prerender <- function(widget) {

  # strip default-data payload from outgoing spec (but keep it available during build)
  widget$x$.__default_data <- NULL
  widget$x$.__default_data_name <- NULL

  layers <- widget$x$.__layers %||% list()

  # ---------- pass 1: pack layers (geometry + base encodings + templates) ----------
  pass1 <- .ml_compile_layers(layers)
  layers <- pass1$layers
  stores <- pass1$stores

  # ---------- pass 2: compile components_raw → compiled components + controls ----------
  pass2 <- .ml_compile_components(widget, layers, stores)
  compiled <- pass2$compiled
  controls <- pass2$controls

  # ---------- finalize + strip internal state ----------
  layers <- .ml_finalize_layers(layers, stores)

  widget$x$.__layers <- layers
  widget$x$.__components <- compiled
  widget$x$.__controls <- controls

  widget$x$.__components_raw <- NULL
  widget$x$.__data_registry  <- NULL
  widget$x$.__layer_meta     <- NULL
  widget$x$.__id_counters    <- NULL

    # strip legacy/UI fields from outgoing spec (Stage 3 contract hygiene)

    widget$x$show_layer_controls <- NULL

    widget$x$.toggle <- NULL


  ml_validate_spec(widget$x)

  # NOTE: Do not write files from prerender; htmlwidgets will serialize widget$x automatically.
  #jsonlite::write_json(
  #  widget$x,
  #  path = "C:/Users/jhumb/OneDrive/Documents/projects/RPackages/maplamina/spec.json",
  #  auto_unbox = TRUE,
  #  pretty = TRUE,
  #  null = "null"
  #)

  widget
}
