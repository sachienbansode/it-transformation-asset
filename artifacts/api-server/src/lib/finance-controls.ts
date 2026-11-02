import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Carry } from "./depreciation";
import { fyEnd, fyLabel } from "./depreciation";

/*
 * Asset finance controls
 *  - Financial-year lock: once FY y is closed, nothing that changes its depreciation may be dated on or before 31 Mar y+1
 *    (purchase date / cost of a capitalised asset, disposal / write-off date, deleting a capitalised asset).
 *    Depreciation rules can still change — they apply from the next open year (carry-forward from the frozen book value).
 *  - Maker-checker: requests in asset_finance_requests are applied only when a different person approves them.
 */

const rowsOf = (r: any) => (r.rows ?? r) as any[];

export type Lock = { fy: number; label: string; lockDate: string; closeId: number; closedBy: string; closedAt: string } | null;

/** The latest closed financial year (closing a year also locks every year before it). */
export async function getLock(): Promise<Lock> {
  const [r] = rowsOf(await db.execute(sql`SELECT id, fy, lock_date, closed_by, closed_at FROM asset_fy_closes WHERE status = 'Closed' ORDER BY fy DESC LIMIT 1`));
  return r ? { fy: r.fy, label: fyLabel(r.fy), lockDate: r.lock_date, closeId: r.id, closedBy: r.closed_by, closedAt: r.closed_at } : null;
}

export class LockError extends Error { status = 409; }

/** Throws LockError when `date` falls in a closed financial year. */
export async function assertOpenDate(date: string | null | undefined, what: string, lock?: Lock) {
  if (!date) return;
  const l = lock === undefined ? await getLock() : lock;
  if (l && date.slice(0, 10) <= l.lockDate) throw new LockError(`${what} ${date.slice(0, 10)} falls in ${l.label}, which is closed (locked up to ${l.lockDate}). Use a later date, or ask Finance to reopen the year.`);
}

/** A capitalised asset (cost + purchase date) bought on or before the lock date: its cost and purchase date are frozen. */
export function lockedFinanceChange(old: any, next: any, lock: Lock): string | null {
  if (!lock) return null;
  const was = old.purchaseDate && old.purchaseDate <= lock.lockDate && Number(old.cost) > 0;
  const will = next.purchaseDate && next.purchaseDate <= lock.lockDate && Number(next.cost) > 0;
  if (!was && !will) return null;
  const costChanged = Number(old.cost || 0) !== Number(next.cost || 0);
  const dateChanged = (old.purchaseDate || null) !== (next.purchaseDate || null);
  if (!costChanged && !dateChanged) return null;
  return `${old.assetTag || "Asset"}: cost / purchase date cannot change — it is in ${lock.label}, which is closed. Ask Finance to reopen the year first.`;
}

/** Frozen per-asset positions from the latest closed year (empty when nothing is closed). */
export async function loadCarries(): Promise<Map<number, Carry>> {
  const [r] = rowsOf(await db.execute(sql`SELECT carry FROM asset_fy_closes WHERE status = 'Closed' ORDER BY fy DESC LIMIT 1`));
  const m = new Map<number, Carry>();
  if (r?.carry) for (const [id, c] of Object.entries(r.carry as Record<string, Carry>)) m.set(Number(id), c);
  return m;
}

/** Frozen register of a closed year, if it is closed. */
export async function closedRegister(fy: number) {
  const [r] = rowsOf(await db.execute(sql`SELECT id, fy, register, totals, closed_by, closed_at, close_note FROM asset_fy_closes WHERE fy = ${fy} AND status = 'Closed' ORDER BY id DESC LIMIT 1`));
  return r || null;
}

export async function financeSettings(): Promise<Record<string, string>> {
  return Object.fromEntries(rowsOf(await db.execute(sql`SELECT key, value FROM asset_finance_settings`)).map(r => [r.key, r.value]));
}

/* ─── Maker-checker requests ─────────────────────────────────────────────── */

export async function createRequest(r: { kind: string; title: string; payload: any; preview?: any; fileName?: string | null; by: string; userId: number | null; note?: string | null }) {
  const [row] = rowsOf(await db.execute(sql`INSERT INTO asset_finance_requests (request_no, kind, title, payload, preview, file_name, requested_by, requested_by_user_id, request_note)
    VALUES (${"TMP-" + Date.now() + Math.random()}, ${r.kind}, ${r.title}, ${JSON.stringify(r.payload)}::jsonb, ${r.preview ? JSON.stringify(r.preview) : null}::jsonb, ${r.fileName ?? null}, ${r.by}, ${r.userId}, ${r.note ?? null}) RETURNING id`));
  const requestNo = `FCR-${new Date().getFullYear()}-${String(row.id).padStart(5, "0")}`;
  await db.execute(sql`UPDATE asset_finance_requests SET request_no = ${requestNo} WHERE id = ${row.id}`);
  return { id: row.id as number, requestNo };
}

export async function pendingFor(kind: string, key: string, value: unknown) {
  return rowsOf(await db.execute(sql`SELECT id, request_no FROM asset_finance_requests WHERE status = 'Pending' AND kind = ${kind} AND payload ->> ${key} = ${String(value)}`))[0] || null;
}

export const fyEndOf = fyEnd;

