// The widget's root element and what the runtime keeps on it.

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RangeComponent, RangeFilterControl, SelectComponent, SelectFilterControl } from './spec-types';

// The selected values of a select, or the [lo, hi] of a range.
export type FilterValue = Set<string> | [number, number];

// By control group id, then by filter label.
export type FiltersState = Record<string, Record<string, FilterValue>>;

export interface FilterDim<C, D> {
  groupId: string;
  label: string;
  id: string;
  comp: C;
  def: D;
}

export type SelectDim = FilterDim<SelectComponent, SelectFilterControl>;
export type RangeDim = FilterDim<RangeComponent, RangeFilterControl>;

export interface LayerFilters {
  select: SelectDim[];
  range: RangeDim[];
}

// Which layers each filter reaches; keys of byKey are `${groupId}|${label}`.
export interface FilterIndex {
  byLayer: Map<string, LayerFilters>;
  byKey: Map<string, Set<string>>;
  byGroup: Map<string, Set<string>>;
  groupIds: string[];
}

export interface RuntimeState {
  views?: Record<string, string>;
  filters?: FiltersState;
}

export interface WidgetRuntime {
  state?: RuntimeState;
  _filterIndex?: FilterIndex | null;
  _filtersGroupIds?: string[];
  _defaultFiltersGroupId?: string | null;
}

export interface WidgetElement extends HTMLElement {
  __mfGetMap?: () => MapLibreMap | null;
  __mfRuntime?: WidgetRuntime | null;
}
