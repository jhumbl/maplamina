ml_encode_f32_dataurl <- function(x) {
  # Coerce and flatten to a plain atomic vector
  x <- as.numeric(x)
  dim(x) <- NULL
  # Optional: make NA explicit (writeBin can handle NaN cleanly)
  x[is.na(x)] <- NaN

  con <- rawConnection(raw(), "wb")
  on.exit(close(con), add = TRUE)
  # size = 4 -> single precision (float32)
  writeBin(x, con, size = 4L, endian = "little")
  raw <- rawConnectionValue(con)
  paste0("data:application/octet-stream;base64,", base64enc::base64encode(raw))
}

# Uint32 encoder (integer -> base64)
ml_encode_u32_dataurl <- function(x) {
  # Accept integer or numeric that are whole numbers
  x <- as.integer(x)
  dim(x) <- NULL
  con <- rawConnection(raw(), "wb")
  on.exit(close(con), add = TRUE)
  writeBin(x, con, size = 4L, endian = "little")
  raw <- rawConnectionValue(con)
  paste0("data:application/octet-stream;base64,", base64enc::base64encode(raw))
}

# Uint8 encoder (raw/0..255 -> base64)
ml_encode_u8_dataurl <- function(x) {
  if (!is.raw(x)) x <- as.raw(pmax(0L, pmin(255L, as.integer(x))))
  # raw is already a flat vector; just encode
  paste0("data:application/octet-stream;base64,", base64enc::base64encode(x))
}
