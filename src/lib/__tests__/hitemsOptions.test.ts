import {
  DEFAULT_HITEMS_FORMAT,
  DEFAULT_HITEMS_MODEL,
  DEFAULT_HITEMS_REQUEST_TYPE,
  HITEMS_PRESET_OPTIONS,
  applyHitemsPreset,
  getDefaultHitemsResolution,
  getHitemsAllowedResolutions,
  getHitemsPreset,
  getMatchingHitemsPresetKey,
  hitemsRequiresMeshUrl,
  hitemsSupportsPbr,
  hitemsSupportsTextureStage,
  isHitemsPresetKey,
  normalizeHitemsFace,
  normalizeHitemsFormat,
  normalizeHitemsModel,
  normalizeHitemsPbr,
  normalizeHitemsReliefFormat,
  normalizeHitemsRequestType,
  normalizeHitemsResolution,
  normalizeHitemsSelection,
  normalizeHitemsSplitJoint,
  normalizeHitemsSplitLevel,
  normalizeHitemsSplitModel,
  normalizeHitemsSplitPart,
} from '@/lib/hitemsOptions';

describe('hitemsOptions', () => {
  it('normalizes model values including v2.1', () => {
    expect(normalizeHitemsModel('hitem3dv2.0')).toBe('hitem3dv2.0');
    expect(normalizeHitemsModel('hitem3dv2.1')).toBe('hitem3dv2.1');
    expect(normalizeHitemsModel('invalid-model')).toBe(DEFAULT_HITEMS_MODEL);
    expect(normalizeHitemsModel(null)).toBe(DEFAULT_HITEMS_MODEL);
    expect(normalizeHitemsModel(undefined)).toBe(DEFAULT_HITEMS_MODEL);
  });

  it('returns allowed and default resolutions per model', () => {
    expect(getHitemsAllowedResolutions('hitem3dv2.0')).toEqual(['512', '1024', '1536', '1536pro']);
    expect(getHitemsAllowedResolutions('hitem3dv2.1')).toEqual(['1536fast', '1536pro']);
    expect(getHitemsAllowedResolutions('scene-portraitv2.1')).toEqual(['1536profast', '1536pro']);
    expect(getHitemsAllowedResolutions('unknown')).toEqual(['512', '1024', '1536', '1536pro']);
    expect(getDefaultHitemsResolution('hitem3dv1.5')).toBe('1024');
    expect(getDefaultHitemsResolution('hitem3dv2.1')).toBe('1536fast');
    expect(getDefaultHitemsResolution('scene-portraitv2.1')).toBe('1536profast');
  });

  it('allows texture stage for all current models', () => {
    expect(hitemsSupportsTextureStage('hitem3dv1.5')).toBe(true);
    expect(hitemsSupportsTextureStage('hitem3dv2.1')).toBe(true);
    expect(hitemsSupportsTextureStage('scene-portraitv2.1')).toBe(true);
  });

  it('detects PBR support per model generation', () => {
    expect(hitemsSupportsPbr('hitem3dv1.5')).toBe(false);
    expect(hitemsSupportsPbr('scene-portraitv1.5')).toBe(false);
    expect(hitemsSupportsPbr('hitem3dv2.0')).toBe(true);
    expect(hitemsSupportsPbr('hitem3dv2.1')).toBe(true);
    expect(hitemsSupportsPbr('scene-portraitv2.0')).toBe(true);
    expect(hitemsSupportsPbr('scene-portraitv2.1')).toBe(true);
  });

  it('normalizes pbr flags with model gating', () => {
    expect(normalizeHitemsPbr('hitem3dv2.1', undefined)).toBe(true);
    expect(normalizeHitemsPbr('hitem3dv2.1', '0')).toBe(false);
    expect(normalizeHitemsPbr('hitem3dv2.1', 'false')).toBe(false);
    expect(normalizeHitemsPbr('hitem3dv2.1', true)).toBe(true);
    expect(normalizeHitemsPbr('hitem3dv1.5', true)).toBe(false);
  });

  it('normalizes request types', () => {
    expect(normalizeHitemsRequestType('hitem3dv1.5', '2')).toBe('2');
    expect(normalizeHitemsRequestType('hitem3dv2.0', '2')).toBe('2');
    expect(normalizeHitemsRequestType('hitem3dv1.5', '9')).toBe(DEFAULT_HITEMS_REQUEST_TYPE);
    expect(normalizeHitemsRequestType('hitem3dv1.5', null)).toBe(DEFAULT_HITEMS_REQUEST_TYPE);
  });

  it('normalizes resolution values with fallback', () => {
    expect(normalizeHitemsResolution('hitem3dv1.5', '512')).toBe('512');
    expect(normalizeHitemsResolution('hitem3dv2.0', '1024')).toBe('1024');
    expect(normalizeHitemsResolution('hitem3dv2.1', '512')).toBe('1536fast');
    expect(normalizeHitemsResolution('unknown', '')).toBe('1024');
    expect(normalizeHitemsResolution('scene-portraitv2.0', null)).toBe('1536pro');
    expect(normalizeHitemsResolution('scene-portraitv2.1', '1536profast')).toBe('1536profast');
  });

  it('normalizes output format values', () => {
    expect(normalizeHitemsFormat('1')).toBe('1');
    expect(normalizeHitemsFormat('invalid')).toBe(DEFAULT_HITEMS_FORMAT);
    expect(normalizeHitemsFormat('')).toBe(DEFAULT_HITEMS_FORMAT);
    expect(normalizeHitemsFormat(undefined)).toBe(DEFAULT_HITEMS_FORMAT);
  });

  it('normalizes face values with bounds', () => {
    expect(normalizeHitemsFace('100000')).toBe('100000');
    expect(normalizeHitemsFace(2000000)).toBe('2000000');
    expect(normalizeHitemsFace('099999')).toBeNull();
    expect(normalizeHitemsFace('2000001')).toBeNull();
    expect(normalizeHitemsFace('123456.7')).toBeNull();
    expect(normalizeHitemsFace('')).toBeNull();
    expect(normalizeHitemsFace(null)).toBeNull();
    expect(normalizeHitemsFace(undefined)).toBeNull();
  });

  it('detects when mesh url is required', () => {
    expect(hitemsRequiresMeshUrl('2')).toBe(true);
    expect(hitemsRequiresMeshUrl('1')).toBe(false);
    expect(hitemsRequiresMeshUrl('3')).toBe(false);
  });

  it('normalizes full selection and clears invalid combinations', () => {
    expect(
      normalizeHitemsSelection({
        model: 'hitem3dv1.5',
        requestType: '2',
        resolution: '1536',
        format: '5',
        face: '150000',
        meshUrl: '  https://example.com/in.glb  ',
      })
    ).toEqual({
      model: 'hitem3dv1.5',
      requestType: '2',
      resolution: '1536',
      format: '5',
      face: '150000',
      meshUrl: 'https://example.com/in.glb',
      pbr: false,
    });

    expect(
      normalizeHitemsSelection({
        model: 'scene-portraitv2.1',
        requestType: '3',
        resolution: '512',
        format: '99',
        face: 'abc',
        meshUrl: 'https://example.com/will-be-cleared.glb',
      })
    ).toEqual({
      model: 'scene-portraitv2.1',
      requestType: '3',
      resolution: '1536profast',
      format: '2',
      face: '',
      meshUrl: '',
      pbr: true,
    });

    expect(
      normalizeHitemsSelection({
        model: 'hitem3dv2.1',
        requestType: '3',
        pbr: '0',
      })
    ).toEqual({
      model: 'hitem3dv2.1',
      requestType: '3',
      resolution: '1536fast',
      format: '2',
      face: '',
      meshUrl: '',
      pbr: false,
    });
  });

  it('validates and resolves presets', () => {
    expect(isHitemsPresetKey('balanced')).toBe(true);
    expect(isHitemsPresetKey('fast-pbr')).toBe(true);
    expect(isHitemsPresetKey('segmentation')).toBe(false);
    expect(isHitemsPresetKey(null)).toBe(false);
    expect(getHitemsPreset('portrait')?.key).toBe('portrait');
    expect(getHitemsPreset('missing')).toBeNull();
  });

  it('applies known preset and resets optional face/mesh', () => {
    const preset = applyHitemsPreset('relief', {
      face: '200000',
      meshUrl: 'https://example.com/in.glb',
    });
    expect(preset).toEqual({
      model: 'hitem3dv1.5',
      requestType: '1',
      resolution: '1024',
      format: '2',
      face: '',
      meshUrl: '',
      pbr: false,
    });

    const fastPbr = applyHitemsPreset('fast-pbr');
    expect(fastPbr).toEqual({
      model: 'hitem3dv2.1',
      requestType: '3',
      resolution: '1536fast',
      format: '2',
      face: '',
      meshUrl: '',
      pbr: true,
    });
  });

  it('falls back to normalized current selection for unknown preset', () => {
    const result = applyHitemsPreset('missing', {
      model: 'hitem3dv2.0',
      requestType: '2',
      resolution: '1024',
      format: '4',
      face: '120000',
      meshUrl: 'https://example.com/mesh.glb',
    });
    expect(result).toEqual({
      model: 'hitem3dv2.0',
      requestType: '2',
      resolution: '1024',
      format: '4',
      face: '120000',
      meshUrl: 'https://example.com/mesh.glb',
      pbr: true,
    });
  });

  it('detects matching preset keys and custom combinations', () => {
    expect(getMatchingHitemsPresetKey(HITEMS_PRESET_OPTIONS[0].selection)).toBe('balanced');
    expect(
      getMatchingHitemsPresetKey({
        model: 'hitem3dv2.1',
        requestType: '3',
        resolution: '1536fast',
        format: '2',
      })
    ).toBe('fast-pbr');
    expect(
      getMatchingHitemsPresetKey({
        model: 'hitem3dv1.5',
        requestType: '3',
        resolution: '1536',
        format: '2',
      })
    ).toBeNull();
  });

  it('normalizes relief format options', () => {
    expect(normalizeHitemsReliefFormat('1')).toBe('1');
    expect(normalizeHitemsReliefFormat('2')).toBe('2');
    expect(normalizeHitemsReliefFormat('bogus')).toBe('2');
    expect(normalizeHitemsReliefFormat(null)).toBe('2');
  });

  it('normalizes split options', () => {
    expect(normalizeHitemsSplitModel('general')).toBe('general');
    expect(normalizeHitemsSplitModel('bogus')).toBe('character');
    expect(normalizeHitemsSplitPart('c')).toBe('c');
    expect(normalizeHitemsSplitPart('z')).toBe('a');
    expect(normalizeHitemsSplitJoint('dovetail')).toBe('dovetail');
    expect(normalizeHitemsSplitJoint('bogus')).toBe('ball');
    expect(normalizeHitemsSplitLevel('high')).toBe('high');
    expect(normalizeHitemsSplitLevel('bogus')).toBe('medium');
  });
});
