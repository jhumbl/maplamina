# ---- Mapflow v3: validation (panel + controls + components) ----

.ml_validate_panel_mounts <- function(x) {
  controls <- x$.__controls %||% list()
  if (!is.list(controls)) stop(".__controls must be a list.", call. = FALSE)

  # validate panel mounts bind ids (controls)
  if (!is.null(x$.__panel)) {
    .ml_ui_validate_position(x$.__panel$position %||% NULL, arg = ".__panel$position")

    sec <- x$.__panel$sections %||% list()
    for (s in sec) {
      bid <- s$id %||% NULL
      if (is.null(bid) || !is.character(bid) || length(bid) != 1L) {
        stop("Panel section ids must be single strings.", call. = FALSE)
      }
      if (is.null(controls[[bid]])) {
        stop("Panel mounts unknown bind id '", bid, "' (not found in .__controls).", call. = FALSE)
      }
    }
  }

  invisible(TRUE)
}

.ml_validate_controls_and_components <- function(x, layers) {

  comps <- x$.__components %||% list()
  comp_views  <- comps$views  %||% list()
  comp_range  <- comps$range  %||% list()
  comp_select <- comps$select %||% list()
  comp_legends <- comps$legends %||% list()

  controls <- x$.__controls %||% list()
  if (!is.list(controls)) stop(".__controls must be a list.", call. = FALSE)

  # helper: check a ref exists in the target layer (supports semantic refs via dataStore.refs)
  check_ref_in_layer <- function(layer_id, ref_obj) {
    if (is.null(ref_obj) || is.null(ref_obj$ref)) return()
    st <- layers[[layer_id]] %||% NULL
    if (is.null(st)) stop("Component targets missing layer '", layer_id, "'.", call. = FALSE)
    ds <- st$dataStore
    if (is.null(ds) || is.null(ds$blobs)) {
      stop("Layer '", layer_id, "' missing dataStore.blobs.", call. = FALSE)
    }

    ref <- ref_obj$ref
    blob_id <- ref
    if (!is.null(ds$refs) && !is.null(ds$refs[[ref]])) blob_id <- ds$refs[[ref]]

    if (is.null(ds$blobs[[blob_id]])) {
      stop(
        "Missing blob for ref '", ref, "' (resolved blob id '", blob_id, "') in layer '", layer_id, "'.",
        call. = FALSE
      )
    }
  }

  # validate controls and that their members exist in matching component bucket
  for (bind in names(controls)) {
    ctl <- controls[[bind]]

    if (is.null(ctl$type) || !ctl$type %in% c("views", "range", "select", "legends", "filters")) {
      stop("Control '", bind, "' has invalid type.", call. = FALSE)
    }

    # validate optional group position (first non-NULL wins at compile-time)
    if (!is.null(ctl$position)) {
      .ml_ui_validate_position(ctl$position, arg = paste0(".__controls$", bind, "$position"))
    }

    # ---- filters (group container) ----
    if (identical(ctl$type, "filters")) {

      items <- ctl$controls %||% list()
      if (!is.list(items) || !length(items)) {
        stop("Filter group '", bind, "' has no controls.", call. = FALSE)
      }

      lbls <- names(items)
      if (is.null(lbls) || !length(lbls) || any(!nzchar(lbls))) {
        stop("Filter group '", bind, "' controls must be a named list keyed by label.", call. = FALSE)
      }

      # deterministic UI order: must exist and match control labels
      ord <- ctl$order %||% NULL
      if (is.null(ord) || !length(ord)) {
        stop("Filter group '", bind, "' is missing `order`.", call. = FALSE)
      }
      ord_vec <- if (is.list(ord)) unlist(ord, use.names = FALSE) else as.character(ord)
      if (!is.character(ord_vec) || any(!nzchar(ord_vec))) {
        stop("Filter group '", bind, "' has invalid `order`.", call. = FALSE)
      }
      if (anyDuplicated(ord_vec)) {
        stop("Filter group '", bind, "' has duplicate entries in `order`.", call. = FALSE)
      }
      if (!setequal(ord_vec, lbls)) {
        stop("Filter group '", bind, "' `order` must contain exactly the control labels.", call. = FALSE)
      }

      for (i in seq_along(items)) {
        lbl <- lbls[[i]]
        sub <- items[[i]] %||% list()
        stype <- sub$type %||% NULL

        if (is.null(stype) || !stype %in% c("range", "select")) {
          stop("Filter group '", bind, "' has invalid control type for label '", lbl, "'.", call. = FALSE)
        }

        smembers <- sub$members %||% NULL
        if (is.null(smembers) || !length(smembers)) {
          stop("Filter group '", bind, "' control '", lbl, "' has no members.", call. = FALSE)
        }
        mids <- if (is.list(smembers)) unlist(smembers, use.names = FALSE) else smembers
        if (!is.character(mids) || !length(mids)) {
          stop("Control members must be component id strings.", call. = FALSE)
        }

        for (mid in mids) {
          if (!is.character(mid) || length(mid) != 1L || !nzchar(mid)) {
            stop("Control members must be component id strings.", call. = FALSE)
          }

          if (identical(stype, "range")) {
            c <- comp_range[[mid]]
            if (is.null(c)) stop("Filter group '", bind, "' references missing range component '", mid, "'.", call. = FALSE)
            if (!identical(c$bind, bind)) stop("Range component '", mid, "' bind mismatch.", call. = FALSE)
            if (!is.null(c$label) && !identical(c$label, lbl)) stop("Range component '", mid, "' label mismatch.", call. = FALSE)
            check_ref_in_layer(c$layer, c$values)

          } else if (identical(stype, "select")) {
            c <- comp_select[[mid]]
            if (is.null(c)) stop("Filter group '", bind, "' references missing select component '", mid, "'.", call. = FALSE)
            if (!identical(c$bind, bind)) stop("Select component '", mid, "' bind mismatch.", call. = FALSE)
            if (!is.null(c$label) && !identical(c$label, lbl)) stop("Select component '", mid, "' label mismatch.", call. = FALSE)
            check_ref_in_layer(c$layer, c$codes)
          }
        }
      }

      next
    }

    # ---- non-group controls (views/range/select/legends) ----
    members <- ctl$members %||% list()
    if (!length(members)) stop("Control '", bind, "' has no members.", call. = FALSE)

    mids <- if (is.list(members)) unlist(members, use.names = FALSE) else members

    for (mid in mids) {
      if (!is.character(mid) || length(mid) != 1L) stop("Control members must be component id strings.", call. = FALSE)

      if (identical(ctl$type, "views")) {
        c <- comp_views[[mid]]
        if (is.null(c)) stop("Control '", bind, "' references missing views component '", mid, "'.", call. = FALSE)
        if (!identical(c$bind, bind)) stop("Views component '", mid, "' bind mismatch.", call. = FALSE)

        # validate motion (per component instance)
        allowed_easing <- c("smoothstep", "linear", "easein", "easeout", "easeinout", "easeInOutCubic")
        motion <- c$motion %||% NULL
        if (is.null(motion) || !is.list(motion)) {
          stop("Views component '", mid, "' is missing `motion`.", call. = FALSE)
        }
        dur <- motion$duration %||% NULL
        eas <- motion$easing   %||% NULL
        if (is.null(dur) || !is.numeric(dur) || length(dur) != 1L || !is.finite(dur) || dur < 0) {
          stop("Views component '", mid, "' has invalid motion.duration.", call. = FALSE)
        }
        if (is.null(eas) || !is.character(eas) || length(eas) != 1L || !nzchar(eas) || !eas %in% allowed_easing) {
          stop("Views component '", mid, "' has invalid motion.easing.", call. = FALSE)
        }

        # check refs in patches
        vmap <- c$views %||% list()
        for (vn in names(vmap)) {
          enc <- vmap[[vn]]$encodings %||% list()
          for (nm in names(enc)) {
            e <- enc[[nm]]
            if (!is.null(e$encoding) && identical(e$encoding, "dict")) {
              check_ref_in_layer(c$layer, e$dict_rgba)
              check_ref_in_layer(c$layer, e$codes)
            } else if (!is.null(e$value) && is.list(e$value)) {
              check_ref_in_layer(c$layer, e$value)
            }
          }
        }

      } else if (identical(ctl$type, "range")) {
        c <- comp_range[[mid]]
        if (is.null(c)) stop("Control '", bind, "' references missing range component '", mid, "'.", call. = FALSE)
        if (!identical(c$bind, bind)) stop("Range component '", mid, "' bind mismatch.", call. = FALSE)
        check_ref_in_layer(c$layer, c$values)

      } else if (identical(ctl$type, "select")) {
        c <- comp_select[[mid]]
        if (is.null(c)) stop("Control '", bind, "' references missing select component '", mid, "'.", call. = FALSE)
        if (!identical(c$bind, bind)) stop("Select component '", mid, "' bind mismatch.", call. = FALSE)
        check_ref_in_layer(c$layer, c$codes)
      } else if (identical(ctl$type, "legends")) {
        c <- comp_legends[[mid]]
        if (is.null(c)) stop("Control '", bind, "' references missing legends component '", mid, "'.", call. = FALSE)
        if (!identical(c$bind, bind)) stop("Legends component '", mid, "' bind mismatch.", call. = FALSE)

        # Optional checks (MVP): validate when.layer and when.view shapes if present
        when <- c$when %||% NULL
        if (!is.null(when) && is.list(when)) {
          if (!is.null(when$layer)) {
            lid <- when$layer
            if (!is.character(lid) || length(lid) != 1L || !nzchar(lid)) {
              stop("Legend component '", mid, "' has invalid when.layer.", call. = FALSE)
            }
            if (is.null(layers[[lid]])) {
              stop("Legend component '", mid, "' targets missing layer '", lid, "'.", call. = FALSE)
            }
          }
          if (!is.null(when$view)) {
            vv <- if (is.list(when$view)) unlist(when$view, use.names = FALSE) else when$view
            if (!is.character(vv) || !length(vv) || any(!nzchar(vv))) {
              stop("Legend component '", mid, "' has invalid when.view.", call. = FALSE)
            }
          }
        }
      }
    }
  }

  invisible(TRUE)
}
