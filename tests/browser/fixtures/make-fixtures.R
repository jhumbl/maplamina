# Builds the saved-widget fixtures the browser tests open. Run from the package root:
#   Rscript tests/browser/fixtures/make-fixtures.R
# Output goes to tests/browser/fixtures/out/ (ignored by git); regenerate after any R change.

if (requireNamespace("pkgload", quietly = TRUE)) {
  pkgload::load_all(".", quiet = TRUE)
} else {
  library(maplamina)
}
library(sf)

out_dir <- file.path("tests", "browser", "fixtures", "out")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

save <- function(widget, name) {
  path <- normalizePath(file.path(out_dir, paste0(name, ".html")), mustWork = FALSE)
  htmlwidgets::saveWidget(widget, path, selfcontained = FALSE, title = name)
  cat("wrote", path, "\n")
}

# A page holding arbitrary tags (several widgets, wrappers, scripts) rather than one widget.
save_page <- function(tags, name) {
  path <- normalizePath(file.path(out_dir, paste0(name, ".html")), mustWork = FALSE)
  htmltools::save_html(tags, path, libdir = paste0(name, "_files"))
  cat("wrote", path, "
")
}

# V1: two views differing in radius; first switch must animate. A 3x3 grid centred on
# (0, 51.5) so the middle circle sits at the canvas centre after fit_bounds.
grid <- expand.grid(lon = c(-0.02, 0, 0.02), lat = c(51.49, 51.5, 51.51))
maplamina(grid) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  add_views(view("big", radius = 12), view("small", radius = 4), duration = 1500) |>
  save("circles-views")

# Negative control for the animation detector: same layer, near-instant duration.
maplamina(grid) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  add_views(view("big", radius = 12), view("small", radius = 4), duration = 1) |>
  save("circles-views-instant")

# V2, V5, F1, F5: views plus a range and a select filter on one layer. Deterministic 3x3
# grid (lon varies fastest): x = 1..9, col cycles red, green, blue. Centre point is x = 5,
# col = green. View "test" colours x < 3 red, others blue.
g2 <- expand.grid(lon = c(-0.02, 0, 0.02), lat = c(51.49, 51.5, 51.51))
g2$x <- 1:9
g2$col <- rep(c("red", "green", "blue"), 3)

filters_map <- function(d, ...) {
  maplamina(d) |>
    add_circles(stroke = FALSE, fill_color = "dodgerblue", fill_opacity = 1, radius = 10) |>
    add_views(
      view("test", color = ~ifelse(x < 3, "red", "blue"), fill_color = ~ifelse(x < 3, "red", "blue")),
      view("test2", radius = 5),
      duration = 1500
    ) |>
    add_filters(...)
}

filters_map(g2, filter_range(~x), filter_select(~col)) |>
  save("circles-views-filters")

# F5: the same map with defaults applied on first render.
filters_map(g2, filter_range(~x, default = c(4, 9)), filter_select(~col, default = c("green", "blue"))) |>
  save("circles-filter-defaults")

# V3: a view that omits radius after one that set it; the revert to base must animate. The
# second view's fill is red so the crossfade from darkblue never desaturates below the
# "drawn" threshold mid-transition.
maplamina(grid) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 6) |>
  add_views(view("big", radius = 14), view("plain", fill_color = "red"), duration = 1500) |>
  save("circles-views-omit")

# V6: constant fill in one view, formula fill in the other; fill must survive the end of the
# first transition.
maplamina(g2) |>
  add_circles(stroke = TRUE, color = "black", fill_opacity = 1, radius = 10) |>
  add_views(
    view("const", fill_color = "darkred"),
    view("formula", fill_color = ~ifelse(x < 5, "darkblue", "darkgreen"), color = ~ifelse(x < 5, "blue", "green")),
    duration = 1500
  ) |>
  save("circles-views-formula-fill")

# V4: line width omitted in the first view; the first switch must animate width.
seg <- function(x0, y0, x1, y1) sf::st_linestring(rbind(c(x0, y0), c(x1, y1)))
lines_sf <- sf::st_sf(
  name = c("a", "b"),
  geometry = sf::st_sfc(seg(-0.03, 51.5, 0.03, 51.5), seg(-0.03, 51.52, 0.03, 51.52), crs = 4326)
)
maplamina(lines_sf) |>
  add_lines(color = "darkblue", width = 300, width_units = "meters") |>
  add_views(view("thin", color = "tomato"), view("thick", color = "darkblue", width = 900), duration = 1500) |>
  save("lines-views-width")

