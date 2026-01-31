import * as React from "react"
import { cn } from "@/lib/utils"

type SelectContextValue = { value?: string; onValueChange?: (v: string) => void };

const SelectContext = React.createContext<SelectContextValue | null>(null);

// Simplified Select using native select
const Select = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value?: string; onValueChange?: (v: string) => void }>(
    ({ children, value, onValueChange, className, ...props }, ref) => {
        // We need to inject the value and change handler if using the composed components pattern
        // But for simplicity, we'll assume the user uses the Select abstraction:
        // <Select value={..} onValueChange={..}> <SelectTrigger..> <SelectContent...>
        
        // Since we are mocking the Shadcn API with native elements, this is tricky.
        // Let's implement a Context based one like Tabs.
        return (
            <SelectContext.Provider value={{ value, onValueChange }}>
                <div ref={ref} className={cn("relative inline-block w-full", className)} {...props}>{children}</div>
            </SelectContext.Provider>
        )
    }
);
Select.displayName = "Select";

const SelectTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
        <div ref={ref} className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
            {children}
        </div>
    )
)
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
    ({ className, ...props }, ref) => {
      const ctx = React.useContext(SelectContext);
      return <span ref={ref} className={className} {...props}>{ctx?.value || "Select..."}</span>
    }
)
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className, children, ...props }, ref) => {
         const ctx = React.useContext(SelectContext);
         
         return (
             <select 
                ref={ref}
                className={cn("absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-zinc-950 text-white", className)}
                value={ctx?.value}
                onChange={(e) => ctx?.onValueChange?.(e.target.value)}
                {...props}
             >
                 {children}
             </select>
         )
    }
)
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<HTMLOptionElement, React.OptionHTMLAttributes<HTMLOptionElement>>(
    ({ className, children, ...props }, ref) => {
        return <option ref={ref} className={cn("bg-zinc-950 text-white", className)} {...props}>{children}</option>
    }
)
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
