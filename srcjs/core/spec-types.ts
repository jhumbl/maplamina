// The spec the R compiler emits, as it arrives in renderValue(). htmlwidgets serialises it
// with auto_unbox, so an empty R list() arrives as [] and a length-1 vector as a scalar.

export type EmptyList = readonly [];
export type WireMap<T> = Readonly<Record<string, T>> | EmptyList;
export type OneOrMany<T> = T | readonly T[];

export type Corner = 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
export type Units = 'pixels' | 'meters' | 'common';
export type Rgba = readonly [number, number, number, number];

// ---- data store ----

export interface Ref {
  readonly ref: string;
}

export type BlobDtype = 'f32' | 'u32' | 'u8';

export interface Blob {
  readonly dtype: BlobDtype;
  readonly href: { readonly data: string };
  readonly length: number;
  readonly size?: number;
}

export interface DataStore {
  readonly blobs: Readonly<Record<string, Blob>>;
  readonly refs: Readonly<Record<string, string>>;
}

// ---- layer columns and encodings ----

export interface PositionColumn {
  readonly values: Ref;
  readonly size: number;
}

export interface PathColumn {
  readonly positions: Ref;
  readonly path_starts: Ref;
  readonly length: number;
  readonly size: number;
}

export interface PolygonColumn {
  readonly positions: Ref;
  readonly ring_starts: Ref;
  readonly poly_starts: Ref;
  readonly length: number;
  readonly size: number;
}

export interface FeatureIndexColumn {
  readonly values: Ref;
}

export interface NumericColumn {
  readonly values: Ref;
}

export interface DictColorColumn {
  readonly encoding: 'dict';
  readonly dict_rgba: Ref;
  readonly codes: Ref;
}

export interface RgbaColumn {
  readonly values: Ref;
  readonly size: 4;
}

export type ColorColumn = DictColorColumn | RgbaColumn;

export interface NumericValue {
  readonly value: number;
}

export interface ColorValue {
  readonly value: Rgba;
}

// ---- tooltip and popup templates ----

export interface NumericPlaceholder {
  readonly kind: 'numeric-u32' | 'numeric-f32' | 'epoch-u32' | 'epoch-f32';
  readonly name: string;
  readonly fmt: string;
  readonly value: Ref;
}

export interface CategoricalPlaceholder {
  readonly kind: 'categorical';
  readonly name: string;
  readonly fmt: string;
  readonly dict: OneOrMany<string>;
  readonly codes: Ref;
}

export type Placeholder = NumericPlaceholder | CategoricalPlaceholder;

export interface Template {
  readonly type: 'template';
  readonly template: string;
  readonly html: boolean;
  readonly placeholders: readonly Placeholder[];
}

// ---- layers ----

interface LayerCommon {
  readonly id: string;
  readonly group: string | null;
  readonly bbox: readonly [number, number, number, number];
  readonly coordinate_origin: readonly [number, number] | null;
  readonly tooltip?: Template;
  readonly popup?: Template;
  readonly dataStore: DataStore;
}

interface CfgCommon {
  readonly pickable: boolean;
  readonly stroke: boolean;
}

export interface CircleLayer extends LayerCommon {
  readonly type: 'circle';
  readonly data_columns: {
    readonly position: PositionColumn;
    readonly radius?: NumericColumn;
    readonly lineWidth?: NumericColumn;
    readonly fillColor?: ColorColumn;
    readonly lineColor?: ColorColumn;
  };
  readonly base_encodings: EmptyList | {
    readonly radius?: NumericValue;
    readonly lineWidth?: NumericValue;
    readonly fillColor?: ColorValue;
    readonly lineColor?: ColorValue;
  };
  readonly cfg: CfgCommon & {
    readonly radiusUnits: Units;
    readonly radiusMinPixels?: number;
    readonly radiusMaxPixels?: number;
    readonly lineWidthUnits: Units;
    readonly lineWidthMinPixels?: number;
    readonly lineWidthMaxPixels?: number;
  };
}

export interface LineLayer extends LayerCommon {
  readonly type: 'line';
  readonly data_columns: {
    readonly path: PathColumn;
    readonly feature_index: FeatureIndexColumn;
    readonly lineWidth?: NumericColumn;
    readonly lineColor?: ColorColumn;
  };
  readonly base_encodings: EmptyList | {
    readonly lineWidth?: NumericValue;
    readonly lineColor?: ColorValue;
  };
  readonly cfg: CfgCommon & {
    readonly widthUnits: Units;
    readonly widthMinPixels?: number;
    readonly widthMaxPixels?: number;
  };
}

