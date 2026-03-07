# Define a range filter

Creates a numeric range filter specification to be registered with
[`add_filters()`](https://jhumbl.github.io/maplamina/reference/add_filters.md).

## Usage

``` r
filter_range(
  col,
  label = NULL,
  default = NULL,
  min = NULL,
  max = NULL,
  step = NULL,
  live = TRUE,
  id = NULL
)
```

## Arguments

- col:

  A formula selecting a numeric column (e.g. `~mag`).

- label:

  Optional label for the UI control (defaults to the column name).

- default:

  Optional default range `c(min, max)` (length 2).

- min, max:

  Optional explicit min/max (otherwise computed from data).

- step:

  Optional step size for the UI slider.

- live:

  Logical; update the map continuously while dragging.

- id:

  Optional filter id (otherwise generated).

## Value

A filter specification object.

## Examples

``` r
f <- filter_range(~mpg, default = c(15, 30))
f
#> $type
#> [1] "range"
#> 
#> $id
#> NULL
#> 
#> $column
#> ~mpg
#> <environment: 0x563b5d47a378>
#> 
#> $label
#> NULL
#> 
#> $default
#> [1] 15 30
#> 
#> $min
#> NULL
#> 
#> $max
#> NULL
#> 
#> $step
#> NULL
#> 
#> $live
#> [1] TRUE
#> 
#> attr(,"class")
#> [1] "ml_filter"
```
