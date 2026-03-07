# Define a select filter

Creates a categorical filter specification to be registered with
[`add_filters()`](https://jhumbl.github.io/maplamina/reference/add_filters.md).

## Usage

``` r
filter_select(
  col,
  label = NULL,
  multi = TRUE,
  dropdown = NULL,
  searchable = TRUE,
  default = NULL,
  max_levels = NULL,
  id = NULL
)
```

## Arguments

- col:

  A formula selecting a column (e.g. `~region`).

- label:

  Optional label for the UI control (defaults to the column name).

- multi:

  Logical; allow multiple selections.

- dropdown:

  Optional UI hint (frontend-specific).

- searchable:

  Logical; allow searching within options.

- default:

  Optional default selection(s).

- max_levels:

  Optional maximum number of levels to show (frontend may truncate).

- id:

  Optional filter id (otherwise generated).

## Value

A filter specification object.

## Examples

``` r
f <- filter_select(~Species, default = c("setosa", "versicolor"))
f
#> $type
#> [1] "select"
#> 
#> $id
#> NULL
#> 
#> $column
#> ~Species
#> <environment: 0x56352d61ac78>
#> 
#> $label
#> NULL
#> 
#> $multi
#> [1] TRUE
#> 
#> $dropdown
#> NULL
#> 
#> $searchable
#> [1] TRUE
#> 
#> $default
#> [1] "setosa"     "versicolor"
#> 
#> $max_levels
#> NULL
#> 
#> attr(,"class")
#> [1] "ml_filter"
```
