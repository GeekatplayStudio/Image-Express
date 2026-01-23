import * as React from "react"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { onCheckedChange?: (checked: boolean) => void }>(
  ({ className, onCheckedChange, checked, ...props }, ref) => (
    <label className="relative inline-flex items-center cursor-pointer">
       <input 
          type="checkbox" 
          className="sr-only peer" 
          ref={ref} 
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
       />
       <div className={cn(
           "w-11 h-6 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary",
           className
       )}></div>
    </label>
  )
)
Switch.displayName = "Switch"

export { Switch }
