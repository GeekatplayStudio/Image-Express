import React from 'react';
import { useI18n } from '@/providers/I18nProvider';

interface LayoutPropertiesProps {
    onAlign: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    onDistribute: (distribution: 'horizontal' | 'vertical') => void;
    canDistribute: boolean;
}

export function LayoutProperties({ onAlign, onDistribute, canDistribute }: LayoutPropertiesProps) {
    const { t } = useI18n();
    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm mb-3">{t('layout.alignment')}</h3>
            <div className="flex gap-1">
                <button title={t('layout.alignLeft')} onClick={() => onAlign('left')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22L4 2" /><rect width="10" height="6" x="8" y="5" rx="1" /><rect width="14" height="6" x="8" y="13" rx="1" /></svg>
                </button>
                <button title={t('layout.alignCenter')} onClick={() => onAlign('center')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L12 22" /><rect width="14" height="6" x="5" y="5" rx="1" /><rect width="10" height="6" x="7" y="13" rx="1" /></svg>
                </button>
                <button title={t('layout.alignRight')} onClick={() => onAlign('right')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 22L20 2" /><rect width="10" height="6" x="6" y="5" rx="1" /><rect width="14" height="6" x="2" y="13" rx="1" /></svg>
                </button>
                <div className="w-px bg-border mx-1" />
                <button title={t('layout.alignTop')} onClick={() => onAlign('top')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 4L2 4" /><rect width="6" height="10" x="5" y="8" rx="1" /><rect width="6" height="14" x="13" y="8" rx="1" /></svg>
                </button>
                <button title={t('layout.alignMiddle')} onClick={() => onAlign('middle')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12L2 12" /><rect width="6" height="14" x="5" y="5" rx="1" /><rect width="6" height="10" x="13" y="7" rx="1" /></svg>
                </button>
                <button title={t('layout.alignBottom')} onClick={() => onAlign('bottom')} className="p-1.5 hover:bg-secondary rounded">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 20L2 20" /><rect width="6" height="10" x="5" y="6" rx="1" /><rect width="6" height="14" x="13" y="2" rx="1" /></svg>
                </button>
            </div>
            
            {canDistribute && (
                <div className="flex gap-1 mt-2">
                    <button title={t('layout.distributeHorizontal')} onClick={() => onDistribute('horizontal')} className="p-1.5 hover:bg-secondary rounded">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22L4 2" /><path d="M20 22L20 2" /><rect width="6" height="10" x="9" y="7" rx="1" /></svg>
                    </button>
                    <button title={t('layout.distributeVertical')} onClick={() => onDistribute('vertical')} className="p-1.5 hover:bg-secondary rounded">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 4L2 4" /><path d="M22 20L2 20" /><rect width="10" height="6" x="7" y="9" rx="1" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
}
