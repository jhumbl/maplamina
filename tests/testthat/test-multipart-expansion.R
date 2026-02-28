ml_decode_f32_blob <- function(layer, semantic_ref) {
  skip_if_not_installed("jsonlite")

  blob_id <- layer$dataStore$refs[[semantic_ref]]
  blob <- layer$dataStore$blobs[[blob_id]]
  dataurl <- blob$href$data

  b64 <- sub("^data:application/octet-stream;base64,", "", dataurl)
  raw <- jsonlite::base64_dec(b64)

  n <- as.integer(blob$length)
  readBin(raw, what = "numeric", n = n, size = 4, endian = "little")
}

test_that("views numeric encodings expand to multipart part-count", {
  poly <- ml_test_polygons_sf()

  m <- maplamina() |>
    add_polygons(poly, id = "polys") |>
    add_views(
      view("V", elevation = ~num_col),
      bind = "views"
    )

  out <- ml_prerender(m)
  lyr <- out$x$.__layers$polys

  # Find the semantic ref for the elevation encoding
  vcomp_id <- names(out$x$.__components$views)[[1]]
  enc <- out$x$.__components$views[[vcomp_id]]$views$V$encodings$elevation
  sem <- enc$value$ref

  vals <- ml_decode_f32_blob(lyr, sem)

  # MULTIPOLYGON had 2 parts + polygon had 1 part => expect 3 values
  expect_length(vals, 3L)

  # Expect row 1 value repeated twice, row 2 once
  expect_identical(as.numeric(vals), c(100, 100, 200))
})
