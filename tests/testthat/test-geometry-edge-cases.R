test_that("circle markers: POINT EMPTY either errors or is dropped", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  g <- sf$st_as_sfc(c("POINT EMPTY", "POINT(0 0)"), crs = 4326)
  dat <- sf$st_sf(num_col = c(1, 2), geometry = g, crs = 4326)

  res <- tryCatch(
    ml_prerender(maplamina() |> add_circles(dat, id = "pts")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "empty|geometry|point", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$pts
    # Expect empties are NOT represented: only the valid point should remain => 2 floats
    blob_id <- lyr$dataStore$refs[["position"]]
    expect_true(is.character(blob_id) && length(blob_id) == 1)
    pos_len <- as.integer(lyr$dataStore$blobs[[blob_id]]$length)
    expect_identical(pos_len, 2L)
  }
})

test_that("circle markers: MULTIPOINT either errors or provides an index mapping", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  # 1st feature has 2 points, 2nd has 1 point -> total 3 points (=> 6 floats)
  g <- sf$st_as_sfc(c("MULTIPOINT((0 0),(1 1))", "MULTIPOINT((2 2))"), crs = 4326)
  dat <- sf$st_sf(num_col = c(1, 2), geometry = g, crs = 4326)

  res <- tryCatch(
    ml_prerender(maplamina() |> add_circles(dat, id = "mp")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "multipoint|point|geometry", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$mp
    blob_id <- lyr$dataStore$refs[["position"]]
    pos_len <- as.integer(lyr$dataStore$blobs[[blob_id]]$length)

    # If MULTIPOINT is expanded (pos_len > 2*nrow), we must have a mapping back to rows.
    # Accept either: no expansion, or explicit feature_index column.
    if (pos_len > 2L * nrow(dat)) {
      expect_true(
        "feature_index" %in% names(lyr$data_columns),
        info = "MULTIPOINT expansion requires data_columns$feature_index mapping back to rows"
      )
    } else {
      expect_identical(pos_len, 2L * nrow(dat))
    }
  }
})

test_that("circle markers: GEOMETRYCOLLECTION either errors or provides an index mapping", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  g <- sf$st_as_sfc(
    c(
      "GEOMETRYCOLLECTION(POINT(0 0), POINT(1 1))",
      "GEOMETRYCOLLECTION(POINT(2 2))"
    ),
    crs = 4326
  )
  dat <- sf$st_sf(num_col = c(1, 2), geometry = g, crs = 4326)

  res <- tryCatch(
    ml_prerender(maplamina() |> add_circles(dat, id = "gc")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "geometrycollection|geometry|point", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$gc
    blob_id <- lyr$dataStore$refs[["position"]]
    pos_len <- as.integer(lyr$dataStore$blobs[[blob_id]]$length)

    if (pos_len > 2L * nrow(dat)) {
      expect_true(
        "feature_index" %in% names(lyr$data_columns),
        info = "GEOMETRYCOLLECTION expansion requires data_columns$feature_index mapping back to rows"
      )
    } else {
      expect_identical(pos_len, 2L * nrow(dat))
    }
  }
})

ml_decode_numeric_blob <- function(layer, semantic_ref) {
  # decodes f32/f64 blobs so we can check for NA/NaN/Inf
  blob_id <- layer$dataStore$refs[[semantic_ref]]
  blob <- layer$dataStore$blobs[[blob_id]]

  dataurl <- if (is.list(blob$href)) blob$href$data else blob$href
  b64 <- sub("^data:application/octet-stream;base64,", "", dataurl)
  raw <- jsonlite::base64_dec(b64)

  dtype <- blob$dtype
  n <- as.integer(blob$length)

  if (identical(dtype, "f32")) {
    readBin(raw, what = "numeric", n = n, size = 4, endian = "little")
  } else if (identical(dtype, "f64")) {
    readBin(raw, what = "numeric", n = n, size = 8, endian = "little")
  } else {
    # not a numeric float blob
    NULL
  }
}

