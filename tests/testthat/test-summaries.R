# Minimal helper to create a stub layer for prerender compilation.
# We avoid depending on specific layer helpers here; the compiler only requires
# a rendering-only layer with a dataStore that can be finalized.
.ml_test_stub_layer <- function(id, type = "points") {
  list(
    id = id,
    type = type,
    # compiler pass 1 will read/write data_columns; keep empty for summaries-only tests
    data_columns = list(),
    # ensure presence of dataStore shape; ml_store_begin()/finalize() may extend this
    dataStore = list(blobs = list(), refs = list())
  )
}

test_that("summary constructors create ml_summary objects", {
  s1 <- summary_count(~id, label = "Count")
  s2 <- summary_max(~income, label = "Max Income")
  s3 <- summary_mean(~income, label = "Avg Income")
  s4 <- summary_sum(~income, label = "Sum Income")
  s5 <- summary_min(~income, label = "Min Income")

  expect_true(inherits(s1, "ml_summary"))
  expect_true(inherits(s2, "ml_summary"))
  expect_true(inherits(s3, "ml_summary"))
  expect_true(inherits(s4, "ml_summary"))
  expect_true(inherits(s5, "ml_summary"))

  expect_identical(s1$op, "count")
  expect_identical(s2$op, "max")
  expect_identical(s3$op, "mean")
  expect_identical(s4$op, "sum")
  expect_identical(s5$op, "min")
})


test_that("na_rm is not part of the MVP summaries API", {
  expect_error(summary_sum(~income, na_rm = TRUE), "unused argument")
  expect_error(summary_max(~income, na_rm = TRUE), "unused argument")
  expect_error(summary_mean(~income, na_rm = TRUE), "unused argument")
})


test_that("add_summaries registers raw components and prerender compiles controls", {
  df <- data.frame(
    id = 1:5,
    income = c(10, 20, 30, NA, 50),
    popden = c(1, 2, 3, 4, 5)
  )

  m <- maplamina()
  m$x$.__layers <- list(l1 = .ml_test_stub_layer("l1", "points"))
  m$x$.__data_registry <- list(l1 = df)
  m$x$.__layer_meta <- list(l1 = list(n_row = nrow(df), n_part = nrow(df)))

  m <- add_summaries(
    m,
    summary_count(~id, label = "Count"),
    summary_max(~income, label = "Max Income", digits = 0),
    summary_mean(~popden, label = "Avg Pop Den", digits = 1),
    bind = "summary",
    layer_id = "l1"
  )

  out <- maplamina:::.ml_prerender(m)

  # compiled components bucket exists and contains summaries
  expect_true(is.list(out$x$.__components))
  expect_true(is.list(out$x$.__components$summaries))
  expect_gte(length(out$x$.__components$summaries), 3)

  # compiled controls include the bound group
  expect_true(is.list(out$x$.__controls$summary))
  ctl <- out$x$.__controls$summary
  expect_identical(ctl$type, "summaries")

  # rows keyed by label
  expect_true("Count" %in% names(ctl$rows))
  expect_true("Max Income" %in% names(ctl$rows))
  expect_true("Avg Pop Den" %in% names(ctl$rows))

  expect_identical(ctl$rows[["Count"]]$op, "count")
  expect_identical(ctl$rows[["Max Income"]]$op, "max")
  expect_identical(ctl$rows[["Avg Pop Den"]]$op, "mean")

  # order must contain exactly the labels (deterministic UI order)
  ord <- ctl$order
  ord_vec <- if (is.list(ord)) unlist(ord, use.names = FALSE) else ord
  expect_setequal(ord_vec, c("Count", "Max Income", "Avg Pop Den"))

  # numeric summaries should have a values ref in compiled components
  comps <- out$x$.__components$summaries
  max_ids <- names(comps)[vapply(comps, function(z) identical(z$label, "Max Income"), logical(1))]
  expect_length(max_ids, 1)
  max_comp <- comps[[max_ids[[1]]]]
  expect_true(is.list(max_comp$values))
  expect_true(!is.null(max_comp$values$ref))
})

test_that("summaries merge across layers by bind + label + op", {
  df1 <- data.frame(id = 1:3, income = c(10, 20, 30))
  df2 <- data.frame(ID = 1:2, income = c(5, 15))

  m <- maplamina()
  m$x$.__layers <- list(
    l1 = .ml_test_stub_layer("l1", "points"),
    l2 = .ml_test_stub_layer("l2", "polygons")
  )
  m$x$.__data_registry <- list(l1 = df1, l2 = df2)
  m$x$.__layer_meta <- list(
    l1 = list(n_row = nrow(df1), n_part = nrow(df1)),
    l2 = list(n_row = nrow(df2), n_part = nrow(df2))
  )

  m <- add_summaries(m, summary_count(~id, label = "Count"), bind = "summary", layer_id = "l1")
  m <- add_summaries(m, summary_count(~ID, label = "Count"), bind = "summary", layer_id = "l2")

  out <- maplamina:::.ml_prerender(m)

  ctl <- out$x$.__controls$summary
  mids <- ctl$rows[["Count"]]$members
  mids_vec <- if (is.list(mids)) unlist(mids, use.names = FALSE) else mids

  expect_equal(length(mids_vec), 2)
})

test_that("conflicts within a merged summaries row error clearly", {
  df1 <- data.frame(id = 1:3, income = c(10, 20, 30))
  df2 <- data.frame(id = 1:2, income = c(5, 15))

  # op conflict (same bind+label, different op)
  m <- maplamina()
  m$x$.__layers <- list(
    l1 = .ml_test_stub_layer("l1"),
    l2 = .ml_test_stub_layer("l2")
  )
  m$x$.__data_registry <- list(l1 = df1, l2 = df2)
  m$x$.__layer_meta <- list(
    l1 = list(n_row = nrow(df1), n_part = nrow(df1)),
    l2 = list(n_row = nrow(df2), n_part = nrow(df2))
  )

  m <- add_summaries(m, summary_count(~id, label = "Count"), bind = "summary", layer_id = "l1")
  m <- add_summaries(m, summary_max(~income, label = "Count"), bind = "summary", layer_id = "l2")

  expect_error(maplamina:::.ml_prerender(m), "incompatible summary ops")

  # formatting conflict (digits differ across layers)
  m2 <- maplamina()
  m2$x$.__layers <- list(
    l1 = .ml_test_stub_layer("l1"),
    l2 = .ml_test_stub_layer("l2")
  )
  m2$x$.__data_registry <- list(l1 = df1, l2 = df2)
  m2$x$.__layer_meta <- list(
    l1 = list(n_row = nrow(df1), n_part = nrow(df1)),
    l2 = list(n_row = nrow(df2), n_part = nrow(df2))
  )

  m2 <- add_summaries(m2, summary_count(~id, label = "Count", digits = 0), bind = "summary", layer_id = "l1")
  m2 <- add_summaries(m2, summary_count(~id, label = "Count", digits = 1), bind = "summary", layer_id = "l2")

  expect_error(maplamina:::.ml_prerender(m2), "inconsistent `digits`")
})
