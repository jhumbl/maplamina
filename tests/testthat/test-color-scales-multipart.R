# Stage 2 tests: resolving scale specs at row-grain and expanding to parts correctly.

library(testthat)

.dict_n <- function(cobj) as.integer(length(cobj$dict_rgba) / 4L)

# Extract (encoding dict) number of colors used for fillColor from .ml_collect_layer_aesthetics output
.n_fill_colors <- function(aes_out) {
  dc <- aes_out$aes$data_columns$fillColor
  expect_true(!is.null(dc))
  if (!is.null(dc$dict_rgba)) return(as.integer(length(dc$dict_rgba) / 4L))
  NA_integer_
}

# Extract codes for fillColor from .ml_collect_layer_aesthetics output
.fill_codes <- function(aes_out) {
  aes_out$aes$data_columns$fillColor$codes
}

test_that("Stage 2: quantiles are computed on row-grain, not part-grain", {
  # Row-grain values: 0, 50, 100 (should produce 2 quantile bins for n=2)
  data <- data.frame(pop = c(0, 50, 100))

  # Multipart expansion: overweight pop==0 heavily
  feature_index <- c(rep(0L, 10L), 1L, 2L) # 0-based indices
  data_eval <- data[feature_index + 1L, , drop = FALSE]

  ctx <- list(
    n_row = nrow(data),
    n_part = nrow(data_eval),
    feature_index = feature_index,
    data_eval = data_eval,
    is_multipart = TRUE
  )

  dots <- list(
    fillColor = maplamina:::color_quantile(~pop, palette = c("red", "blue"), n = 2),
    fillOpacity = 1
  )

  out <- maplamina:::.ml_collect_layer_aesthetics(ctx, type = "polygon", data = data, dots = dots)

  # With correct Stage 2 handling, we expect TWO colors (two bins) in the fill dict.
  # Without Stage 2 (i.e. resolving on data_eval), the heavy repetition can collapse
  # quantile breaks and result in a single color.
  expect_equal(.n_fill_colors(out), 2)

  codes <- .fill_codes(out)
  expect_length(codes, ctx$n_part)
  expect_true(all(codes[1:10] == codes[1]))
  expect_true(length(unique(codes)) == 2)
})
