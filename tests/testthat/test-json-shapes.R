test_that("controls use JSON-array-friendly shapes (members/order)", {
  pts <- ml_test_points_sf()

  out <- ml_prerender(
    maplamina() |>
      add_circles(pts) |>
      add_views(view("A", radius = 1), bind = "views")
  )

  json <- jsonlite::toJSON(out$x, auto_unbox = TRUE, null = "null")

  # members should serialize as array
  expect_true(grepl("\"members\"[[:space:]]*:[[:space:]]*\\[", json))

  # view_names should serialize as array
  expect_true(grepl("\"view_names\"[[:space:]]*:[[:space:]]*\\[", json))
})
