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
let lastConfirmedAt = 0;
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
    if (ok) lastConfirmedAt = Date.now();
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
          {cur?.cancelText !== "" && <AlertDialogCancel onClick={() => done(false)}>{cur?.cancelText ?? "Cancel"}</AlertDialogCancel>}
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

/* ── Ask before every change ─────────────────────────────────────────────────
   Every POST / PUT / PATCH / DELETE to the API from this app is confirmed in-app first, unless the screen already asked
   (a confirm in the last few seconds), the call is a read-only action (preview / export / search / chat message /
   notification read), or the request says X-No-Confirm. Admin can switch it off (setting ui.confirmChanges). */
const NO_CONFIRM = [/\/auth\//, /\/notifications/, /\/push\//, /\/messages$/, /\/my-policies\/\d+\/decision$/, /\/search/, /\/export/, /\/preview/, /\/validate/, /\/dry-?run/, /\/report/, /\/test$/, /\/central/, /\/mark-read/, /\/read$/];
const LABEL: Record<string, string> = { assets: "asset", "asset-agents": "device", "asset-agent-codes": "installation key", "asset-allocations": "handover", "asset-handovers": "handover", "asset-licenses": "licence", "asset-license-assignments": "licence assignment", "asset-vendors": "vendor", "asset-contracts": "contract", "asset-audits": "physical audit", "maintenance-records": "maintenance record", incidents: "incident", problems: "problem", changes: "change request", "service-requests": "service request", "knowledge-base": "knowledge article", "sla-policies": "SLA policy", approvals: "approval", "my-approvals": "approval", policies: "policy", users: "user", roles: "role", settings: "settings", policies: "policy", "user-roles": "user roles", settings: "settings", roadmap: "roadmap item", checklist: "checklist item", applications: "application" };
const VERB: Record<string, string> = { issue: "Issue", return: "Return", assign: "Assign / link", transition: "Change status of", publish: "Publish", retire: "Retire", unretire: "Restore", deactivate: "Deactivate", activate: "Activate", discard: "Discard changes to", resend: "Resend", remind: "Send reminders for", duplicate: "Duplicate", restore: "Restore a version of", share: "Email", ignore: "Ignore", unignore: "Stop ignoring", ticket: "Raise a ticket for", resolve: "Resolve", close: "Close", approve: "Approve", reject: "Reject", acknowledge: "Acknowledge", import: "Import into", "bulk-update": "Update several", "bulk-issue": "Issue several", "bulk-assign": "Assign several", chats: "Start a chat about", confirm: "Confirm", reopen: "Re-open" };
let guardOn = true;
export function setConfirmChanges(on: boolean) { guardOn = on; }
function describeChange(method: string, url: string, body: unknown) {
  const path = url.replace(/^.*\/api/, "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "admin" && parts[1]) parts.shift();
  const what = LABEL[parts[0]] || parts[0]?.replace(/-/g, " ") || "record";
  const id = parts.find(p => /^\d+$/.test(p));
  const last = [...parts].reverse().find(p => !/^\d+$/.test(p) && p !== parts[0]);
  const verb = method === "DELETE" ? "Delete" : last && VERB[last] ? VERB[last] : method === "POST" && !id ? "Create" : "Save changes to";
  let detail = "";
  try { const b = typeof body === "string" ? JSON.parse(body) : null; if (b && typeof b === "object") { const k = Object.keys(b).filter(x => !/pass|token|secret|code/i.test(x)).slice(0, 6); if (k.length) detail = `\nFields: ${k.join(", ")}`; } } catch { /* not JSON */ }
  return { title: method === "DELETE" ? "Confirm delete" : "Confirm change", message: `${verb} ${what}${id ? ` #${id}` : ""}?${detail}\nThis change is recorded in the audit log.`, destructive: method === "DELETE" };
}
export function installChangeGuard() {
  const w = window as any; if (w.__changeGuard) return; w.__changeGuard = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = String(init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const h = new Headers(init?.headers || (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
    if (guardOn && /\/api\//.test(url) && !["GET", "HEAD", "OPTIONS"].includes(method) && !h.get("X-No-Confirm")
        && !NO_CONFIRM.some(r => r.test(url.split("?")[0])) && !/"dryRun"\s*:\s*true/.test(String(init?.body || "")) && Date.now() - lastConfirmedAt > 8000) {
      const d = describeChange(method, url, init?.body);
      const ok = await confirmDialog(d.message, { title: d.title, confirmText: method === "DELETE" ? "Delete" : "Confirm", destructive: d.destructive });
      if (!ok) { const e: any = new Error("Cancelled — nothing was changed"); e.cancelled = true; throw e; }
    }
    return orig(input as any, init);
  };
}
