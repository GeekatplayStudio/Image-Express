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
import useEscapeKey from '@/hooks/useEscapeKey';
import useSingleFlight from '@/hooks/useSingleFlight';
import { extractApiErrorMessage, parseApiResponse } from '@/lib/apiErrorParsing';
import {
    DEFAULT_HITEMS_FORMAT,
    DEFAULT_HITEMS_MODEL,
    DEFAULT_HITEMS_REQUEST_TYPE,
    HITEMS_FORMAT_OPTIONS,
    HITEMS_MODEL_OPTIONS,
    HITEMS_PRESET_OPTIONS,
    HITEMS_REQUEST_TYPE_OPTIONS,
    applyHitemsPreset,
    getDefaultHitemsResolution,
    getHitemsAllowedResolutions,
    getMatchingHitemsPresetKey,
    hitemsRequiresMeshUrl,
    hitemsSupportsTextureStage,
    isHitemsPresetKey,
    normalizeHitemsFace,
    normalizeHitemsSelection,
    type HitemsPresetKey,
    type HitemsSelection,
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
        const normalizedLayerImageOptions = useMemo(() => {
            const options = [...(layerImageOptions || [])];
            if (initialImage) {
                const hasInitial = options.some((option) => option.imageUrl === initialImage);
                if (!hasInitial) {
                    options.unshift({ id: '__initial__', label: 'Current Source Image', imageUrl: initialImage });
                }
            }
            return options;
        }, [initialImage, layerImageOptions]);

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
        });
        setHitemsModel(savedSelection.model);
        setHitemsRequestType(savedSelection.requestType);
        setHitemsResolution(savedSelection.resolution);
        setHitemsFormat(savedSelection.format);
        setHitemsFace(savedSelection.face);
        setHitemsMeshUrl(savedSelection.meshUrl);
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
    }, [hitemsModel, hitemsRequestType, hitemsResolution, hitemsFormat, hitemsFace, hitemsMeshUrl, hitemsPreset, hitemsImageViewMode, hitemsFrontLayerId, hitemsBackLayerId, hitemsLeftLayerId, hitemsRightLayerId]);

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
                title: 'Missing API key',
                description: 'Add your Hitem key/token in Settings first.',
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
                    title: 'Hitem setup looks good',
                    description: `${remoteMessage}${hintText}`,
                    variant: 'success'
                });
            } else {
                const hintText = localHints.length ? ` ${localHints.join(' ')}` : '';
                toast({
                    title: 'Hitem setup validation failed',
                    description: `${remoteMessage}${hintText}`,
                    variant: 'destructive'
                });
            }
        } catch (e) {
            toast({
                title: 'Validation error',
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
                title: 'Missing job ID',
                description: 'Enter a Hitem task ID to recover tracking.',
                variant: 'warning'
            });
            return;
        }

        let key = getSelectedKey();
        if (!key) {
            toast({
                title: 'Missing API key',
                description: 'Set your Hitem key before recovering a job.',
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
            title: 'Recovery started',
            description: `Tracking Hitem job ${jobId}.`,
            variant: 'success'
        });
    };

    const handleGenerate = async () => {
        await runSingleFlight(async () => {
            let key = getSelectedKey();
            if (!key) {
                toast({
                    title: 'Missing API key',
                    description: `Configure API key for ${selectedProvider}.`,
                    variant: 'warning'
                });
                return;
            }

            key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();
            if (isMissingSanitizedKey(key)) {
                toast({
                    title: 'Missing API key',
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
                            title: 'Image required',
                            description: 'Hitem3D currently supports image-to-3D only. Select an image first.',
                            variant: 'warning'
                        });
                        setIsLoading(false);
                        return;
                    }
                    await generateHitems(key);
                } else {
                    toast({ title: 'Coming soon', description: 'Service integration in progress.', variant: 'warning' });
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
                          toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
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
                        apiKey: key // Store key with job to poll correctly
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
                    title: 'Generation failed',
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
                     toast({ title: 'Missing prompt', description: 'Please enter a prompt.', variant: 'warning' });
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
                            title: 'Upload failed',
                            description: uploadReason,
                            variant: 'destructive'
                        });
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                     console.error("Failed to process image for upload", e);
                     toast({ title: 'Upload failed', description: 'Failed to process upload.', variant: 'destructive' });
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
                    apiKey: key
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
                 toast({ title: 'Generation failed', description: errorMsg, variant: 'destructive' });
             setIsLoading(false);
        }
    };

    const generateHitems = async (key: string) => {
        if (!frontImageUrl) {
            toast({
                title: 'Missing front layer',
                description: 'Select a front layer/image for Hitem generation.',
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
        });
        const rawFaceText = hitemsFace.trim();
        if (rawFaceText && !normalizeHitemsFace(rawFaceText)) {
            toast({
                title: 'Invalid face count',
                description: 'Face count must be an integer between 100000 and 2000000.',
                variant: 'warning'
            });
            setIsLoading(false);
            return;
        }
        applyHitemsSelectionToState(normalizedSelection);

        if (hitemsRequiresMeshUrl(normalizedSelection.requestType) && !normalizedSelection.meshUrl) {
            toast({
                title: 'Mesh URL required',
                description: 'Texture Existing Mesh mode requires a mesh_url (public GLB/OBJ URL).',
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
                    title: 'Missing API key',
                    description: 'Configure a valid Hitem key/token in Settings, then retry.',
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
                    onStartBackgroundJob({
                        id: taskId,
                        type: 'image-to-3d',
                        provider: 'hitems',
                        status: 'IN_PROGRESS',
                        prompt: `${normalizedSelection.model} (${normalizedSelection.resolution})`,
                        createdAt: Date.now(),
                        apiKey: key
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
                    title: 'Generation failed',
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
                title: 'Generation failed',
                description: `${e instanceof Error ? e.message : 'Failed to send image to Hitem3D.'} Check setup with Validate Setup.`,
                variant: 'destructive'
            });
            setIsLoading(false);
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
            return { label: 'Check setup', isReady: false };
        }

        const storedKey = (localStorage.getItem('hitems_api_key') || '').trim();
        const typedKey = [hitemsAk.trim(), hitemsSk.trim()].every(Boolean) ? `${hitemsAk.trim()}:${hitemsSk.trim()}` : '';
        const effectiveKey = (storedKey || typedKey).replace(/Bearer /gi, '').replace(/["']/g, '').trim();
        if (isMissingSanitizedKey(effectiveKey)) {
            return { label: 'Missing API key', isReady: false };
        }

        const appId = (localStorage.getItem('hitems_appid') || '').trim();
        if (!appId) {
            return { label: 'Ready (App ID optional)', isReady: true };
        }

        return { label: 'Ready', isReady: true };
    })();

    // Need to import Sparkles if I use it
    return (
        <div className="absolute top-4 left-4 z-50 bg-card/95 backdrop-blur-xl border border-border pb-4 rounded-xl shadow-2xl w-80 animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/20">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                     <Box size={16} className="text-primary" />
                    {initialImage ? 'Image to 3D' : 'AI 3D Generator'}
                </h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">X</button>
            </div>

            {/* Service Selection */}
            {!isJobRunning && !modelUrl && (
                <div className="px-4 pt-3">
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">Provider</label>
                    <select 
                        value={selectedProvider} 
                        onChange={handleProviderChange}
                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border focus:border-primary outline-none text-foreground dark:bg-zinc-950 bg-zinc-950"
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
                                <label className="text-xs font-medium text-muted-foreground">App ID (ak_...)</label>
                                 <input 
                                    type="text" 
                                    value={hitemsAk}
                                    onChange={(e) => setHitemsAk(e.target.value)}
                                    placeholder="ak_xxxxxxxx"
                                    className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">App Secret (sk_...)</label>
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
                            <label className="text-xs font-medium text-muted-foreground">{selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key (Quick Input)</label>
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
                                    alt="Source"
                                    fill
                                    sizes="256px"
                                    className="object-contain rounded"
                                    unoptimized
                                />
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-muted-foreground text-center">
                            {selectedProvider === 'meshy' && 'Note: Meshy automatically isolates the subject. For best results, use images with clear contrast or transparent backgrounds.'}
                            {selectedProvider === 'tripo' && 'Note: Tripo performs best with a centered subject and minimal background noise.'}
                            {selectedProvider === 'hitems' && 'Note: Hitem3D supports general and portrait models. Use General v2.0 for segmentation-aware output, and geometry-only mode for relief-style meshes.'}
                        </p>
                    </div>
                )}

                {selectedProvider === 'hitems' && initialImage && (
                    <div className="space-y-2 rounded-md border border-border/60 bg-secondary/30 p-3">
                        <div className="space-y-2 rounded-md border border-border/40 bg-background/60 p-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-medium uppercase text-muted-foreground">Setup Checklist</p>
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
                                            Open Settings
                                        </button>
                                    )}
                                    <button
                                        onClick={validateHitemsSetup}
                                        disabled={isValidatingHitems}
                                        className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary disabled:opacity-50"
                                        type="button"
                                    >
                                        {isValidatingHitems ? 'Validating...' : 'Validate Setup'}
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground">1) Save `hitems_api_key` (token or `ak:sk`) in Settings.</p>
                            <p className="text-[10px] text-muted-foreground">2) If auth fails or responses look empty, set `hitems_appid` in Settings.</p>
                            <p className="text-[10px] text-muted-foreground">3) For staged texturing (Task 2), provide a public mesh URL.</p>
                            <div className="pt-1 space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Recover Existing Job ID</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={recoverJobId}
                                        onChange={(e) => setRecoverJobId(e.target.value)}
                                        placeholder="task_id..."
                                        className="flex-1 px-2 py-1 bg-secondary/50 rounded border border-border text-[11px] font-mono"
                                    />
                                    <button
                                        onClick={handleRecoverHitemsJob}
                                        className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary"
                                        type="button"
                                    >
                                        Recover
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">One-Click Presets</label>
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
                                {activeHitemsPreset?.description || 'Custom preset values.'}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Model</label>
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
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Resolution</label>
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
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">Image View Mode</label>
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
                                    Single Image
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
                                    Multi-view (Front/Back/Sides)
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground">Front Preview</p>
                                    <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                        {frontImageUrl ? (
                                            <Image src={frontImageUrl} alt="Front layer preview" fill sizes="128px" className="object-contain" unoptimized />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">No front layer</div>
                                        )}
                                    </div>
                                </div>
                                {hitemsImageViewMode === 'multi' && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-muted-foreground">Back Preview</p>
                                        <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                            {resolveLayerImageUrl(hitemsBackLayerId) ? (
                                                <Image src={resolveLayerImageUrl(hitemsBackLayerId)} alt="Back layer preview" fill sizes="128px" className="object-contain" unoptimized />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 gap-1 pt-1">
                                <label className="text-[10px] text-muted-foreground">Front Layer</label>
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
                            {hitemsImageViewMode === 'multi' && (
                                <div className="grid grid-cols-1 gap-1 pt-1">
                                    <p className="text-[10px] text-muted-foreground">Assign document layers for Back / Left / Right views. At least one extra view is required.</p>
                                    <div className="grid grid-cols-2 gap-2 pb-1">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground">Left Preview</p>
                                            <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                                {resolveLayerImageUrl(hitemsLeftLayerId) ? (
                                                    <Image src={resolveLayerImageUrl(hitemsLeftLayerId)} alt="Left layer preview" fill sizes="128px" className="object-contain" unoptimized />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground">Right Preview</p>
                                            <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">
                                                {resolveLayerImageUrl(hitemsRightLayerId) ? (
                                                    <Image src={resolveLayerImageUrl(hitemsRightLayerId)} alt="Right layer preview" fill sizes="128px" className="object-contain" unoptimized />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <select
                                        value={hitemsBackLayerId}
                                        onChange={(e) => setHitemsBackLayerId(e.target.value)}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="">Back: Not set</option>
                                        {normalizedLayerImageOptions.map((option) => (
                                            <option key={`back-${option.id}`} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={hitemsLeftLayerId}
                                        onChange={(e) => setHitemsLeftLayerId(e.target.value)}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="">Left: Not set</option>
                                        {normalizedLayerImageOptions.map((option) => (
                                            <option key={`left-${option.id}`} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={hitemsRightLayerId}
                                        onChange={(e) => setHitemsRightLayerId(e.target.value)}
                                        className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"
                                    >
                                        <option value="">Right: Not set</option>
                                        {normalizedLayerImageOptions.map((option) => (
                                            <option key={`right-${option.id}`} value={option.id}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Task</label>
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
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Format</label>
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
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">Face Count (Optional)</label>
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
                                <label className="text-[10px] font-medium text-muted-foreground uppercase">Mesh URL (Required for staged texture)</label>
                                <input
                                    type="url"
                                    value={hitemsMeshUrl}
                                    onChange={(e) => handleHitemsMeshUrlChange(e.target.value)}
                                    placeholder="https://.../input-mesh.glb"
                                    className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm"
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Tip: portrait models are best for faces, General v2.0 is segmentation-aware, and geometry-only mode is useful for relief/base-mesh workflows.
                        </p>
                    </div>
                )}

                {!initialImage && selectedProvider !== 'hitems' && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="A cute ceramic cat..."
                            className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm min-h-[80px]"
                        />
                    </div>
                )}

                {selectedProvider === 'hitems' && !initialImage && (
                    <div className="rounded-md border border-border/60 bg-secondary/40 p-2 text-[11px] text-muted-foreground">
                        Hitem3D currently supports image-to-3D only. Select an image first, then reopen the 3D panel.
                    </div>
                )}

                <button 
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16}/> : <RotateCw size={16}/>}
                    {isLoading ? 'Generating...' : (initialImage ? 'Transform to 3D' : 'Generate 3D Model')}
                </button>
                {jobStatus && <p className="text-xs text-center text-muted-foreground">
                    {jobStatus === 'SUCCEEDED' ? 'Complete!' : 
                     jobStatus === 'FAILED' ? (activeJob?.error ? `Failed: ${activeJob.error}` : 'Failed') : 
                     `Generating... ${jobProgress}%`}
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
                                        title="Export Resolution Settings"
                                    >
                                        <Settings2 size={12} />
                                        {resolution.width}x{resolution.height}
                                    </button>
                                    {showResSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-48 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">Export Resolution</h4>
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div>
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Width</label>
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
                                                    <label className="text-muted-foreground block mb-1 text-[10px] uppercase">Height</label>
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
                                        title="Lighting Settings"
                                    >
                                        <Sun size={12} />
                                        Light
                                    </button>
                                    {showLightSettings && (
                                        <div className="bg-popover p-3 rounded-lg shadow-xl border border-border text-xs w-56 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 origin-top-right">
                                            <h4 className="font-semibold mb-2">Lighting</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground uppercase">Cast Shadow</span>
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
                                                                <span>Cast Blur</span>
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
                                                                <span>Cast Intensity</span>
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
                                                    <span className="text-[10px] text-muted-foreground uppercase">Contact Shadow</span>
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
                                                                <span>Contact Blur</span>
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
                                                                <span>Contact Intensity</span>
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
                                                        <span>Color</span>
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
                                                        <span>Intensity</span>
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
                                                            <span>Pos {axis.toUpperCase()}</span>
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
                                Model was generated in a format that cannot be previewed in-app. Save it to assets or switch Hitem format to GLB.
                            </div>
                        )
                     ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                             Preview will appear here
                        </div>
                     )}
                     
                     {modelUrl && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                            {canPreviewModelInApp && (
                                <button 
                                    onClick={handleCapture}
                                    className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:scale-105 transition-transform"
                                >
                                    <Plus size={12} /> Add to Canvas
                                </button>
                            )}
                            <button
                                onClick={async () => {
                                    const confirmed = await dialog.confirm('Save generated 3D model to assets?', { title: 'Save 3D model' });
                                    if(confirmed) {
                                        try {
                                            const res = await fetch('/api/assets/save-url', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    url: modelUrl,
                                                    filename: prompt.slice(0, 15) || 'generated-3d',
                                                    type: 'models',
                                                    owner: currentUser || 'Guest'
                                                })
                                            });
                                            if(res.ok) {
                                                toast({ title: 'Saved', description: 'Saved to assets.', variant: 'success' });
                                            } else {
                                                toast({ title: 'Save failed', description: 'Failed to save asset.', variant: 'destructive' });
                                            }
                                        } catch(e) { console.error(e); }
                                    }
                                }}
                                className="p-2 bg-secondary text-foreground rounded-full shadow-lg hover:bg-secondary/80 border border-border"
                                title="Save to Assets"
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