export interface PolygonLayer extends LayerCommon {
  readonly type: 'polygon';
  readonly data_columns: {
    readonly polygon: PolygonColumn;
    readonly feature_index: FeatureIndexColumn;
    readonly lineWidth?: NumericColumn;
    readonly elevation?: NumericColumn;
    readonly fillColor?: ColorColumn;
    readonly lineColor?: ColorColumn;
  };
  readonly base_encodings: EmptyList | {
    readonly lineWidth?: NumericValue;
    readonly elevation?: NumericValue;
    readonly fillColor?: ColorValue;
    readonly lineColor?: ColorValue;
  };
  readonly cfg: CfgCommon & {
    readonly lineWidthUnits: Units;
    readonly lineWidthMinPixels?: number;
    readonly lineWidthMaxPixels?: number;
    readonly elevationScale: number;
  };
}

interface IconColumns {
  readonly position: PositionColumn;
  readonly size?: NumericColumn;
  readonly fillColor?: ColorColumn;
}

interface IconEncodings {
  readonly size?: NumericValue;
  readonly fillColor?: ColorValue;
}

interface IconCfg extends CfgCommon {
  readonly icon: string;
  readonly iconAnchor?: readonly [number, number];
  readonly sizeUnits: Units;
  readonly sizeMinPixels?: number;
  readonly sizeMaxPixels?: number;
  readonly mask: boolean;
  readonly occlude: boolean;
}

export interface IconLayer extends LayerCommon {
  readonly type: 'icon';
  readonly data_columns: IconColumns;
  readonly base_encodings: EmptyList | IconEncodings;
  readonly cfg: IconCfg;
}

export interface MarkerLayer extends LayerCommon {
  readonly type: 'marker';
  readonly data_columns: IconColumns;
  readonly base_encodings: EmptyList | IconEncodings;
  readonly cfg: IconCfg & { readonly iconStroke: string };
}

export type Layer = CircleLayer | LineLayer | PolygonLayer | IconLayer | MarkerLayer;
export type LayerType = Layer['type'];

// ---- components ----

export type Easing = 'smoothstep' | 'linear' | 'easein' | 'easeout' | 'easeinout' | 'easeInOutCubic';

export interface Motion {
  readonly duration: number;
  readonly easing: Easing;
}

export interface ViewNumericEncoding {
  readonly value: number | Ref;
}

export interface ViewDictColorEncoding extends DictColorColumn {
  readonly dict_rgba_ref_hint: string;
  readonly codes_ref_hint: string;
}

export type ViewColorEncoding = ColorValue | ViewDictColorEncoding;

export interface ViewEncodings {
  readonly radius?: ViewNumericEncoding;
  readonly size?: ViewNumericEncoding;
  readonly lineWidth?: ViewNumericEncoding;
  readonly elevation?: ViewNumericEncoding;
  readonly fillColor?: ViewColorEncoding;
  readonly lineColor?: ViewColorEncoding;
}

export interface View {
  readonly encodings: EmptyList | ViewEncodings;
}

export interface ViewsComponent {
  readonly type: 'views';
  readonly id: string;
  readonly layer: string;
  readonly bind: string;
  readonly position: Corner | null;
  readonly motion: Motion;
  readonly views: WireMap<View>;
}

export interface RangeComponent {
  readonly type: 'range';
  readonly id: string;
  readonly layer: string;
  readonly bind: string;
  readonly position: Corner | null;
  readonly label: string;
  readonly default: readonly [number, number] | null;
  readonly min: number;
  readonly max: number;
  readonly step: number | null;
  readonly live: boolean;
  readonly values: Ref;
  readonly values_ref_hint: string;
}

export interface SelectComponent {
  readonly type: 'select';
  readonly id: string;
  readonly layer: string;
  readonly bind: string;
  readonly position: Corner | null;
  readonly label: string;
  readonly multi: boolean;
  readonly dropdown: boolean | null;
  readonly searchable: boolean;
  readonly dict: readonly string[];
  readonly default: OneOrMany<string> | null;
  readonly max_levels: number | null;
  readonly freq: readonly number[];
  readonly top_indices: readonly number[];
  readonly codes: Ref;
  readonly codes_ref_hint: string;
}

export type SummaryValueOp = 'min' | 'max' | 'sum' | 'mean' | 'count_non_na';
export type SummaryOp = 'count' | SummaryValueOp;

interface SummaryFormat {
  readonly digits?: number;
  readonly prefix?: string;
  readonly suffix?: string;
}

interface SummaryCommon extends SummaryFormat {
  readonly type: 'summaries';
  readonly id: string;
  readonly layer: string;
  readonly bind: string;
  readonly position: Corner | null;
  readonly label: string;
}

export interface CountSummaryComponent extends SummaryCommon {
  readonly op: 'count';
}

export interface ValueSummaryComponent extends SummaryCommon {
  readonly op: SummaryValueOp;
  readonly na_rm: boolean;
  readonly values: Ref;
  readonly values_ref_hint: string;
}

