test_that("circle layer meets contract", {
  pts <- ml_test_points_sf()
  out <- ml_prerender(maplamina() |> add_circles(pts))
  lyr <- out$x$.__layers[[1]]

  expect_identical(lyr$type, "circle")
  expect_true("position" %in% names(lyr$data_columns))
  expect_refs_resolve(lyr)
})

test_that("line layer meets contract", {
  ln <- ml_test_lines_sf()
  out <- ml_prerender(maplamina() |> add_lines(ln))
  lyr <- out$x$.__layers[[1]]

  expect_identical(lyr$type, "line")
  expect_true("path" %in% names(lyr$data_columns))
  expect_refs_resolve(lyr)
})

test_that("polygon layer meets contract", {
  poly <- ml_test_polygons_sf()
  out <- ml_prerender(maplamina() |> add_polygons(poly))
  lyr <- out$x$.__layers[[1]]

  expect_identical(lyr$type, "polygon")
  expect_true("polygon" %in% names(lyr$data_columns))
  expect_refs_resolve(lyr)
})
