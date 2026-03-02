# ---- Maplamina v3: geometry collectors ----
# Refactor: split from geometry.R for readability.

ml_collect_geometry_lines <- function(data, use_offsets = NULL) {
  # Prefer sf
  x <- data
  stopifnot(inherits(x, "sf"))

  g  <- sf::st_geometry(x)
  bb <- sf::st_bbox(x)
  use_offsets_final <- if (is.null(use_offsets)) use_offsets_from_bbox(bb) else isTRUE(use_offsets)
  if (use_offsets_final) {
    origin <- c(unname((bb["xmin"] + bb["xmax"]) / 2),
                unname((bb["ymin"] + bb["ymax"]) / 2))
  }
  use_offsets <- use_offsets_final

  # PASS 1 — count paths/verts (no as.matrix)
  tot_paths <- 0L; tot_verts <- 0L
  for (i in seq_along(g)) {
    gi <- g[[i]]; if (is.null(gi)) next

    if (inherits(gi, "MULTILINESTRING")) {
      for (seg in unclass(gi)) {
        m <- seg[, 1:2, drop = FALSE]     # seg is already a numeric matrix
        n <- nrow(m)
        if (n >= 2L) { tot_paths <- tot_paths + 1L; tot_verts <- tot_verts + n }
      }
    } else if (inherits(gi, "LINESTRING")) {
      m <- unclass(gi)[, 1:2, drop = FALSE]  # already a matrix
      n <- nrow(m)
      if (n >= 2L) { tot_paths <- tot_paths + 1L; tot_verts <- tot_verts + n }
    }
  }

  positions <- numeric(2L * tot_verts)
  starts    <- integer(tot_paths)
  feature_idx <- integer(tot_paths)

  # PASS 2 — fill coordinates (deltas or absolutes), interleave without transpose/coercion
  v_off <- 0L  # vertex offset
  p_off <- 0L  # path offset

  write_seg <- function(m, fid) {
    n <- nrow(m); if (n < 2L) return()
    # Extract columns once
    xv <- m[, 1]
    yv <- m[, 2]
    if (use_offsets) {
      xv <- xv - origin[1]
      yv <- yv - origin[2]
    }

    p_off <<- p_off + 1L
    starts[p_off] <<- v_off
    feature_idx[p_off] <<- fid

    # Interleave directly: [x1, y1, x2, y2, ...]
    base <- 2L * v_off
    # odd positions -> X
    positions[ base + (1L + (0L:(n - 1L)) * 2L) ] <<- xv
    # even positions -> Y
    positions[ base + (2L + (0L:(n - 1L)) * 2L) ] <<- yv

    v_off <<- v_off + n
  }

  for (i in seq_along(g)) {
    gi <- g[[i]]; if (is.null(gi)) next

    if (inherits(gi, "MULTILINESTRING")) {
      for (seg in unclass(gi)) {
        write_seg(seg[, 1:2, drop = FALSE], fid = (i - 1L))
      }
    } else if (inherits(gi, "LINESTRING")) {
      write_seg(unclass(gi)[, 1:2, drop = FALSE], fid = (i - 1L))
    }
  }

  out <- list(
    n = as.integer(p_off),
    path = list(
      positions   = positions,
      path_starts = starts,
      length      = as.integer(p_off),
      size        = 2L
    ),
    feature_index = list(values = as.integer(feature_idx)),
    bbox = unname(c(bb["xmin"], bb["ymin"], bb["xmax"], bb["ymax"]))
  )
  if (use_offsets) out$coordinate_origin <- origin
  out
}
