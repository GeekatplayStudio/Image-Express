import type { StabilityRequestDependencies } from './types';

export const createStabilityRequestHandlers = ({
    apiKey,
    prompt,
    aspectRatio,
    strength,
    selectedCanvasImage,
    sourceType,
    flattenSelection,
    maskDataUrl,
    outpaintDirs,
    isCanvasMasking,
    canvas,
    runSingleFlight,
    toast,
    onJobCreated,
    onClose,
    setIsProcessing,
    setResultImage,
    handleSuccess,
    captureSourceImage,
    captureCanvasAndMask,
    toggleCanvasMasking,
}: StabilityRequestDependencies) => {
    const handleGenerate = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key in settings.', variant: 'warning' });
                return;
            }
            if (!prompt.trim()) {
                toast({ title: 'Missing Prompt', description: 'Please describe the image you want to generate.', variant: 'warning' });
                return;
            }

            setIsProcessing(true);
            setResultImage(null);

            try {
                const formData = new FormData();
                formData.append('prompt', prompt);
                formData.append('aspect_ratio', aspectRatio);
                formData.append('output_format', 'png');

                const res = await fetch('/api/ai/stability/generate', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    handleSuccess(data.image);
                    return;
                }

                toast({ title: 'Generation failed', description: data.message || 'Error generating image.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Generation failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleRemoveBg = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
                return;
            }
            if (!selectedCanvasImage) {
                toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
                return;
            }

            setIsProcessing(true);
            try {
                const blobInfo = await fetch(selectedCanvasImage).then((response) => response.blob());
                const formData = new FormData();
                formData.append('image', blobInfo);
                formData.append('output_format', 'png');

                const res = await fetch('/api/ai/stability/remove-bg', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    handleSuccess(data.image);
                    return;
                }

                toast({ title: 'Remove BG failed', description: data.message || 'Error removing background.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Remove BG failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleUpscale = async (type: 'conservative' | 'creative') => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
                return;
            }
            if (!selectedCanvasImage) {
                toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
                return;
            }

            setIsProcessing(true);
            try {
                const blobInfo = await fetch(selectedCanvasImage).then((response) => response.blob());
                const formData = new FormData();
                formData.append('image', blobInfo);
                formData.append('prompt', prompt);
                formData.append('output_format', 'png');

                const res = await fetch(`/api/ai/stability/upscale?type=${type}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (!data.success) {
                    toast({ title: 'Upscale failed', description: data.message || 'Error starting upscale.', variant: 'destructive' });
                    return;
                }

                if (data.status === 'IN_PROGRESS') {
                    onJobCreated?.({
                        id: data.id,
                        type: 'stability-upscale',
                        status: 'IN_PROGRESS',
                        createdAt: Date.now(),
                        apiKey,
                        provider: 'stability',
                        prompt,
                        request: {
                            provider: 'stability',
                            mode: 'upscale',
                            imageUrl: selectedCanvasImage,
                            upscaleType: type,
                            prompt,
                        },
                    });
                    toast({ title: 'Upscale started', description: 'Creative upscale running in background.', variant: 'success' });
                    onClose();
                    return;
                }

                handleSuccess(data.image);
            } catch (error) {
                console.error(error);
                toast({ title: 'Upscale failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleImg2Img = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
                return;
            }

            const sourceImage = captureSourceImage();
            if (!sourceImage) {
                console.warn('[Stability] No source image captured', { sourceType, flattenSelection });
                toast({ title: 'No image source', description: 'Select an image or use full canvas.', variant: 'warning' });
                return;
            }

            setIsProcessing(true);
            try {
                const blobInfo = await fetch(sourceImage).then((response) => response.blob());
                const formData = new FormData();
                formData.append('image', blobInfo);
                formData.append('prompt', prompt);
                formData.append('strength', String(strength[0]));
                formData.append('mode', 'image-to-image');
                formData.append('output_format', 'png');

                const res = await fetch('/api/ai/stability/img2img', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    handleSuccess(data.image);
                    return;
                }

                toast({ title: 'Img2Img failed', description: data.message || 'Error generating image.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Img2Img failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleOutpaint = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
                return;
            }

            const sourceImage = captureSourceImage();
            if (!sourceImage) {
                toast({ title: 'No image source', description: 'Select an image/area to outpaint from.', variant: 'warning' });
                return;
            }

            if (!outpaintDirs.left && !outpaintDirs.right && !outpaintDirs.up && !outpaintDirs.down) {
                toast({ title: 'No direction', description: 'Select at least one direction to expand.', variant: 'warning' });
                return;
            }

            setIsProcessing(true);
            try {
                const blobInfo = await fetch(sourceImage).then((response) => response.blob());
                const formData = new FormData();
                formData.append('image', blobInfo);
                formData.append('prompt', prompt);
                formData.append('output_format', 'png');

                if (outpaintDirs.left) formData.append('left', 'true');
                if (outpaintDirs.right) formData.append('right', 'true');
                if (outpaintDirs.up) formData.append('up', 'true');
                if (outpaintDirs.down) formData.append('down', 'true');

                const res = await fetch('/api/ai/stability/outpaint', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    handleSuccess(data.image);
                    return;
                }

                toast({ title: 'Outpaint failed', description: data.message || 'Error outpainting.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Outpaint failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleInpaint = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: 'Missing API key', description: 'Please set Stability API Key.', variant: 'warning' });
                return;
            }

            let imageBlob: Blob | null = null;
            let maskBlob: Blob | null = null;

            if (sourceType === 'canvas' || isCanvasMasking || canvas?.getObjects().some((object) => object.get('isMask'))) {
                const captured = await captureCanvasAndMask();
                if (!captured) {
                    toast({ title: 'Capture failed', description: 'Could not capture canvas.', variant: 'destructive' });
                    return;
                }
                imageBlob = captured.imageBlob;
                maskBlob = captured.maskBlob;
            } else {
                if (!selectedCanvasImage) {
                    toast({ title: 'No image selected', description: 'Select an image on canvas first.', variant: 'warning' });
                    return;
                }
                if (!maskDataUrl) {
                    toast({ title: 'No mask', description: 'Please draw a mask on the image.', variant: 'warning' });
                    return;
                }
                imageBlob = await fetch(selectedCanvasImage).then((response) => response.blob());
                maskBlob = await fetch(maskDataUrl).then((response) => response.blob());
            }

            setIsProcessing(true);
            try {
                if (!imageBlob || !maskBlob) {
                    throw new Error('Image or mask data is missing.');
                }

                const formData = new FormData();
                formData.append('image', imageBlob);
                formData.append('mask', maskBlob);
                formData.append('prompt', prompt);
                formData.append('output_format', 'png');

                const res = await fetch('/api/ai/stability/inpaint', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: formData,
                });

                const data = await res.json();
                if (data.success) {
                    handleSuccess(data.image);
                    if (isCanvasMasking) {
                        toggleCanvasMasking();
                    }
                    return;
                }

                toast({ title: 'Inpaint failed', description: data.message || 'Error running inpaint.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Inpaint failed', description: 'Something went wrong.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    return {
        handleGenerate,
        handleRemoveBg,
        handleUpscale,
        handleImg2Img,
        handleOutpaint,
        handleInpaint,
    };
};
