# ---- Mapflow v3: validation (layers + refs) ----

.ml_validate_top_level_invariants <- function(x) {

  # ---- top-level invariants ----
  if (!is.null(x$.__components_raw)) stop("Internal field .__components_raw leaked into spec.", call. = FALSE)
  if (!is.null(x$.__data_registry))  stop("Internal field .__data_registry leaked into spec.", call. = FALSE)
  if (!is.null(x$.__layer_meta))     stop("Internal field .__layer_meta leaked into spec.", call. = FALSE)


  # ---- Stage 3 contract: restrict top-level keys ----
  allowed <- c(
    "map_options",
    ".__layers",
    ".__components",
    ".__controls",
    ".__panel"
  )
  extra <- setdiff(names(x), allowed)
  if (length(extra)) {
    stop(
      "Unexpected top-level keys in spec: ",
      paste(extra, collapse = ", "),
      call. = FALSE
    )
  }

  layers <- x$.__layers %||% list()
  ids <- names(layers)
  if (anyDuplicated(ids)) stop("Duplicate layer ids.", call. = FALSE)

  # validate map_options (MapLibre controls live here)
  .ml_validate_map_options(x$map_options %||% list())

  invisible(TRUE)
}

.ml_validate_layers <- function(layers) {

  ids <- names(layers %||% list())

  for (id in ids) {
    st <- layers[[id]]

    leaked <- grep("^\\.__", names(st), value = TRUE)
    if (length(leaked)) {
      stop("Layer '", id, "' contains internal fields: ", paste(leaked, collapse = ", "), call. = FALSE)
    }

    if (!is.null(st$panel)) stop("Layer '", id, "' should not contain `panel` in Stage 3.", call. = FALSE)
    if (!is.null(st$views) || !is.null(st$filters) || !is.null(st$active_view)) {
      stop("Layer '", id, "' should not contain views/filters/active_view in Stage 3.", call. = FALSE)
    }

    if ("transitions" %in% names(st)) {
      stop("Layer '", id, "' must not contain `transitions` in v3 (motion is component-authored).", call. = FALSE)
    }

    ds <- st$dataStore
    if (is.null(ds) || is.null(ds$blobs)) stop("Layer ", id, " missing dataStore.blobs", call. = FALSE)

    resolve_blob_id <- function(ref) {
      if (is.null(ref)) return(NULL)
      # New scheme: semantic ref -> blob id mapping in dataStore.refs
      if (!is.null(ds$refs) && !is.null(ds$refs[[ref]])) return(ds$refs[[ref]])
      # Back-compat: ref may already be a blob id
      ref
    }

    check_ref <- function(obj) {
      if (is.null(obj)) return()
      if (!is.null(obj$ref)) {
        bid <- resolve_blob_id(obj$ref)
        if (is.null(ds$blobs[[bid]])) {
          stop("Missing blob for ref '", obj$ref, "' in layer ", id, call. = FALSE)
        }
      }
    }

    # data_columns (must be ref-packed after prerender)
    assert_ref <- function(obj, ctx) {
      if (is.null(obj)) stop("Missing required ref for ", ctx, " in layer ", id, call. = FALSE)
      if (!is.list(obj) || is.null(obj$ref)) {
        stop("Raw array leaked into spec: expected {ref} for ", ctx, " in layer ", id, call. = FALSE)
      }
      bid <- resolve_blob_id(obj$ref)
      if (is.null(ds$blobs[[bid]])) stop("Missing blob for ref '", obj$ref, "' in layer ", id, call. = FALSE)
    }

    dc <- st$data_columns %||% list()
    for (nm in names(dc)) {
      col <- dc[[nm]]

      if (identical(nm, "polygon")) {
        assert_ref(col$positions,   "data_columns$polygon$positions")
        assert_ref(col$ring_starts, "data_columns$polygon$ring_starts")
        assert_ref(col$poly_starts, "data_columns$polygon$poly_starts")
        next
      }

      if (identical(nm, "path")) {
        assert_ref(col$positions,   "data_columns$path$positions")
        assert_ref(col$path_starts, "data_columns$path$path_starts")
        next
      }

      if (!is.null(col$encoding) && identical(col$encoding, "dict")) {
        # accept older naming: dict -> dict_rgba
        if (!is.null(col$dict) && is.null(col$dict_rgba)) col$dict_rgba <- col$dict
        assert_ref(col$dict_rgba, paste0("data_columns$", nm, "$dict_rgba"))
        assert_ref(col$codes,     paste0("data_columns$", nm, "$codes"))
        next
      }

      if (!is.null(col$values)) {
        assert_ref(col$values, paste0("data_columns$", nm, "$values"))
        next
      }

      if (!is.null(col$value)) {
        assert_ref(col$value, paste0("data_columns$", nm, "$value"))
        next
      }

      # allow a direct {ref} object
      if (is.list(col) && !is.null(col$ref)) {
        assert_ref(col, paste0("data_columns$", nm))
        next
      }
    }

    # base_encodings
    be <- st$base_encodings %||% list()
    for (nm in names(be)) {
      if (!is.null(be[[nm]]$value) && is.list(be[[nm]]$value)) check_ref(be[[nm]]$value)
    }

    # tooltip/popup placeholder refs
    check_template <- function(tt) {
      if (is.null(tt)) return()
      ph <- tt$placeholders %||% list()
      for (p in ph) {
        if (!is.null(p$value)) check_ref(p$value)
        if (!is.null(p$codes)) check_ref(p$codes)
        if (!is.null(p$values_values) || !is.null(p$codes_values)) {
          stop("Template placeholders must not carry raw arrays after prerender.", call. = FALSE)
        }
      }
    }
    check_template(st$tooltip)
    check_template(st$popup)
  }

  invisible(TRUE)
}
