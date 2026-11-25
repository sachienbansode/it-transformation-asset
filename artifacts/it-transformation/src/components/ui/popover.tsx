import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

/* r98: keyboard for every searchable drop-down — on the closed field, typing a letter / number opens the list with that
   text already in its search box; Arrow-Down, Enter or Space opens it. Arrow keys + Enter then pick a value (cmdk). */
const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ onKeyDown, ...props }, ref) => (
  <PopoverPrimitive.Trigger
    ref={ref}
    onKeyDown={e => {
      onKeyDown?.(e)
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.currentTarget as HTMLElement
      if (el.getAttribute("data-state") === "open") return
      const printable = e.key.length === 1 && e.key !== " "
      if (!printable && e.key !== "ArrowDown") return
      e.preventDefault()
      el.click()
      if (!printable) return
      const ch = e.key
      let tries = 0
      const put = () => {
        const inputs = document.querySelectorAll<HTMLInputElement>("[data-radix-popper-content-wrapper] input[cmdk-input]")
        const input = inputs[inputs.length - 1]
        if (!input) { if (++tries < 10) setTimeout(put, 25); return }
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
        set?.call(input, (input.value || "") + ch)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.focus()
      }
      setTimeout(put, 20)
    }}
    {...props}
  />
))
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
