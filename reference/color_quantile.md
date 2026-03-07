# Quantile color scale specification

Quantile color scale specification

## Usage

``` r
color_quantile(
  expr,
  palette = NULL,
  n = 5,
  domain = NULL,
  na_color = "#00000000",
  reverse = FALSE,
  clamp = TRUE
)
```

## Arguments

- expr:

  A formula selecting a numeric column (e.g. `~value`).

- palette:

  `NULL`, a palette name, or a vector of colors.

- n:

  Number of quantile bins.

- domain:

  Optional numeric range `c(min, max)`; defaults to data range.

- na_color:

  Color used for missing values.

- reverse:

  Logical; reverse the palette.

- clamp:

  Logical; if `TRUE`, clamp values outside `domain` to the ends.

## Value

A color scale specification object.
