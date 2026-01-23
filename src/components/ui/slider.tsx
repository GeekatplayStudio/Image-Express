import * as React from "react"
import { cn } from "@/lib/utils"

// Simplified slider that doesn't need Radix
const Slider = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number[] | number, onValueChange?: (val: number[]) => void, max?: number, min?: number, step?: number }>(
  ({ className, value, onValueChange, max = 100, min = 0, step = 1, ...props }, ref) => {
    const val = Array.isArray(value) ? value[0] : (value as number);
    
    return (
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onValueChange?.([parseFloat(e.target.value)])}
        ref={ref}
        className={cn(
            "w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary", 
            className
        )}
        {...props}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
