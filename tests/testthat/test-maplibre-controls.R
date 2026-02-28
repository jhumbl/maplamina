prune_x_for_spec <- function(m) {
  x <- m$x
  # mirror .ml_prerender() stripping so ml_validate_spec() can be called in tests
  x$.__default_data <- NULL
  x$.__default_data_name <- NULL
  x$.__components_raw <- NULL
  x$.__data_registry  <- NULL
  x$.__layer_meta     <- NULL
  x$.__id_counters    <- NULL
  x$show_layer_controls <- NULL
  x$.toggle <- NULL
  x
}

test_that("maplamina applies navigation default via add_navigation()", {
  m <- maplamina()
  ctl <- m$x$map_options$controls

  expect_true(is.list(ctl))
  nav <- Filter(function(r) is.list(r) && identical(r$type, "navigation"), ctl)
  expect_length(nav, 1)

  expect_equal(nav[[1]]$position, "topright")
  expect_true(is.list(nav[[1]]$options))
  expect_identical(nav[[1]]$options$showZoom, TRUE)

  # Compass default follows dragRotate (see maplamina() default injection)
  expect_identical(nav[[1]]$options$showCompass, isTRUE(m$x$map_options$dragRotate))
})

test_that("default navigation compass follows dragRotate", {
  m1 <- maplamina(dragRotate = FALSE)
  nav1 <- Filter(function(r) is.list(r) && identical(r$type, "navigation"), m1$x$map_options$controls)
  expect_length(nav1, 1)
  expect_identical(nav1[[1]]$options$showCompass, FALSE)

  m2 <- maplamina(dragRotate = TRUE)
  nav2 <- Filter(function(r) is.list(r) && identical(r$type, "navigation"), m2$x$map_options$controls)
  expect_length(nav2, 1)
  expect_identical(nav2[[1]]$options$showCompass, TRUE)
})

test_that("map_options.controls last call wins per type", {
  m <- maplamina()
  m <- maplamina:::add_navigation(m, position = "topleft", compass = FALSE, zoom_controls = TRUE)
  m <- maplamina:::add_navigation(m, position = "bottomright", compass = TRUE, zoom_controls = FALSE)

  ctl <- m$x$map_options$controls
  nav <- Filter(function(r) is.list(r) && identical(r$type, "navigation"), ctl)
  expect_length(nav, 1)

  expect_equal(nav[[1]]$position, "bottomright")
  expect_identical(nav[[1]]$options$showZoom, FALSE)
  expect_identical(nav[[1]]$options$showCompass, TRUE)
})

test_that("scale/fullscreen/geolocate helpers write correct control records", {
  m <- maplamina()
  m <- maplamina:::add_scalebar(m, position = "bottomleft", unit = "metric", max_width = 120)
  m <- maplamina:::add_fullscreen(m, position = "topright")
  m <- maplamina:::add_geolocate(m, position = "topright", track_user_location = TRUE)

  ctl <- m$x$map_options$controls
  types <- vapply(
    ctl,
    function(r) if (is.list(r) && !is.null(r$type)) as.character(r$type) else NA_character_,
    character(1)
  )

  expect_true("scale" %in% types)
  expect_true("fullscreen" %in% types)
  expect_true("geolocate" %in% types)

  scale_rec <- ctl[[which(types == "scale")[1]]]
  expect_equal(scale_rec$position, "bottomleft")
  expect_true(is.list(scale_rec$options))
  expect_identical(scale_rec$options$unit, "metric")
  expect_identical(scale_rec$options$maxWidth, 120L)

  full_rec <- ctl[[which(types == "fullscreen")[1]]]
  expect_equal(full_rec$position, "topright")
  expect_false("options" %in% names(full_rec))  # empty options must be omitted/NULL

  geo_rec <- ctl[[which(types == "geolocate")[1]]]
  expect_equal(geo_rec$position, "topright")
  expect_true(is.list(geo_rec$options))
  expect_identical(geo_rec$options$trackUserLocation, TRUE)
})

test_that("spec validation rejects invalid or malformed map_options.controls", {
  m <- maplamina()

  # attribution excluded in MVP
  m$x$map_options$controls <- list(list(type = "attribution", position = "topright", options = list(compact = TRUE)))
  expect_error(maplamina:::ml_validate_spec(prune_x_for_spec(m)), "invalid control type")

  # duplicate type
  m$x$map_options$controls <- list(
    list(type = "navigation", position = "topright", options = list(showZoom = TRUE, showCompass = TRUE)),
    list(type = "navigation", position = "topleft",  options = list(showZoom = TRUE, showCompass = TRUE))
  )
  expect_error(maplamina:::ml_validate_spec(prune_x_for_spec(m)), "duplicate control type")

  # invalid position
  m$x$map_options$controls <- list(list(type = "fullscreen", position = "middle"))
  expect_error(maplamina:::ml_validate_spec(prune_x_for_spec(m)), "invalid position")

  # empty options list is not allowed (can serialize as [])
  m$x$map_options$controls <- list(list(type = "fullscreen", position = "topright", options = list()))
  expect_error(maplamina:::ml_validate_spec(prune_x_for_spec(m)), "empty list is not allowed")
})