# F3: two circle layers with disjoint categories bound to one select filter.
ga <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.49, cat = c("A", "B", "C"))
gb <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.51, cat = c("P", "Q", "P"))
maplamina() |>
  add_circles(ga, stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10) |>
  add_filters(filter_select(~cat), bind = "filters") |>
  add_circles(gb, stroke = FALSE, fill_color = "darkred", fill_opacity = 1, radius = 10) |>
  add_filters(filter_select(~cat), bind = "filters") |>
  save("circles-bound-select")

# F4 and G2: multipolygon parts follow their row's value under a range filter and views.
sq <- function(x0, y0, s = 0.008) sf::st_polygon(list(rbind(c(x0, y0), c(x0 + s, y0), c(x0 + s, y0 + s), c(x0, y0 + s), c(x0, y0))))
polys <- sf::st_sf(
  value = c(1, 5),
  geometry = sf::st_sfc(
    sf::st_multipolygon(list(sq(-0.03, 51.49), sq(0.02, 51.49))),
    sq(-0.005, 51.51),
    crs = 4326
  )
)
maplamina(polys) |>
  add_polygons(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  add_views(view("byvalue", fill_color = ~ifelse(value < 3, "darkred", "darkgreen")), view("flat", fill_color = "darkblue"), duration = 1500) |>
  add_filters(filter_range(~value)) |>
  save("polygons-multipart")

# G1: a square with a square hole next to a square without one.
outer <- rbind(c(-0.03, 51.49), c(-0.01, 51.49), c(-0.01, 51.51), c(-0.03, 51.51), c(-0.03, 51.49))
hole  <- rbind(c(-0.025, 51.495), c(-0.015, 51.495), c(-0.015, 51.505), c(-0.025, 51.505), c(-0.025, 51.495))
holes_sf <- sf::st_sf(
  name = c("with_hole", "without"),
  geometry = sf::st_sfc(sf::st_polygon(list(outer, hole)), sq(0.01, 51.49, 0.02), crs = 4326)
)
maplamina(holes_sf) |>
  add_polygons(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  save("polygons-hole")

# G3: a layer with exactly one polygon.
maplamina(sf::st_sf(name = "only", geometry = sf::st_sfc(sq(-0.01, 51.49, 0.02), crs = 4326))) |>
  add_polygons(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  save("polygon-single")

# G4: longitudes beyond 180 (Fiji, as in the quakes data) must stay visible when zoomed in.
dateline <- data.frame(lon = c(178.5, 181.0, 183.5), lat = c(-18, -18, -18))
maplamina(dateline) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10) |>
  save("circles-dateline")

# Same points plus one far to the north, so the extent is too wide for the offsets mode.
maplamina(rbind(dateline, data.frame(lon = 181, lat = 20))) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10) |>
  save("circles-dateline-wide")

# T1: popups on a circle layer; two features so a second click can open a second popup.
two <- data.frame(lon = c(-0.02, 0.02), lat = c(51.5, 51.5), name = c("alpha", "beta"), v = c(1.5, 2.5))
maplamina(two) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 12,
              tooltip = tmpl("{name} {v:.1f}"), popup = tmpl("P {name}")) |>
  save("tooltips-circles")

