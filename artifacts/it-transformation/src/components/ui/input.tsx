import * as React from "react"

import { cn } from "@/lib/utils"
import { fmtDate } from "@/lib/date"

const BASE = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

/*
 * Date fields show dd-MMM-yyyy (05-Nov-2026) on every screen, whatever the browser's language.
 * The real <input type="date"> stays underneath (same value "yyyy-mm-dd", same onChange, min / max, keyboard),
 * only its own text is hidden and a formatted label is drawn on top. Clicking anywhere opens the calendar.
 */
const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, onChange, onClick, onKeyDown, style, ...props }, ref) => {
  const inner = React.useRef<HTMLInputElement | null>(null)
  const [val, setVal] = React.useState<string>(String(props.value ?? props.defaultValue ?? ""))
  React.useEffect(() => { if (props.value !== undefined) setVal(String(props.value ?? "")) }, [props.value])
  const open = () => { try { (inner.current as any)?.showPicker?.() } catch { /* not allowed (e.g. disabled) */ } }
  return (
    <div className={cn("relative", className?.match(/\bw-\S+|\bmax-w-\S+|\bflex-1\b|\bshrink-0\b|\bcol-span-\S+/g)?.join(" ") || "w-full")}>
      <input
        type="date"
        ref={el => { inner.current = el; if (typeof ref === "function") ref(el); else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el }}
        className={cn(BASE, "cursor-pointer text-transparent caret-transparent [&::-webkit-datetime-edit]:opacity-0 [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer", className)}
        style={{ ...style, colorScheme: "light dark" }}
        onChange={e => { setVal(e.target.value); onChange?.(e) }}
        onClick={e => { open(); onClick?.(e) }}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open() } onKeyDown?.(e) }}
        {...props}
      />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 right-9 flex items-center px-3 text-base md:text-sm truncate", val ? "text-foreground" : "text-muted-foreground", props.disabled && "opacity-50")}>
        {val ? fmtDate(val, "") : "dd-MMM-yyyy"}
      </span>
    </div>
  )
})
DateInput.displayName = "DateInput"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    if (type === "date") return <DateInput ref={ref} className={className} {...props} />
    return (
      <input
        type={type}
        className={cn(BASE, className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, DateInput }
