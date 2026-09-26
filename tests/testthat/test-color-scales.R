# These tests cover the v3 color scale spec system:
# Stage 1: color_*() spec objects + R-side resolution via ml_prepare_color()
# Stage 3: strict semantics for ~col (numeric ~col should error; categorical labels still allowed)

library(testthat)

# Helper: count dictionary levels from ml_prepare_color output
.dict_n <- function(cobj) {
  if (is.null(cobj$dict_rgba)) return(NA_integer_)
  as.integer(length(cobj$dict_rgba) / 4L)
}

# Helper: count unique codes
.codes_n <- function(cobj) {
  if (is.null(cobj$codes)) return(NA_integer_)
  length(unique(as.integer(cobj$codes)))
}

test_that("color_* constructors return maplamina_color_scale specs", {
  spec1 <- maplamina:::color_bin(~pop, palette = c("red", "blue"), bins = 2)
  spec2 <- maplamina:::color_quantile(~pop, palette = "Blues", n = 4)
  spec3 <- maplamina:::color_numeric(~pop, palette = "Viridis", steps = 16)
  spec4 <- maplamina:::color_factor(~grp, palette = c("#ff0000", "#00ff00"))

  expect_s3_class(spec1, "maplamina_color_scale")
  expect_s3_class(spec2, "maplamina_color_scale")
  expect_s3_class(spec3, "maplamina_color_scale")
  expect_s3_class(spec4, "maplamina_color_scale")

  expect_equal(spec1$kind, "bin")
  expect_equal(spec2$kind, "quantile")
  expect_equal(spec3$kind, "numeric")
  expect_equal(spec4$kind, "factor")

  expect_true(maplamina:::ml_is_formulaish(spec1$expr))
})

test_that("ml_prepare_color resolves bin/quantile/numeric specs into packed colors (no JS changes)", {
  df <- data.frame(pop = c(0, 10, 20, 30, 40, 50))
  n <- nrow(df)

  # Bin (2 colors)
  spec_bin <- maplamina:::color_bin(~pop, palette = c("red", "blue"), bins = 2)
  c_bin <- maplamina:::ml_prepare_color(spec_bin, opacity = 1, n = n, data = df)
  expect_true(!is.null(c_bin$dict_rgba) && !is.null(c_bin$codes))
  expect_length(c_bin$codes, n)
  expect_equal(.dict_n(c_bin), 2)
  expect_lte(.codes_n(c_bin), 2)

  # Quantile (3 bins -> 3 colors)
  spec_q <- maplamina:::color_quantile(~pop, palette = c("red", "green", "blue"), n = 3)
  c_q <- maplamina:::ml_prepare_color(spec_q, opacity = 1, n = n, data = df)
  expect_true(!is.null(c_q$dict_rgba) && !is.null(c_q$codes))
  expect_length(c_q$codes, n)
  expect_equal(.dict_n(c_q), 3)
  expect_lte(.codes_n(c_q), 3)

  # Numeric ramp: keep it compressible by steps
  spec_num <- maplamina:::color_numeric(~pop, palette = c("red", "blue"), steps = 8)
  c_num <- maplamina:::ml_prepare_color(spec_num, opacity = 1, n = n, data = df)
  expect_true(!is.null(c_num$dict_rgba) && !is.null(c_num$codes))
  expect_length(c_num$codes, n)
  expect_lte(.dict_n(c_num), 8)
  expect_lte(.codes_n(c_num), 8)
})

test_that("color_factor produces expected per-row colors (resolved in R)", {
  df <- data.frame(grp = c("b", "a", NA, "b"))
  spec <- maplamina:::color_factor(~grp, palette = c("#111111", "#222222"), domain = c("a", "b"), na_color = "#00000000")

  cols <- maplamina:::.ml_resolve_color_scale(spec, data = df, n = nrow(df))
  expect_equal(cols, c("#222222", "#111111", "#00000000", "#222222"))
})

