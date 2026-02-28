test_that("bind id cannot be reused across incompatible control types (views vs filters)", {
  pts <- ml_test_points_sf()

  m <- maplamina() |>
    add_circles(pts) |>
    add_views(view("A", radius = 1), bind = "shared") |>
    add_filters(filter_select(~cat_col), bind = "shared")

  expect_error(
    ml_prerender(m),
    "incompatible control types",
    fixed = FALSE
  )
})

test_that("filters error if same (bind,label) is reused across different filter types", {
  pts <- ml_test_points_sf()

  m <- maplamina() |>
    add_circles(pts) |>
    add_filters(filter_select(~cat_col, label = "X"), bind = "filters") |>
    add_filters(filter_range(~num_col, label = "X"), bind = "filters")

  expect_error(
    ml_prerender(m),
    "incompatible filter types",
    fixed = FALSE
  )
})

test_that("range filters require consistent UI metadata (step) across members", {
  pts  <- ml_test_points_sf()
  poly <- ml_test_polygons_sf()

  m <- maplamina() |>
    add_circles(pts, id = "pts") |>
    add_filters(filter_range(~num_col, label = "num", step = 1), bind = "filters") |>
    add_polygons(poly, id = "polys") |>
    add_filters(filter_range(~num_col, label = "num", step = 2), bind = "filters")

  expect_error(
    ml_prerender(m),
    "inconsistent `step`",
    fixed = FALSE
  )
})

test_that("select filters require consistent UI metadata (multi) across members", {
  pts  <- ml_test_points_sf()
  poly <- ml_test_polygons_sf()

  m <- maplamina() |>
    add_circles(pts, id = "pts") |>
    add_filters(filter_select(~cat_col, label = "cat", multi = TRUE), bind = "filters") |>
    add_polygons(poly, id = "polys") |>
    add_filters(filter_select(~cat_col2, label = "cat", multi = FALSE), bind = "filters")

  expect_error(
    ml_prerender(m),
    "inconsistent `multi`",
    fixed = FALSE
  )
})

ml_decode_u32_blob <- function(layer, semantic_ref) {
  blob_id <- layer$dataStore$refs[[semantic_ref]]
  blob <- layer$dataStore$blobs[[blob_id]]

  dataurl <- if (is.list(blob$href)) blob$href$data else blob$href
  b64 <- sub("^data:application/octet-stream;base64,", "", dataurl)

  raw <- jsonlite::base64_dec(b64)
  readBin(raw, what = "integer", n = as.integer(blob$length), size = 4, endian = "little")
}

test_that("filter_select maps NA to (Missing) and codes contain no NA", {
  pts <- ml_test_points_sf()
  pts$cat_col[2] <- NA_character_

  m <- maplamina() |>
    add_circles(pts, id = "pts") |>
    add_filters(filter_select(~cat_col), bind = "filters")

  out <- ml_prerender(m)

  # UI dict includes "(Missing)"
  dict <- out$x$.__controls$filters$controls$cat_col$dict
  expect_true("(Missing)" %in% unlist(dict, use.names = FALSE))

  # Codes blob has no NA
  cid <- names(out$x$.__components$select)[[1]]
  sem <- out$x$.__components$select[[cid]]$codes$ref

  lyr <- out$x$.__layers[[1]]
  codes <- ml_decode_u32_blob(lyr, sem)

  expect_false(anyNA(codes))
  expect_true(all(codes >= 0))
})

test_that("multiple filter bind groups compile into separate controls", {
  pts <- ml_test_points_sf()

  m <- maplamina() |>
    add_circles(pts) |>
    add_filters(filter_select(~cat_col, label = "cat"), bind = "filters_a") |>
    add_filters(filter_range(~num_col, label = "num"), bind = "filters_b")

  out <- ml_prerender(m)

  expect_identical(out$x$.__controls$filters_a$type, "filters")
  expect_identical(out$x$.__controls$filters_b$type, "filters")
  expect_true("cat" %in% unlist(out$x$.__controls$filters_a$order))
  expect_true("num" %in% unlist(out$x$.__controls$filters_b$order))
})
