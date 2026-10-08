import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

// In-app replacement for window.confirm().
// Usage: if (!(await confirmDialog("Delete this item?"))) return;
type Opts = { title?: string; confirmText?: string; cancelText?: string; destructive?: boolean };
type Req = Opts & { message: string; resolve: (ok: boolean) => void };

let push: ((r: Req) => void) | null = null;
const pending: Req[] = [];

export function confirmDialog(message: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const r: Req = { message, ...opts, resolve };
    if (push) push(r); else pending.push(r);
  });
}

export function ConfirmDialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => { push = null; };
  }, []);

  const cur = queue[0];
  const done = (ok: boolean) => {
    if (!cur) return;
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
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => done(false)}>{cur?.cancelText ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={(e) => { e.preventDefault(); done(true); }}
          >
            {cur?.confirmText ?? (destructive ? "Delete" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
