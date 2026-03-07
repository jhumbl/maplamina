# Summary: count rows

Counts the number of filtered rows.

## Usage

``` r
summary_count(
  col = NULL,
  label = NULL,
  digits = NULL,
  prefix = NULL,
  suffix = NULL,
  id = NULL
)
```

## Arguments

- col:

  Optional formula like `~id` (validated if provided).

- label:

  Display label for the summary row.

- digits:

  Optional number of digits for formatting (applied in JS).

- prefix, suffix:

  Optional prefix/suffix strings (applied in JS).

- id:

  Optional summary id.

## Value

A summary specification object.
