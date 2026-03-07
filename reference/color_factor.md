# Categorical color scale specification

Categorical color scale specification

## Usage

``` r
color_factor(
  expr,
  palette = NULL,
  domain = NULL,
  na_color = "#00000000",
  reverse = FALSE
)
```

## Arguments

- expr:

  A formula selecting a categorical column (e.g. `~region`).

- palette:

  `NULL`, a palette name, or a vector of colors.

- domain:

  Optional character vector of levels (controls ordering and which
  levels are shown).

- na_color:

  Color used for missing values.

- reverse:

  Logical; reverse the palette.

## Value

A color scale specification object.
