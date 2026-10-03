// A layer as the runtime holds it: a clone of the spec layer that hydration writes decoded
// arrays into.

import type { GpuFiltering, GpuMeta } from '../filters/runtime';
import type { LayerType, Units } from './spec-types';

export type TypedArray = Float32Array | Uint32Array | Uint8Array;
export type RgbaTuple = [number, number, number, number];

export type Href =
  | string
  | { readonly href?: string | { readonly data?: string }; data?: string };

export interface BlobState {
  dtype: string;
  href: Href;
  length?: number;
  size?: number;
  __array?: TypedArray;
}

export interface DataStoreState {
  blobs?: Record<string, BlobState>;
  refs?: Record<string, string>;
}

// Anything resolveRefOrHref() can turn into an array: a ref into the data store, a direct
// href, or either of those wrapped in `values` or `value`.
export interface RefNode {
  ref?: string;
  href?: Href;
  dtype?: string;
  size?: number;
  array?: TypedArray;
  values?: RefNode;
  value?: RefNode;
}

export interface ResolvedArray {
  array: TypedArray;
  dtype: string;
  size: number | undefined;
  blobId?: string;
}

export interface PositionColumnState extends RefNode {
  array?: TypedArray;
}

export interface PathColumnState {
  positions: RefNode;
  path_starts: RefNode;
  length?: number;
  size?: number;
  positions_array?: TypedArray;
  path_starts_array?: TypedArray;
}

export interface PolygonColumnState {
  positions: RefNode;
  ring_starts: RefNode;
  poly_starts: RefNode;
  length?: number;
  size?: number;
  positions_array?: TypedArray;
  ring_starts_array?: TypedArray;
  poly_starts_array?: TypedArray;
}

export interface NumericColumnState extends RefNode {
  array?: TypedArray;
}

export interface ColorColumnState extends RefNode {
  encoding?: 'dict';
  dict_rgba?: RefNode;
  dict?: RefNode;
  codes?: RefNode;
  dict_array?: TypedArray | null;
  codes_array?: TypedArray | null;
}

export interface DataColumnsState {
  position?: PositionColumnState;
  path?: PathColumnState;
  polygon?: PolygonColumnState;
  feature_index?: RefNode;
  feature_index_array?: TypedArray | null;
  radius?: NumericColumnState;
  lineWidth?: NumericColumnState;
  size?: NumericColumnState;
  elevation?: NumericColumnState;
  fillColor?: ColorColumnState;
  lineColor?: ColorColumnState;
}

export interface NumericEncodingState {
  value?: number | RefNode | null;
  value_array?: TypedArray | null;
}

export interface ColorEncodingState {
  value?: RgbaTuple | null;
  encoding?: 'dict';
  dict_rgba?: RefNode;
  dict?: RefNode;
  codes?: RefNode;
  dict_array?: TypedArray | null;
  codes_array?: TypedArray | null;
}

export interface EncodingsState {
  radius?: NumericEncodingState;
  lineWidth?: NumericEncodingState;
  size?: NumericEncodingState;
  elevation?: NumericEncodingState;
  opacity?: NumericEncodingState;
  fillColor?: ColorEncodingState;
  lineColor?: ColorEncodingState;
}

export type NumericColumnKey = 'radius' | 'lineWidth' | 'size' | 'elevation';
export type ColorEncodingKey = 'fillColor' | 'lineColor';

export interface LayerCfgState {
  pickable?: boolean;
  stroke?: boolean;
  radiusUnits?: Units;
  radiusMinPixels?: number;
  radiusMaxPixels?: number;
  lineWidthUnits?: Units;
  lineWidthMinPixels?: number;
  lineWidthMaxPixels?: number;
  widthUnits?: Units;
  widthMinPixels?: number;
  widthMaxPixels?: number;
  elevationScale?: number;
  icon?: string;
  iconAnchor?: [number, number];
  iconSize?: number;
  iconStroke?: string;
  sizeUnits?: Units;
  sizeMinPixels?: number;
  sizeMaxPixels?: number;
  mask?: boolean;
  occlude?: boolean;
  fillScale?: number;
  strokeDarken?: number;
}

// A template placeholder; hydration writes the underscore fields.
export interface PlaceholderState {
  kind?: string;
  name: string;
  fmt?: string;
  value?: RefNode | TypedArray;
  values?: RefNode | TypedArray;
  ref?: string | RefNode;
  href?: string | RefNode;
  codes?: RefNode | TypedArray;
  dict?: string | string[] | { values?: string[] } | null;
  _kind?: string;
  _array?: TypedArray;
  _codes?: TypedArray | null;
  _dict?: string[];
}

export interface TemplateState {
  type: 'template';
  template: string;
  html?: boolean;
  placeholders?: PlaceholderState[];
}

export interface TransitionEntry {
  duration?: number;
  delay?: number;
  easing?: (t: number) => number;
  onEnd?: () => void;
  onInterrupt?: () => void;
}

// By deck.gl prop name; a bare number is a duration.
export type TransitionsMap = Record<string, TransitionEntry | number>;

// What the runtime assembly attaches to a layer before it is built.
export interface RenderFields {
  transitions?: TransitionsMap;
  gpuFiltering?: GpuFiltering;
  gpuMeta?: GpuMeta;
  forceHidden?: boolean;
}

export interface LayerState {
  id: string | null;
  type: LayerType;
  group?: string | null;
  bbox?: readonly number[];
  coordinate_origin?: readonly number[] | null;
  tooltip?: TemplateState | null;
  popup?: TemplateState | null;
  dataStore?: DataStoreState;
  data_columns?: DataColumnsState;
  base_encodings?: EncodingsState;
  cfg?: LayerCfgState;
  __render?: RenderFields;
  __warns?: string[];
}

// What pushWarn() needs of a layer.
export type WarnTarget = Pick<LayerState, 'id' | '__warns'>;
