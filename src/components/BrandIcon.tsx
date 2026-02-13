'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BrandIconProps {
    className?: string;
    notificationText?: string;
}

const SPARKS = [
    { angle: 14, distance: 14, delay: 0 },
    { angle: 64, distance: 16, delay: 90 },
    { angle: 118, distance: 14, delay: 180 },
    { angle: 174, distance: 16, delay: 260 },
    { angle: 222, distance: 15, delay: 340 },
    { angle: 278, distance: 17, delay: 430 },
    { angle: 322, distance: 15, delay: 520 }
];

type SparkStyle = React.CSSProperties & {
    '--spark-angle': string;
    '--spark-distance': string;
    '--spark-delay': string;
};

export default function BrandIcon({ className, notificationText = 'Creative signal active' }: BrandIconProps) {
    return (
        <div className={cn('relative group/brand flex items-center', className)}>
            <div className="brand-icon-shell w-9 h-9 rounded-xl shadow-lg flex items-center justify-center relative overflow-visible">
                <span className="font-bold text-white text-lg select-none">iEX</span>
                {SPARKS.map((spark, index) => (
                    <span
                        key={`${spark.angle}-${index}`}
                        className="brand-spark pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-white/90"
                        style={{
                            '--spark-angle': `${spark.angle}deg`,
                            '--spark-distance': `${spark.distance}px`,
                            '--spark-delay': `${spark.delay}ms`
                        } as SparkStyle}
                    />
                ))}
            </div>
            <div className="brand-notice pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white/90 shadow-xl">
                {notificationText}
            </div>
        </div>
    );
}
