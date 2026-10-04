// The widget's root element and what the runtime keeps on it.

import type { Layer } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { BuildCache } from '../layers/utils';
import type { RuntimeDeps } from '../runtime/api';
import type { DeferredFitManager, MapLibreControls, ProjectionManager } from '../runtime/map';
import type { MotionPolicy, TransitionTokens } from '../runtime/motion';
import type { PipelineDeps } from '../runtime/pipeline';
import type { Invalidation, RenderJob, ScheduleOptions, SchedulerState } from '../runtime/scheduler';
import type { LayerState, TransitionsMap } from './layer-state';
import type {
  Control,
  RangeComponent,
  RangeFilterControl,
  SelectComponent,
  SelectFilterControl,
  Spec
} from './spec-types';

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

// What the last build of a layer was asked for.
export interface LayerEntryMeta {
  lastReason?: string | null;
  lastMotionPolicy?: MotionPolicy | null;
  lastInvalidation?: Invalidation | null;
}

// A layer as the runtime keeps it between builds.
export interface LayerEntry {
  logical?: LayerState | null;
  cache?: { lastRenderState?: LayerState | null };
  runtime?: LayerEntryMeta;
}

export interface WidgetRuntime {
  specRef: Spec | null;
  layers: Map<string, LayerEntry>;
  // Written by runtime/api and filters/runtime alone, which take the runtime as WritableRuntime.
  readonly state: {
    readonly views?: Readonly<Record<string, string>>;
    readonly filters?: Readonly<Record<string, Readonly<Record<string, FilterValue>>>>;
  };
  _renderEpoch: number;
  _mfApiDeps: RuntimeDeps;
  _mfPipelineDeps?: PipelineDeps;
  _sched?: SchedulerState;
  _filterIndex?: FilterIndex | null;
  _filtersGroupIds?: string[];
  _defaultFiltersGroupId?: string | null;
  // The view each group showed before the switch being built, by group id.
  _viewsPrev?: Record<string, string | null>;
  // By layer id. Written by runtime/motion alone.
  readonly _layerTransitions?: Map<string, Readonly<TransitionsMap>>;
  readonly _transitionTokens?: Map<string, Readonly<TransitionTokens>>;
  _transitionTokenSeq?: number;
  _maplibreControls?: MapLibreControls;
  _projectionMgr?: ProjectionManager | null;
  _mfDeferredFitMgr?: DeferredFitManager;
  __mfPipelineAttached?: boolean;
  __mfApiMethodsAttached?: boolean;
  buildLayer?(st: LayerState): Layer | Layer[] | null;
  schedule?(opts?: ScheduleOptions | null): Promise<void>;
  _flushSnapshot?(job: RenderJob): Promise<void>;
  getLayerEntry?(layerId: unknown): LayerEntry | null;
  getLogicalLayerState?(layerId: unknown): LayerState | null;
  getLastRenderState?(layerId: unknown): LayerState | null;
  getLastMotionPolicy?(layerId: unknown): MotionPolicy | null;
  invalidate?(opts?: ScheduleOptions | null): Promise<void>;
  // With one argument, the view for the first views group.
  setActiveView?(groupId: string, newView?: string): void;
  rebuildLayers?(layerIds: ScheduleOptions['layers']): Promise<void> | undefined;
  // With two arguments, a label and a value for the default filters group.
  setFilter?: {
    (label: string, value: Set<string> | number[]): void;
    (groupId: string, label: string, value: Set<string> | number[]): void;
  };
  clearFilters?(groupId?: unknown): void;
}

// The runtime as the writers of its state and its transition maps declare it.
export type WritableRuntime = Omit<WidgetRuntime, 'state' | '_layerTransitions' | '_transitionTokens'> & {
  state: RuntimeState;
  _layerTransitions?: Map<string, TransitionsMap>;
  _transitionTokens?: Map<string, TransitionTokens>;
};

// A control group as the panel mounted it: the node its renderer drew into and its spec.
export interface MountedControl {
  mountEl: HTMLElement | null;
  controlSpec: Control | null | undefined;
}

export interface WidgetElement extends HTMLElement {
  __mfGetMap?: () => MapLibreMap | null;
  __mfRuntime?: WidgetRuntime | null;
  __mlMountedControls?: Record<string, MountedControl>;
  __mfCtxCache?: BuildCache;
  __mfHudNode?: HTMLElement | null;
  _mfDeferredFitMgr?: DeferredFitManager;
}
