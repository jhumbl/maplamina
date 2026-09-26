testthat::skip_if_not_installed("jsonlite")

placeholders_of <- function(d, template) {
  w <- ml_prerender(maplamina(d) |> add_circles(tooltip = tmpl(template), id = "pts"))
  w$x$.__layers$pts$tooltip$placeholders
}

test_that("template placeholders use u32 only for whole numbers the blob can hold", {
  d <- data.frame(
    lon = c(0, 0.01), lat = 51.5,
    neg = c(-5L, 7L), big = c(3e9, 1), miss = c(1L, NA), whole = c(2, 3),
    old = as.Date(c("1965-01-01", "2020-01-01")),
    late = as.POSIXct(c("2040-01-01", "2020-01-01"), tz = "UTC")
  )
  ph <- placeholders_of(d, "{neg} {big} {miss} {whole} {old} {late}")
  kinds <- vapply(ph, function(p) p$kind, character(1))
  expect_identical(kinds, c("numeric-f32", "numeric-f32", "numeric-f32", "numeric-u32", "epoch-f32", "epoch-f32"))
})
