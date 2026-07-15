'use client';

import { X, HelpCircle } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { useI18n } from '@/providers/I18nProvider';

interface HelpPopupProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'comfy' | 'api';
}

export default function HelpPopup({ isOpen, onClose, type }: HelpPopupProps) {
    const { t } = useI18n();
    useEscapeKey(onClose, { enabled: isOpen });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-secondary/20 flex justify-between items-center">
                    <h3 className="font-semibold flex items-center gap-2">
                        <HelpCircle size={18} className="text-primary" />
                        {type === 'comfy' ? t('help.comfy.title') : t('help.api.title')}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-4 text-sm text-foreground/80 overflow-y-auto max-h-[60vh]">
                    {type === 'comfy' ? (
                        <>
                            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-xs leading-relaxed">
                                <strong>ComfyUI</strong> {t('help.comfy.intro')}
                            </div>

                            <ol className="list-decimal list-inside space-y-3 marker:font-bold">
                                <li>
                                    <strong>{t('help.comfy.step1.label')}</strong> {t('help.comfy.step1.pre')}{' '}
                                    <a href="https://github.com/comfyanonymous/ComfyUI" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {t('help.comfy.step1.linkText')}
                                    </a>{' '}
                                    {t('help.comfy.step1.post')}
                                </li>
                                <li>
                                    <strong>{t('help.comfy.step2.label')}</strong> {t('help.comfy.step2.pre')}{' '}
                                    <code className="bg-secondary px-1 py-0.5 rounded">ComfyUI/models/checkpoints</code>{' '}
                                    {t('help.comfy.step2.post')}
                                </li>
                                <li>
                                    <strong>{t('help.comfy.step3.label')}</strong> {t('help.comfy.step3.pre')}{' '}
                                    <code className="bg-secondary px-1 py-0.5 rounded">run_nvidia_gpu.bat</code>{' '}
                                    {t('help.comfy.step3.post')}
                                </li>
                                <li>
                                    <strong>{t('help.comfy.step4.label')}</strong> {t('help.comfy.step4.pre')}{' '}
                                    <code className="bg-secondary px-1 py-0.5 rounded text-primary">http://localhost:8188</code>
                                    {'. '}
                                    {t('help.comfy.step4.post')}
                                </li>
                                <li>
                                    <strong>{t('help.comfy.step5.label')}</strong> {t('help.comfy.step5.pre')}{' '}
                                    <code className="bg-secondary px-1 py-0.5 rounded">--enable-cors-header</code>
                                    {'. '}
                                    {t('help.comfy.step5.mid')}{' '}
                                    <code className="bg-secondary px-1 py-0.5 rounded">http://localhost:8188</code>{' '}
                                    {t('help.comfy.step5.post')}
                                </li>
                            </ol>
                        </>
                    ) : (
                         <>
                            <p>{t('help.api.intro')}</p>
                            <div className="space-y-4 mt-2">
                                <div className="border border-border rounded-lg p-3">
                                    <h4 className="font-medium text-foreground mb-1">{t('help.api.meshy.title')}</h4>
                                    <p className="text-xs text-muted-foreground mb-2">{t('help.api.meshy.desc')}</p>
                                    <a href="https://www.meshy.ai/" target="_blank" className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded inline-block">{t('help.api.meshy.cta')}</a>
                                </div>
                                <div className="border border-border rounded-lg p-3">
                                    <h4 className="font-medium text-foreground mb-1">{t('help.api.stability.title')}</h4>
                                    <p className="text-xs text-muted-foreground mb-2">{t('help.api.stability.desc')}</p>
                                    <a href="https://platform.stability.ai/" target="_blank" className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded inline-block">{t('help.api.stability.cta')}</a>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 bg-secondary/10 border-t border-border flex justify-end">
                    <button onClick={onClose} className="text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-md transition-colors">
                        {t('help.gotIt')}
                    </button>
                </div>
            </div>
        </div>
    );
}
