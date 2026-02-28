# ---- Mapflow v3: geometry collectors ----
# Refactor: split from geometry.R for readability.

deg2rad <- function(x) x * pi / 180

use_offsets_from_bbox <- function(bb, tol = 0.01) {
  # Clamp to Web Mercator valid lat range
  clamp_lat <- function(lat) pmax(pmin(lat, 85.05113), -85.05113)

  ymin <- clamp_lat(as.numeric(bb[["ymin"]]))
  ymax <- clamp_lat(as.numeric(bb[["ymax"]]))
  lat0 <- (ymin + ymax) / 2

  # Bounding-box spans (in degrees)
  xmin <- as.numeric(bb[["xmin"]])
  xmax <- as.numeric(bb[["xmax"]])
  span_lng <- xmax - xmin
  if (!is.finite(span_lng) || span_lng < 0) return(FALSE)

  span_lat <- ymax - ymin
  if (!is.finite(span_lat) || span_lat < 0) return(FALSE)

  # Degenerate bbox (single point): offsets are safe and can improve numeric stability
  if (span_lat == 0 && span_lng == 0) return(TRUE)

  # If span is huge, bail early (offsets are for local extents)
  if (span_lat > 20) return(FALSE)  # ~conservative guard; keep or tune as you like
  # Optional guard: avoid offsets for "global" horizontal features (span_lat == 0 but huge lon span)
  if (span_lat == 0 && span_lng > 20) return(FALSE)

  deg2rad <- function(x) x * pi / 180
  merc_y  <- function(phi) log(tan(pi/4 + phi/2))  # exact Mercator Y (unit sphere)

  phi0 <- deg2rad(lat0)
  phiA <- deg2rad(ymax)
  phiB <- deg2rad(ymin)

  # Exact Δy to each edge
  dyA_true <- merc_y(phiA) - merc_y(phi0)
  dyB_true <- merc_y(phiB) - merc_y(phi0)

  # Linearized (offset mode) Δy using slope at origin: dY/dφ = sec(phi0)
  slope0 <- 1 / cos(phi0)
  dyA_lin <- slope0 * (phiA - phi0)
  dyB_lin <- slope0 * (phiB - phi0)

  # Relative errors at edges (use magnitude). Protect against 0 in denominator.
  relA <- if (dyA_true == 0) 0 else abs((dyA_lin - dyA_true) / dyA_true)
  relB <- if (dyB_true == 0) 0 else abs((dyB_lin - dyB_true) / dyB_true)

  rel_err <- max(relA, relB)
  #if(rel_err <= tol) message("Using LATLNG_OFFSET") else message("Using LATLNG")
  rel_err <= tol
}
