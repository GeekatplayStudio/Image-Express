'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Loader2, Plus, RotateCw, Box, Settings2, Sun } from 'lucide-react';
import { BackgroundJob } from '@/types';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/providers/I18nProvider';
import useEscapeKey from '@/hooks/useEscapeKey';
import useSingleFlight from '@/hooks/useSingleFlight';
import { extractApiErrorMessage, parseApiResponse } from '@/lib/apiErrorParsing';
import { persistAssetToLibrary } from '@/lib/assetPersistence';
import {
    DEFAULT_HITEMS_FORMAT,
    DEFAULT_HITEMS_MODEL,
    DEFAULT_HITEMS_RELIEF_FORMAT,
    DEFAULT_HITEMS_REQUEST_TYPE,
    DEFAULT_HITEMS_SPLIT_JOINT,
    DEFAULT_HITEMS_SPLIT_LEVEL,
    DEFAULT_HITEMS_SPLIT_MODEL,
    DEFAULT_HITEMS_SPLIT_PART,
    HITEMS_FORMAT_OPTIONS,
    HITEMS_MODEL_OPTIONS,
    HITEMS_PRESET_OPTIONS,
    HITEMS_REQUEST_TYPE_OPTIONS,
    applyHitemsPreset,
    getDefaultHitemsResolution,
    getHitemsAllowedResolutions,
    getMatchingHitemsPresetKey,
    hitemsRequiresMeshUrl,
    hitemsSupportsPbr,
    hitemsSupportsTextureStage,
    isHitemsPresetKey,
    normalizeHitemsFace,
    normalizeHitemsSelection,
    type HitemsPresetKey,
    type HitemsReliefFormat,
    type HitemsSelection,
    type HitemsSplitJoint,
    type HitemsSplitLevel,
    type HitemsSplitModel,
    type HitemsSplitPart,
} from '@/lib/hitemsOptions';

const SUPPORTED_PROVIDERS = ['meshy', 'tripo', 'hitems'];

const isMissingSanitizedKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'bearer' || normalized === 'undefined' || normalized === 'null' || normalized === 'nan';
};

const sanitizeHeaderValue = (value: string) => value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
type HitemsImageViewMode = 'single' | 'multi';

const HITEMS_RESOLUTION_LABELS: Record<string, string> = {
    '512': '512³ · Eco',
    '1024': '1024³ · Balanced',
    '1536': '1536P³ · High precision · Complex topology · Fine detail',
    '1536pro': '1536P³pro · Flagship · Commercial · Print-ready',
    '1536fast': '1536³fast · Fast v2.1 pipeline · Lower cost',
    '1536profast': '1536³pro-fast · Fast portrait pipeline',
};

interface ThreeDGeneratorProps {
    onAddToCanvas: (dataUrl: string, modelUrl?: string) => void;
    onClose: () => void;
    onOpenSettings?: () => void;
    initialImage?: string; 
    layerImageOptions?: Array<{ id: string; label: string; imageUrl: string }>;
    onStartBackgroundJob?: (job: Partial<BackgroundJob>) => void; // Parent handles logic
    onRecoverBackgroundJob?: (job: Partial<BackgroundJob>) => void;
    activeJob?: BackgroundJob | null; // Pass active job if it exists
    currentUser?: string;
}

type CaptureContext = {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
};

const renderSceneToDataUrl = (
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
) => {
    const target = new THREE.WebGLRenderTarget(width, height);
    const originalTarget = gl.getRenderTarget();
    const originalSize = new THREE.Vector2();
    gl.getSize(originalSize);
    const originalPixelRatio = gl.getPixelRatio();
    const originalAspect = (camera as THREE.PerspectiveCamera).aspect;
    const originalViewport = new THREE.Vector4();
    const originalScissor = new THREE.Vector4();
    gl.getViewport(originalViewport);
    gl.getScissor(originalScissor);
    const originalScissorTest = gl.getScissorTest();

    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    (camera as THREE.PerspectiveCamera).aspect = width / height;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);

    const buffer = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, buffer);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        gl.setRenderTarget(originalTarget);
        gl.setSize(originalSize.x, originalSize.y, false);
        gl.setPixelRatio(originalPixelRatio);
        (camera as THREE.PerspectiveCamera).aspect = originalAspect;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        gl.setViewport(originalViewport);
        gl.setScissor(originalScissor);
        gl.setScissorTest(originalScissorTest);
        target.dispose();
        return '';
    }

    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const src = ((height - y - 1) * width + x) * 4;
            const dst = (y * width + x) * 4;
            imageData.data[dst] = buffer[src];
            imageData.data[dst + 1] = buffer[src + 1];
            imageData.data[dst + 2] = buffer[src + 2];
            imageData.data[dst + 3] = buffer[src + 3];
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    gl.setRenderTarget(originalTarget);
    gl.setSize(originalSize.x, originalSize.y, false);
    gl.setPixelRatio(originalPixelRatio);
    (camera as THREE.PerspectiveCamera).aspect = originalAspect;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    gl.setViewport(originalViewport);
    gl.setScissor(originalScissor);
    gl.setScissorTest(originalScissorTest);
    target.dispose();

    return dataUrl;
};

// Helper to capture Threejs context
const CaptureHelper = ({ controlRef }: { controlRef: React.MutableRefObject<CaptureContext | null> }) => {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        controlRef.current = { gl, scene, camera };
    }, [gl, scene, camera, controlRef]);
    return null;
};

// Component to render the GLTF Model
const ModelViewer = ({ url, onGroundY }: { url: string; onGroundY?: (y: number) => void }) => {
    const { scene } = useGLTF(url);
    useEffect(() => {
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        if (onGroundY) {
            const bounds = new THREE.Box3().setFromObject(scene);
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            const groundedY = bounds.min.y - center.y;
            onGroundY(groundedY);
        }
    }, [scene, onGroundY]);
    return <primitive object={scene} />;
};


