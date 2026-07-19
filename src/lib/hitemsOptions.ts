export const HITEMS_MODEL_OPTIONS = [
  { value: 'hitem3dv1.5', labelKey: 'gen3d.model.general15' },
  { value: 'hitem3dv2.0', labelKey: 'gen3d.model.general20' },
  { value: 'hitem3dv2.1', labelKey: 'gen3d.model.general21' },
  { value: 'scene-portraitv1.5', labelKey: 'gen3d.model.portrait15' },
  { value: 'scene-portraitv2.0', labelKey: 'gen3d.model.portrait20' },
  { value: 'scene-portraitv2.1', labelKey: 'gen3d.model.portrait21' },
] as const;

export const HITEMS_REQUEST_TYPE_OPTIONS = [
  { value: '3', labelKey: 'gen3d.reqType.allInOne' },
  { value: '1', labelKey: 'gen3d.reqType.geometryOnly' },
  { value: '2', labelKey: 'gen3d.reqType.textureStaged' },
] as const;

export const HITEMS_FORMAT_OPTIONS = [
  { value: '2', labelKey: 'gen3d.format.glb' },
  { value: '1', labelKey: 'gen3d.format.obj' },
  { value: '3', labelKey: 'gen3d.format.stl' },
  { value: '4', labelKey: 'gen3d.format.fbx' },
  { value: '5', labelKey: 'gen3d.format.usdz' },
] as const;

export type HitemsModel = (typeof HITEMS_MODEL_OPTIONS)[number]['value'];
export type HitemsRequestType = (typeof HITEMS_REQUEST_TYPE_OPTIONS)[number]['value'];
export type HitemsFormat = (typeof HITEMS_FORMAT_OPTIONS)[number]['value'];
export type HitemsResolution = '512' | '1024' | '1536' | '1536pro' | '1536fast' | '1536profast';

export type HitemsSelection = {
  model: HitemsModel;
  requestType: HitemsRequestType;
  resolution: HitemsResolution;
  format: HitemsFormat;
  face: string;
  meshUrl: string;
  pbr: boolean;
};

export type HitemsSelectionInput = {
  model?: string | null;
  requestType?: string | null;
  resolution?: string | null;
  format?: string | null;
  face?: string | number | null;
  meshUrl?: string | null;
  pbr?: boolean | string | number | null;
};

export const DEFAULT_HITEMS_MODEL: HitemsModel = 'hitem3dv1.5';
export const DEFAULT_HITEMS_REQUEST_TYPE: HitemsRequestType = '3';
export const DEFAULT_HITEMS_FORMAT: HitemsFormat = '2';
export const DEFAULT_HITEMS_RESOLUTION: HitemsResolution = '1024';

const HITEMS_MODEL_VALUES = new Set<string>(HITEMS_MODEL_OPTIONS.map((option) => option.value));
const HITEMS_REQUEST_TYPE_VALUES = new Set<string>(HITEMS_REQUEST_TYPE_OPTIONS.map((option) => option.value));
const HITEMS_FORMAT_VALUES = new Set<string>(HITEMS_FORMAT_OPTIONS.map((option) => option.value));

// Per docs.hi3d.ai create-task: v1.5/v2.0 support 512-1536pro, v2.1 is fast/pro only.
const HITEMS_MODEL_RESOLUTIONS: Record<HitemsModel, readonly HitemsResolution[]> = {
  'hitem3dv1.5': ['512', '1024', '1536', '1536pro'],
  'hitem3dv2.0': ['512', '1024', '1536', '1536pro'],
  'hitem3dv2.1': ['1536fast', '1536pro'],
  'scene-portraitv1.5': ['1536'],
  'scene-portraitv2.0': ['1536pro'],
  'scene-portraitv2.1': ['1536profast', '1536pro'],
};

const HITEMS_DEFAULT_RESOLUTION_BY_MODEL: Record<HitemsModel, HitemsResolution> = {
  'hitem3dv1.5': '1024',
  'hitem3dv2.0': '1536',
  'hitem3dv2.1': '1536fast',
  'scene-portraitv1.5': '1536',
  'scene-portraitv2.0': '1536pro',
  'scene-portraitv2.1': '1536profast',
};

// PBR toggle is only honored by the v2.0/v2.1 model generations.
const HITEMS_PBR_SUPPORTED_MODELS = new Set<HitemsModel>([
  'hitem3dv2.0',
  'hitem3dv2.1',
  'scene-portraitv2.0',
  'scene-portraitv2.1',
]);

