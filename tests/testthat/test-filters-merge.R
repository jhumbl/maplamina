test_that("filters merge by (bind,label,type) and union domains/dicts", {
  pts  <- ml_test_points_sf()
  poly <- ml_test_polygons_sf()

  m <- maplamina() |>
    add_circles(pts, id = "pts") |>
    add_filters(
      filter_select(~cat_col),
      filter_range(~num_col),
      bind = "filters"
    ) |>
    add_polygons(poly, id = "polys") |>
    add_filters(
      filter_select(~cat_col2, label = "cat_col"), # deliberate same label, same type
      filter_range(~num_col),                     # same label, same type
      bind = "filters"
    )

  out <- ml_prerender(m)

  fctrl <- out$x$.__controls$filters
  expect_identical(fctrl$type, "filters")
  expect_true(is.list(fctrl$order))
  expect_true("cat_col" %in% unlist(fctrl$order))
  expect_true("num_col" %in% unlist(fctrl$order))

  cat <- fctrl$controls$cat_col
  expect_identical(cat$type, "select")
  expect_true(length(cat$members) >= 2)

  rng <- fctrl$controls$num_col
  expect_identical(rng$type, "range")
  expect_true(is.list(rng$domain))
  expect_true(is.numeric(rng$domain$min))
  expect_true(is.numeric(rng$domain$max))
})
