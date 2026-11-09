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
   notification read), or the request says X-No-Confirm. Admin can switch it off (setting ui.confirmChanges).
   ITH-081 — the confirmation names the actual change: the record (by its name / ticket number / tag, taken from what the
   screen loaded), each changed field as old → new, ids turned into names, and the values being added. A screen can give
   its own wording with confirmHeader(). */
const NO_CONFIRM = [/\/auth\//, /\/notifications/, /\/push\//, /\/messages$/, /\/my-policies\/\d+\/decision$/, /\/search/, /\/export/, /\/preview/, /\/validate/, /\/dry-?run/, /\/report/, /\/test$/, /\/central/, /\/mark-read/, /\/read$/, /\/signal$/, /\/refresh$/];
const LABEL: Record<string, string> = { assets: "asset", "asset-agents": "device", "asset-agent-codes": "installation key", "asset-allocations": "handover", "asset-handovers": "handover", "asset-licenses": "licence", "asset-license-assignments": "licence assignment", "asset-vendors": "vendor", "asset-contracts": "contract", "asset-audits": "physical audit", "maintenance-records": "maintenance record", incidents: "incident", problems: "problem", changes: "change request", "service-requests": "service request", "knowledge-base": "knowledge article", "sla-policies": "SLA policy", approvals: "approval", "my-approvals": "approval", policies: "policy", users: "user", roles: "role", "user-roles": "user roles", settings: "settings", roadmap: "roadmap item", checklist: "checklist item", applications: "application",
  alerts: "health item", masters: "master value", chats: "chat", sessions: "screen session", attachments: "attachment", tracking: "tracking rule", "itsm-teams": "ITSM team", members: "team member", "business-units": "business unit", kpis: "KPI", "ticket-suggestions": "ticket suggestion", "itsm-catalog": "catalogue entry", "approval-matrix": "approval rule", "notification-rules": "notification rule", retirements: "retirement item", comments: "comment", evidence: "evidence", audits: "audit", checkpoints: "checkpoint", auditors: "auditor" };
const VERB: Record<string, string> = { issue: "Issue", return: "Return", assign: "Assign / link", transition: "Change status of", publish: "Publish", retire: "Retire", unretire: "Restore", deactivate: "Deactivate", activate: "Activate", discard: "Discard changes to", resend: "Resend", remind: "Send reminders for", duplicate: "Duplicate", restore: "Restore a version of", share: "Email", ignore: "Ignore", unignore: "Stop ignoring", ticket: "Raise a ticket for", resolve: "Resolve", close: "Close", approve: "Approve", reject: "Reject", acknowledge: "Acknowledge", import: "Import into", "bulk-update": "Update several", "bulk-issue": "Issue several", "bulk-assign": "Assign several", chats: "Start a chat about", confirm: "Confirm", reopen: "Re-open", accept: "Accept", dismiss: "Keep open", decline: "Decline", control: "Remote control for", end: "End", cancel: "Cancel", submit: "Submit", reset: "Reset", unlock: "Unlock", lock: "Lock", revoke: "Revoke", extend: "Extend", upload: "Upload to", recording: "Upload the recording of" };
const FIELD: Record<string, string> = { assignedTo: "Assigned to", assignedGroup: "Assigned group", ownerName: "Owner", userId: "User", agentId: "Device", assetId: "Asset", teamId: "Team", leadUserId: "Team lead", requesterUserId: "Requester", sortOrder: "Order", isActive: "Active", dueAt: "Due", expectedReturnDate: "Return by", startDate: "Start", endDate: "End", until: "Until", reopenReason: "Reason for re-opening", resolutionNotes: "Resolution notes" };
const NAME_KEYS = ["ticketNo", "assetTag", "handoverNo", "hostname", "title", "name", "label", "subject", "message", "fileName", "email", "code", "employeeCode"];
let guardOn = true;
export function setConfirmChanges(on: boolean) { guardOn = on; }
/** ITH-078: a plain-words confirmation for a request, e.g. confirmHeader(`Start a chat with Asha Rao with the message “Hi…”?`). */
export function confirmHeader(text: string): Record<string, string> { return { "X-Confirm-Text": encodeURIComponent(text) }; }
const words = (k: string) => FIELD[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^./, c => c.toUpperCase());
const short = (v: string) => (v.length > 90 ? v.slice(0, 87) + "…" : v);
const SECRET_K = /pass|token|secret|^code$|base64|otp|mfa/i;
const SKIP_K = /^(id|createdAt|updatedAt|createdBy|updatedBy|version|_.*)$/;

/* What the screens loaded: objects with an id, remembered by the list / field they came in (bounded, newest wins). */
const seen = new Map<string, { o: any; hints: string[]; parent?: any }[]>(); let seenN = 0;
function remember(url: string, data: any) {
  const top = url.replace(/^.*\/api\//, "").split(/[/?]/)[0];
  const isRec = (v: any) => v && typeof v === "object" && !Array.isArray(v) && (typeof v.id === "number" || /^\d+$/.test(String(v.id ?? ""))) && NAME_KEYS.some(k => v[k]);
  const walk = (v: any, hint: string, depth: number, parent?: any) => {
    if (!v || typeof v !== "object" || depth > 4) return;
    if (Array.isArray(v)) { for (const x of v.slice(0, 500)) walk(x, hint, depth + 1, parent); return; }
    if (isRec(v)) {
      const k = String(v.id); const list = seen.get(k) || [];
      const hints = [hint, top].filter(Boolean);
      const i = list.findIndex(x => x.hints[0] === hint && x.hints[1] === top);
      if (i >= 0) list[i] = { o: v, hints, parent }; else { list.unshift({ o: v, hints, parent }); seenN++; }
      seen.set(k, list.slice(0, 8));
      if (seenN > 20000) { seen.clear(); seenN = 0; }
    }
    // records listed next to a record (e.g. { agent, alerts: [...] }) belong to it
    const owner = isRec(v) ? v : Object.values(v).find(isRec) || parent;
    for (const [f, x] of Object.entries(v)) if (x && typeof x === "object") walk(x, f, depth + 1, x === owner ? parent : owner);
  };
  walk(data, top, 0);
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/(ies)$/, "y").replace(/s$/, "");
function entry(id: string | number, hint: string) {
  const list = seen.get(String(id)); if (!list?.length) return null;
  const h = norm(hint);
  const person = /user|owner|lead|requester|member|employee|people|person/.test(h);
  return list.find(x => x.hints.some(y => norm(y) === h)) || list.find(x => x.hints.some(y => norm(y).includes(h) || h.includes(norm(y))))
    || (person ? list.find(x => x.o.email || x.o.employeeCode) : null) || null;
}
const lookup = (id: string | number, hint: string): any => entry(id, hint)?.o || null;
function nameOf(o: any): string {
  if (!o) return "";
  if (o.kind && o.message && o.severity) return `“${short(String(o.message))}”`;   // a health item
  if (o.ticketNo) return `${o.ticketNo}${o.title ? ` “${short(String(o.title))}”` : ""}`;
  if (o.assetTag) return `${o.assetTag}${o.name ? ` ${o.name}` : o.assetName ? ` ${o.assetName}` : ""}`;
  if (o.handoverNo) return o.handoverNo;
  if (o.hostname) return o.hostname;
  if (o.employeeCode && o.name) return `${o.name} (${o.employeeCode})`;
  for (const k of ["title", "name", "label", "subject", "message", "fileName", "email", "code"]) if (o[k]) return `“${short(String(o[k]))}”`;
  return "";
}
function fmtVal(k: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (/Id$/.test(k) && /^\d+$/.test(String(v))) { const o = lookup(v, k.replace(/Id$/, "")) || lookup(v, k.replace(/Id$/, "") + "s"); const n = nameOf(o).replace(/^“|”$/g, ""); return n || `#${v}`; }
  if (Array.isArray(v)) return v.length > 6 ? `${v.length} items` : v.map(x => typeof x === "object" ? (nameOf(x) || "item") : String(x)).join(", ");
  if (typeof v === "object") return "(details)";
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(t)) { const d = new Date(t); if (!isNaN(+d)) return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(t.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Kolkata" }); }
  return `“${short(t)}”`.replace(/^“(\d+(\.\d+)?)”$/, "$1");
}
function describeChange(method: string, url: string, body: unknown) {
  const path = url.replace(/^.*\/api/, "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "admin" && parts[1]) parts.shift();
  const idIdx = parts.map((p, i) => /^\d+$/.test(p) ? i : -1).filter(i => i >= 0);
  const lastId = idIdx.length ? idIdx[idIdx.length - 1] : -1;
  const entSeg = lastId > 0 ? parts[lastId - 1] : parts[parts.length - 1] || parts[0];
  const what = LABEL[entSeg] || LABEL[parts[0]] || entSeg?.replace(/-/g, " ") || "record";
  const id = lastId >= 0 ? parts[lastId] : null;
  const after = lastId >= 0 ? parts.slice(lastId + 1).filter(p => !/^\d+$/.test(p)) : parts.slice(1);
  const action = after[after.length - 1];
  const rec = id ? lookup(id, entSeg) : null;
  // the parent record, e.g. the device a health item belongs to
  const parentId = idIdx.length > 1 ? parts[idIdx[idIdx.length - 2]] : null;
  const parent = parentId ? lookup(parentId, parts[idIdx[idIdx.length - 2] - 1]) : (rec?.agentId ? lookup(rec.agentId, "asset-agents") : id ? entry(id, entSeg)?.parent || null : null);
  let b: any = null; try { b = typeof body === "string" ? JSON.parse(body) : null; } catch { /* not JSON */ }
  const verb = method === "DELETE" ? "Delete" : action && VERB[action] ? VERB[action] : method === "POST" && !id ? "Add" : "Change";
  const recName = nameOf(rec);
  const target = `${what}${recName ? ` ${recName}` : id ? ` #${id}` : ""}${parent && nameOf(parent) ? ` on ${nameOf(parent)}` : ""}`;
  const lines: string[] = [];
  if (b && typeof b === "object" && !Array.isArray(b)) {
    const entries = Object.entries(b).filter(([k]) => !SECRET_K.test(k) && !SKIP_K.test(k));
    if ((method === "PATCH" || method === "PUT") && rec) {
      for (const [k, v] of entries) { if (typeof v === "object" && v !== null && !Array.isArray(v)) continue; const o = rec[k]; if (String(o ?? "") === String(v ?? "")) continue; lines.push(`${words(k)}: ${fmtVal(k, o)} → ${fmtVal(k, v)}`); }
      if (!lines.length) lines.push("No field values change.");
    } else for (const [k, v] of entries.slice(0, 8)) { if (v === null || v === undefined || v === "") continue; if (typeof v === "object" && !Array.isArray(v)) continue; lines.push(`${words(k)}: ${fmtVal(k, v)}`); }
  }
  const head = method === "POST" && !id ? `${verb} ${what}?` : `${verb} ${target}?`;
  return { title: method === "DELETE" ? "Confirm delete" : "Confirm change", message: `${head}${lines.length ? `\n${lines.slice(0, 10).join("\n")}` : ""}`, destructive: method === "DELETE" };
}
export const __describeChange = describeChange;   // for tests
export const __remember = remember;
export function installChangeGuard() {
  const w = window as any; if (w.__changeGuard) return; w.__changeGuard = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = String(init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const h = new Headers(init?.headers || (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
    const said = h.get("X-Confirm-Text"); if (said !== null && init) { const h2 = new Headers(init.headers); h2.delete("X-Confirm-Text"); init = { ...init, headers: h2 }; }
    if (guardOn && /\/api\//.test(url) && !["GET", "HEAD", "OPTIONS"].includes(method) && !h.get("X-No-Confirm")
        && !NO_CONFIRM.some(r => r.test(url.split("?")[0])) && !/"dryRun"\s*:\s*true/.test(String(init?.body || "")) && Date.now() - lastConfirmedAt > 8000) {
      const d = said ? { title: method === "DELETE" ? "Confirm delete" : "Confirm", message: decodeURIComponent(said), destructive: method === "DELETE" } : describeChange(method, url, init?.body);
      const ok = await confirmDialog(d.message, { title: d.title, confirmText: method === "DELETE" ? "Delete" : "Confirm", destructive: d.destructive });
      if (!ok) { const e: any = new Error("Cancelled — nothing was changed"); e.cancelled = true; throw e; }
    }
    const res = await orig(input as any, init);
    // remember records the screens load (to name them in later confirmations); skipped for large or non-JSON answers
    if (method === "GET" && /\/api\//.test(url) && res.ok && /json/.test(res.headers.get("content-type") || "") && Number(res.headers.get("content-length") || 0) < 3_000_000)
      res.clone().json().then(j => remember(url, j)).catch(() => {});
    return res;
  };
}
