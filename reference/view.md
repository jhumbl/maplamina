# Define a view

A view is a named set of overrides (e.g. radius/opacity) that can be
switched via a shared views selector created by
[`add_views()`](https://jhumbl.github.io/maplamina/reference/add_views.md).

## Usage

``` r
view(name, ...)
```

## Arguments

- name:

  View name shown in the UI.

- ...:

  Named overrides for layer aesthetics (e.g. `radius = ~mag * 3`,
  `opacity = 0.3`).

## Value

A view specification object.

## Examples

``` r
v <- view("magnitude", radius = ~mag * 3)
v
#> $name
#> [1] "magnitude"
#> 
#> $overrides
#> $overrides$radius
#> ~mag * 3
#> 
#> attr(,"ml_env")
#> <environment: 0x562e2c5ab7c0>
#> 
#> attr(,"class")
#> [1] "ml_view"
```
