test_that("views bind-group position uses first non-NULL wins", {
  pts <- data.frame(
    lon = c(0, 1),
    lat = c(0, 1),
    mag = c(1, 2),
    depth = c(10, 20)
  )

  w <- maplamina:::maplamina()
  # create two layers (auto ids: circle1, circle2)
  w <- maplamina:::add_circles(w, pts)
  w <- maplamina:::add_circles(w, pts)

  w <- maplamina:::add_views(
    w,
    maplamina:::view("magnitude", radius = ~mag * 3),
    bind = "views",
    position = "topleft",
    layer_id = "circle1"
  )

  # Same bind, different position on a different layer -> should be ignored (first wins)
  w <- maplamina:::add_views(
    w,
    maplamina:::view("depth", opacity = ~depth / max(depth)),
    bind = "views",
    position = "bottomright",
    layer_id = "circle2"
  )

  w <- maplamina:::.ml_prerender(w)

  expect_equal(w$x$.__controls$views$position, "topleft")
  expect_silent(maplamina:::ml_validate_spec(w$x))
})

test_that("filters bind-group position uses first non-NULL wins", {
  pts <- data.frame(
    lon = c(0, 1),
    lat = c(0, 1),
    mag = c(1, 2),
    region = c("a", "b")
  )

  w <- maplamina:::maplamina()
  w <- maplamina:::add_circles(w, pts)

  w <- maplamina:::add_filters(
    w,
    maplamina:::filter_range(~mag),
    bind = "filters",
    position = "topright"
  )

  w <- maplamina:::add_filters(
    w,
    maplamina:::filter_select(~region),
    bind = "filters",
    position = "bottomleft"
  )

  w <- maplamina:::.ml_prerender(w)

  expect_equal(w$x$.__controls$filters$position, "topright")
  expect_silent(maplamina:::ml_validate_spec(w$x))
})

test_that("panel position is preserved and validated", {
  pts <- data.frame(
    lon = c(0, 1),
    lat = c(0, 1),
    mag = c(1, 2)
  )

  w <- maplamina:::maplamina()
  w <- maplamina:::add_circles(w, pts)

  # Ensure the 'views' bind exists in .__controls so panel mount validation passes
  w <- maplamina:::add_views(
    w,
    maplamina:::view("magnitude", radius = ~mag * 3),
    bind = "views",
    position = "topleft"
  )

  w <- maplamina:::add_panel(
    w,
    sections = maplamina:::sections(maplamina:::section("views")),
    position = "bottomright"
  )

  w <- maplamina:::.ml_prerender(w)

  expect_equal(w$x$.__panel$position, "bottomright")
  expect_silent(maplamina:::ml_validate_spec(w$x))
})

test_that("invalid positions error", {
  expect_error(maplamina:::.ml_ui_validate_position("center"), "must be one of", fixed = FALSE)
  expect_silent(maplamina:::.ml_ui_validate_position("topleft"))
})
