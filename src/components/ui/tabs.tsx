import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string, onValueChange: (v: string) => void }>(
  ({ className, value, onValueChange, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} data-state={value}>
        {children}
    </div>
  )
)
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>(
  ({ className, value, ...props }, ref) => {
      // In a real implementation we useContext, here we rely on parent hacking in props or just simple click handling if passed down
      // Since context is hard without creating one, let's use a trick: functionality needs to be handled by parent content or Context.
      // To keep it simple and file-contained without too much bloat, let's use a simple Context.
      const ctx = React.useContext(TabsContext);
      return (
        <button
          ref={ref}
          type="button"
          onClick={() => ctx?.onValueChange?.(value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            ctx?.value === value && "bg-background text-foreground shadow-sm",
            className
          )}
          {...props}
        />
      )
  }
)
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
  ({ className, value, ...props }, ref) => {
      const ctx = React.useContext(TabsContext);
      if (ctx?.value !== value) return null;
      return (
        <div
          ref={ref}
          className={cn(
            "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
          )}
          {...props}
        />
      )
  }
)
TabsContent.displayName = "TabsContent"

// Context for the simple Tabs implementation
const TabsContext = React.createContext<{ value?: string; onValueChange?: (v: string) => void } | null>(null);

const TabsWrapper = (props: React.ComponentProps<typeof Tabs>) => {
    return (
        <TabsContext.Provider value={{ value: props.value, onValueChange: props.onValueChange }}>
            <Tabs {...props} />
        </TabsContext.Provider>
    )
}

export { TabsWrapper as Tabs, TabsList, TabsTrigger, TabsContent }