# T7: column values holding markup are shown literally in text and html templates alike;
# only the html template's own tags become elements.
esc <- data.frame(lon = c(-0.02, 0.02), lat = 51.5, name = c("a<b & c", "a<b & c"))
maplamina(esc) |>
  add_circles(esc[1, ], stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 12,
              tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  add_circles(esc[2, ], stroke = FALSE, fill_color = "darkred", fill_opacity = 1, radius = 12,
              tooltip = tmpl("<b>{name}</b>", html = TRUE), popup = tmpl("<b>P {name}</b>", html = TRUE)) |>
  save("tooltips-escaping")

# T2: tooltip and popup on every layer type, one row per band of latitude. The two polygons
# touch along x = 0 so hovering their shared edge exercises the stroke-edge pick.
tt_points <- data.frame(lon = c(-0.02, 0.02), lat = 51.52, name = c("circle-a", "circle-b"))
tt_icons <- data.frame(lon = c(-0.02, 0.02), lat = 51.53, name = c("icon-a", "icon-b"))
tt_markers <- data.frame(lon = c(-0.02, 0.02), lat = 51.54, name = c("marker-a", "marker-b"))
tt_lines <- sf::st_sf(
  name = c("line-a", "line-b"),
  geometry = sf::st_sfc(seg(-0.03, 51.505, 0.03, 51.505), seg(-0.03, 51.51, 0.03, 51.51), crs = 4326)
)
tt_polys <- sf::st_sf(
  name = c("poly-a", "poly-b"),
  geometry = sf::st_sfc(sq(-0.03, 51.48, 0.03), sq(0, 51.48, 0.03), crs = 4326)
)
maplamina() |>
  add_polygons(tt_polys, color = "black", width = 3, fill_color = "darkblue", fill_opacity = 1,
               tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  add_lines(tt_lines, color = "darkred", width = 6, tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  add_circles(tt_points, stroke = FALSE, fill_color = "darkgreen", fill_opacity = 1, radius = 10,
              tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  add_icons(tt_icons, size = 24, color = "purple", tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  add_markers(tt_markers, size = 24, color = "orange", tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
  save("tooltips-layers")

# S2, T5: two widgets stacked on one page with identical bind names, different data and
# templates. Full width keeps the control panel clear of the features.
page_widget <- function(d, fill) {
  maplamina(d, width = 780, height = 290) |>
    add_circles(stroke = FALSE, fill_color = fill, fill_opacity = 1, radius = 12,
                tooltip = tmpl("{name}"), popup = tmpl("P {name}")) |>
    add_views(view("big", radius = 12), view("small", radius = 4), duration = 1) |>
    add_filters(filter_select(~name))
}
w1 <- page_widget(data.frame(lon = c(-0.02, 0.02), lat = 51.5, name = c("alpha", "beta")), "darkblue")
w2 <- page_widget(data.frame(lon = c(-0.02, 0.02), lat = 51.5, name = c("gamma", "delta")), "darkred")
save_page(htmltools::tags$div(style = "display:flex;flex-direction:column;gap:8px", w1, w2), "page-two-widgets")

# S1: a widget rendered inside a display:none wrapper, shown later by the test.
w_hidden <- maplamina(grid, width = 600, height = 400) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10)
save_page(htmltools::tagList(
  htmltools::tags$div(id = "wrap", style = "display:none", w_hidden),
  htmltools::tags$script("window.showMap = function () { document.getElementById('wrap').style.display = ''; };")
), "page-hidden")

# V8: two circle layers on one views control; the second layer lacks the "only-a" view and
# must fall back to its base radius when that view is active.
va <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.51)
vb <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.49)
maplamina() |>
  add_circles(va, stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 5) |>
  add_views(view("grow", radius = 12), view("only-a", radius = 12), duration = 1, bind = "views") |>
  add_circles(vb, stroke = FALSE, fill_color = "darkred", fill_opacity = 1, radius = 5) |>
  add_views(view("grow", radius = 12), duration = 1, bind = "views") |>
  save("circles-two-layers-views")

# V10, F10: icon and marker layers with views on size and colour and a range filter.
ic <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.51, v = 1:3)
mk <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.49, v = 1:3)
maplamina() |>
  add_icons(ic, icon = "circle", size = 16, color = "darkblue", tooltip = tmpl("icon {v}")) |>
  add_views(view("small", size = 16, color = "darkblue"), view("big", size = 40, color = "red"), duration = 1500, bind = "views") |>
  add_filters(filter_range(~v), bind = "filters") |>
  add_markers(mk, size = 24, color = "darkgreen") |>
  add_views(view("small", size = 24), view("big", size = 48), duration = 1500, bind = "views") |>
  add_filters(filter_range(~v), bind = "filters") |>
  save("icons-markers-views")

# V11: polygon fill colour animates between views.
maplamina(sf::st_sf(name = "one", geometry = sf::st_sfc(sq(-0.01, 51.49, 0.02), crs = 4326))) |>
  add_polygons(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  add_views(view("blue", fill_color = "darkblue"), view("red", fill_color = "red"), duration = 1500) |>
  save("polygons-views-fill")

# V16: a layer whose base fill is a colour scale; a view sets a constant fill.
sc <- sf::st_sf(name = c("a", "b"), v = c(1, 9),
                geometry = sf::st_sfc(sq(-0.01, 51.49, 0.02), sq(0.03, 51.49, 0.02), crs = 4326))
maplamina(sc) |>
  add_polygons(stroke = FALSE, fill_color = color_bin(~v, palette = c("darkblue", "navy"), bins = 2), fill_opacity = 1) |>
  add_views(view("scale", fill_color = color_bin(~v, palette = c("darkblue", "navy"), bins = 2)),
            view("flat", fill_color = "red"), duration = 1500) |>
  save("polygons-scale-views-constant")

# T3, T4: a template with no placeholders, and a constant string column.
const <- data.frame(lon = c(-0.02, 0.02), lat = 51.5, label = c("constant text", "constant text"))
maplamina(const) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 12,
              tooltip = tmpl("plain tooltip"), popup = tmpl("{label}")) |>
  save("tooltips-constant")

# V9: two layers on separate views binds; a switch on the second must not restart the
# first's in-flight transition.
maplamina() |>
  add_circles(va, stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 4) |>
  add_views(view("small", radius = 4), view("big", radius = 14), duration = 1500, bind = "views_a") |>
  add_circles(vb, stroke = FALSE, fill_color = "darkred", fill_opacity = 1, radius = 4) |>
  add_views(view("small", radius = 4), view("big", radius = 14), duration = 1500, bind = "views_b") |>
  save("circles-independent-views")

# F12: filter labels containing "/" and spaces.
lab <- g2
lab$`speed / rate` <- lab$x
lab$`colour group` <- lab$col
maplamina(lab) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10) |>
  add_filters(filter_range(~`speed / rate`), filter_select(~`colour group`)) |>
  save("circles-filter-labels")

