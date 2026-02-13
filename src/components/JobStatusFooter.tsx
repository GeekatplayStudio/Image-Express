'use client';

import { Loader2, CheckCircle, XCircle, Copy } from 'lucide-react';
import { BackgroundJob } from '@/types';

interface JobStatusFooterProps {
    jobs: BackgroundJob[];
    onClear: (jobId: string) => void;
}

export default function JobStatusFooter({ jobs, onClear }: JobStatusFooterProps) {
    if (jobs.length === 0) return null;

    const copyJobId = async (id: string) => {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(id);
            }
        } catch (error) {
            console.error('Failed to copy job id', error);
        }
    };

    return (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[min(92vw,30rem)] flex flex-col gap-2 z-50 pointer-events-none">
            {jobs.map((job) => (
                <div 
                    key={job.id} 
                    className="pointer-events-auto bg-card border border-border shadow-lg rounded-lg p-3 w-full flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2"
                >
                    <div className="shrink-0">
                        {job.status === 'SUCCEEDED' ? (
                            <CheckCircle size={20} className="text-green-500" />
                        ) : job.status === 'FAILED' ? (
                            <XCircle size={20} className="text-red-500" />
                        ) : (
                            <div className="relative">
                                <Loader2 size={20} className="text-primary animate-spin" />
                                {typeof job.progress === 'number' && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                                        {job.progress}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                            {job.type === 'text-to-3d' ? `Gen: ${job.prompt}` : 'Image to 3D'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] font-mono text-muted-foreground truncate" title={job.id}>
                                {job.id}
                            </p>
                            <button
                                onClick={() => copyJobId(job.id)}
                                className="shrink-0 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                                title="Copy Job ID"
                            >
                                <Copy size={11} />
                            </button>
                        </div>
                        <p
                            className={`text-xs mt-1 ${job.status === 'FAILED' ? 'text-red-500' : 'text-muted-foreground'} truncate`}
                            title={job.error || undefined}
                        >
                            {job.status === 'SUCCEEDED' ? 'Saved to server & added.' : 
                             job.status === 'FAILED' ? (job.error || 'Failed to process.') : 
                             (typeof job.progress === 'number' ? `Processing... ${job.progress}%` : 'Processing...')}
                        </p>
                    </div>

                    {(job.status === 'SUCCEEDED' || job.status === 'FAILED') && (
                        <button 
                            onClick={() => onClear(job.id)}
                            className="shrink-0 p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                        >
                            <XCircle size={14} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
