'use client';

import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { BackgroundJob } from '@/types';

interface JobStatusFooterProps {
    jobs: BackgroundJob[];
    onClear: (jobId: string) => void;
}

export default function JobStatusFooter({ jobs, onClear }: JobStatusFooterProps) {
    if (jobs.length === 0) return null;

    return (
        <div className="absolute bottom-20 right-4 flex flex-col gap-2 z-50 pointer-events-none">
            {jobs.map((job) => (
                <div 
                    key={job.id} 
                    className="pointer-events-auto bg-card border border-border shadow-lg rounded-lg p-3 w-72 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
                >
                    <div className="shrink-0">
                        {job.status === 'SUCCEEDED' ? (
                            <CheckCircle size={20} className="text-green-500" />
                        ) : job.status === 'FAILED' ? (
                            <XCircle size={20} className="text-red-500" />
                        ) : (
                            <div className="relative">
                                <Loader2 size={20} className="text-primary animate-spin" />
                                {job.progress && (
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
                        <p className="text-xs text-muted-foreground">
                            {job.status === 'SUCCEEDED' ? 'Saved to server & added.' : 
                             job.status === 'FAILED' ? 'Failed to process.' : 
                             `Processing... ${job.progress || 0}%`}
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
