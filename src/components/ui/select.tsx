import * as React from "react"
import { cn } from "@/lib/utils"

// Simplified Select using native select
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { onValueChange?: (v: string) => void }>(
    ({ children, value, onValueChange, className, ...props }, ref) => {
        // We need to inject the value and change handler if using the composed components pattern
        // But for simplicity, we'll assume the user uses the Select abstraction:
        // <Select value={..} onValueChange={..}> <SelectTrigger..> <SelectContent...>
        
        // Since we are mocking the Shadcn API with native elements, this is tricky.
        // Let's implement a Context based one like Tabs.
        return (
            <SelectContext.Provider value={{ value, onValueChange: onValueChange }}>
                <div className="relative inline-block w-full">{children}</div>
            </SelectContext.Provider>
        )
    }
) as any;

const SelectContext = React.createContext<{ value?: any; onValueChange?: (v: any) => void } | null>(null);

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}>
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

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => {
         // In a real one this pops over.
         // For this simple mock, we will actually just use a real native select on top of everything opacity 0? 
         // Or just Render the children (SelectItems) which we will transform into a native Select?
         // Mixing Shadcn API with Native Select is hard.
         // Let's make a fake UI that ACTUALLY renders a native select visually underneath or something? 
         
         // BETTER approach for "No Radix":
         // Reset internal components to just be a wrapper around a native <select> if possible?
         // But the usage in StabilityGenerator is:
         // <Select value={aspectRatio} onValueChange={setAspectRatio}>
         //    <SelectTrigger><SelectValue /></SelectTrigger>
         //    <SelectContent>
         //        <SelectItem value="1:1">Square</SelectItem>
         // ...
         
         // I will rewrite this Select component to just Render a Native Select, destroying the custom UI look slightly but making it work 100%.
         const ctx = React.useContext(SelectContext);
         
         return (
             <select 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={ctx?.value}
                onChange={(e) => ctx?.onValueChange?.(e.target.value)}
             >
                 {children}
             </select>
         )
    }
)
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<HTMLOptionElement, React.OptionHTMLAttributes<HTMLOptionElement>>(
    ({ className, children, ...props }, ref) => {
        return <option ref={ref} className={className} {...props}>{children}</option>
    }
)
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