export const HITEMS_PRESET_OPTIONS = [
  {
    key: 'balanced',
    labelKey: 'gen3d.preset.balanced',
    descriptionKey: 'gen3d.preset.balancedDesc',
    selection: {
      model: 'hitem3dv1.5',
      requestType: '3',
      resolution: '1024',
      format: '2',
    },
  },
  {
    key: 'fast-pbr',
    labelKey: 'gen3d.preset.fastPbr',
    descriptionKey: 'gen3d.preset.fastPbrDesc',
    selection: {
      model: 'hitem3dv2.1',
      requestType: '3',
      resolution: '1536fast',
      format: '2',
    },
  },
  {
    key: 'relief',
    labelKey: 'gen3d.preset.relief',
    descriptionKey: 'gen3d.preset.reliefDesc',
    selection: {
      model: 'hitem3dv1.5',
      requestType: '1',
      resolution: '1024',
      format: '2',
    },
  },
  {
    key: 'portrait',
    labelKey: 'gen3d.preset.portrait',
    descriptionKey: 'gen3d.preset.portraitDesc',
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

// --- Image to 3D Relief (depth map) API options ---

export const HITEMS_RELIEF_FORMAT_OPTIONS = [
  { value: '2', labelKey: 'gen3d.relief.png' },
  { value: '1', labelKey: 'gen3d.relief.exr' },
] as const;

export type HitemsReliefFormat = (typeof HITEMS_RELIEF_FORMAT_OPTIONS)[number]['value'];
export const DEFAULT_HITEMS_RELIEF_FORMAT: HitemsReliefFormat = '2';

export const normalizeHitemsReliefFormat = (format: string | null | undefined): HitemsReliefFormat => (
  format === '1' ? '1' : DEFAULT_HITEMS_RELIEF_FORMAT
);

// --- Model Split API options ---

export const HITEMS_SPLIT_MODEL_OPTIONS = [
  { value: 'character', labelKey: 'gen3d.split.character' },
  { value: 'general', labelKey: 'gen3d.split.general' },
] as const;

export const HITEMS_SPLIT_PART_OPTIONS = [
  { value: 'a', labelKey: 'gen3d.partsA' },
  { value: 'b', labelKey: 'gen3d.partsB' },
  { value: 'c', labelKey: 'gen3d.partsC' },
  { value: 'd', labelKey: 'gen3d.partsD' },
  { value: 'e', labelKey: 'gen3d.partsE' },
  { value: 'f', labelKey: 'gen3d.partsF' },
] as const;

export const HITEMS_SPLIT_JOINT_OPTIONS = [
  { value: 'ball', labelKey: 'gen3d.joint.ball' },
  { value: 'dovetail', labelKey: 'gen3d.joint.dovetail' },
  { value: 'none', labelKey: 'gen3d.joint.none' },
] as const;

export const HITEMS_SPLIT_LEVEL_OPTIONS = [
  { value: 'medium', labelKey: 'gen3d.level.medium' },
  { value: 'low', labelKey: 'gen3d.level.low' },
  { value: 'high', labelKey: 'gen3d.level.high' },
] as const;

export type HitemsSplitModel = (typeof HITEMS_SPLIT_MODEL_OPTIONS)[number]['value'];
export type HitemsSplitPart = (typeof HITEMS_SPLIT_PART_OPTIONS)[number]['value'];
export type HitemsSplitJoint = (typeof HITEMS_SPLIT_JOINT_OPTIONS)[number]['value'];
export type HitemsSplitLevel = (typeof HITEMS_SPLIT_LEVEL_OPTIONS)[number]['value'];

export const DEFAULT_HITEMS_SPLIT_MODEL: HitemsSplitModel = 'character';
export const DEFAULT_HITEMS_SPLIT_PART: HitemsSplitPart = 'a';
export const DEFAULT_HITEMS_SPLIT_JOINT: HitemsSplitJoint = 'ball';
export const DEFAULT_HITEMS_SPLIT_LEVEL: HitemsSplitLevel = 'medium';

export const normalizeHitemsSplitModel = (value: string | null | undefined): HitemsSplitModel => (
  value === 'general' ? 'general' : DEFAULT_HITEMS_SPLIT_MODEL
);

export const normalizeHitemsSplitPart = (value: string | null | undefined): HitemsSplitPart => (
  HITEMS_SPLIT_PART_OPTIONS.some((option) => option.value === value)
    ? (value as HitemsSplitPart)
    : DEFAULT_HITEMS_SPLIT_PART
);

export const normalizeHitemsSplitJoint = (value: string | null | undefined): HitemsSplitJoint => (
  HITEMS_SPLIT_JOINT_OPTIONS.some((option) => option.value === value)
    ? (value as HitemsSplitJoint)
    : DEFAULT_HITEMS_SPLIT_JOINT
);

export const normalizeHitemsSplitLevel = (value: string | null | undefined): HitemsSplitLevel => (
  HITEMS_SPLIT_LEVEL_OPTIONS.some((option) => option.value === value)
    ? (value as HitemsSplitLevel)
    : DEFAULT_HITEMS_SPLIT_LEVEL
);

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

// The current API accepts request_type=2 (texture an existing mesh) for every
// model version; earlier versions of the service restricted it. The parameter
// stays so callers keep compiling if the restriction ever returns.
export const hitemsSupportsTextureStage = (model: string) => Boolean(normalizeHitemsModel(model));

export const hitemsSupportsPbr = (model: string) => (
  HITEMS_PBR_SUPPORTED_MODELS.has(normalizeHitemsModel(model))
);

export const normalizeHitemsPbr = (
  model: string,
  pbr: boolean | string | number | null | undefined
): boolean => {
  if (!hitemsSupportsPbr(model)) return false;
  if (pbr === undefined || pbr === null || pbr === '') return true;
  if (typeof pbr === 'boolean') return pbr;
  const normalized = String(pbr).trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no');
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
  const pbr = normalizeHitemsPbr(model, selection.pbr);
  return { model, requestType, resolution, format, face, meshUrl, pbr };
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
    pbr: null,
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
