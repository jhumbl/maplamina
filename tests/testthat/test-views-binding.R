test_that("views compile into controls with unioned view_names", {
  pts  <- ml_test_points_sf()
  poly <- ml_test_polygons_sf()

  m <- maplamina() |>
    add_circles(pts, id = "pts") |>
    add_views(
      view("A", radius = ~num_col),
      view("B", radius = 99),
      bind = "views"
    ) |>
    add_polygons(poly, id = "polys") |>
    add_views(
      view("B", fill_opacity = 0.2),
      view("C", fill_opacity = ~num_col / max(num_col)),
      bind = "views"
    )

  out <- ml_prerender(m)

  ctrl <- out$x$.__controls$views
  expect_true(is.list(ctrl))
  expect_identical(ctrl$type, "views")
  expect_true(is.list(ctrl$members))
  expect_true(is.list(ctrl$view_names))
  expect_true("A" %in% unlist(ctrl$view_names))
  expect_true("B" %in% unlist(ctrl$view_names))
  expect_true("C" %in% unlist(ctrl$view_names))
})
