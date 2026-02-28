.ml_flatten_num <- function(x) { x <- as.numeric(x); dim(x) <- NULL; x }
.ml_flatten_int <- function(x) { x <- as.integer(x); dim(x) <- NULL; x }
.ml_flatten_u8  <- function(x) { x <- as.integer(x); dim(x) <- NULL; pmax(0L, pmin(255L, x)) }

# Treat geometry blobs (positions/starts/feature_index) as a separate dedupe namespace
# so that semantically unrelated u32 arrays (e.g. filter codes) don't end up reusing
# ids like "poly.starts" purely due to identical content.
.ml_is_geo_hint <- function(id_hint) {
  isTRUE(
    identical(id_hint, "position") ||
      identical(id_hint, "feature_index") ||
      grepl("^(poly|path)\\.", id_hint)
  )
}

.ml_store_key <- function(id_hint, key) {
  scope <- if (.ml_is_geo_hint(id_hint)) "geo" else "data"
  paste0(scope, "::", key)
}

# Simple content-keying (fast, deterministic)
ml_key_numeric <- function(x)
  paste0("f32:", length(x), ":", digest::digest(.ml_flatten_num(x), algo = "xxhash64"))
ml_key_u32 <- function(x)
  paste0("u32:", length(x), ":", digest::digest(.ml_flatten_int(x), algo = "xxhash64"))
ml_key_u8 <- function(x, size = NULL) {
  sz <- if (is.null(size)) "" else as.character(size)
  paste0("u8:", length(x), ":", sz, ":", digest::digest(.ml_flatten_u8(x), algo = "xxhash64"))
}

# Begin a per-layer store:
# - blobs: environment for by-ref writes keyed by opaque blob_id
# - index: environment mapping content keys -> blob_id (dedupe)
# - refs:  environment mapping semantic refs (vw./flt./etc) -> blob_id
ml_store_begin <- function(layer) {
  list(
    blobs = new.env(parent = emptyenv()),
    index = new.env(parent = emptyenv()),
    refs  = new.env(parent = emptyenv())
  )
}

# Put one blob by id into the store (by reference)
ml_store_put_blob <- function(store, blob_id, dtype, data_url, length, size = NULL) {
  blob <- c(
    list(dtype = dtype, href = list(data = data_url), length = length),
    if (!is.null(size)) list(size = size) else list()
  )
  assign(blob_id, blob, envir = store$blobs)
  blob_id
}

# Internal: register semantic_ref -> blob_id mapping (and guard against semantic drift)
.ml_store_register_ref <- function(store, semantic_ref, blob_id) {
  if (!is.character(semantic_ref) || length(semantic_ref) != 1L || !nzchar(semantic_ref)) {
    stop("Invalid semantic ref while storing blobs.", call. = FALSE)
  }
  if (exists(semantic_ref, envir = store$refs, inherits = FALSE)) {
    existing <- get(semantic_ref, envir = store$refs, inherits = FALSE)
    if (!identical(existing, blob_id)) {
      stop(
        "Semantic ref '", semantic_ref, "' was previously bound to blob '", existing,
        "' but is now being rebound to blob '", blob_id, "'.",
        call. = FALSE
      )
    }
  } else {
    assign(semantic_ref, blob_id, envir = store$refs)
  }
  invisible(TRUE)
}

# Make (or reuse) a numeric (f32) blob.
# Returns {ref = <semantic_ref>} and records dataStore.refs[semantic_ref] -> blob_id.
ml_store_ref_numeric <- function(store, semantic_ref, vec) {
  vec <- .ml_flatten_num(vec)

  key_raw <- ml_key_numeric(vec)
  key <- .ml_store_key(semantic_ref, key_raw)

  if (!exists(key, envir = store$index, inherits = FALSE)) {
    blob_id <- paste0("blob_", digest::digest(key, algo = "xxhash64"))
    data_url <- ml_encode_f32_dataurl(vec)
    assign(key, blob_id, envir = store$index)
    ml_store_put_blob(store, blob_id, "f32", data_url, length(vec))
  }

  blob_id <- get(key, envir = store$index, inherits = FALSE)
  .ml_store_register_ref(store, semantic_ref, blob_id)
  list(ref = semantic_ref)
}

# Make (or reuse) a u32 blob.
ml_store_ref_u32 <- function(store, semantic_ref, vec) {
  vec <- .ml_flatten_int(vec)

  key_raw <- ml_key_u32(vec)
  key <- .ml_store_key(semantic_ref, key_raw)

  if (!exists(key, envir = store$index, inherits = FALSE)) {
    blob_id <- paste0("blob_", digest::digest(key, algo = "xxhash64"))
    data_url <- ml_encode_u32_dataurl(vec)
    assign(key, blob_id, envir = store$index)
    ml_store_put_blob(store, blob_id, "u32", data_url, length(vec))
  }

  blob_id <- get(key, envir = store$index, inherits = FALSE)
  .ml_store_register_ref(store, semantic_ref, blob_id)
  list(ref = semantic_ref)
}

# Make (or reuse) a u8 blob (RGBA dict).
ml_store_ref_u8 <- function(store, semantic_ref, vec, size = NULL) {
  vec <- .ml_flatten_u8(vec)

  key_raw <- ml_key_u8(vec, size = size)
  key <- .ml_store_key(semantic_ref, key_raw)

  if (!exists(key, envir = store$index, inherits = FALSE)) {
    blob_id <- paste0("blob_", digest::digest(key, algo = "xxhash64"))
    data_url <- ml_encode_u8_dataurl(vec)
    assign(key, blob_id, envir = store$index)
    ml_store_put_blob(store, blob_id, "u8", data_url, length(vec), size = size)
  }

  blob_id <- get(key, envir = store$index, inherits = FALSE)
  .ml_store_register_ref(store, semantic_ref, blob_id)
  list(ref = semantic_ref)
}

# Finalize: convert env -> plain list for JSON
ml_store_finalize <- function(store) {
  list(
    blobs = as.list(store$blobs),
    refs  = as.list(store$refs)
  )
}
