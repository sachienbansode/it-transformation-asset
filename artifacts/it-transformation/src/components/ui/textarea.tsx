import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { minChars?: number }
>(({ className, minChars, ...props }, ref) => {
  // r92: when a minimum length is needed (e.g. a reason), say so under the box so a disabled button is never a mystery
  const len = String(props.value ?? "").trim().length
  const box = (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
  if (!minChars) return box
  return (
    <div className="w-full space-y-1">
      {box}
      <div data-testid="min-chars-hint" className={cn("text-[11px]", len >= minChars ? "text-emerald-600" : "text-amber-600")}>
        {len >= minChars ? `${len} characters ✓` : `At least ${minChars} characters needed — ${minChars - len} more`}
      </div>
    </div>
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
