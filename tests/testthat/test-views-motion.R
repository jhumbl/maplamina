# tests/testthat/test-views-motion.R
# Verifies that views-authored motion compiles into the widget spec and that
# layer-level transitions are absent (v3 contract).

library(testthat)

# Helpers ---------------------------------------------------------------

entry_map <- function(...) {
  # In this package the entry point is maplamina(). It may or may not be exported,
  # so we resolve it without using pkg::.
  if (exists("maplamina", mode = "function", inherits = TRUE)) {
    return(maplamina(...))
  }
  # Fallback: resolve from the package namespace directly.
  return(getFromNamespace("maplamina", "maplamina")(...))
}

prerender <- function(widget) {
  # Tests run with the package namespace as a parent, so this should usually work.
  if (exists(".ml_prerender", mode = "function", inherits = TRUE)) {
    return(.ml_prerender(widget))
  }
  getFromNamespace(".ml_prerender", "maplamina")(widget)
}

make_points_df <- function(n = 3L) {
  data.frame(
    lon = seq(-0.1, 0.1, length.out = n),
    lat = seq(51.4, 51.6, length.out = n),
    mag = seq_len(n),
    depth = seq(10, 30, length.out = n)
  )
}

# Tests -----------------------------------------------------------------

test_that("add_views() motion is compiled into .__components$views[[id]]$motion", {
  df <- make_points_df(3L)

  m <- entry_map()
  m <- add_circles(m, df, lon = ~lon, lat = ~lat)
  m <- add_views(
    m,
    view("magnitude", radius = ~mag * 3),
    bind = "views",
    duration = 250,
    easing = "linear"
  )

  out <- prerender(m)

  comps <- out$x$.__components$views
  expect_true(is.list(comps))
  expect_gt(length(comps), 0L)

  cid <- names(comps)[[1L]]
  expect_true(nzchar(cid))

  motion <- comps[[cid]]$motion
  expect_true(is.list(motion))
  expect_equal(motion$duration, 250)
  expect_equal(motion$easing, "linear")

  # Layers must not carry transitions (Stage 2 contract)
  lid <- names(out$x$.__layers)[[1L]]
  expect_false("transitions" %in% names(out$x$.__layers[[lid]]))
})


test_that("add_views() defaults motion when not provided", {
  df <- make_points_df(2L)

  m <- entry_map()
  m <- add_circles(m, df, lon = ~lon, lat = ~lat)
  m <- add_views(m, view("x"), bind = "views")

  out <- prerender(m)

  comps <- out$x$.__components$views
  cid <- names(comps)[[1L]]
  motion <- comps[[cid]]$motion

  expect_equal(motion$duration, 750)
  expect_equal(motion$easing, "smoothstep")
})


test_that("add_views() validates motion inputs", {
  df <- make_points_df(2L)

  m <- entry_map()
  m <- add_circles(m, df, lon = ~lon, lat = ~lat)

  expect_error(
    add_views(m, view("x"), duration = -1),
    "duration",
    fixed = FALSE
  )

  # `easing` is validated via match.arg(); its error message does not
  # necessarily include the word "easing", so we only assert that it errors.
  expect_error(add_views(m, view("x"), easing = "not-an-easing"))
})


test_that("transition() is defunct (if present) and points users to add_views()", {
  if (!exists("transition", mode = "function", inherits = TRUE)) {
    skip("transition() not present (removed entirely)")
  }

  expect_error(
    transition(duration = 100),
    "removed|Defunct|add_views",
    ignore.case = TRUE
  )
})


test_that("spec validation rejects layers containing transitions", {
  df <- make_points_df(2L)

  m <- entry_map()
  m <- add_circles(m, df, lon = ~lon, lat = ~lat)

  # Manually inject an invalid field to ensure the validator catches it.
  lid <- names(m$x$.__layers)[[1L]]
  m$x$.__layers[[lid]]$transitions <- list(duration = 100, easing = "linear")

  expect_error(prerender(m), "transitions")
})
