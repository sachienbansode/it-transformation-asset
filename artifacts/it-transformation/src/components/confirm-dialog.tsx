import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

// In-app replacement for window.confirm().
// Usage: if (!(await confirmDialog("Delete this item?"))) return;
type Opts = { title?: string; confirmText?: string; cancelText?: string; destructive?: boolean };
type Req = Opts & { message: string; resolve: (ok: boolean) => void; input?: { label: string; min: number; onValue: (v: string) => void } };

let push: ((r: Req) => void) | null = null;
const pending: Req[] = [];

export function confirmDialog(message: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const r: Req = { message, ...opts, resolve };
    if (push) push(r); else pending.push(r);
  });
}

/** In-app replacement for window.prompt() when a reason is needed. Resolves to the text, or null if cancelled. */
export function reasonDialog(message: string, opts: Opts & { label?: string; minLength?: number } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let value = "";
    const r: Req = { message, ...opts, input: { label: opts.label || "Reason", min: opts.minLength ?? 5, onValue: v => { value = v; } }, resolve: ok => resolve(ok ? value.trim() : null) };
    if (push) push(r); else pending.push(r);
  });
}

export function ConfirmDialogHost() {
  const [text, setText] = useState("");
  const [queue, setQueue] = useState<Req[]>([]);

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => { push = null; };
  }, []);

  const cur = queue[0];
  const done = (ok: boolean) => {
    if (!cur) return;
    setText("");
    cur.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  const destructive = cur ? (cur.destructive ?? /delete|remove|archive/i.test(cur.message)) : false;

  return (
    <AlertDialog open={!!cur} onOpenChange={(open) => { if (!open) done(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cur?.title ?? (destructive ? "Confirm delete" : "Please confirm")}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{cur?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        {cur?.input && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{cur.input.label} *</label>
            <textarea autoFocus rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={text} onChange={e => { setText(e.target.value); cur.input!.onValue(e.target.value); }} />
            <p className="text-[11px] text-muted-foreground">At least {cur.input.min} characters.</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => done(false)}>{cur?.cancelText ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            disabled={!!cur?.input && text.trim().length < (cur?.input?.min ?? 0)}
            onClick={(e) => { e.preventDefault(); done(true); }}
          >
            {cur?.confirmText ?? (destructive ? "Delete" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
