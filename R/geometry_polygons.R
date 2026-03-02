# ---- Maplamina v3: geometry collectors ----
# Refactor: split from geometry.R for readability.

ml_collect_geometry_polygons <- function(data, use_offsets = NULL) {
  # Fast "drop closing vertex" without copying the matrix
  drop_closing_idx <- function(xy) {
    if (is.null(xy)) return(integer())
    n <- nrow(xy)
    if (!n || n < 2) return(seq_len(n))
    if (all(xy[1, 1:2] == xy[n, 1:2])) seq_len(n - 1L) else seq_len(n)
  }
  rings_of <- function(sfg) {
    if (inherits(sfg, "POLYGON")) list(unclass(sfg))
    else if (inherits(sfg, "MULTIPOLYGON")) unclass(sfg)
    else list()
  }

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

  # PASS 1 — count parts/rings/verts (no copies)
  tot_polys <- 0L; tot_rings <- 0L; tot_verts <- 0L
  for (i in seq_along(g)) {
    gi <- g[[i]]; if (is.null(gi)) next
    for (poly in rings_of(gi)) {
      if (!length(poly)) next
      tot_polys <- tot_polys + 1L
      for (ring in poly) {
        # ring is already a numeric matrix [n, 2+] -> take first 2 cols via view
        idx <- drop_closing_idx(ring[, 1:2, drop = FALSE])
        n   <- length(idx)
        if (n > 0L) { tot_rings <- tot_rings + 1L; tot_verts <- tot_verts + n }
      }
    }
  }

  positions   <- numeric(2L * tot_verts)
  ring_starts <- integer(tot_rings)
  poly_starts <- integer(tot_polys)
  feature_idx <- integer(tot_polys)

  # PASS 2 — fill (deltas or absolutes), interleave without transpose/coercion
  v_off <- 0L; r_off <- 0L; p_off <- 0L
  for (i in seq_along(g)) {
    gi <- g[[i]]; if (is.null(gi)) next
    for (poly in rings_of(gi)) {
      if (!length(poly)) next
      p_off <- p_off + 1L
      poly_starts[p_off] <- r_off
      feature_idx[p_off] <- (i - 1L)

      for (ring in poly) {
        # View first two columns only; decide if we drop the closing vertex
        xy_view <- ring[, 1:2, drop = FALSE]
        idx <- drop_closing_idx(xy_view)
        n   <- length(idx)
        if (n == 0L) next

        # Prepare X/Y vectors (no matrix copies)
        xv <- xy_view[idx, 1]
        yv <- xy_view[idx, 2]
        if (use_offsets) {
          xv <- xv - origin[1]
          yv <- yv - origin[2]
        }

        r_off <- r_off + 1L
        ring_starts[r_off] <- v_off

        # Interleave directly: [x1,y1,x2,y2,...] without t()/as.numeric()
        base <- 2L * v_off
        # odd positions -> X
        positions[ base + (1L + (0L:(n - 1L)) * 2L) ] <- xv
        # even positions -> Y
        positions[ base + (2L + (0L:(n - 1L)) * 2L) ] <- yv

        v_off <- v_off + n
      }
    }
  }

  # Trim in case of any skipped/empty rings
  if (length(positions)   != 2L * v_off) positions   <- positions[seq_len(2L * v_off)]
  if (length(ring_starts) != r_off)       ring_starts <- ring_starts[seq_len(r_off)]
  if (length(poly_starts) != p_off)       poly_starts <- poly_starts[seq_len(p_off)]
  if (length(feature_idx) != p_off)       feature_idx <- feature_idx[seq_len(p_off)]

  out <- list(
    n = as.integer(p_off),
    polygon = list(
      positions   = positions,
      ring_starts = ring_starts,
      poly_starts = poly_starts,
      length      = as.integer(p_off),
      size        = 2L
    ),
    feature_index = list(values = as.integer(feature_idx)),
    bbox = unname(c(bb["xmin"], bb["ymin"], bb["xmax"], bb["ymax"]))
  )
  if (use_offsets) out$coordinate_origin <- origin
  out
}