export default function ThreeDGenerator({ onAddToCanvas, onClose, onOpenSettings, initialImage, layerImageOptions, onStartBackgroundJob, onRecoverBackgroundJob, activeJob, currentUser }: ThreeDGeneratorProps) {
    const dialog = useDialog();
    const { toast } = useToast();
    const { t } = useI18n();
    const runSingleFlight = useSingleFlight();
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const captureRef = useRef<CaptureContext | null>(null);
    const [resolution, setResolution] = useState<{width: number, height: number}>({ width: 2048, height: 2048 });
    const [showResSettings, setShowResSettings] = useState(false);
    const [mode] = useState<'text' | 'image'>(initialImage ? 'image' : 'text');
    const [showLightSettings, setShowLightSettings] = useState(false);
    const [lightPosition, setLightPosition] = useState<{ x: number; y: number; z: number }>({ x: 5, y: 5, z: 5 });
    const [lightIntensity, setLightIntensity] = useState(1.2);
    const [lightColor, setLightColor] = useState('#ffffff');
    const [castShadowEnabled, setCastShadowEnabled] = useState(true);
    const [castShadowBlur, setCastShadowBlur] = useState(22);
    const [castShadowIntensity, setCastShadowIntensity] = useState(0.35);
    const [contactShadowEnabled, setContactShadowEnabled] = useState(true);
    const [contactShadowBlur, setContactShadowBlur] = useState(8);
    const [contactShadowIntensity, setContactShadowIntensity] = useState(0.6);
    const [groundY, setGroundY] = useState(-1);

    const [hitemsAk, setHitemsAk] = useState('');
    const [hitemsSk, setHitemsSk] = useState('');
    const [hitemsModel, setHitemsModel] = useState(DEFAULT_HITEMS_MODEL);
    const [hitemsRequestType, setHitemsRequestType] = useState(DEFAULT_HITEMS_REQUEST_TYPE);
    const [hitemsResolution, setHitemsResolution] = useState(getDefaultHitemsResolution(DEFAULT_HITEMS_MODEL));
    const [hitemsFormat, setHitemsFormat] = useState(DEFAULT_HITEMS_FORMAT);
    const [hitemsFace, setHitemsFace] = useState('');
    const [hitemsMeshUrl, setHitemsMeshUrl] = useState('');
    const [hitemsImageViewMode, setHitemsImageViewMode] = useState<HitemsImageViewMode>('single');
    const [hitemsFrontLayerId, setHitemsFrontLayerId] = useState('__initial__');
    const [hitemsBackLayerId, setHitemsBackLayerId] = useState('');
    const [hitemsLeftLayerId, setHitemsLeftLayerId] = useState('');
    const [hitemsRightLayerId, setHitemsRightLayerId] = useState('');
    const [hitemsPreset, setHitemsPreset] = useState<HitemsPresetKey | 'custom'>('balanced');
    const [hitemsPbr, setHitemsPbr] = useState(true);
    const [hitemsReliefFormat, setHitemsReliefFormat] = useState<HitemsReliefFormat>(DEFAULT_HITEMS_RELIEF_FORMAT);
    const [hitemsSplitMeshUrl, setHitemsSplitMeshUrl] = useState('');
    const [hitemsSplitModel, setHitemsSplitModel] = useState<HitemsSplitModel>(DEFAULT_HITEMS_SPLIT_MODEL);
    const [hitemsSplitPart, setHitemsSplitPart] = useState<HitemsSplitPart>(DEFAULT_HITEMS_SPLIT_PART);
    const [hitemsSplitJoint, setHitemsSplitJoint] = useState<HitemsSplitJoint>(DEFAULT_HITEMS_SPLIT_JOINT);
    const [hitemsSplitLevel, setHitemsSplitLevel] = useState<HitemsSplitLevel>(DEFAULT_HITEMS_SPLIT_LEVEL);
    const [isSubmittingHitemsExtra, setIsSubmittingHitemsExtra] = useState(false);
        const normalizedLayerImageOptions = useMemo(() => {
            const options = [...(layerImageOptions || [])];
            if (initialImage) {
                const hasInitial = options.some((option) => option.imageUrl === initialImage);
                if (!hasInitial) {
                    options.unshift({ id: '__initial__', label: t('gen3d.currentSourceImage'), imageUrl: initialImage });
                }
            }
            return options;
        }, [initialImage, layerImageOptions, t]);

        const resolveLayerImageUrl = (layerId: string) => {
            if (layerId === '__initial__') return initialImage || '';
            const match = normalizedLayerImageOptions.find((option) => option.id === layerId);
            return match?.imageUrl || '';
        };

        const frontImageUrl = resolveLayerImageUrl(hitemsFrontLayerId);
    const [isValidatingHitems, setIsValidatingHitems] = useState(false);
    const [recoverJobId, setRecoverJobId] = useState('');

    
    // Use internal state OR prop state
    const jobStatus = activeJob?.status || '';
    const jobProgress = activeJob?.progress || 0;
    const modelUrl = activeJob?.resultUrl || null;
    const canPreviewModelInApp = Boolean(modelUrl && /\.(glb|gltf)(?:$|[?#])/i.test(modelUrl));
    const isJobRunning = activeJob?.status === 'IN_PROGRESS' || activeJob?.status === 'PENDING';

    useEffect(() => {
        if (activeJob) {
             const loading = activeJob.status === 'IN_PROGRESS' || activeJob.status === 'PENDING';
             if (isLoading !== loading) setIsLoading(loading);
        } else {
             
            if (isLoading) setIsLoading(false);
        }
    }, [activeJob, isLoading]);
    
    // Load API Key

    // Load API Key
    const [selectedProvider, setSelectedProvider] = useState<string>('meshy');
    // const [availableProviders, setAvailableProviders] = useState<string[]>([]); // Deprecated: Always show all
    
    const [hasSavedKey, setHasSavedKey] = useState(true); // Assume true initially to prevent flicker

    useEscapeKey(onClose);

    useEffect(() => {
        // Load persist selection
        if (typeof window === 'undefined') return;
        const savedProvider = localStorage.getItem('image-express-3d-provider');
        
        if (savedProvider && SUPPORTED_PROVIDERS.includes(savedProvider)) {
             setSelectedProvider(prev => prev !== savedProvider ? savedProvider : prev);
        }

        const savedSelection = normalizeHitemsSelection({
            model: localStorage.getItem('hitems_model') || undefined,
            requestType: localStorage.getItem('hitems_request_type') || undefined,
            resolution: localStorage.getItem('hitems_resolution') || undefined,
            format: localStorage.getItem('hitems_format') || undefined,
            face: localStorage.getItem('hitems_face') || undefined,
            meshUrl: localStorage.getItem('hitems_mesh_url') || undefined,
            pbr: localStorage.getItem('hitems_pbr') || undefined,
        });
        setHitemsModel(savedSelection.model);
        setHitemsRequestType(savedSelection.requestType);
        setHitemsResolution(savedSelection.resolution);
        setHitemsFormat(savedSelection.format);
        setHitemsFace(savedSelection.face);
        setHitemsMeshUrl(savedSelection.meshUrl);
        setHitemsPbr(savedSelection.pbr);
        const savedImageViewMode = localStorage.getItem('hitems_image_view_mode');
        if (savedImageViewMode === 'single' || savedImageViewMode === 'multi') {
            setHitemsImageViewMode(savedImageViewMode);
        }
        setHitemsFrontLayerId(localStorage.getItem('hitems_front_layer_id') || '__initial__');
        setHitemsBackLayerId(localStorage.getItem('hitems_back_layer_id') || '');
        setHitemsLeftLayerId(localStorage.getItem('hitems_left_layer_id') || '');
        setHitemsRightLayerId(localStorage.getItem('hitems_right_layer_id') || '');

        const savedPreset = localStorage.getItem('hitems_preset');
        if (isHitemsPresetKey(savedPreset)) {
            setHitemsPreset(savedPreset);
            return;
        }
        const matchedPreset = getMatchingHitemsPresetKey(savedSelection);
        setHitemsPreset(matchedPreset || 'custom');
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('hitems_model', hitemsModel);
        localStorage.setItem('hitems_request_type', hitemsRequestType);
        localStorage.setItem('hitems_resolution', hitemsResolution);
        localStorage.setItem('hitems_format', hitemsFormat);
        localStorage.setItem('hitems_face', hitemsFace);
        localStorage.setItem('hitems_mesh_url', hitemsMeshUrl);
        localStorage.setItem('hitems_pbr', hitemsPbr ? '1' : '0');
        localStorage.setItem('hitems_image_view_mode', hitemsImageViewMode);
        localStorage.setItem('hitems_front_layer_id', hitemsFrontLayerId);
        localStorage.setItem('hitems_back_layer_id', hitemsBackLayerId);
        localStorage.setItem('hitems_left_layer_id', hitemsLeftLayerId);
        localStorage.setItem('hitems_right_layer_id', hitemsRightLayerId);
        if (hitemsPreset !== 'custom') {
            localStorage.setItem('hitems_preset', hitemsPreset);
        } else {
            localStorage.removeItem('hitems_preset');
        }
    }, [hitemsModel, hitemsRequestType, hitemsResolution, hitemsFormat, hitemsFace, hitemsMeshUrl, hitemsPbr, hitemsPreset, hitemsImageViewMode, hitemsFrontLayerId, hitemsBackLayerId, hitemsLeftLayerId, hitemsRightLayerId]);

    useEffect(() => {
        if (!normalizedLayerImageOptions.length) return;
        const validIds = new Set(normalizedLayerImageOptions.map((option) => option.id));

        if (!validIds.has(hitemsFrontLayerId)) {
            setHitemsFrontLayerId(normalizedLayerImageOptions[0].id);
        }
        if (hitemsBackLayerId && !validIds.has(hitemsBackLayerId)) {
            setHitemsBackLayerId('');
        }
        if (hitemsLeftLayerId && !validIds.has(hitemsLeftLayerId)) {
            setHitemsLeftLayerId('');
        }
        if (hitemsRightLayerId && !validIds.has(hitemsRightLayerId)) {
            setHitemsRightLayerId('');
        }
    }, [normalizedLayerImageOptions, hitemsFrontLayerId, hitemsBackLayerId, hitemsLeftLayerId, hitemsRightLayerId]);

    // Check for key when provider changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const key = localStorage.getItem(`${selectedProvider}_api_key`);
        const hasKey = !!key;
        setHasSavedKey(prev => prev !== hasKey ? hasKey : prev);
        setApiKey(''); // Clear manual input on switch
    }, [selectedProvider]);

    const getSelectedKey = () => {
         // Should use the centralized util to check params too if needed, but direct localstorage is fine here
         // Need to match STORAGE_KEYS from SettingsModal:
         // MESHY_API_KEY: 'meshy_api_key'
         // TRIPO_API_KEY: 'tripo_api_key'
         if (selectedProvider === 'hitems') {
             const ak = hitemsAk.trim();
             const sk = hitemsSk.trim();
             if (ak && sk) return `${ak}:${sk}`;
         }

         const stored = localStorage.getItem(`${selectedProvider}_api_key`);
         if (stored) return stored;
         
         if (selectedProvider === 'hitems') {
             return apiKey; // Fallback if they pasted full string in one box (hidden now but maybe historical)
         }
         return apiKey;
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedProvider(e.target.value);
        localStorage.setItem('image-express-3d-provider', e.target.value);
    };

    const applyHitemsSelectionToState = (selection: HitemsSelection) => {
        setHitemsModel(selection.model);
        setHitemsRequestType(selection.requestType);
        setHitemsResolution(selection.resolution);
        setHitemsFormat(selection.format);
        setHitemsFace(selection.face);
        setHitemsMeshUrl(selection.meshUrl);
        setHitemsPbr(selection.pbr);
        const matchedPreset = getMatchingHitemsPresetKey(selection);
        setHitemsPreset(matchedPreset || 'custom');
    };

    const getCurrentHitemsSelection = (): HitemsSelection => normalizeHitemsSelection({
        model: hitemsModel,
        requestType: hitemsRequestType,
        resolution: hitemsResolution,
        format: hitemsFormat,
        face: hitemsFace,
        meshUrl: hitemsMeshUrl,
        pbr: hitemsPbr,
    });

    const handleHitemsPresetClick = (presetKey: HitemsPresetKey) => {
        const updated = applyHitemsPreset(presetKey, getCurrentHitemsSelection());
        applyHitemsSelectionToState(updated);
        setHitemsPreset(presetKey);
    };

    const handleHitemsModelChange = (nextModel: string) => {
        const updated = normalizeHitemsSelection({
            ...getCurrentHitemsSelection(),
            model: nextModel,
        });
        applyHitemsSelectionToState(updated);
    };

    const handleHitemsRequestTypeChange = (nextRequestType: string) => {
        const updated = normalizeHitemsSelection({
            ...getCurrentHitemsSelection(),
            requestType: nextRequestType,
        });
        applyHitemsSelectionToState(updated);
    };

    const handleHitemsResolutionChange = (nextResolution: string) => {
        const updated = normalizeHitemsSelection({
            ...getCurrentHitemsSelection(),
            resolution: nextResolution,
        });
        applyHitemsSelectionToState(updated);
    };

    const handleHitemsFormatChange = (nextFormat: string) => {
        const updated = normalizeHitemsSelection({
            ...getCurrentHitemsSelection(),
            format: nextFormat,
        });
        applyHitemsSelectionToState(updated);
    };

    const handleHitemsFaceChange = (nextFace: string) => {
        setHitemsFace(nextFace);
        const matchedPreset = getMatchingHitemsPresetKey({
            ...getCurrentHitemsSelection(),
            face: nextFace,
        });
        setHitemsPreset(matchedPreset || 'custom');
    };

    const handleHitemsMeshUrlChange = (nextMeshUrl: string) => {
        setHitemsMeshUrl(nextMeshUrl);
        const matchedPreset = getMatchingHitemsPresetKey({
            ...getCurrentHitemsSelection(),
            meshUrl: nextMeshUrl,
        });
        setHitemsPreset(matchedPreset || 'custom');
    };

    const handleHitemsImageViewModeChange = (nextMode: HitemsImageViewMode) => {
        setHitemsImageViewMode(nextMode);
    };

    const validateHitemsSetup = async () => {
        let key = getSelectedKey();
        if (!key) {
            toast({
                title: t('gen3d.missingApiKey'),
                description: t('gen3d.addKeyHint'),
                variant: 'warning'
            });
            return;
        }

        key = sanitizeHeaderValue(key);
        const appId = sanitizeHeaderValue(localStorage.getItem('hitems_appid') || '');
        const localHints: string[] = [];

        if (key.includes(':')) {
            const [ak, sk] = key.split(':');
            if (!ak || !sk) {
                localHints.push('Key format looks invalid. Expected `ak:sk` when using app credentials.');
            }
        } else if (key.length < 20) {
            localHints.push('Token length looks short. Verify you pasted the full token.');
        }

        if (!appId) {
            localHints.push('App ID is empty. Some Hitem accounts require `hitems_appid`.');
        }

        setIsValidatingHitems(true);
        try {
            const authHeader = key.includes(':') ? key : `Bearer ${key}`;
            const headers: Record<string, string> = { Authorization: authHeader };
            if (appId) headers.Appid = appId;

            const res = await fetch('/api/ai/hitems/validate', { method: 'GET', headers });
            const data = await res.json().catch(() => ({})) as {
                valid?: boolean;
                message?: string;
                detail?: string;
                status?: number;
            };

            const remoteMessage = data.message || data.detail || `Validation returned status ${res.status}.`;
            if (res.ok && data.valid) {
                const hintText = localHints.length ? ` Local checks: ${localHints.join(' ')}` : '';
                toast({
                    title: t('gen3d.setupOk'),
                    description: `${remoteMessage}${hintText}`,
                    variant: 'success'
                });
            } else {
                const hintText = localHints.length ? ` ${localHints.join(' ')}` : '';
                toast({
                    title: t('gen3d.setupFailed'),
                    description: `${remoteMessage}${hintText}`,
                    variant: 'destructive'
                });
            }
        } catch (e) {
            toast({
                title: t('gen3d.validationError'),
                description: e instanceof Error ? e.message : 'Failed to validate Hitem setup.',
                variant: 'destructive'
            });
        } finally {
            setIsValidatingHitems(false);
        }
    };

    const handleRecoverHitemsJob = () => {
        const jobId = recoverJobId.trim();
        if (!jobId) {
            toast({
                title: t('gen3d.missingJobId'),
                description: t('gen3d.enterTaskId'),
                variant: 'warning'
            });
            return;
        }

        let key = getSelectedKey();
        if (!key) {
            toast({
                title: t('gen3d.missingApiKey'),
                description: t('gen3d.setKeyBeforeRecover'),
                variant: 'warning'
            });
            return;
        }
        key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

        const payload: Partial<BackgroundJob> = {
            id: jobId,
            type: 'image-to-3d',
            provider: 'hitems',
            status: 'IN_PROGRESS',
            progress: 0,
            prompt: `Recovered: ${jobId.slice(0, 18)}`,
            createdAt: Date.now(),
            apiKey: key,
            error: undefined,
        };

        if (onRecoverBackgroundJob) onRecoverBackgroundJob(payload);
        else if (onStartBackgroundJob) onStartBackgroundJob(payload);

        toast({
            title: t('gen3d.recoveryStarted'),
            description: `Tracking Hitem job ${jobId}.`,
            variant: 'success'
        });
    };

    const handleGenerate = async () => {
        await runSingleFlight(async () => {
            let key = getSelectedKey();
            if (!key) {
                toast({
                    title: t('gen3d.missingApiKey'),
                    description: `Configure API key for ${selectedProvider}.`,
                    variant: 'warning'
                });
                return;
            }

            key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
            if (isMissingSanitizedKey(key)) {
                toast({
                    title: t('gen3d.missingApiKey'),
                    description: `Configure a valid API key for ${selectedProvider} in Settings.`,
                    variant: 'warning'
                });
                return;
            }

            console.log(`[ThreeDGenerator] Generating with provider: ${selectedProvider}`);

            setIsLoading(true);

            try {
                if (selectedProvider === 'meshy') {
                    await generateMeshy(key);
                } else if (selectedProvider === 'tripo') {
                    await generateTripo(key);
                } else if (selectedProvider === 'hitems') {
                    if (mode === 'text' || !initialImage) {
                        toast({
                            title: t('gen3d.imageRequired'),
                            description: t('gen3d.imageOnlyHint'),
                            variant: 'warning'
                        });
                        setIsLoading(false);
                        return;
                    }
                    await generateHitems(key);
                } else {
                    toast({ title: t('gen3d.comingSoon'), description: t('gen3d.serviceInProgress'), variant: 'warning' });
                    setIsLoading(false);
                }
            } catch (e) {
                console.error(e);
                setIsLoading(false);
            }
        });
    };

    const generateMeshy = async (key: string) => {
        // reuse existing logic but wrapped
         let body: Record<string, unknown> = {};
            let endpoint = '';
            
            if (mode === 'text') {
                      if (!prompt) {
                          toast({ title: t('gen3d.missingPrompt'), description: t('gen3d.enterPrompt'), variant: 'warning' });
                    setIsLoading(false);
                    return;
                }
                endpoint = 'text-to-3d';
                // Using Meshy V2 API Preview Mode (Cost: 5 credits)
                body = {
                    mode: "preview",
                    prompt: prompt,
                    art_style: "realistic",
                    ai_model: "meshy-4", 
                    topology: "quad",
                    should_remesh: true
                };
            } else {
                // Image to 3D
                if (!initialImage) return;
                endpoint = 'image-to-3d';
                // Using Meshy V1 API
                body = {
                    image_url: initialImage, 
                    enable_pbr: true, 
                    should_texture: true, // Always texture
                    should_remesh: true,
                };
            }

            // Using local proxy to avoid CORS
            const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            const { data, responseText } = await parseApiResponse(res);
             // V2 returns 'result': 'id' string on creation often, or check 'id'
             const taskId =
                (typeof data?.result === 'string' && data.result.trim().length > 0 ? data.result : null)
                || (typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id : null);

             if (taskId) {
                if (onStartBackgroundJob) {
                    onStartBackgroundJob({
                        id: taskId,
                        type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                        provider: 'meshy',
                        status: 'IN_PROGRESS',
                        prompt: mode === 'text' ? prompt : 'Image to 3D',
                        createdAt: Date.now(),
                        apiKey: key, // Store key with job to poll correctly
                        request: mode === 'text'
                            ? { provider: 'meshy', mode: 'text', prompt }
                            : (initialImage ? { provider: 'meshy', mode: 'image', imageUrl: initialImage } : undefined),
                    });
                }
            } else {
                console.error('Meshy Start Error Response:', {
                    status: res.status,
                    statusText: res.statusText,
                    payload: data,
                    bodyPreview: responseText ? responseText.slice(0, 300) : '<empty body>',
                });
                const reason = extractApiErrorMessage({
                    data,
                    responseText,
                    status: res.status,
                    statusText: res.statusText,
                    fallback: res.ok
                        ? 'Meshy request succeeded but did not return a task id'
                        : 'Meshy request failed',
                });
                toast({
                    title: t('gen3d.generationFailed'),
                    description: reason,
                    variant: 'destructive'
                });
                setIsLoading(false);
            }
    };

    const generateTripo = async (key: string) => {
        let body: Record<string, unknown> = {};
        
        if (mode === 'text') {
                 if (!prompt) {
                     toast({ title: t('gen3d.missingPrompt'), description: t('gen3d.enterPrompt'), variant: 'warning' });
                setIsLoading(false);
                return;
            }
            body = {
                type: "text_to_model",
                prompt: prompt
            };
        } else {
            // Image to 3D
            if (!initialImage) return;

            // Handle Base64 Data URL (Upload first)
            if (initialImage.startsWith('data:')) {
                // Convert Base64 to Blob
                try {
                    const fetchRes = await fetch(initialImage);
                    const blob = await fetchRes.blob();
                    
                    // Detect file extension from mime type
                    const mimeType = blob.type; 
                    let fileExt = 'png';
                    // Tripo expects 'jpg' for JPEGs
                    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileExt = 'jpg';
                    else if (mimeType === 'image/webp') fileExt = 'webp';

                    const formData = new FormData();
                    formData.append('file', blob, `image.${fileExt}`);

                    // Upload
                    const uploadRes = await fetch('/api/ai/tripo/upload', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${key}`
                        },
                        body: formData
                    });

                    const { data: uploadJson, responseText: uploadResponseText } = await parseApiResponse(uploadRes);
                    
                    if (uploadJson?.code === 0 && typeof uploadJson?.data === 'object' && uploadJson.data && 'image_token' in uploadJson.data) {
                        const uploadData = uploadJson.data as { image_token?: string };
                         body = {
                            type: "image_to_model",
                            file: {
                                type: fileExt,
                                file_token: uploadData.image_token
                            }
                        };
                    } else {
                        console.error('Tripo Upload Error Response:', {
                            status: uploadRes.status,
                            statusText: uploadRes.statusText,
                            payload: uploadJson,
                            bodyPreview: uploadResponseText ? uploadResponseText.slice(0, 300) : '<empty body>',
                        });
                        const uploadReason = extractApiErrorMessage({
                            data: uploadJson,
                            responseText: uploadResponseText,
                            status: uploadRes.status,
                            statusText: uploadRes.statusText,
                            fallback: 'Failed to upload image to Tripo',
                        });
                        toast({
                            title: t('gen3d.uploadFailed'),
                            description: uploadReason,
                            variant: 'destructive'
                        });
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                     console.error("Failed to process image for upload", e);
                     toast({ title: t('gen3d.uploadFailed'), description: t('gen3d.uploadProcessFailed'), variant: 'destructive' });
                     setIsLoading(false);
                     return;
                }
            } else {
                // Public URL
                let fileExt = 'png';
                // Basic extension check, defaulting to png if unknown
                if (initialImage.toLowerCase().endsWith('.jpg') || initialImage.toLowerCase().endsWith('.jpeg')) {
                    fileExt = 'jpg';
                } else if (initialImage.toLowerCase().endsWith('.webp')) {
                    fileExt = 'webp';
                }
                
                body = {
                    type: "image_to_model",
                    file: {
                        type: fileExt,
                        url: initialImage
                    }
                };
            }
        }

        // Use local proxy to avoid CORS
        const res = await fetch(`/api/ai/tripo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const { data, responseText } = await parseApiResponse(res);
        
        if (data?.code === 0 && typeof data?.data === 'object' && data.data && 'task_id' in data.data) {
            const tripoData = data.data as { task_id?: string };
            if (onStartBackgroundJob && typeof tripoData.task_id === 'string' && tripoData.task_id.trim().length > 0) {
                onStartBackgroundJob({
                    id: tripoData.task_id,
                    type: mode === 'text' ? 'text-to-3d' : 'image-to-3d',
                    provider: 'tripo',
                    status: 'IN_PROGRESS',
                    prompt: mode === 'text' ? prompt : 'Image to 3D',
                    createdAt: Date.now(),
                    apiKey: key,
                    request: mode === 'text'
                        ? { provider: 'tripo', mode: 'text', prompt }
                        : (initialImage ? { provider: 'tripo', mode: 'image', imageUrl: initialImage } : undefined),
                });
            }
        } else {
                 console.error('Tripo Start Error Response:', {
                     status: res.status,
                     statusText: res.statusText,
                     payload: data,
                     bodyPreview: responseText ? responseText.slice(0, 300) : '<empty body>',
                 });
                 const errorMsg = extractApiErrorMessage({
                     data,
                     responseText,
                     status: res.status,
                     statusText: res.statusText,
                     fallback: res.ok
                          ? 'Tripo request succeeded but did not return a task id'
                          : 'Error starting Tripo generation',
                 });
                 toast({ title: t('gen3d.generationFailed'), description: errorMsg, variant: 'destructive' });
             setIsLoading(false);
        }
    };

    const generateHitems = async (key: string) => {
        if (!frontImageUrl) {
            toast({
                title: t('gen3d.missingFrontLayer'),
                description: t('gen3d.selectFrontLayer'),
                variant: 'warning'
            });
            setIsLoading(false);
            return;
        }

        const normalizedSelection = normalizeHitemsSelection({
            model: hitemsModel,
            requestType: hitemsRequestType,
            resolution: hitemsResolution,
            format: hitemsFormat,
            face: hitemsFace,
            meshUrl: hitemsMeshUrl,
            pbr: hitemsPbr,
        });
        const rawFaceText = hitemsFace.trim();
        if (rawFaceText && !normalizeHitemsFace(rawFaceText)) {
            toast({
                title: t('gen3d.invalidFaceCount'),
                description: t('gen3d.faceCountHint'),
                variant: 'warning'
            });
            setIsLoading(false);
            return;
        }
        applyHitemsSelectionToState(normalizedSelection);

        if (hitemsRequiresMeshUrl(normalizedSelection.requestType) && !normalizedSelection.meshUrl) {
            toast({
                title: t('gen3d.meshUrlRequired'),
                description: t('gen3d.meshUrlHint'),
                variant: 'warning'
            });
            setIsLoading(false);
            return;
        }

        const normalizedFace = normalizeHitemsFace(normalizedSelection.face);

        try {
            const formData = new FormData();
            const appendImageAs = async (url: string, fieldName: 'images' | 'multi_images', filenamePrefix: string) => {
                const imageRes = await fetch(url);
                if (!imageRes.ok) {
                    throw new Error('Failed to load one of the selected view images. Ensure URLs are public and reachable.');
                }
                const blob = await imageRes.blob();
                const mimeType = blob.type || 'image/png';
                let fileExt = 'png';
                if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileExt = 'jpg';
                else if (mimeType === 'image/webp') fileExt = 'webp';
                formData.append(fieldName, blob, `${filenamePrefix}.${fileExt}`);
            };

            const optionalViews = [
                resolveLayerImageUrl(hitemsBackLayerId),
                resolveLayerImageUrl(hitemsLeftLayerId),
                resolveLayerImageUrl(hitemsRightLayerId),
            ].filter(Boolean);

            if (hitemsImageViewMode === 'multi') {
                await appendImageAs(frontImageUrl, 'multi_images', 'front-view');
                for (let index = 0; index < optionalViews.length; index += 1) {
                    await appendImageAs(optionalViews[index], 'multi_images', `extra-view-${index + 1}`);
                }

                if (optionalViews.length === 0) {
                    throw new Error('Multi-view requires at least one additional view URL (back, left, or right).');
                }

                const bitFlags = [
                    '1',
                    resolveLayerImageUrl(hitemsBackLayerId) ? '1' : '0',
                    resolveLayerImageUrl(hitemsLeftLayerId) ? '1' : '0',
                    resolveLayerImageUrl(hitemsRightLayerId) ? '1' : '0',
                ].join('');
                formData.append('multi_images_bit', bitFlags);
            } else {
                await appendImageAs(frontImageUrl, 'images', 'image');
            }

            formData.append('model', normalizedSelection.model);
            formData.append('request_type', normalizedSelection.requestType);
            formData.append('resolution', normalizedSelection.resolution);
            formData.append('format', normalizedSelection.format);
            if (hitemsSupportsPbr(normalizedSelection.model)) {
                formData.append('pbr', normalizedSelection.pbr ? '1' : '0');
            }
            if (normalizedFace) formData.append('face', normalizedFace);
            if (hitemsRequiresMeshUrl(normalizedSelection.requestType)) {
                formData.append('mesh_url', normalizedSelection.meshUrl);
            }

            console.log('Sending Hitem3D request with params:', {
                imageMode: hitemsImageViewMode,
                model: normalizedSelection.model,
                requestType: normalizedSelection.requestType,
                resolution: normalizedSelection.resolution,
                format: normalizedSelection.format,
                face: normalizedFace || undefined,
                meshUrl: hitemsRequiresMeshUrl(normalizedSelection.requestType) ? normalizedSelection.meshUrl : undefined,
                multiImagesBit: hitemsImageViewMode === 'multi'
                    ? ['1', resolveLayerImageUrl(hitemsBackLayerId) ? '1' : '0', resolveLayerImageUrl(hitemsLeftLayerId) ? '1' : '0', resolveLayerImageUrl(hitemsRightLayerId) ? '1' : '0'].join('')
                    : undefined,
            });

            const sanitizedKey = sanitizeHeaderValue(key);
            if (isMissingSanitizedKey(sanitizedKey)) {
                toast({
                    title: t('gen3d.missingApiKey'),
                    description: t('gen3d.configureKeyHint'),
                    variant: 'warning'
                });
                setIsLoading(false);
                return;
            }

            const authHeader = sanitizedKey.includes(':') ? sanitizedKey : `Bearer ${sanitizedKey}`;
            const appId = sanitizeHeaderValue(localStorage.getItem('hitems_appid') || '');

            const headers: Record<string, string> = {
                'Authorization': authHeader
            };
            if (appId) {
                headers['Appid'] = appId;
            }

            const res = await fetch('/api/ai/hitems', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const { data, responseText } = await parseApiResponse(res);
            const nestedTaskId = (() => {
                if (!data?.data || typeof data.data !== 'object') return null;
                const taskIdCandidate = (data.data as Record<string, unknown>).task_id;
                return typeof taskIdCandidate === 'string' && taskIdCandidate.trim().length > 0 ? taskIdCandidate : null;
            })();
            const taskId =
                nestedTaskId
                || (typeof data?.task_id === 'string' && data.task_id.trim().length > 0 ? data.task_id : null);

            if (res.ok && taskId) {
                if (onStartBackgroundJob) {
                    const extraImageUrls = [
                        resolveLayerImageUrl(hitemsBackLayerId),
                        resolveLayerImageUrl(hitemsLeftLayerId),
                        resolveLayerImageUrl(hitemsRightLayerId),
                    ].filter(Boolean);

                    onStartBackgroundJob({
                        id: taskId,
                        type: 'image-to-3d',
                        provider: 'hitems',
                        status: 'IN_PROGRESS',
                        prompt: `${normalizedSelection.model} (${normalizedSelection.resolution})`,
                        createdAt: Date.now(),
                        apiKey: key,
                        request: {
                            provider: 'hitems',
                            mode: 'image',
                            imageUrl: frontImageUrl,
                            model: normalizedSelection.model,
                            requestType: normalizedSelection.requestType,
                            resolution: normalizedSelection.resolution,
                            format: normalizedSelection.format,
                            face: normalizedFace || undefined,
                            meshUrl: hitemsRequiresMeshUrl(normalizedSelection.requestType) ? normalizedSelection.meshUrl : undefined,
                            pbr: hitemsSupportsPbr(normalizedSelection.model) ? normalizedSelection.pbr : undefined,
                            extraImageUrls: extraImageUrls.length > 0 ? extraImageUrls : undefined,
                            multiImagesBit: hitemsImageViewMode === 'multi'
                                ? ['1', resolveLayerImageUrl(hitemsBackLayerId) ? '1' : '0', resolveLayerImageUrl(hitemsLeftLayerId) ? '1' : '0', resolveLayerImageUrl(hitemsRightLayerId) ? '1' : '0'].join('')
                                : undefined,
                        },
                    });
                }
            } else {
                if (typeof window !== 'undefined' && window.localStorage.getItem('hitems_debug') === '1') {
                    console.warn('Hitem3D Start Warning Response:', {
                        status: res.status,
                        statusText: res.statusText,
                        payload: data,
                        bodyPreview: responseText ? responseText.slice(0, 300) : '<empty body>',
                    });
                }
                const reason = extractApiErrorMessage({
                    data,
                    responseText,
                    status: res.status,
                    statusText: res.statusText,
                    fallback: res.ok
                        ? 'Hitem request succeeded but did not return a task_id. Try Validate Setup and retry.'
                        : 'Hitem request failed',
                });
                const reasonText = String(reason || '').trim();
                const isAuthIssue = /auth|token|appid|unauthorized|forbidden|credential|login/i.test(reasonText);
                const alreadyHasSetupGuidance = /hitems_api_key|hitems_appid|validate setup/i.test(reasonText);
                const setupHint = isAuthIssue && !alreadyHasSetupGuidance
                    ? ' Check `hitems_api_key` and `hitems_appid` in Settings, then use Validate Setup.'
                    : '';
                toast({
                    title: t('gen3d.generationFailed'),
                    description: `${reasonText || 'Hitem request failed'}${setupHint}`,
                    variant: 'destructive'
                });
                setIsLoading(false);
            }
        } catch (e) {
            if (typeof window !== 'undefined' && window.localStorage.getItem('hitems_debug') === '1') {
                console.warn('Hitem3D request failed', e);
            }
            toast({
                title: t('gen3d.generationFailed'),
                description: `${e instanceof Error ? e.message : 'Failed to send image to Hitem3D.'} Check setup with Validate Setup.`,
                variant: 'destructive'
            });
            setIsLoading(false);
        }
    };

    const buildHitemsRequestHeaders = (): Record<string, string> | null => {
        const sanitizedKey = sanitizeHeaderValue(getSelectedKey() || '');
        if (isMissingSanitizedKey(sanitizedKey)) {
            toast({
                title: t('gen3d.missingApiKey'),
                description: t('gen3d.configureKeyHint'),
                variant: 'warning'
            });
            return null;
        }
        const headers: Record<string, string> = {
            Authorization: sanitizedKey.includes(':') ? sanitizedKey : `Bearer ${sanitizedKey}`,
        };
        const appId = sanitizeHeaderValue(localStorage.getItem('hitems_appid') || '');
        if (appId) headers.Appid = appId;
        return headers;
    };

    const readHitemsTaskId = (data: Record<string, unknown> | null | undefined): string | null => {
        const nested = data?.data && typeof data.data === 'object'
            ? (data.data as Record<string, unknown>).task_id
            : null;
        if (typeof nested === 'string' && nested.trim().length > 0) return nested;
        const topLevel = data?.task_id;
        return typeof topLevel === 'string' && topLevel.trim().length > 0 ? topLevel : null;
    };

    // Hi3D "Image to 3D Relief" — produces a depth-map image (PNG/EXR) from the front layer.
    const submitHitemsRelief = async () => {
        if (!frontImageUrl) {
            toast({ title: t('gen3d.missingFrontLayer'), description: t('gen3d.selectFrontLayerRelief'), variant: 'warning' });
            return;
        }
        const headers = buildHitemsRequestHeaders();
        if (!headers) return;

        setIsSubmittingHitemsExtra(true);
        try {
            const imageRes = await fetch(frontImageUrl);
            if (!imageRes.ok) throw new Error('Failed to load the selected front image.');
            const blob = await imageRes.blob();

            const formData = new FormData();
            formData.append('image', blob, 'relief-source.png');
            formData.append('format', hitemsReliefFormat);
            formData.append('rmbg', '1');

            const res = await fetch('/api/ai/hitems/depth', { method: 'POST', headers, body: formData });
            const { data, responseText } = await parseApiResponse(res);
            const taskId = readHitemsTaskId(data);
            if (!res.ok || !taskId) {
                throw new Error(extractApiErrorMessage({
                    data,
                    responseText,
                    status: res.status,
                    statusText: res.statusText,
                    fallback: 'Hitem3D relief request failed.',
                }));
            }

            onStartBackgroundJob?.({
                id: taskId,
                type: 'hitems-relief',
                provider: 'hitems',
                status: 'IN_PROGRESS',
                prompt: `Relief depth map (${hitemsReliefFormat === '1' ? 'EXR' : 'PNG'})`,
                createdAt: Date.now(),
                apiKey: getSelectedKey(),
            });
            toast({ title: t('gen3d.reliefStarted'), description: t('gen3d.trackInBackgroundJobs'), variant: 'success' });
        } catch (error) {
            toast({
                title: t('gen3d.reliefFailed'),
                description: error instanceof Error ? error.message : 'Failed to submit relief task.',
                variant: 'destructive'
            });
        } finally {
            setIsSubmittingHitemsExtra(false);
        }
    };

    // Hi3D "Model Split" — decomposes an existing mesh into printable/articulated parts.
    const submitHitemsSplit = async () => {
        const meshUrl = (hitemsSplitMeshUrl || modelUrl || '').trim();
        if (!meshUrl) {
            toast({ title: t('gen3d.missingMesh'), description: t('gen3d.enterMeshUrl'), variant: 'warning' });
            return;
        }
        const headers = buildHitemsRequestHeaders();
        if (!headers) return;

        setIsSubmittingHitemsExtra(true);
        try {
            const formData = new FormData();
            formData.append('mesh_url', meshUrl);
            formData.append('model', hitemsSplitModel);
            if (hitemsSplitModel === 'character') {
                formData.append('part', hitemsSplitPart);
                formData.append('joint', hitemsSplitJoint);
            } else {
                formData.append('level', hitemsSplitLevel);
                formData.append('format', hitemsFormat);
            }

            const res = await fetch('/api/ai/hitems/split', { method: 'POST', headers, body: formData });
            const { data, responseText } = await parseApiResponse(res);
            const taskId = readHitemsTaskId(data);
            if (!res.ok || !taskId) {
                throw new Error(extractApiErrorMessage({
                    data,
                    responseText,
                    status: res.status,
                    statusText: res.statusText,
                    fallback: 'Hitem3D split request failed.',
                }));
            }

            onStartBackgroundJob?.({
                id: taskId,
                type: 'hitems-split',
                provider: 'hitems',
                status: 'IN_PROGRESS',
                prompt: hitemsSplitModel === 'character'
                    ? `Split character (${hitemsSplitPart}, ${hitemsSplitJoint})`
                    : `Split general (${hitemsSplitLevel})`,
                createdAt: Date.now(),
                apiKey: getSelectedKey(),
            });
            toast({ title: t('gen3d.splitStarted'), description: t('gen3d.trackInBackgroundJobs'), variant: 'success' });
        } catch (error) {
            toast({
                title: t('gen3d.splitFailed'),
                description: error instanceof Error ? error.message : 'Failed to submit split task.',
                variant: 'destructive'
            });
        } finally {
            setIsSubmittingHitemsExtra(false);
        }
    };

    const handleCapture = () => {
        const state = captureRef.current;
        if (state && state.gl && state.scene && state.camera) {
             const { gl, scene, camera } = state;
             try {
                const data = renderSceneToDataUrl(gl, scene, camera, resolution.width, resolution.height);
                if (data) {
                    onAddToCanvas(data, modelUrl || undefined);
                    return;
                }
                
             } catch (e) {
                 console.error("High-res capture failed, falling back", e);
             }
        }

        const canvas = document.querySelector('#three-d-canvas canvas') as HTMLCanvasElement;
        if (canvas) {
            const data = canvas.toDataURL('image/png');
            onAddToCanvas(data, modelUrl || undefined);
        }
    };

    const activeHitemsPreset = HITEMS_PRESET_OPTIONS.find((preset) => preset.key === hitemsPreset) || null;
    const hitemsSetupStatus = (() => {
        if (typeof window === 'undefined') {
            return { label: t('gen3d.checkSetup'), isReady: false };
        }

        const storedKey = (localStorage.getItem('hitems_api_key') || '').trim();
        const typedKey = [hitemsAk.trim(), hitemsSk.trim()].every(Boolean) ? `${hitemsAk.trim()}:${hitemsSk.trim()}` : '';
        const effectiveKey = (storedKey || typedKey).replace(/Bearer /gi, '').replace(/["']/g, '').trim();
        if (isMissingSanitizedKey(effectiveKey)) {
            return { label: t('gen3d.missingApiKey'), isReady: false };
        }

        const appId = (localStorage.getItem('hitems_appid') || '').trim();
        if (!appId) {
            return { label: t('gen3d.readyAppIdOptional'), isReady: true };
        }

        return { label: t('gen3d.ready'), isReady: true };
    })();

    // Need to import Sparkles if I use it
    return (
        <div className="absolute top-4 left-4 z-50 bg-card/95 backdrop-blur-xl border border-border pb-4 rounded-xl shadow-2xl w-80 animate-in fade-in slide-in-from-left-4 max-h-[calc(100vh-7rem)] overflow-y-auto overflow-x-hidden scrollbar-thin">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/20">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                     <Box size={16} className="text-primary" />
                    {initialImage ? t('gen3d.imageTo3d') : t('gen3d.title')}
                </h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">X</button>
            </div>

            {/* Service Selection */}
            {!isJobRunning && !modelUrl && (
                <div className="px-4 pt-3">
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">{t('gen3d.provider')}</label>
                    <select 
                        value={selectedProvider} 
                        onChange={handleProviderChange}
                        className="w-full rounded border border-border bg-secondary/50 p-2 text-xs text-foreground outline-none focus:border-primary dark:bg-zinc-950"
                    >
                        {SUPPORTED_PROVIDERS.map(p => (
                            <option key={p} value={p} className="bg-zinc-950 text-white">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="p-4 space-y-4">

                    {!hasSavedKey && selectedProvider === 'hitems' && (
                        <div className="space-y-2">
                             <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">{t('gen3d.appId')}</label>
                                 <input 
                                    type="text" 
                                    value={hitemsAk}
                                    onChange={(e) => setHitemsAk(e.target.value)}
                                    placeholder="ak_xxxxxxxx"
                                    className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">{t('gen3d.appSecret')}</label>
                                 <input 
                                    type="password" 
                                    value={hitemsSk}
                                    onChange={(e) => setHitemsSk(e.target.value)}
                                    placeholder="sk_xxxxxxxx"
                                    className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm font-mono"
                                />
                            </div>
                        </div>
                    )}

                    {!hasSavedKey && selectedProvider !== 'hitems' && (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t('gen3d.apiKeyQuick', { provider: selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1) })}</label>
                             <input 
                                type="password" 
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                            />
                        </div>
                    )}

                {(selectedProvider === 'hitems' ? Boolean(frontImageUrl || initialImage) : Boolean(initialImage)) && (
                    <div className="space-y-2">
                         <div className="flex justify-center bg-black/10 p-2 rounded">
                            <div className="relative w-full h-24">
                                <Image
                                    src={selectedProvider === 'hitems' ? (frontImageUrl || initialImage || '') : (initialImage || '')}
                                    alt={t('gen3d.sourceAlt')}
                                    fill
                                    sizes="256px"
                                    className="object-contain rounded"
                                    unoptimized
                                />
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-muted-foreground text-center">
                            {selectedProvider === 'meshy' && t('gen3d.noteMeshy')}
                            {selectedProvider === 'tripo' && t('gen3d.noteTripo')}
                            {selectedProvider === 'hitems' && t('gen3d.noteHitems')}
                        </p>
                    </div>
                )}

                {selectedProvider === 'hitems' && initialImage && (
                    <div className="space-y-2 rounded-md border border-border/60 bg-secondary/30 p-3">
                        <div className="space-y-2 rounded-md border border-border/40 bg-background/60 p-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('gen3d.setupChecklist')}</p>
                                <div className="flex items-center gap-1">
                                    <span
                                        className={`px-2 py-1 text-[10px] rounded border ${hitemsSetupStatus.isReady
                                            ? 'border-border bg-secondary/50 text-foreground'
                                            : 'border-border bg-secondary/50 text-destructive'}`}
                                    >
                                        {hitemsSetupStatus.label}
                                    </span>
                                    {onOpenSettings && (
                                        <button
                                            onClick={onOpenSettings}
                                            className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary"
                                            type="button"
                                        >
                                            {t('gen3d.openSettings')}
                                        </button>
                                    )}
                                    <button
                                        onClick={validateHitemsSetup}
                                        disabled={isValidatingHitems}
                                        className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary disabled:opacity-50"
                                        type="button"
                                    >
                                        {isValidatingHitems ? t('gen3d.validating') : t('gen3d.validateSetup')}
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{t('gen3d.setupStep1')}</p>
                            <p className="text-[10px] text-muted-foreground">{t('gen3d.setupStep2')}</p>
                            <p className="text-[10px] text-muted-foreground">{t('gen3d.setupStep3')}</p>
                            <div className="pt-1 space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.recoverJobId')}</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={recoverJobId}
                                        onChange={(e) => setRecoverJobId(e.target.value)}
                                        placeholder={t('gen3d.taskIdPlaceholder')}
                                        className="flex-1 px-2 py-1 bg-secondary/50 rounded border border-border text-[11px] font-mono"
                                    />
                                    <button
                                        onClick={handleRecoverHitemsJob}
                                        className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary"
                                        type="button"
                                    >
                                        {t('gen3d.recover')}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.oneClickPresets')}</label>
                            <div className="grid grid-cols-2 gap-1">
                                {HITEMS_PRESET_OPTIONS.map((preset) => (
                                    <button
                                        key={preset.key}
                                        onClick={() => handleHitemsPresetClick(preset.key)}
                                        className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                                            hitemsPreset === preset.key
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-secondary/50 border-border hover:bg-secondary'
                                        }`}
                                        type="button"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                {activeHitemsPreset?.description || t('gen3d.customPresetValues')}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.model')}</label>
                                <select
                                    value={hitemsModel}
                                    onChange={(e) => handleHitemsModelChange(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    {HITEMS_MODEL_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.resolution')}</label>
                                <select
                                    value={hitemsResolution}
                                    onChange={(e) => handleHitemsResolutionChange(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    {getHitemsAllowedResolutions(hitemsModel).map((value) => (
                                        <option key={value} value={value}>{HITEMS_RESOLUTION_LABELS[value] || value}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.imageViewMode')}</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleHitemsImageViewModeChange('single')}
                                    className={`px-2 py-2 rounded text-[10px] border transition-colors ${
                                        hitemsImageViewMode === 'single'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-secondary/50 border-border hover:bg-secondary'
                                    }`}
                                >
                                    {t('gen3d.singleImage')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleHitemsImageViewModeChange('multi')}
                                    className={`px-2 py-2 rounded text-[10px] border transition-colors ${
                                        hitemsImageViewMode === 'multi'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-secondary/50 border-border hover:bg-secondary'
                                    }`}
                                >
                                    {t('gen3d.multiView')}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground">{t('gen3d.frontPreview')}</p>
                                    <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                        {frontImageUrl ? (
                                            <Image src={frontImageUrl} alt={t('gen3d.frontPreviewAlt')} fill sizes="128px" className="object-contain" unoptimized />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t('gen3d.noFrontLayer')}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-muted-foreground">{t('gen3d.backPreview')}</p>
                                        {hitemsImageViewMode !== 'multi' && (
                                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{t('gen3d.savedForMultiView')}</span>
                                        )}
                                    </div>
                                    <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                        {resolveLayerImageUrl(hitemsBackLayerId) ? (
                                            <Image src={resolveLayerImageUrl(hitemsBackLayerId)} alt={t('gen3d.backPreviewAlt')} fill sizes="128px" className="object-contain" unoptimized />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t('gen3d.notSet')}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1 pt-1">
                                <label className="text-[10px] text-muted-foreground">{t('gen3d.frontLayer')}</label>
                                <select
                                    value={hitemsFrontLayerId}
                                    onChange={(e) => setHitemsFrontLayerId(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    {normalizedLayerImageOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 gap-1 pt-1">
                                <label className="text-[10px] text-muted-foreground">{t('gen3d.backLayer')}</label>
                                <select
                                    value={hitemsBackLayerId}
                                    onChange={(e) => setHitemsBackLayerId(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    <option value="">{t('gen3d.backNotSet')}</option>
                                    {normalizedLayerImageOptions.map((option) => (
                                        <option key={`always-back-${option.id}`} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                                {hitemsImageViewMode !== 'multi' && (
                                    <p className="text-[10px] text-muted-foreground">{t('gen3d.backArtworkHint')}</p>
                                )}
                            </div>
                            {hitemsImageViewMode === 'multi' && (
                                <div className="grid grid-cols-1 gap-1 pt-1">
                                    <p className="text-[10px] text-muted-foreground">{t('gen3d.assignViewsHint')}</p>
                                    <div className="grid grid-cols-2 gap-2 pb-1">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground">{t('gen3d.leftPreview')}</p>
                                            <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                                {resolveLayerImageUrl(hitemsLeftLayerId) ? (
                                                    <Image src={resolveLayerImageUrl(hitemsLeftLayerId)} alt={t('gen3d.leftPreviewAlt')} fill sizes="128px" className="object-contain" unoptimized />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t('gen3d.notSet')}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground">{t('gen3d.rightPreview')}</p>
                                            <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                                {resolveLayerImageUrl(hitemsRightLayerId) ? (
                                                    <Image src={resolveLayerImageUrl(hitemsRightLayerId)} alt={t('gen3d.rightPreviewAlt')} fill sizes="128px" className="object-contain" unoptimized />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t('gen3d.notSet')}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <select
                                        value={hitemsLeftLayerId}
                                        onChange={(e) => setHitemsLeftLayerId(e.target.value)}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="">{t('gen3d.leftNotSet')}</option>
                                        {normalizedLayerImageOptions.map((option) => (
                                            <option key={`left-${option.id}`} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={hitemsRightLayerId}
                                        onChange={(e) => setHitemsRightLayerId(e.target.value)}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="">{t('gen3d.rightNotSet')}</option>
                                        {normalizedLayerImageOptions.map((option) => (
                                            <option key={`right-${option.id}`} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.task')}</label>
                                <select
                                    value={hitemsRequestType}
                                    onChange={(e) => handleHitemsRequestTypeChange(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    {HITEMS_REQUEST_TYPE_OPTIONS.map((option) => {
                                        const disabled = option.value === '2' && !hitemsSupportsTextureStage(hitemsModel);
                                        return (
                                            <option key={option.value} value={option.value} disabled={disabled}>
                                                {option.label}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.format')}</label>
                                <select
                                    value={hitemsFormat}
                                    onChange={(e) => handleHitemsFormatChange(e.target.value)}
                                    className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                >
                                    {HITEMS_FORMAT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {hitemsSupportsPbr(hitemsModel) && (
                            <label className="flex items-center gap-2 rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={hitemsPbr}
                                    onChange={(e) => setHitemsPbr(e.target.checked)}
                                    aria-label={t('gen3d.enablePbrAria')}
                                />
                                <span className="font-medium text-foreground">{t('gen3d.pbrTextures')}</span>
                                <span className="text-[10px] text-muted-foreground">{t('gen3d.pbrHint')}</span>
                            </label>
                        )}
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.faceCountOptional')}</label>
                            <input
                                type="number"
                                value={hitemsFace}
                                onChange={(e) => handleHitemsFaceChange(e.target.value)}
                                min={100000}
                                max={2000000}
                                step={1000}
                                placeholder="100000 - 2000000"
                                className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                            />
                        </div>
                        {hitemsRequestType === '2' && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.meshUrlStaged')}</label>
                                <input
                                    type="url"
                                    value={hitemsMeshUrl}
                                    onChange={(e) => handleHitemsMeshUrlChange(e.target.value)}
                                    placeholder={t('gen3d.meshUrlPlaceholder')}
                                    className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            {t('gen3d.modelTip')}
                        </p>

                        <details className="rounded-md border border-border/50 bg-secondary/20">
                            <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('gen3d.reliefDepthMap')}
                            </summary>
                            <div className="space-y-2 px-3 pb-3">
                                <p className="text-[10px] text-muted-foreground">
                                    {t('gen3d.reliefDepthHint')}
                                </p>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.outputFormat')}</label>
                                    <select
                                        value={hitemsReliefFormat}
                                        onChange={(e) => setHitemsReliefFormat(e.target.value === '1' ? '1' : '2')}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="2">{t('gen3d.formatPng')}</option>
                                        <option value="1">{t('gen3d.formatExr')}</option>
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { void submitHitemsRelief(); }}
                                    disabled={isSubmittingHitemsExtra || !frontImageUrl}
                                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmittingHitemsExtra ? t('gen3d.submitting') : t('gen3d.generateDepthRelief')}
                                </button>
                            </div>
                        </details>

                        <details className="rounded-md border border-border/50 bg-secondary/20">
                            <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                                {t('gen3d.modelSplit')}
                            </summary>
                            <div className="space-y-2 px-3 pb-3">
                                <p className="text-[10px] text-muted-foreground">
                                    {t('gen3d.modelSplitHint')}
                                </p>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.meshUrl')}</label>
                                    <input
                                        type="url"
                                        value={hitemsSplitMeshUrl}
                                        onChange={(e) => setHitemsSplitMeshUrl(e.target.value)}
                                        placeholder={modelUrl ? 'Leave empty to split the latest result' : 'https://.../model.glb'}
                                        className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.splitMode')}</label>
                                    <select
                                        value={hitemsSplitModel}
                                        onChange={(e) => setHitemsSplitModel(e.target.value === 'general' ? 'general' : 'character')}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="character">{t('gen3d.splitCharacter')}</option>
                                        <option value="general">{t('gen3d.splitGeneral')}</option>
                                    </select>
                                </div>
                                {hitemsSplitModel === 'character' ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.partsTemplate')}</label>
                                            <select
                                                value={hitemsSplitPart}
                                                onChange={(e) => setHitemsSplitPart((['a', 'b', 'c', 'd', 'e', 'f'].includes(e.target.value) ? e.target.value : 'a') as typeof hitemsSplitPart)}
                                                className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                            >
                                                <option value="a">{t('gen3d.partsA')}</option>
                                                <option value="b">{t('gen3d.partsB')}</option>
                                                <option value="c">{t('gen3d.partsC')}</option>
                                                <option value="d">{t('gen3d.partsD')}</option>
                                                <option value="e">{t('gen3d.partsE')}</option>
                                                <option value="f">{t('gen3d.partsF')}</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.joints')}</label>
                                            <select
                                                value={hitemsSplitJoint}
                                                onChange={(e) => setHitemsSplitJoint((['ball', 'dovetail', 'none'].includes(e.target.value) ? e.target.value : 'ball') as typeof hitemsSplitJoint)}
                                                className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                            >
                                                <option value="ball">{t('gen3d.jointBall')}</option>
                                                <option value="dovetail">{t('gen3d.jointDovetail')}</option>
                                                <option value="none">{t('gen3d.jointNone')}</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('gen3d.splitLevel')}</label>
                                        <select
                                            value={hitemsSplitLevel}
                                            onChange={(e) => setHitemsSplitLevel((['low', 'medium', 'high'].includes(e.target.value) ? e.target.value : 'medium') as typeof hitemsSplitLevel)}
                                            className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                        >
                                            <option value="medium">{t('gen3d.levelMedium')}</option>
                                            <option value="low">{t('gen3d.levelLow')}</option>
                                            <option value="high">{t('gen3d.levelHigh')}</option>
                                        </select>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { void submitHitemsSplit(); }}
                                    disabled={isSubmittingHitemsExtra || (!hitemsSplitMeshUrl.trim() && !modelUrl)}
                                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmittingHitemsExtra ? t('gen3d.submitting') : t('gen3d.splitModel')}
                                </button>
                            </div>
                        </details>
                    </div>
                )}

                {!initialImage && selectedProvider !== 'hitems' && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{t('gen3d.prompt')}</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t('gen3d.promptPlaceholder')}
                            className="w-full min-h-20 rounded-md border border-border/50 bg-secondary/50 px-3 py-2 text-sm"
                        />
                    </div>
                )}

                {selectedProvider === 'hitems' && !initialImage && (
                    <div className="rounded-md border border-border/60 bg-secondary/40 p-2 text-[11px] text-muted-foreground">
                        {t('gen3d.imageOnlyPanelHint')}
                    </div>
                )}

                <button 
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16}/> : <RotateCw size={16}/>}
                    {isLoading ? t('gen3d.generating') : (initialImage ? t('gen3d.transformTo3d') : t('gen3d.generate3dModel'))}
                </button>
                {jobStatus && <p className="text-xs text-center text-muted-foreground">
                    {jobStatus === 'SUCCEEDED' ? t('gen3d.complete') :
                     jobStatus === 'FAILED' ? (activeJob?.error ? t('gen3d.failedWithReason', { reason: activeJob.error }) : t('gen3d.failed')) :
                     t('gen3d.generatingPercent', { percent: jobProgress })}
                </p>}

                {/* 3D Preview Area */}
                <div id="three-d-canvas" className="w-full aspect-square bg-black/5 rounded-lg overflow-hidden border border-border/30 relative">
                     {modelUrl ? (
                        canPreviewModelInApp ? (
                        <>
                            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end pointer-events-none">
                                <div className="pointer-events-auto flex flex-col items-end gap-1">
                                    <button 
                                        onClick={() => setShowResSettings(!showResSettings)}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                                        title={t('gen3d.exportResolutionSettings')}
                                    >
                                        <Settings2 size={12} />
                                        {resolution.width}x{resolution.height}
                                    </button>
                                    {showResSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-48 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">{t('gen3d.exportResolution')}</h4>
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div>
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">{t('canvas.width')}</label>
                                                    <input 
                                                        type="number" 
                                                        value={resolution.width} 
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value);
                                                            setResolution(p => ({...p, width: val, height: val})) // Keep square by default? No, let's keep aspect ratio usually used for models? Canvas is square usually.
                                                        }}
                                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right" 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">{t('canvas.height')}</label>
                                                    <input 
                                                        type="number" 
                                                        value={resolution.height} 
                                                        onChange={e => setResolution(p => ({...p, height: parseInt(e.target.value)}))}
                                                        className="w-full bg-muted px-2 py-1 rounded border border-border/50 text-right" 
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1">
                                                {[512, 1024, 2048].map(size => (
                                                    <button 
                                                        key={size}
                                                        onClick={() => setResolution({width: size, height: size})} 
                                                        className={`px-2 py-1 rounded text-[10px] border transition-colors ${resolution.width === size ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/80 border-transparent'}`}
                                                    >
                                                        {size}px
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowLightSettings(!showLightSettings)}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 text-white rounded-md backdrop-blur-sm transition-colors text-[10px] font-medium border border-white/10"
                                        title={t('gen3d.lightingSettings')}
                                    >
                                        <Sun size={12} />
                                        {t('gen3d.light')}
                                    </button>
                                    {showLightSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-56 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">{t('gen3d.lighting')}</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground uppercase">{t('gen3d.castShadow')}</span>
                                                    <div
                                                        className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${castShadowEnabled ? 'bg-primary' : 'bg-secondary'}`}
                                                        onClick={() => setCastShadowEnabled((prev) => !prev)}
                                                    >
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${castShadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>
                                                {castShadowEnabled && (
                                                    <div className="space-y-2">
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>{t('gen3d.castBlur')}</span>
                                                                <span>{castShadowBlur}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="60"
                                                                step="1"
                                                                value={castShadowBlur}
                                                                onChange={(e) => setCastShadowBlur(parseInt(e.target.value))}
                                                                data-default="22"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>{t('gen3d.castIntensity')}</span>
                                                                <span>{castShadowIntensity.toFixed(2)}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.05"
                                                                value={castShadowIntensity}
                                                                onChange={(e) => setCastShadowIntensity(parseFloat(e.target.value))}
                                                                data-default="0.35"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground uppercase">{t('gen3d.contactShadow')}</span>
                                                    <div
                                                        className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${contactShadowEnabled ? 'bg-primary' : 'bg-secondary'}`}
                                                        onClick={() => setContactShadowEnabled((prev) => !prev)}
                                                    >
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${contactShadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                </div>
                                                {contactShadowEnabled && (
                                                    <div className="space-y-2">
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>{t('gen3d.contactBlur')}</span>
                                                                <span>{contactShadowBlur}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="20"
                                                                step="1"
                                                                value={contactShadowBlur}
                                                                onChange={(e) => setContactShadowBlur(parseInt(e.target.value))}
                                                                data-default="8"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                                <span>{t('gen3d.contactIntensity')}</span>
                                                                <span>{contactShadowIntensity.toFixed(2)}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.05"
                                                                value={contactShadowIntensity}
                                                                onChange={(e) => setContactShadowIntensity(parseFloat(e.target.value))}
                                                                data-default="0.6"
                                                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                        <span>{t('ctrl.color')}</span>
                                                        <span>{lightColor.toUpperCase()}</span>
                                                    </div>
                                                    <div className="relative h-6 w-full rounded border border-border flex items-center px-1 bg-background">
                                                        <div className="w-full h-4 rounded-sm border shadow-sm" style={{ backgroundColor: lightColor }} />
                                                        <input
                                                            type="color"
                                                            value={lightColor}
                                                            onChange={(e) => setLightColor(e.target.value)}
                                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                        <span>{t('fx.intensity')}</span>
                                                        <span>{lightIntensity.toFixed(2)}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="5"
                                                        step="0.05"
                                                        value={lightIntensity}
                                                        onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                                                        data-default="1.2"
                                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                                {(['x', 'y', 'z'] as const).map((axis) => (
                                                    <div className="space-y-1" key={axis}>
                                                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                                            <span>{t('gen3d.pos', { axis: axis.toUpperCase() })}</span>
                                                            <span>{lightPosition[axis].toFixed(1)}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="-10"
                                                            max="10"
                                                            step="0.1"
                                                            value={lightPosition[axis]}
                                                            onChange={(e) =>
                                                                setLightPosition((prev) => ({
                                                                    ...prev,
                                                                    [axis]: parseFloat(e.target.value)
                                                                }))
                                                            }
                                                            data-default="5"
                                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Canvas
                                shadows
                                camera={{ position: [0, 0, 4], fov: 50 }}
                                onCreated={({ gl }) => {
                                    gl.shadowMap.enabled = true;
                                    gl.shadowMap.type = THREE.PCFSoftShadowMap;
                                }}
                            >
                                <CaptureHelper controlRef={captureRef} />
                                <ambientLight intensity={0.35} />
                                {(() => {
                                    const shadowMapSize = Math.max(256, 2048 - castShadowBlur * 28);
                                    return (
                                        <directionalLight
                                            key={`shadow-${castShadowBlur}-${castShadowEnabled}`}
                                            position={[lightPosition.x, lightPosition.y, lightPosition.z]}
                                            intensity={lightIntensity}
                                            color={lightColor}
                                            castShadow={castShadowEnabled}
                                            shadow-mapSize-width={shadowMapSize}
                                            shadow-mapSize-height={shadowMapSize}
                                            shadow-radius={castShadowBlur * 1.5}
                                            shadow-bias={-0.0002}
                                            shadow-normalBias={0.02}
                                            shadow-camera-near={0.1}
                                            shadow-camera-far={20}
                                            shadow-camera-left={-3}
                                            shadow-camera-right={3}
                                            shadow-camera-top={3}
                                            shadow-camera-bottom={-3}
                                        />
                                    );
                                })()}
                                {castShadowEnabled && (
                                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
                                        <planeGeometry args={[8, 8]} />
                                        <shadowMaterial opacity={castShadowIntensity} />
                                    </mesh>
                                )}
                                {contactShadowEnabled && (
                                    <ContactShadows
                                        position={[0, groundY + 0.02, 0]}
                                        scale={3.5}
                                        blur={contactShadowBlur}
                                        opacity={contactShadowIntensity}
                                        far={1.2}
                                        color="#000000"
                                    />
                                )}
                                <Stage environment="city" intensity={0.6} shadows={false}>
                                    <ModelViewer url={modelUrl} onGroundY={setGroundY} />
                                </Stage>
                                <OrbitControls makeDefault autoRotate />
                            </Canvas>
                        </>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
                                {t('gen3d.unpreviewableFormat')}
                            </div>
                        )
                     ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                             {t('gen3d.previewPlaceholder')}
                        </div>
                     )}
                     
                     {modelUrl && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                            {canPreviewModelInApp && (
                                <button 
                                    onClick={handleCapture}
                                    className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform"
                                >
                                    <Plus size={12} /> {t('assets.addToCanvas')}
                                </button>
                            )}
                            <button
                                onClick={async () => {
                                    const confirmed = await dialog.confirm('Save generated 3D model to assets?', { title: t('gen3d.saveModel') });
                                    if(confirmed) {
                                        try {
                                            const urlMatch = modelUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i);
                                            const extension = (urlMatch?.[1] || 'glb').toLowerCase();
                                            const filenameBase = prompt.slice(0, 15).trim() || 'generated-3d';
                                            const filename = filenameBase.toLowerCase().endsWith(`.${extension}`)
                                                ? filenameBase
                                                : `${filenameBase}.${extension}`;

                                            await persistAssetToLibrary({
                                                source: modelUrl,
                                                filename,
                                                type: 'models',
                                                category: 'uploads',
                                                owner: currentUser || 'Guest',
                                            });
                                            toast({ title: t('gen3d.saved'), description: t('gen3d.savedToAssets'), variant: 'success' });
                                        } catch(e) { console.error(e); }
                                    }
                                }}
                                className="p-2 bg-secondary text-foreground rounded-full shadow-lg hover:bg-secondary/80 border border-border"
                                title={t('gen3d.saveToAssets')}
                            >
                                <Box size={14} />
                            </button>
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
}
