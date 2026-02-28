ml_test_points_sf <- function() {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  pts <- sf$st_sfc(
    sf$st_point(c(0, 0)),
    sf$st_point(c(1, 1)),
    sf$st_point(c(2, 1))
  )
  sf$st_sf(
    num_col = c(10, 20, 30),
    cat_col = c("A", "B", "A"),
    geometry = pts,
    crs = 4326
  )
}

ml_test_lines_sf <- function() {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  l1 <- sf$st_linestring(rbind(c(0,0), c(1,0), c(2,0)))
  l2 <- sf$st_multilinestring(list(
    rbind(c(0,1), c(1,1)),
    rbind(c(1,1), c(2,2), c(3,2))
  ))

  sf$st_sf(
    num_col = c(5, 9),
    cat_col = c("X", "Y"),
    geometry = sf$st_sfc(l1, l2),
    crs = 4326
  )
}

ml_test_polygons_sf <- function() {
  skip_if_not_installed("sf")
  sf <- asNamespace("sf")

  # polygon 1: MULTIPOLYGON with 2 parts (=> multipart expansion target)
  p1a <- sf$st_polygon(list(rbind(c(0,0), c(2,0), c(2,2), c(0,2), c(0,0))))
  p1b <- sf$st_polygon(list(rbind(c(3,0), c(4,0), c(4,1), c(3,1), c(3,0))))
  mp1 <- sf$st_multipolygon(list(unclass(p1a), unclass(p1b)))

  # polygon 2: single polygon
  p2 <- sf$st_polygon(list(rbind(c(0,3), c(1,3), c(1,4), c(0,4), c(0,3))))

  sf$st_sf(
    num_col  = c(100, 200),
    cat_col2 = c("A", "B"),
    geometry = sf$st_sfc(mp1, p2),
    crs = 4326
  )
}

ml_prerender <- function(m) {
  # Uses your preRenderHook compiler
  maplamina:::.ml_prerender(m)
}