export type SummariesComponent = CountSummaryComponent | ValueSummaryComponent;

export type LegendShape = 'circle' | 'square' | 'line' | 'icon';

export interface LegendItem {
  readonly label: string;
  readonly color: string;
  readonly shape: LegendShape;
  readonly icon?: string;
  readonly size?: number;
}

export interface CategoricalLegend {
  readonly title: string | null;
  readonly type: 'categorical';
  readonly items: readonly LegendItem[];
}

export interface ContinuousLegend {
  readonly title: string | null;
  readonly type: 'continuous';
  readonly scale: {
    readonly range: readonly [number, number];
    readonly labels: OneOrMany<string>;
    readonly breaks: OneOrMany<number> | null;
    readonly gradient: readonly string[];
  };
  readonly shape: LegendShape;
  readonly icon?: string;
  readonly size: number;
}

export type Legend = CategoricalLegend | ContinuousLegend;

export interface LegendWhen {
  readonly layer: string | null;
  readonly view: readonly string[] | null;
}

export interface LegendsComponent {
  readonly type: 'legends';
  readonly id: string;
  readonly bind: string;
  readonly position: Corner;
  readonly legend: Legend;
  readonly when: LegendWhen | null;
}

export interface Components {
  readonly views: WireMap<ViewsComponent>;
  readonly range: WireMap<RangeComponent>;
  readonly select: WireMap<SelectComponent>;
  readonly legends: WireMap<LegendsComponent>;
  readonly summaries: WireMap<SummariesComponent>;
}

export type ComponentBucket = keyof Components;

// ---- controls ----

interface ControlCommon {
  readonly position?: Corner;
}

export interface ViewsControl extends ControlCommon {
  readonly type: 'views';
  readonly members: readonly string[];
  readonly view_names: readonly string[];
  readonly default: string;
}

export interface LegendsControl extends ControlCommon {
  readonly type: 'legends';
  readonly members: readonly string[];
}

export interface RangeFilterControl {
  readonly type: 'range';
  readonly label: string;
  readonly members: readonly string[];
  readonly domain: { readonly min: number; readonly max: number };
  readonly default?: readonly [number, number];
  readonly step?: number;
  readonly live: boolean;
}

export interface SelectFilterControl {
  readonly type: 'select';
  readonly label: string;
  readonly members: readonly string[];
  readonly dict: readonly string[];
  readonly default?: OneOrMany<string>;
  readonly multi: boolean;
  readonly dropdown?: boolean;
  readonly searchable: boolean;
  readonly max_levels?: number;
  readonly freq: readonly number[];
  readonly top_indices: readonly number[];
}

export type FilterControl = RangeFilterControl | SelectFilterControl;

export interface FiltersControl extends ControlCommon {
  readonly type: 'filters';
  readonly controls: Readonly<Record<string, FilterControl>>;
  readonly order: readonly string[];
}

export interface SummaryRow extends SummaryFormat {
  readonly op: SummaryOp;
  readonly label: string;
  readonly members: readonly string[];
  readonly na_rm?: boolean;
}

export interface SummariesControl extends ControlCommon {
  readonly type: 'summaries';
  readonly rows: Readonly<Record<string, SummaryRow>>;
  readonly order: readonly string[];
}

export type Control = ViewsControl | LegendsControl | FiltersControl | SummariesControl;
export type ControlType = Control['type'];

// ---- panel and map options ----

export interface PanelSection {
  readonly id: string;
}

export interface Panel {
  readonly title: string | null;
  readonly description: string | null;
  readonly icon: string | null;
  readonly dividers: boolean;
  readonly position: Corner | null;
  readonly sections: readonly PanelSection[];
}

export type MapControlType = 'navigation' | 'scale' | 'fullscreen' | 'geolocate';

export interface MapControl {
  readonly type: MapControlType;
  readonly position: Corner;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface MapOptions {
  readonly style: string;
  readonly projection: 'mercator' | 'globe';
  readonly dragRotate: boolean;
  readonly fit_bounds: boolean;
  readonly controls: readonly MapControl[];
  // Not an argument of maplamina(); set on the widget by hand.
  readonly hud?: boolean;
}

// ---- the spec ----

export interface WireSpec {
  readonly map_options: MapOptions;
  readonly '.__layers': WireMap<Layer>;
  readonly '.__components': Components;
  readonly '.__controls': WireMap<Control>;
  readonly '.__panel': Panel | null;
}

// After renderValue() has replaced the empty top-level lists with objects.
export interface Spec extends Omit<WireSpec, '.__layers' | '.__controls'> {
  readonly '.__layers': Readonly<Record<string, Layer>>;
  readonly '.__controls': Readonly<Record<string, Control>>;
}
