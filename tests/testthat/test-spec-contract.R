test_that("prerender returns Stage 3 spec and strips internal fields", {
  pts <- ml_test_points_sf()

  m <- maplamina() |>
    add_circles(pts)

  out <- ml_prerender(m)
  expect_maplamina_stage3(out$x)

  # Stage 5: legacy top-level .__legends is retired (legends are controls/components now).
  expect_true(is.null(out$x$.__legends))

  expect_true(length(out$x$.__layers) == 1)
  lyr <- out$x$.__layers[[1]]
  expect_layer_contract(lyr)
  expect_refs_resolve(lyr)
})
