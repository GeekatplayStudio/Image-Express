'use client';

import { useState, useEffect } from 'react';
import { LayoutTemplate, Plus, Loader2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';

interface Template {
    id: string;
    name: string;
    path: string; // URL to json
    image: string; // URL to thumbnail
}

interface TemplateLibraryProps {
    onSelect: (templateDataUrl: string) => void;
    onSaveCurrent: () => void;
    onClose: () => void;
}

export default function TemplateLibrary({ onSelect, onSaveCurrent, onClose }: TemplateLibraryProps) {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const dialog = useDialog();
    const { toast } = useToast();

    const fetchTemplates = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/templates/list');
            const data = await res.json();
            if (data.success) {
                setTemplates(data.templates);
            }
        } catch (error) {
            console.error("Failed to load templates", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, templatePath: string) => {
        e.stopPropagation();
        const confirmed = await dialog.confirm('Delete this template?', { title: 'Delete Template', variant: 'destructive' });
        if (!confirmed) return;

        try {
            const res = await fetch('/api/templates/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: templatePath })
            });
            if(res.ok) {
                fetchTemplates();
            } else {
                toast({ title: 'Delete failed', description: 'Failed to delete template.', variant: 'destructive' });
            }
        } catch(e) {
            console.error(e);
            toast({ title: 'Delete failed', description: 'Something went wrong while deleting.', variant: 'destructive' });
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    return (
        <DraggableResizablePanel
            className="bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200"
            initialPosition={{ x: 80, y: 320 }}
            initialSize={{ width: 320, height: 500 }}
            minWidth={300}
            minHeight={360}
        >
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/10 rounded-t-lg draggable-handle cursor-move">
                <div className="flex items-center gap-2">
                    <LayoutTemplate size={16} />
                    <h3 className="font-semibold text-sm">Templates</h3>
                </div>
                <button 
                    onClick={onSaveCurrent}
                    className="flex items-center gap-1 text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/90 transition-colors"
                    title="Save current workspace as new template"
                >
                    <Plus size={12} />
                    <span>Save Current</span>
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        <Loader2 className="animate-spin" />
                        <span className="text-xs">Loading templates...</span>
                    </div>
                ) : templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-4">
                        <LayoutTemplate size={32} className="mb-2 opacity-50" />
                        <p className="text-sm">No templates yet</p>
                        <p className="text-xs mt-1">Save your workspace to see it here</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                onClick={() => onSelect(template.path)}
                                className="group relative flex flex-col items-start gap-2 p-2 rounded-lg border border-border/50 hover:bg-secondary/50 hover:border-primary/50 transition-all text-left cursor-pointer"
                            >
                                <div className="w-full aspect-square relative bg-white/5 rounded overflow-hidden border border-border/30">
                                    <Image 
                                        src={template.image} 
                                        alt={template.name}
                                        fill
                                        className="object-cover transition-transform group-hover:scale-105"
                                        unoptimized
                                    />
                                </div>
                                <span className="text-xs font-medium truncate w-full">{template.name}</span>
                                <button 
                                    onClick={(e) => handleDelete(e, template.path)}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-destructive text-white rounded opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border bg-secondary/5 flex justify-end">
                <button 
                    onClick={onClose}
                    className="text-xs text-muted-foreground hover:text-foreground"
                >
                    Close
                </button>
            </div>
        </DraggableResizablePanel>
    );
}
