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
    t,
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
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKeyInSettings'), variant: 'warning' });
                return;
            }
            if (!prompt.trim()) {
                toast({ title: t('stab.missingPrompt'), description: t('stab.describeImage'), variant: 'warning' });
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

                toast({ title: t('stab.generationFailed'), description: data.message || 'Error generating image.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.generationFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleRemoveBg = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKey'), variant: 'warning' });
                return;
            }
            if (!selectedCanvasImage) {
                toast({ title: t('stab.noImageSelected'), description: t('stab.selectImageFirst'), variant: 'warning' });
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

                toast({ title: t('stab.removeBgFailed'), description: data.message || 'Error removing background.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.removeBgFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleUpscale = async (type: 'conservative' | 'creative') => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKey'), variant: 'warning' });
                return;
            }
            if (!selectedCanvasImage) {
                toast({ title: t('stab.noImageSelected'), description: t('stab.selectImageFirst'), variant: 'warning' });
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
                    toast({ title: t('stab.upscaleFailed'), description: data.message || 'Error starting upscale.', variant: 'destructive' });
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
                    toast({ title: t('stab.upscaleStarted'), description: t('stab.upscaleRunning'), variant: 'success' });
                    onClose();
                    return;
                }

                handleSuccess(data.image);
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.upscaleFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleImg2Img = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKey'), variant: 'warning' });
                return;
            }

            const sourceImage = captureSourceImage();
            if (!sourceImage) {
                console.warn('[Stability] No source image captured', { sourceType, flattenSelection });
                toast({ title: t('stab.noImageSource'), description: t('stab.selectImageOrCanvas'), variant: 'warning' });
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

                toast({ title: t('stab.img2imgFailed'), description: data.message || 'Error generating image.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.img2imgFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleOutpaint = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKey'), variant: 'warning' });
                return;
            }

            const sourceImage = captureSourceImage();
            if (!sourceImage) {
                toast({ title: t('stab.noImageSource'), description: t('stab.selectAreaToOutpaint'), variant: 'warning' });
                return;
            }

            if (!outpaintDirs.left && !outpaintDirs.right && !outpaintDirs.up && !outpaintDirs.down) {
                toast({ title: t('stab.noDirection'), description: t('stab.selectDirection'), variant: 'warning' });
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

                toast({ title: t('stab.outpaintFailed'), description: data.message || 'Error outpainting.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.outpaintFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const handleInpaint = async () => {
        await runSingleFlight(async () => {
            if (!apiKey) {
                toast({ title: t('stab.missingApiKey'), description: t('stab.setKey'), variant: 'warning' });
                return;
            }

            let imageBlob: Blob | null = null;
            let maskBlob: Blob | null = null;

            if (sourceType === 'canvas' || isCanvasMasking || canvas?.getObjects().some((object) => object.get('isMask'))) {
                const captured = await captureCanvasAndMask();
                if (!captured) {
                    toast({ title: t('stab.captureFailed'), description: t('stab.couldNotCapture'), variant: 'destructive' });
                    return;
                }
                imageBlob = captured.imageBlob;
                maskBlob = captured.maskBlob;
            } else {
                if (!selectedCanvasImage) {
                    toast({ title: t('stab.noImageSelected'), description: t('stab.selectImageFirst'), variant: 'warning' });
                    return;
                }
                if (!maskDataUrl) {
                    toast({ title: t('stab.noMask'), description: t('stab.drawMask'), variant: 'warning' });
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

                toast({ title: t('stab.inpaintFailed'), description: data.message || 'Error running inpaint.', variant: 'destructive' });
            } catch (error) {
                console.error(error);
                toast({ title: t('stab.inpaintFailed'), description: t('stab.somethingWrong'), variant: 'destructive' });
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
