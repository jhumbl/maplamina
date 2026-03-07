# Create a list of panel sections

Create a list of panel sections

## Usage

``` r
sections(...)
```

## Arguments

- ...:

  One or more
  [`section()`](https://jhumbl.github.io/maplamina/reference/section.md)
  objects, character ids, or lists of sections.

## Value

A panel sections container.

## Examples

``` r
sections(section("views"), section("filters"))
#> [[1]]
#> $id
#> [1] "views"
#> 
#> attr(,"class")
#> [1] "maplamina_panel_section"
#> 
#> [[2]]
#> $id
#> [1] "filters"
#> 
#> attr(,"class")
#> [1] "maplamina_panel_section"
#> 
#> attr(,"class")
#> [1] "maplamina_panel_sections"
```
