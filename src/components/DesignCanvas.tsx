'use client';
import { useEffect, useRef } from 'react';
import * as fabric from 'fabric'; // Import all to be safe with versioning, or named imports

interface DesignCanvasProps {
  onCanvasReady: (canvas: fabric.Canvas) => void;
}

export default function DesignCanvas({ onCanvasReady }: DesignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Initialize Fabric Canvas
    // Using named import if available, else fallback provided by * as fabric
    const CanvasClass = fabric.Canvas;
    
    const canvas = new CanvasClass(canvasRef.current, {
      backgroundColor: '#ffffff',
      width: 1080,
      height: 1080,
      preserveObjectStacking: true,
    });
    
    fabricRef.current = canvas;
    onCanvasReady(canvas);

    return () => {
      canvas.dispose();
      // resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1E1E1E] relative overflow-auto flex items-center justify-center">
        <div className="shadow-2xl">
            <canvas ref={canvasRef} />
        </div>
    </div>
  );
}
