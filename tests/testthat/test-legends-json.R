testthat::test_that("legend when.view remains an array in JSON even length-1", {
  testthat::skip_if_not(
    requireNamespace("jsonlite", quietly = TRUE),
    message = "jsonlite is required for this test"
  )

  # Minimal data + layer so the compiler pipeline runs
  d <- data.frame(
    lon = c(-0.10, -0.11),
    lat = c(51.50, 51.51)
  )

  # NOTE:
  # - This test assumes Stage 2+3 are in place:
  #   add_legend() writes a raw component with when$view normalized via .ml_json_array_chr(),
  #   and the compiler emits .__components$legends[[id]].
  w <- maplamina() |>
    add_circles(d, lon = ~lon, lat = ~lat, id = "pts") |>
    add_legend(
      id = "legendA",
      bind = "legends",
      title = "Legend A",
      type = "categorical",
      values = c("x"),
      colors = c("red"),
      view = "magnitude"
    )

  x <- ml_test_compile_spec(w)

  comp <- x$.__components$legends$legendA
  testthat::expect_true(is.list(comp$when$view))

  json <- jsonlite::toJSON(comp$when$view, auto_unbox = TRUE)
  testthat::expect_match(json, '\\["magnitude"\\]')

  # Guard against accidental scalar unboxing
  testthat::expect_false(identical(json, '"magnitude"'))
})

testthat::test_that("legend compiles without any layers", {
  w <- maplamina() |>
    add_legend(
      id = "legendOnly",
      bind = "legends",
      type = "continuous",
      position = "bottomleft",
      gradient = c("darkblue", "white"),
      range = c(0, 1),
      breaks = c(0, 0.25, 0.5, 0.75, 1),
      labels = c("0%", "25%", "50%", "75%", "100%")
    )

  x <- ml_test_compile_spec(w)

  testthat::expect_true("legendOnly" %in% names(x$.__components$legends))
  testthat::expect_true("legends" %in% names(x$.__controls))
  testthat::expect_equal(x$.__controls$legends$position, "bottomleft")

  testthat::expect_silent(ml_validate_spec(x))
})
