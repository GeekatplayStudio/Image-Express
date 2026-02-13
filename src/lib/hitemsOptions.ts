export const HITEMS_MODEL_OPTIONS = [
  { value: 'hitem3dv1.5', label: 'General v1.5' },
  { value: 'hitem3dv2.0', label: 'General v2.0' },
  { value: 'scene-portraitv1.5', label: 'Portrait v1.5' },
  { value: 'scene-portraitv2.0', label: 'Portrait v2.0' },
  { value: 'scene-portraitv2.1', label: 'Portrait v2.1' },
] as const;

export const HITEMS_REQUEST_TYPE_OPTIONS = [
  { value: '3', label: 'All-in-One (Geometry + Texture)' },
  { value: '1', label: 'Geometry Only (Relief/Base Mesh)' },
  { value: '2', label: 'Texture Existing Mesh (Staged)' },
] as const;

export const HITEMS_FORMAT_OPTIONS = [
  { value: '2', label: 'GLB (Best for in-app preview)' },
  { value: '1', label: 'OBJ' },
  { value: '3', label: 'STL' },
  { value: '4', label: 'FBX' },
  { value: '5', label: 'USDZ' },
] as const;

export type HitemsModel = (typeof HITEMS_MODEL_OPTIONS)[number]['value'];
export type HitemsRequestType = (typeof HITEMS_REQUEST_TYPE_OPTIONS)[number]['value'];
export type HitemsFormat = (typeof HITEMS_FORMAT_OPTIONS)[number]['value'];
export type HitemsResolution = '512' | '1024' | '1536' | '1536pro';

export type HitemsSelection = {
  model: HitemsModel;
  requestType: HitemsRequestType;
  resolution: HitemsResolution;
  format: HitemsFormat;
  face: string;
  meshUrl: string;
};

export type HitemsSelectionInput = {
  model?: string | null;
  requestType?: string | null;
  resolution?: string | null;
  format?: string | null;
  face?: string | number | null;
  meshUrl?: string | null;
};

export const DEFAULT_HITEMS_MODEL: HitemsModel = 'hitem3dv1.5';
export const DEFAULT_HITEMS_REQUEST_TYPE: HitemsRequestType = '3';
export const DEFAULT_HITEMS_FORMAT: HitemsFormat = '2';
export const DEFAULT_HITEMS_RESOLUTION: HitemsResolution = '1024';

const HITEMS_MODEL_VALUES = new Set<string>(HITEMS_MODEL_OPTIONS.map((option) => option.value));
const HITEMS_REQUEST_TYPE_VALUES = new Set<string>(HITEMS_REQUEST_TYPE_OPTIONS.map((option) => option.value));
const HITEMS_FORMAT_VALUES = new Set<string>(HITEMS_FORMAT_OPTIONS.map((option) => option.value));

const HITEMS_MODEL_RESOLUTIONS: Record<HitemsModel, readonly HitemsResolution[]> = {
  'hitem3dv1.5': ['512', '1024', '1536', '1536pro'],
  'hitem3dv2.0': ['1536', '1536pro'],
  'scene-portraitv1.5': ['1536'],
  'scene-portraitv2.0': ['1536pro'],
  'scene-portraitv2.1': ['1536pro'],
};

const HITEMS_DEFAULT_RESOLUTION_BY_MODEL: Record<HitemsModel, HitemsResolution> = {
  'hitem3dv1.5': '1024',
  'hitem3dv2.0': '1536',
  'scene-portraitv1.5': '1536',
  'scene-portraitv2.0': '1536pro',
  'scene-portraitv2.1': '1536pro',
};

const HITEMS_TEXTURE_STAGE_UNSUPPORTED = new Set<HitemsModel>(['hitem3dv2.0', 'scene-portraitv2.0', 'scene-portraitv2.1']);

export const HITEMS_PRESET_OPTIONS = [
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'General model, 1024, geometry + texture.',
    selection: {
      model: 'hitem3dv1.5',
      requestType: '3',
      resolution: '1024',
      format: '2',
    },
  },
  {
    key: 'segmentation',
    label: 'Segmentation',
    description: 'General v2.0 segmentation-aware workflow.',
    selection: {
      model: 'hitem3dv2.0',
      requestType: '3',
      resolution: '1536',
      format: '2',
    },
  },
  {
    key: 'relief',
    label: '3D Relief',
    description: 'Geometry-focused output for relief/base mesh use.',
    selection: {
      model: 'hitem3dv1.5',
      requestType: '1',
      resolution: '1024',
      format: '2',
    },
  },
  {
    key: 'portrait',
    label: 'Portrait',
    description: 'Portrait model for face-focused generation.',
    selection: {
      model: 'scene-portraitv2.1',
      requestType: '3',
      resolution: '1536pro',
      format: '2',
    },
  },
] as const;