# C5: a panel in the bottom-right corner and a standalone views control in the top-right.
maplamina() |>
  add_circles(va, stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 5) |>
  add_views(view("small", radius = 5), view("big", radius = 12), duration = 1, bind = "views") |>
  add_circles(vb, stroke = FALSE, fill_color = "darkred", fill_opacity = 1, radius = 5) |>
  add_views(view("small", radius = 5), view("big", radius = 12), duration = 1, bind = "views_b", position = "topright") |>
  add_panel(title = "Panel", position = "bottomright", sections = sections(section("views"))) |>
  save("panel-corners")

# C6, C9: a panel icon given as a relative path; the file sits beside the page.
writeLines(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>',
  file.path(out_dir, "panel-icon.svg")
)
maplamina(va) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 5) |>
  add_views(view("small", radius = 5), view("big", radius = 12), duration = 1, bind = "views") |>
  add_panel(title = "Panel", icon = "panel-icon.svg", sections = sections(section("views"))) |>
  save("panel-icon-relative")

# G12: an icon sized in meters shrinks when zooming out; one sized in pixels does not.
im <- data.frame(lon = -0.02, lat = 51.5)
ip <- data.frame(lon = 0.02, lat = 51.5)
maplamina() |>
  add_icons(im, icon = "circle", size = 600, size_units = "meters", color = "darkblue") |>
  add_icons(ip, icon = "circle", size = 40, size_units = "pixels", color = "darkred") |>
  save("icons-size-units")

# C8: summaries count rows, not parts, on multipart geometry.
sm <- sf::st_sf(
  v = c(10, 1),
  geometry = sf::st_sfc(
    sf::st_multipolygon(list(sq(-0.03, 51.49), sq(0.02, 51.49))),
    sq(-0.005, 51.51),
    crs = 4326
  )
)
maplamina(sm) |>
  add_polygons(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1) |>
  add_filters(filter_range(~v), bind = "filters") |>
  add_summaries(summary_count(label = "n"), summary_sum(~v, label = "sum"), summary_mean(~v, label = "mean", digits = 1),
                summary_min(~v, label = "min"), bind = "summaries") |>
  save("polygons-multipart-summaries")

# F14: a range filter whose domain includes 0 never shows the NA row.
na <- data.frame(lon = c(-0.02, 0, 0.02), lat = 51.5, v = c(-1, NA, 1))
maplamina(na) |>
  add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 10) |>
  add_filters(filter_range(~v), bind = "filters") |>
  add_summaries(summary_count(label = "n"), bind = "summaries") |>
  save("circles-range-na")

# C3, C7: one legend group holding a categorical legend (a circle and an icon shape) and a
# continuous legend shown for view "b"; a second group whose only legend is shown for view
# "b" of layer "pts". Standalone, then the same inside a panel.
legends_map <- function() {
  maplamina(va) |>
    add_circles(stroke = FALSE, fill_color = "darkblue", fill_opacity = 1, radius = 5, id = "pts") |>
    add_views(view("a", radius = 5), view("b", radius = 12), duration = 1, bind = "views") |>
    add_legend(title = "Kind", type = "categorical", values = c("low", "high"),
               colors = c("darkblue", "red"), shapes = c("circle", "geo_alt_fill"), bind = "lg") |>
    add_legend(title = "Scale", type = "continuous", range = c(0, 10), breaks = c(0, 5, 10),
               labels = c("0", "5", "10"), gradient = c("white", "red"), view = "b", bind = "lg") |>
    add_legend(title = "Gated", type = "categorical", values = "only", colors = "green",
               layer = "pts", view = "b", bind = "solo", position = "bottomright")
}
legends_map() |>
  save("legends-views")

legends_map() |>
  add_panel(title = "Panel", sections = sections(section("views"), section("lg"), section("solo"))) |>
  save("legends-panel")
