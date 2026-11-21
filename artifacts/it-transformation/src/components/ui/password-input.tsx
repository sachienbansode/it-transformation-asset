import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** ITH-126 — password field with a show / hide button (eye). Hidden again automatically after 30 seconds. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<typeof Input>, "type">>(({ className, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => { if (!show) return; const t = setTimeout(() => setShow(false), 30_000); return () => clearTimeout(t); }, [show]);
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={show ? "text" : "password"} className={cn("pr-9", className)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)} aria-label={show ? "Hide password text" : "Show password text"} title={show ? "Hide password text" : "Show password text"}
        data-testid="toggle-password" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={props.disabled}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