export type HitemsPresetKey = (typeof HITEMS_PRESET_OPTIONS)[number]['key'];

const HITEMS_PRESET_VALUES = new Set<string>(HITEMS_PRESET_OPTIONS.map((preset) => preset.key));

export const normalizeHitemsModel = (model: string | null | undefined): HitemsModel => {
  if (!model || !HITEMS_MODEL_VALUES.has(model)) return DEFAULT_HITEMS_MODEL;
  return model as HitemsModel;
};

export const getHitemsAllowedResolutions = (model: string): HitemsResolution[] => {
  const normalizedModel = normalizeHitemsModel(model);
  return [...HITEMS_MODEL_RESOLUTIONS[normalizedModel]];
};

export const getDefaultHitemsResolution = (model: string): HitemsResolution => {
  const normalizedModel = normalizeHitemsModel(model);
  return HITEMS_DEFAULT_RESOLUTION_BY_MODEL[normalizedModel];
};

export const hitemsSupportsTextureStage = (model: string) => {
  const normalizedModel = normalizeHitemsModel(model);
  return !HITEMS_TEXTURE_STAGE_UNSUPPORTED.has(normalizedModel);
};

export const normalizeHitemsRequestType = (
  model: string,
  requestType: string | null | undefined
): HitemsRequestType => {
  if (!requestType || !HITEMS_REQUEST_TYPE_VALUES.has(requestType)) {
    return DEFAULT_HITEMS_REQUEST_TYPE;
  }
  if (requestType === '2' && !hitemsSupportsTextureStage(model)) {
    return DEFAULT_HITEMS_REQUEST_TYPE;
  }
  return requestType as HitemsRequestType;
};

export const normalizeHitemsResolution = (
  model: string,
  resolution: string | null | undefined
): HitemsResolution => {
  const normalizedModel = normalizeHitemsModel(model);
  const allowed = HITEMS_MODEL_RESOLUTIONS[normalizedModel];
  if (!resolution) return getDefaultHitemsResolution(normalizedModel);
  if (allowed.includes(resolution as HitemsResolution)) {
    return resolution as HitemsResolution;
  }
  return getDefaultHitemsResolution(normalizedModel);
};

export const normalizeHitemsFormat = (format: string | null | undefined): HitemsFormat => {
  if (!format || !HITEMS_FORMAT_VALUES.has(format)) return DEFAULT_HITEMS_FORMAT;
  return format as HitemsFormat;
};

export const normalizeHitemsFace = (face: string | number | null | undefined): string | null => {
  if (face === null || face === undefined) return null;
  const value = String(face).trim();
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 100000 || numeric > 2000000) return null;
  return String(numeric);
};

export const hitemsRequiresMeshUrl = (requestType: string) => requestType === '2';

const normalizeMeshUrl = (requestType: HitemsRequestType, meshUrl: string | null | undefined) => {
  if (!hitemsRequiresMeshUrl(requestType)) return '';
  return (meshUrl || '').trim();
};

export const normalizeHitemsSelection = (selection: HitemsSelectionInput): HitemsSelection => {
  const model = normalizeHitemsModel(selection.model);
  const requestType = normalizeHitemsRequestType(model, selection.requestType);
  const resolution = normalizeHitemsResolution(model, selection.resolution);
  const format = normalizeHitemsFormat(selection.format);
  const face = normalizeHitemsFace(selection.face) || '';
  const meshUrl = normalizeMeshUrl(requestType, selection.meshUrl);
  return { model, requestType, resolution, format, face, meshUrl };
};

export const isHitemsPresetKey = (key: string | null | undefined): key is HitemsPresetKey =>
  Boolean(key && HITEMS_PRESET_VALUES.has(key));

export const getHitemsPreset = (key: string | null | undefined) => {
  if (!isHitemsPresetKey(key)) return null;
  return HITEMS_PRESET_OPTIONS.find((preset) => preset.key === key) as (typeof HITEMS_PRESET_OPTIONS)[number];
};

export const applyHitemsPreset = (
  key: string | null | undefined,
  currentSelection: HitemsSelectionInput = {}
): HitemsSelection => {
  const preset = getHitemsPreset(key);
  if (!preset) return normalizeHitemsSelection(currentSelection);
  return normalizeHitemsSelection({
    ...currentSelection,
    ...preset.selection,
    face: '',
    meshUrl: '',
  });
};

export const getMatchingHitemsPresetKey = (selection: HitemsSelectionInput): HitemsPresetKey | null => {
  const normalized = normalizeHitemsSelection(selection);
  const match = HITEMS_PRESET_OPTIONS.find((preset) => {
    const target = normalizeHitemsSelection(preset.selection);
    return (
      normalized.model === target.model &&
      normalized.requestType === target.requestType &&
      normalized.resolution === target.resolution &&
      normalized.format === target.format
    );
  });
  return match ? match.key : null;
};
