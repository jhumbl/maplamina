# maplamina

GPU-accelerated interactive maps for R (MapLibre GL + deck.gl via htmlwidgets).

> **Status:** early / MVP in progress. APIs may change.

## Installation

Not on CRAN yet.

```r
# install.packages("devtools")
devtools::install_github("YOUR_ORG_OR_USER/maplamina")
```

## Quick start

```r
library(maplamina)

m <- maplamina()
m
```

## Development

- Generate docs: `devtools::document()`
- Run tests: `devtools::test()`
- Full check (Windows requires Rtools): `devtools::check()`

## License

MIT.