test_that("polygons: invalid polygon either errors or produces finite numeric buffers", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  # Self-intersecting "bowtie"
  g <- sf$st_as_sfc(c("POLYGON((0 0, 2 2, 0 2, 2 0, 0 0))"), crs = 4326)
  dat <- sf$st_sf(num_col = 1, geometry = g, crs = 4326)

  # Confirm it's actually invalid on this system (s2 settings can vary)
  inv <- tryCatch(sf$st_is_valid(dat)[[1]], error = function(e) NA)
  if (!isTRUE(inv == FALSE)) {
    skip("sf backend reports polygon as valid here; skipping invalid polygon test")
  }

  res <- tryCatch(
    ml_prerender(maplamina() |> add_polygons(dat, id = "inv")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "invalid|valid|make_valid|polygon|ring|self", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$inv

    # Try to find a float blob tied to polygon coordinates and ensure it's finite
    # Common semantic refs: "polygon" (if you use that), otherwise fall back to first ref in polygon column.
    poly_ref <- NULL
    if (is.list(lyr$data_columns$polygon) && is.list(lyr$data_columns$polygon$values)) {
      poly_ref <- lyr$data_columns$polygon$values$ref
    }
    if (is.null(poly_ref) || !is.character(poly_ref)) {
      # fallback: locate a ref anywhere under data_columns$polygon
      poly_ref <- ml_collect_refs(lyr$data_columns$polygon)[1]
    }

    vals <- ml_decode_numeric_blob(lyr, poly_ref)
    if (!is.null(vals)) {
      expect_false(anyNA(vals))
      expect_true(all(is.finite(vals)))
    }
  }
})

test_that("polygons: POLYGON EMPTY either errors or is dropped", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  g <- sf$st_as_sfc(c("POLYGON EMPTY", "POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))"), crs = 4326)
  dat <- sf$st_sf(num_col = c(1, 2), geometry = g, crs = 4326)

  res <- tryCatch(
    ml_prerender(maplamina() |> add_polygons(dat, id = "pe")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "empty|polygon|geometry", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$pe

    # Expect the empty polygon is NOT represented; at minimum, polygon coordinate buffer should be finite/non-empty
    poly_ref <- NULL
    if (is.list(lyr$data_columns$polygon) && is.list(lyr$data_columns$polygon$values)) {
      poly_ref <- lyr$data_columns$polygon$values$ref
    }
    if (is.null(poly_ref) || !is.character(poly_ref)) {
      poly_ref <- ml_collect_refs(lyr$data_columns$polygon)[1]
    }

    vals <- ml_decode_numeric_blob(lyr, poly_ref)
    if (!is.null(vals)) {
      expect_true(length(vals) > 0)
      expect_false(anyNA(vals))
      expect_true(all(is.finite(vals)))
    }
  }
})

test_that("lines: GEOMETRYCOLLECTION either errors or produces finite numeric buffers", {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  g <- sf$st_as_sfc(
    c(
      "GEOMETRYCOLLECTION(LINESTRING(0 0, 1 0), POINT(9 9))",
      "GEOMETRYCOLLECTION(LINESTRING(0 1, 2 2))"
    ),
    crs = 4326
  )
  dat <- sf$st_sf(num_col = c(1, 2), geometry = g, crs = 4326)

  res <- tryCatch(
    ml_prerender(maplamina() |> add_lines(dat, id = "lgc")),
    error = identity
  )

  if (inherits(res, "error")) {
    expect_match(conditionMessage(res), "geometrycollection|line|string|geometry", ignore.case = TRUE)
  } else {
    lyr <- res$x$.__layers$lgc
    # Try path ref under data_columns$path
    path_ref <- NULL
    if (is.list(lyr$data_columns$path) && is.list(lyr$data_columns$path$values)) {
      path_ref <- lyr$data_columns$path$values$ref
    }
    if (is.null(path_ref) || !is.character(path_ref)) {
      path_ref <- ml_collect_refs(lyr$data_columns$path)[1]
    }

    vals <- ml_decode_numeric_blob(lyr, path_ref)
    if (!is.null(vals)) {
      expect_false(anyNA(vals))
      expect_true(all(is.finite(vals)))
    }
  }
})