/** Email the configured recipients that a request was submitted or decided (event asset_finance_approval). */
/** People who can approve finance changes: base admins and anyone with write / admin on Depreciation (asset_depreciation). */
export async function financeApprovers(): Promise<{ id: number; name: string; email: string | null }[]> {
  return rowsOf(await db.execute(sql`SELECT DISTINCT u.id, u.name, u.email FROM users u
    WHERE u.is_active AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = u.id AND rp.module = 'asset_depreciation' AND rp.access_level IN ('write', 'admin'))) ORDER BY u.name`)) as any[];
}
export async function notifyRequest(id: number) {
  // in-app bell: approvers when a change is raised, the requester when it is approved / rejected
  try {
    const [q] = rowsOf(await db.execute(sql`SELECT * FROM asset_finance_requests WHERE id = ${id}`));
    if (q) {
      if (q.status === "Pending") {
        for (const a of await financeApprovers()) if (a.id !== q.requested_by_user_id)
          await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${a.id}, ${`Approval needed: ${q.request_no}`}, ${`${q.title} — raised by ${q.requested_by}`}, 'warning', '/asset-depreciation?tab=approvals')`);
      } else if (q.requested_by_user_id) {
        await db.execute(sql`INSERT INTO notifications (user_id, title, message, type, link) VALUES (${q.requested_by_user_id}, ${`${q.request_no} ${String(q.status).toLowerCase()}`}, ${`${q.title} — ${String(q.status).toLowerCase()} by ${q.decided_by}${q.decision_note ? `: ${q.decision_note}` : ""}`}, ${q.status === "Approved" ? "success" : "error"}, '/asset-depreciation?tab=approvals')`);
        const [ru] = rowsOf(await db.execute(sql`SELECT email FROM users WHERE id = ${q.requested_by_user_id}`));
        if (ru?.email) { const { sendDirect, esc } = await import("./mailer"); await sendDirect("asset_finance_approval", [ru.email], `${q.request_no} ${String(q.status).toLowerCase()} — ${q.title}`,
          `<p>Your finance change <b>${esc(q.request_no)}</b> (${esc(q.title)}) was <b>${esc(String(q.status).toLowerCase())}</b> by ${esc(q.decided_by || "")}.</p>${q.decision_note ? `<p>Note: ${esc(q.decision_note)}</p>` : ""}<p>Regards,</p>`).catch(() => {}); }
      }
    }
  } catch (e) { console.error("finance in-app notification failed", e); }
  try {
    const { notify, htmlTable, esc } = await import("./mailer");
    const [r] = rowsOf(await db.execute(sql`SELECT * FROM asset_finance_requests WHERE id = ${id}`));
    if (!r) return;
    const changes: any[] = r.preview?.changes || [];
    const sample = changes.slice(0, 15).map((c: any) => c.assetTag ? `${c.assetTag}: ${(c.changes || []).map((x: any) => `${x.label} ${x.from ?? "—"} → ${x.to ?? "—"}`).join("; ")}` : `${c.label}: ${c.from ?? "—"} → ${c.to ?? "—"}`);
    const verb = r.status === "Pending" ? "waiting for approval" : r.status.toLowerCase();
    await notify("asset_finance_approval", {
      subject: `${r.request_no} ${verb} — ${r.title}`,
      html: `<p>A finance change is <b>${esc(verb)}</b>.${r.status === "Pending" ? " Approve or reject it in IT Hub › Depreciation › Approvals. The person who raised it cannot approve it." : ""}</p>
        ${htmlTable([["Request", r.request_no], ["Change", r.title], ["Raised by", r.requested_by], ["Note", r.request_note || "—"], ...(r.status !== "Pending" ? [["Decided by", r.decided_by], ["Decision note", r.decision_note || "—"]] as [string, unknown][] : [])])}
        ${sample.length ? `<p style="margin-top:12px"><b>Changes</b>${changes.length > sample.length ? ` (first ${sample.length} of ${changes.length})` : ""}:</p><ul>${sample.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`,
    });
  } catch (e) { console.error("notifyRequest failed", e); }
}

/** Finance changes waiting for approval, per asset: asset edits (cost / dates / depreciation) and finance uploads.
 *  Used to show "change pending" on the asset and to stop a second request for the same asset. */
export async function pendingByAsset(): Promise<{ byId: Record<number, any[]>; byTag: Record<string, any[]> }> {
  const rows = rowsOf(await db.execute(sql`SELECT r.id, r.request_no, r.kind, r.title, r.requested_by, r.requested_at AS created_at, r.payload, r.preview FROM asset_finance_requests r WHERE r.status = 'Pending' AND r.kind IN ('asset_edit', 'finance_upload')`));
  const byId: Record<number, any[]> = {}, byTag: Record<string, any[]> = {};
  for (const r of rows) {
    const info = { requestNo: r.request_no, kind: r.kind, title: r.title, requestedBy: r.requested_by, at: r.created_at };
    if (r.kind === "asset_edit" && r.payload?.assetId) (byId[Number(r.payload.assetId)] ||= []).push(info);
    if (r.kind === "finance_upload") {
      const tags = new Set<string>([...((r.payload?.rows || []) as any[]).map(x => String(x.assetTag ?? x["Asset Tag"] ?? "").trim().toUpperCase()), ...((r.preview?.changes || []) as any[]).map(x => String(x.assetTag || "").toUpperCase())].filter(Boolean));
      for (const t of tags) (byTag[t] ||= []).push(info);
    }
  }
  return { byId, byTag };
}
