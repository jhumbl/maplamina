ml_collect_geometry_points <- function(data, lon = NULL, lat = NULL, use_offsets = NULL) {
  if (inherits(data, "sf")) {
    g <- sf::st_geometry(data)

    # Drop empty geometries (e.g. POINT EMPTY)
    empty <- sf::st_is_empty(g)
    if (any(empty)) {
      data <- data[!empty, , drop = FALSE]
      g <- g[!empty]
    }
    if (length(g) == 0L) {
      stop("All point geometries are empty; cannot build a points layer.", call. = FALSE)
    }

    # For now, points layer requires POINT only (no MULTIPOINT / GEOMETRYCOLLECTION)
    gtype <- as.character(sf::st_geometry_type(g, by_geometry = TRUE))
    if (any(gtype != "POINT")) {
      stop(
        "add_circle_markers() currently requires sf geometries of type POINT. ",
        "Please cast with sf::st_cast(x, 'POINT') (and drop other geometry types) before plotting.",
        call. = FALSE
      )
    }

    bb <- sf::st_bbox(data)
    use_offsets_final <- if (is.null(use_offsets)) use_offsets_from_bbox(bb) else isTRUE(use_offsets)
    if (use_offsets_final) {
      origin <- c(unname((bb["xmin"] + bb["xmax"]) / 2),
                  unname((bb["ymin"] + bb["ymax"]) / 2))
    }
    use_offsets <- use_offsets_final

    coords <- sf::st_coordinates(g)
    stopifnot(ncol(coords) >= 2)
    n <- nrow(coords)

    # Preallocate and interleave directly (no cbind/t/as.numeric)
    pos <- numeric(2L * n)
    if (n) {
      idx <- 0L:(n - 1L)
      if (use_offsets) {
        pos[2L * idx + 1L] <- coords[, 1] - origin[1]
        pos[2L * idx + 2L] <- coords[, 2] - origin[2]
      } else {
        pos[2L * idx + 1L] <- coords[, 1]
        pos[2L * idx + 2L] <- coords[, 2]
      }
    }

    out <- list(
      n = n,
      position = list(values = pos, size = 2L),
      bbox = unname(c(bb["xmin"], bb["ymin"], bb["xmax"], bb["ymax"]))
    )
    if (use_offsets) out$coordinate_origin <- origin
    return(out)
  }

  # Non-sf fallback (explicit lon/lat or common columns)
  get_xy_cols <- function(df, lon, lat) {
    if (!is.null(lon) && !is.null(lat)) {
      if (!ml_is_formulaish(lon) || !ml_is_formulaish(lat)) {
        stop("lon/lat must be formulas like ~lon and ~lat.", call. = FALSE)
      }
      x <- ml_eval(df, lon); y <- ml_eval(df, lat)
      return(list(x = as.numeric(x), y = as.numeric(y)))
    }
    nm <- names(df)
    for (pair in list(c("lon","lat"), c("lng","lat"), c("x","y"),
                      c("Longitude","Latitude"), c("LONGITUDE","LATITUDE"),
                      c("Lon","Lat"), c("X","Y"))) {
      if (all(pair %in% nm)) return(list(x = as.numeric(df[[pair[1]]]),
                                         y = as.numeric(df[[pair[2]]])))
    }
    stop(
      "Could not determine point coordinates. Pass lon = ~<col> and lat = ~<col>, provide sf POINT geometry, or include lon/lat columns.",
      call. = FALSE
    )
  }

  xy <- get_xy_cols(data, lon, lat)

  # Drop non-finite rows (NA/NaN/Inf) to avoid bad bbox / buffers
  ok <- is.finite(xy$x) & is.finite(xy$y)
  if (!all(ok)) {
    xy$x <- xy$x[ok]
    xy$y <- xy$y[ok]
  }
  if (!length(xy$x)) {
    stop("No finite point coordinates found (all lon/lat values are NA/NaN/Inf).", call. = FALSE)
  }

  # One-pass ranges for bbox
  rx <- range(xy$x, na.rm = TRUE); ry <- range(xy$y, na.rm = TRUE)
  bb <- c(xmin = rx[1], ymin = ry[1], xmax = rx[2], ymax = ry[2])
  use_offsets_final <- if (is.null(use_offsets)) use_offsets_from_bbox(bb) else isTRUE(use_offsets)
  if (use_offsets_final) {
    origin <- c((bb["xmin"] + bb["xmax"]) / 2, (bb["ymin"] + bb["ymax"]) / 2)
  }
  use_offsets <- use_offsets_final

  n <- length(xy$x)
  pos <- numeric(2L * n)
  if (n) {
    idx <- 0L:(n - 1L)
    if (use_offsets) {
      pos[2L * idx + 1L] <- xy$x - origin[1]
      pos[2L * idx + 2L] <- xy$y - origin[2]
    } else {
      pos[2L * idx + 1L] <- xy$x
      pos[2L * idx + 2L] <- xy$y
    }
  }

  out <- list(
    n = n,
    position = list(values = pos, size = 2L),
    bbox = unname(c(bb["xmin"], bb["ymin"], bb["xmax"], bb["ymax"]))
  )
  if (use_offsets) out$coordinate_origin <- unname(origin)
  out
}
