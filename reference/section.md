# Create a panel section that mounts a control by bind id

Panel sections refer to bind ids created by components such as
[`add_views()`](https://jhumbl.github.io/maplamina/reference/add_views.md),
[`add_filters()`](https://jhumbl.github.io/maplamina/reference/add_filters.md),
and
[`add_summaries()`](https://jhumbl.github.io/maplamina/reference/add_summaries.md).

## Usage

``` r
section(id)
```

## Arguments

- id:

  Bind id (e.g. the `bind` supplied to add_views/add_filters, or the
  component id when bind is omitted).

## Value

A panel section object.

## Examples

``` r
section("filters")
#> $id
#> [1] "filters"
#> 
#> attr(,"class")
#> [1] "maplamina_panel_section"
```