test_that("Stage 3 strict semantics: numeric ~col must error; categorical labels are allowed", {
  df <- data.frame(pop = c(1, 2, 3), grp = c("x", "y", "x"))

  # Desired Stage 3 behavior: numeric ~col is NOT treated as categorical labels.
  expect_error(
    maplamina:::ml_prepare_color(~pop, opacity = 1, n = nrow(df), data = df),
    regexp = "color_(bin|quantile|numeric|factor)|color_bin|color_quantile|color_numeric|color_factor"
  )

  # Categorical labels should still map to a default palette.
  c_lab <- maplamina:::ml_prepare_color(~grp, opacity = 1, n = nrow(df), data = df)
  expect_true(!is.null(c_lab$dict_rgba) && !is.null(c_lab$codes))
  expect_equal(.dict_n(c_lab), 2)
})

test_that("ml_color_to_rgba keeps a colour's own alpha channel", {
  expect_equal(unname(maplamina:::ml_color_to_rgba("#00000000")), c(0L, 0L, 0L, 0L))
  expect_equal(unname(maplamina:::ml_color_to_rgba("#FF000080", 0.5)), c(255L, 0L, 0L, 64L))
  packed <- maplamina:::ml_color_to_rgba(c("transparent", "blue"), 1)
  expect_equal(as.integer(packed), c(255L, 255L, 255L, 0L, 0L, 0L, 255L, 255L))
})

test_that("na_color = '#00000000' resolves to a transparent dictionary entry", {
  df <- data.frame(pop = c(1, NA, 3))
  spec <- maplamina:::color_numeric(~pop, palette = c("red", "blue"), steps = 4)
  cobj <- maplamina:::ml_prepare_color(spec, opacity = 1, n = nrow(df), data = df)
  rgba <- matrix(as.integer(cobj$dict_rgba), nrow = 4L)
  expect_true(any(rgba[4L, ] == 0L))
})

test_that("color_quantile honours domain and clamp", {
  df <- data.frame(v = 1:10)
  resolve <- function(spec) maplamina:::.ml_resolve_color_scale(spec, data = df, n = nrow(df))

  # Breaks come from the values inside the domain, with the ends pinned to it.
  clamped <- resolve(color_quantile(~v, domain = c(4, 7), n = 2, palette = c("red", "blue")))
  expect_equal(clamped, rep(c("#FF0000", "#0000FF"), each = 5))

  dropped <- resolve(color_quantile(~v, domain = c(4, 7), n = 2, palette = c("red", "blue"), clamp = FALSE))
  expect_equal(dropped[c(1:3, 8:10)], rep("#00000000", 6))
  expect_equal(dropped[4:7], c("#FF0000", "#FF0000", "#0000FF", "#0000FF"))

  # A domain wider than the data leaves the quantile bins unchanged.
  wide <- resolve(color_quantile(~v, domain = c(0, 100), n = 4, palette = c("red", "blue")))
  plain <- resolve(color_quantile(~v, n = 4, palette = c("red", "blue")))
  expect_equal(wide, plain)
})

test_that("color_bin clamps values outside the domain to the end bins", {
  df <- data.frame(v = 1:10)
  spec <- color_bin(~v, domain = c(4, 7), bins = 3, palette = c("red", "blue"))
  cols <- maplamina:::.ml_resolve_color_scale(spec, data = df, n = nrow(df))
  expect_equal(cols[1:4], rep("#FF0000", 4))
  expect_equal(cols[7:10], rep("#0000FF", 4))
})

test_that("an unknown palette name is an error, a single colour is not", {
  df <- data.frame(v = 1:3)
  resolve <- function(pal) maplamina:::.ml_resolve_color_scale(
    color_numeric(~v, palette = pal, steps = 3), data = df, n = 3
  )
  expect_error(resolve("Vridis"), "Unknown palette 'Vridis'")
  expect_equal(unique(resolve("red")), "red")
  expect_length(unique(resolve("viridis")), 3)
})
