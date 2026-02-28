# tests/testthat/helper-contracts.R

expect_maplamina_stage3 <- function(x) {
  expect_true(is.list(x))
  expect_true(is.list(x$map_options))

  # Stage 3 top-level fields should exist
  expect_true(is.list(x$.__layers))
  expect_true(is.list(x$.__components))
  expect_true(is.list(x$.__controls))

  # Internal-only fields should be stripped after prerender
  expect_null(x$.__components_raw)
  expect_null(x$.__data_registry)
  expect_null(x$.__layer_meta)
  expect_null(x$.__id_counters)

  # Legacy/UI stripped
  expect_null(x$show_layer_controls)
  expect_null(x$.toggle)
}

expect_layer_contract <- function(layer) {
  expect_true(is.list(layer))
  expect_true(is.character(layer$id) && length(layer$id) == 1)
  expect_true(is.character(layer$type) && length(layer$type) == 1)

  expect_true(is.list(layer$data_columns))
  expect_true(is.list(layer$base_encodings))
  expect_true(is.list(layer$cfg))

  # dataStore must exist
  expect_true(is.list(layer$dataStore))
  expect_true(is.list(layer$dataStore$blobs))
  expect_true(is.list(layer$dataStore$refs))

  # rendering-only: these must be absent
  expect_null(layer$views)
  expect_null(layer$filters)
  expect_null(layer$panel)
  expect_null(layer$active_view)
}

# Collect {ref=...} objects recursively (excluding the dataStore itself)
ml_collect_refs <- function(x) {
  refs <- character()

  walk <- function(obj) {
    if (is.list(obj)) {
      # detect {ref: "..."} shape
      if (!is.null(obj$ref) && is.character(obj$ref) && length(obj$ref) == 1) {
        refs <<- c(refs, obj$ref)
      }
      for (nm in names(obj)) {
        if (identical(nm, "dataStore")) next
        walk(obj[[nm]])
      }
    }
  }

  walk(x)
  unique(refs)
}

expect_refs_resolve <- function(layer) {
  refs <- ml_collect_refs(layer)
  if (!length(refs)) return(invisible(TRUE))

  for (r in refs) {
    blob_id <- layer$dataStore$refs[[r]]
    expect_true(
      is.character(blob_id) && length(blob_id) == 1,
      info = paste("Missing dataStore.refs entry for", r)
    )

    blob <- layer$dataStore$blobs[[blob_id]]
    expect_true(
      is.list(blob),
      info = paste("Missing blob for", r, "->", blob_id)
    )

    # Basic blob contract
    expect_true(is.character(blob$dtype) && length(blob$dtype) == 1,
                info = paste("blob$dtype must be a length-1 string for", blob_id))

    expect_true(!is.null(blob$length) && length(blob$length) == 1,
                info = paste("blob$length missing/invalid for", blob_id))
    expect_true(is.numeric(blob$length) || is.integer(blob$length),
                info = paste("blob$length must be numeric/integer for", blob_id))

    # href contract: either list(data="<dataurl>") or a single string
    expect_true(!is.null(blob$href),
                info = paste("blob$href missing for", blob_id))

    if (is.list(blob$href)) {
      # current shape: href = list(data = "data:application/octet-stream;base64,...")
      expect_true(!is.null(blob$href$data),
                  info = paste("blob$href$data missing for", blob_id))
      expect_true(is.character(blob$href$data) && length(blob$href$data) == 1,
                  info = paste("blob$href$data must be a length-1 string for", blob_id))
    } else {
      # optional future shape: href = "https://..." or "data:..."
      expect_true(is.character(blob$href) && length(blob$href) == 1,
                  info = paste("blob$href must be a length-1 string or list(data=...) for", blob_id))
    }
  }

  invisible(TRUE)
}
