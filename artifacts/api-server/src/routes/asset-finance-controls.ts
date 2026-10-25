import { Router, Request, Response } from "express";
import { db, assetsTable, assetTransactionsTable, assetDepreciationRulesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy, buildContext } from "./audit-logs";
import { getAccess, can } from "../lib/rbac";
import { DATE_RE, resolveInput, schedule, accumulated, lifeUsed, fyOf, fyLabel, fyStart, fyEnd, today } from "../lib/depreciation";
import { getLock, loadCarries, financeSettings, notifyRequest, lockedFinanceChange, LockError } from "../lib/finance-controls";
import { createBatch, batchWorkbook, XLSX_TYPE } from "../lib/archive";
import { notify, htmlTable } from "../lib/mailer";
import { loadRules, buildRegister, applyRuleRequest, applyFinanceUpload } from "./asset-finance";

/*
 * Asset finance controls (Depreciation module)
 *  · Approvals — maker-checker queue for rule changes, cost / purchase uploads, asset cost edits and GL ledgers.
 *  · Year-end close — freezes a financial year's register and locks it against back-dated changes; reopen with reason.
 *  · Disposals — book value, sale value and profit / loss on disposal or write-off, per financial year.
 *  · Journal — monthly depreciation + disposal journal (Tally-ready Excel), archived as a batch and emailed.
 */

const router = Router();
const fail = (res: Response, code: number, error: string) => { res.status(code).json({ error }); };
const handleError = (res: Response, e: unknown) => e instanceof LockError ? fail(res, 409, e.message) : fail(res, 500, e instanceof Error ? e.message : String(e));
const s = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const r2 = (n: number) => Math.round(n * 100) / 100;
async function safeLog(p: Parameters<typeof logAudit>[0]) { try { await logAudit(p); } catch { /* non-fatal */ } }
async function me(req: Request) {
  const userId = (req.session as any)?.userId as number | undefined;
  return { userId: userId ?? null, by: await getPerformedBy(userId).catch(() => "System"), access: await getAccess(req) };
}
const ASSET_MODS = ["assets", "asset_registry", "asset_depreciation", "asset_contracts", "asset_allocations"];

/* ═══ APPROVALS (maker-checker) ════════════════════════════════════════════ */

const KIND_LABEL: Record<string, string> = { rule_update: "Depreciation rule", rule_create: "New depreciation rule", finance_upload: "Purchase / cost upload", asset_edit: "Asset cost edit", gl_settings: "GL ledgers" };

router.get("/asset-finance-requests", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    if (!u.access || !ASSET_MODS.some(m => can(u.access!, m, "read"))) return fail(res, 403, "You do not have access to finance approvals.");
    const status = s(req.query.status);
    const list = rowsOf(await db.execute(sql`SELECT id, request_no AS "requestNo", kind, title, preview, file_name AS "fileName", status, requested_by AS "requestedBy", requested_by_user_id AS "requestedByUserId",
        requested_at AS "requestedAt", request_note AS "requestNote", decided_by AS "decidedBy", decided_at AS "decidedAt", decision_note AS "decisionNote", result
      FROM asset_finance_requests ${status && status !== "all" ? sql`WHERE status = ${status}` : sql``} ORDER BY (status = 'Pending') DESC, requested_at DESC LIMIT 300`));
    const canApprove = !!u.access && can(u.access, "asset_depreciation", "write");
    res.json({ requests: list.map(r => ({ ...r, kindLabel: KIND_LABEL[r.kind] || r.kind, mine: r.requestedByUserId === u.userId, canDecide: canApprove && r.status === "Pending" && r.requestedByUserId !== u.userId })),
      pending: list.filter(r => r.status === "Pending").length, canApprove });
  } catch (e) { handleError(res, e); }
});

async function applyRequest(r: any, approver: string) {
  const p = r.payload;
  switch (r.kind) {
    case "rule_update": case "rule_create": return applyRuleRequest(r.kind, p, approver);
    case "finance_upload": return applyFinanceUpload(p, approver, r.request_no);
    case "asset_edit": return applyAssetEdit(p, approver, r.request_no);
    case "gl_settings": return applyLedgers(p, approver);
    default: throw new Error(`Unknown request type ${r.kind}`);
  }
}

router.post("/asset-finance-requests/:id/approve", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    if (!u.access || !can(u.access, "asset_depreciation", "write")) return fail(res, 403, "Only Finance (edit access to Depreciation) can approve finance changes.");
    const id = Number(req.params.id);
    const [r] = rowsOf(await db.execute(sql`SELECT * FROM asset_finance_requests WHERE id = ${id}`));
    if (!r) return fail(res, 404, "Request not found");
    if (r.status !== "Pending") return fail(res, 400, `${r.request_no} is already ${r.status.toLowerCase()}`);
    if (r.requested_by_user_id && r.requested_by_user_id === u.userId) return fail(res, 403, "You raised this request — a different person must approve it (maker-checker).");
    // Claim it so two approvers cannot apply it twice
    const claimed = rowsOf(await db.execute(sql`UPDATE asset_finance_requests SET status = 'Approved', decided_by = ${u.by}, decided_by_user_id = ${u.userId}, decided_at = now(), decision_note = ${s(req.body?.note)} WHERE id = ${id} AND status = 'Pending' RETURNING id`));
    if (!claimed.length) return fail(res, 409, "Someone else decided this request just now — refresh.");
    let result: any;
    try { result = await applyRequest(r, u.by); }
    catch (e: any) {
      await db.execute(sql`UPDATE asset_finance_requests SET status = 'Pending', decided_by = NULL, decided_by_user_id = NULL, decided_at = NULL, decision_note = NULL WHERE id = ${id}`);
      return fail(res, e instanceof LockError ? 409 : 400, `Could not apply ${r.request_no}: ${e?.message || e}`);
    }
    await db.execute(sql`UPDATE asset_finance_requests SET result = ${JSON.stringify(result ?? {})}::jsonb WHERE id = ${id}`);
    await safeLog({ entityType: "asset_finance_request", entityId: id, action: "approve", performedBy: u.by, summary: `${r.request_no} approved and applied — ${r.title}`, context: buildContext(req, "Depreciation") });
    void notifyRequest(id);
    res.json({ ok: true, requestNo: r.request_no, result });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-finance-requests/:id/reject", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    if (!u.access || !can(u.access, "asset_depreciation", "write")) return fail(res, 403, "Only Finance (edit access to Depreciation) can reject finance changes.");
    const note = s(req.body?.note);
    if (!note || note.length < 3) return fail(res, 400, "Give a reason for rejecting");
    const id = Number(req.params.id);
    const r = rowsOf(await db.execute(sql`UPDATE asset_finance_requests SET status = 'Rejected', decided_by = ${u.by}, decided_by_user_id = ${u.userId}, decided_at = now(), decision_note = ${note} WHERE id = ${id} AND status = 'Pending' RETURNING request_no, title`))[0];
    if (!r) return fail(res, 400, "Request is not pending");
    await safeLog({ entityType: "asset_finance_request", entityId: id, action: "reject", performedBy: u.by, summary: `${r.request_no} rejected — ${r.title}: ${note}`, context: buildContext(req, "Depreciation") });
    void notifyRequest(id);
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-finance-requests/:id/cancel", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    const id = Number(req.params.id);
    const [r] = rowsOf(await db.execute(sql`SELECT * FROM asset_finance_requests WHERE id = ${id}`));
    if (!r) return fail(res, 404, "Request not found");
    if (r.requested_by_user_id !== u.userId && !u.access?.isAdmin) return fail(res, 403, "Only the person who raised it (or an administrator) can cancel a request.");
    const done = rowsOf(await db.execute(sql`UPDATE asset_finance_requests SET status = 'Cancelled', decided_by = ${u.by}, decided_by_user_id = ${u.userId}, decided_at = now(), decision_note = 'Cancelled' WHERE id = ${id} AND status = 'Pending' RETURNING id`));
    if (!done.length) return fail(res, 400, "Request is not pending");
    await safeLog({ entityType: "asset_finance_request", entityId: id, action: "cancel", performedBy: u.by, summary: `${r.request_no} cancelled — ${r.title}`, context: buildContext(req, "Depreciation") });
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

/** Asset form edits to cost / purchase date / depreciation fields (raised by PATCH /assets/:id). */
async function applyAssetEdit(p: any, approver: string, requestNo: string) {
  const [a] = await db.select().from(assetsTable).where(eq(assetsTable.id, p.assetId));
  if (!a || !a.isActive) throw new Error("The asset no longer exists");
  const stale = (p.changes as any[]).filter(c => String((a as any)[c.field] ?? "") !== String(c.from ?? "") && !(["cost", "salvageValue", "usefulLifeYears"].includes(c.field) && Number((a as any)[c.field]) === Number(c.from)));
  if (stale.length) throw new Error(`${stale.map(c => c.label).join(", ")} changed after this request was raised — reject it and raise a new one`);
  const locked = lockedFinanceChange(a, { ...a, ...p.set }, await getLock());
  if (locked) throw new LockError(locked);
  await db.transaction(async tx => {
    await tx.update(assetsTable).set({ ...p.set, updatedBy: approver, updatedAt: new Date() }).where(eq(assetsTable.id, a.id));
    await tx.insert(assetTransactionsTable).values({ assetId: a.id, action: "Updated", userName: approver, comment: `${p.comment || "Finance change"} · ${requestNo} approved by ${approver}`, changes: p.changes, notes: (p.changes as any[]).map(c => c.label).join(", ") + " changed (approved)" });
  });
  return { assetTag: a.assetTag, fields: p.changes.length };
}

/* ═══ GL LEDGERS ═══════════════════════════════════════════════════════════ */

const defaultLedgers = (type: string) => ({ assetLedger: `Fixed Assets - ${type}`, accDepLedger: `Accumulated Depreciation - ${type}`, expenseLedger: "Depreciation Expense" });

async function ledgerMap() {
  const rules = await db.select().from(assetDepreciationRulesTable);
  const m = new Map<string, { assetLedger: string; accDepLedger: string; expenseLedger: string }>();
  for (const r of rules) { const d = defaultLedgers(r.assetType); m.set(r.assetType.toLowerCase(), { assetLedger: r.assetLedger || d.assetLedger, accDepLedger: r.accDepLedger || d.accDepLedger, expenseLedger: r.expenseLedger || d.expenseLedger }); }
  return (type: string) => m.get(String(type || "").toLowerCase()) || defaultLedgers(type || "Others");
}

router.get("/asset-depreciation/ledgers", requireAuth, async (_req, res) => {
  try {
    const rules = await db.select().from(assetDepreciationRulesTable).orderBy(assetDepreciationRulesTable.assetType);
    const pending = rowsOf(await db.execute(sql`SELECT request_no FROM asset_finance_requests WHERE kind = 'gl_settings' AND status = 'Pending' LIMIT 1`))[0];
    res.json({ types: rules.map(r => { const d = defaultLedgers(r.assetType); return { id: r.id, assetType: r.assetType, assetLedger: r.assetLedger || d.assetLedger, accDepLedger: r.accDepLedger || d.accDepLedger, expenseLedger: r.expenseLedger || d.expenseLedger }; }),
      settings: await financeSettings(), pendingRequest: pending?.request_no || null });
  } catch (e) { handleError(res, e); }
});

router.put("/asset-depreciation/ledgers", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    const cur: any = await (async () => { const rules = await db.select().from(assetDepreciationRulesTable); const st = await financeSettings(); return { rules, st }; })();
    const types: any[] = Array.isArray(req.body?.types) ? req.body.types : [];
    const settings: Record<string, string> = req.body?.settings || {};
    const changes: any[] = [];
    for (const t of types) {
      const r = cur.rules.find((x: any) => x.id === Number(t.id)); if (!r) continue;
      const d = defaultLedgers(r.assetType);
      for (const [k, label] of [["assetLedger", "asset ledger"], ["accDepLedger", "accumulated depreciation ledger"], ["expenseLedger", "depreciation expense ledger"]] as const) {
        const now = r[k] || d[k], next = s(t[k]) || d[k];
        if (now !== next) changes.push({ label: `${r.assetType} — ${label}`, from: now, to: next, id: r.id, key: k });
      }
    }
    for (const k of ["ledger_disposal_proceeds", "ledger_gain", "ledger_loss", "voucher_type"]) {
      const next = s(settings[k]); if (next && next !== cur.st[k]) changes.push({ label: k.replace("ledger_", "").replace(/_/g, " ") + " ledger", from: cur.st[k], to: next, setting: k });
    }
    if (!changes.length) return fail(res, 400, "Nothing changed");
    const pend = rowsOf(await db.execute(sql`SELECT request_no FROM asset_finance_requests WHERE kind = 'gl_settings' AND status = 'Pending' LIMIT 1`))[0];
    if (pend) return fail(res, 409, `A ledger change is already waiting for approval (${pend.request_no})`);
    const { createRequest } = await import("../lib/finance-controls");
    const r = await createRequest({ kind: "gl_settings", title: `GL ledgers for the depreciation journal (${changes.length} change${changes.length > 1 ? "s" : ""})`, payload: { changes }, preview: { changes }, by: u.by, userId: u.userId });
    void notifyRequest(r.id);
    res.status(202).json({ pendingApproval: true, ...r });
  } catch (e) { handleError(res, e); }
});

async function applyLedgers(p: any, approver: string) {
  await db.transaction(async tx => {
    for (const c of p.changes) {
      if (c.setting) await tx.execute(sql`INSERT INTO asset_finance_settings (key, value, updated_by, updated_at) VALUES (${c.setting}, ${c.to}, ${approver}, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`);
      else await tx.execute(sql`UPDATE asset_depreciation_rules SET ${sql.raw({ assetLedger: "asset_ledger", accDepLedger: "acc_dep_ledger", expenseLedger: "expense_ledger" }[c.key as string] || "notes")} = ${c.to}, updated_by = ${approver}, updated_at = now() WHERE id = ${c.id}`);
    }
  });
  return { changed: p.changes.length };
}

/* ═══ YEAR-END CLOSE & LOCK ═══════════════════════════════════════════════ */

router.get("/asset-depreciation/close-status", requireAuth, async (_req, res) => {
  try {
    const closes = rowsOf(await db.execute(sql`SELECT c.id, c.fy, c.status, c.lock_date AS "lockDate", c.closed_by AS "closedBy", c.closed_at AS "closedAt", c.close_note AS "closeNote", c.reopened_by AS "reopenedBy", c.reopened_at AS "reopenedAt", c.reopen_reason AS "reopenReason", c.totals,
        b.batch_no AS "batchNo", b.id AS "batchId" FROM asset_fy_closes c LEFT JOIN data_archive_batches b ON b.id = c.archive_batch_id ORDER BY c.closed_at DESC`)).map(c => ({ ...c, label: fyLabel(c.fy) }));
    const lock = await getLock();
    const cur = fyOf(today());
    // Next year that can be closed: the one after the lock, or (first time) the last completed year
    let next: number | null = lock ? lock.fy + 1 : cur - 1;
    if (next !== null && fyEnd(next) >= today()) next = null;
    let preview: any = null;
    if (next !== null) {
      const reg = await buildRegister(next);
      const pending = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM asset_finance_requests WHERE status = 'Pending'`))[0].n;
      preview = { fy: next, label: fyLabel(next), from: fyStart(next), to: fyEnd(next), assets: reg.rows.length, totals: reg.totals, missing: reg.missing.length, pendingRequests: pending };
    }
    res.json({ lock, closes, next: preview, currentFy: { fy: cur, label: fyLabel(cur) } });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-depreciation/close", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    const fy = Number(req.body?.fy);
    if (!Number.isInteger(fy)) return fail(res, 400, "Financial year is required");
    const lock = await getLock();
    if (lock && fy !== lock.fy + 1) return fail(res, 400, `Years close in order — the next year to close is ${fyLabel(lock.fy + 1)}`);
    if (fyEnd(fy) >= today()) return fail(res, 400, `${fyLabel(fy)} has not ended yet (ends ${fyEnd(fy)})`);
    const pending = rowsOf(await db.execute(sql`SELECT request_no FROM asset_finance_requests WHERE status = 'Pending' ORDER BY id`));
    if (pending.length) return fail(res, 400, `Approve or reject the ${pending.length} pending finance change(s) first (${pending.slice(0, 3).map(p => p.request_no).join(", ")}${pending.length > 3 ? "…" : ""}) — they could change this year's figures.`);
    const reg = await buildRegister(fy);
    // Carry-forward: each asset's frozen schedule up to the year end, closing book value and life used
    const rules = await loadRules();
    const carries = await loadCarries();
    const assets = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true));
    const carry: Record<number, any> = {};
    for (const a of assets) {
      const { input } = resolveInput(a, rules, carries);
      if (!input || input.purchaseDate > fyEnd(fy)) continue;
      const rows = schedule(input, fyEnd(fy));
      carry[a.id] = { rows, book: r2(input.cost - rows.reduce((t, r) => t + r.depreciation, 0)), elapsed: Math.round(lifeUsed(rows) * 1e6) / 1e6, nextFy: fy + 1 };
    }
    const disposals = reg.rows.filter((r: any) => r.deletions > 0);
    const readable = reg.rows.map((r: any) => ({ "Asset Tag": r.assetTag, "Asset": r.name, "Type": r.type, "Department": r.department || "", "Location": r.location || "", "Purchase Date": r.purchaseDate, "Method": r.method, "Life (yrs)": Number(r.lifeYears),
      "Gross Opening": r.grossOpening, "Additions": r.additions, "Deletions": r.deletions, "Gross Closing": r.grossClosing, "Acc Dep Opening": r.accOpening, "Depreciation": r.depreciation, "Acc Dep on Deletion": r.accOnDeletion, "Acc Dep Closing": r.accClosing,
      "Net Opening": r.netOpening, "Net Closing": r.netClosing, "Disposal Date": r.disposalDate || "", "Book Value at Disposal": r.bookAtDisposal ?? "", "Sale Value": r.disposalValue ?? "", "Gain / (Loss)": r.gainLoss ?? "" }));
    const batch = await createBatch({ kind: "asset_fy_close", module: "IT Asset Management", title: `${fyLabel(fy)} closed — fixed asset register`, rowCount: reg.rows.length, by: u.by,
      summary: { fy: fyLabel(fy), assets: reg.rows.length, ...Object.fromEntries(Object.entries(reg.totals).map(([k, v]) => [k, v])), note: s(req.body?.note) || "" },
      sections: { register: readable, byType: (reg.byType as any[]).map(t => ({ "Asset Type": t.type, "Assets": t.count, "Gross Block": r2(t.gross), "Depreciation": r2(t.depreciation), "Net Block": r2(t.net) })),
        disposals: disposals.map((r: any) => ({ "Asset Tag": r.assetTag, "Asset": r.name, "Disposal Date": r.disposalDate, "Cost": r.deletions, "Acc Dep": r.accOnDeletion, "Book Value": r.bookAtDisposal, "Sale Value": r.disposalValue ?? 0, "Gain / (Loss)": r.gainLoss ?? "" })) } });
    const ins = rowsOf(await db.execute(sql`INSERT INTO asset_fy_closes (fy, status, lock_date, closed_by, close_note, totals, register, carry, archive_batch_id)
      VALUES (${fy}, 'Closed', ${fyEnd(fy)}, ${u.by}, ${s(req.body?.note)}, ${JSON.stringify(reg.totals)}::jsonb, ${JSON.stringify(reg.rows)}::jsonb, ${JSON.stringify(carry)}::jsonb, ${batch.id}) RETURNING id`))[0];
    await safeLog({ entityType: "asset_fy_close", entityId: ins.id, action: "close", performedBy: u.by, summary: `${fyLabel(fy)} closed — ${reg.rows.length} assets, depreciation ₹${reg.totals.depreciation}, net block ₹${reg.totals.netClosing}; locked up to ${fyEnd(fy)}`, context: buildContext(req, "Depreciation") });
    batchWorkbook(batch.id).then(({ buffer, name }) => notify("asset_fy_close", {
      subject: `${fyLabel(fy)} closed — fixed asset register locked up to ${fyEnd(fy)}`,
      html: `<p><b>${fyLabel(fy)}</b> was closed. Its fixed asset register is frozen and no change can be back-dated into it.</p>${htmlTable([["Closed by", u.by], ["Assets", reg.rows.length], ["Gross block", `₹${reg.totals.grossClosing}`], ["Depreciation for the year", `₹${reg.totals.depreciation}`], ["Net block", `₹${reg.totals.netClosing}`], ["Archive batch", batch.batchNo], ["Note", s(req.body?.note) || "—"]])}<p>Attached: fixed asset register, summary by type, disposals.</p>`,
      attachment: { name, content: buffer, contentType: XLSX_TYPE }, batchId: batch.id,
    })).catch(e => console.error("fy close notify failed", e));
    res.json({ ok: true, fy, label: fyLabel(fy), lockDate: fyEnd(fy), batchNo: batch.batchNo, missing: reg.missing.length });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-depreciation/reopen", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    if (!u.access || !(u.access.isAdmin || u.access.perms.asset_depreciation === "admin")) return fail(res, 403, "Only an administrator (Full access to Depreciation) can reopen a closed year.");
    const reason = s(req.body?.reason);
    if (!reason || reason.length < 5) return fail(res, 400, "Give the reason for reopening (at least 5 characters)");
    const lock = await getLock();
    if (!lock) return fail(res, 400, "No financial year is closed");
    if (Number(req.body?.fy) !== lock.fy) return fail(res, 400, `Only the latest closed year (${lock.label}) can be reopened`);
    await db.execute(sql`UPDATE asset_fy_closes SET status = 'Reopened', reopened_by = ${u.by}, reopened_at = now(), reopen_reason = ${reason} WHERE id = ${lock.closeId}`);
    await safeLog({ entityType: "asset_fy_close", entityId: lock.closeId, action: "reopen", performedBy: u.by, summary: `${lock.label} reopened: ${reason}`, context: buildContext(req, "Depreciation") });
    void notify("asset_fy_close", { subject: `${lock.label} reopened — ${reason}`, html: `<p><b>${lock.label}</b> was reopened. Its figures can change until it is closed again.</p>${htmlTable([["Reopened by", u.by], ["Reason", reason], ["Originally closed by", lock.closedBy]])}` });
    const now = await getLock();
    res.json({ ok: true, lock: now });
  } catch (e) { handleError(res, e); }
});

/* ═══ DISPOSALS — profit / loss ═════════════════════════════════════════════ */

router.get("/asset-depreciation/disposals", requireAuth, async (req, res) => {
  try {
    const fy = Number(req.query.fy) || fyOf(today());
    const reg = await buildRegister(fy);
    const rows = reg.rows.filter((r: any) => r.deletions > 0).map((r: any) => ({ id: r.id, assetTag: r.assetTag, name: r.name, type: r.type, department: r.department, purchaseDate: r.purchaseDate, disposalDate: r.disposalDate,
      method: r.disposalMethod || (r.status === "Lost / Stolen" ? "Lost / Stolen" : null), cost: r.deletions, accumulated: r.accOnDeletion, bookValue: r.bookAtDisposal, saleValue: r.disposalValue ?? 0,
      gainLoss: r.gainLoss ?? (r.bookAtDisposal !== null ? r2((r.disposalValue ?? 0) - r.bookAtDisposal) : null) }));
    // Disposed assets without cost / purchase date cannot be valued
    const unvalued = (await db.select({ id: assetsTable.id, assetTag: assetsTable.assetTag, name: assetsTable.name, disposalDate: assetsTable.disposalDate, cost: assetsTable.cost, purchaseDate: assetsTable.purchaseDate, status: assetsTable.status })
      .from(assetsTable).where(sql`is_active = true AND disposal_date >= ${fyStart(fy)} AND disposal_date <= ${fyEnd(fy)} AND (cost IS NULL OR cost <= 0 OR purchase_date IS NULL)`));
    const sum = (k: string) => r2(rows.reduce((t: number, r: any) => t + (Number(r[k]) || 0), 0));
    res.json({ fy, label: fyLabel(fy), years: reg.years, locked: reg.locked, rows, unvalued,
      totals: { count: rows.length, cost: sum("cost"), accumulated: sum("accumulated"), bookValue: sum("bookValue"), saleValue: sum("saleValue"), gain: r2(rows.filter((r: any) => r.gainLoss > 0).reduce((t: number, r: any) => t + r.gainLoss, 0)), loss: r2(rows.filter((r: any) => r.gainLoss < 0).reduce((t: number, r: any) => t - r.gainLoss, 0)), net: sum("gainLoss") } });
  } catch (e) { handleError(res, e); }
});

/* ═══ MONTHLY JOURNAL ══════════════════════════════════════════════════════ */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const dayBefore = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10); };
const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export async function buildJournal(month: string) {
  const from = `${month}-01`, to = lastDay(month);
  const rules = await loadRules();
  const carries = await loadCarries();
  const L = await ledgerMap();
  const st = await financeSettings();
  const assets = await db.select().from(assetsTable).where(eq(assetsTable.isActive, true)).orderBy(assetsTable.assetTag);
  const detail: any[] = [], disposals: any[] = [];
  const agg = new Map<string, { ledger: string; costCentre: string; dr: number; cr: number; narr: Set<string>; count: number }>();
  const add = (ledger: string, cc: string, dr: number, cr: number, narr: string) => {
    if (Math.abs(dr) < 0.005 && Math.abs(cr) < 0.005) return;
    const k = `${ledger}|${cc}|${dr ? "D" : "C"}`;
    const e = agg.get(k) || { ledger, costCentre: cc, dr: 0, cr: 0, narr: new Set<string>(), count: 0 };
    e.dr += dr; e.cr += cr; e.narr.add(narr); e.count++; agg.set(k, e);
  };
  for (const a of assets) {
    const { input } = resolveInput(a, rules, carries);
    if (!input || input.purchaseDate > to) continue;
    const accStart = input.purchaseDate < from ? accumulated(input, dayBefore(from)) : 0;
    const accEnd = accumulated(input, to);
    const dep = r2(accEnd - accStart);
    const led = L(a.type);
    const cc = a.department || "Unallocated";
    if (dep > 0) {
      detail.push({ "Asset Tag": a.assetTag, "Asset": a.name, "Type": a.type, "Department": cc, "Method": input.method, "Opening Book Value": r2(input.cost - accStart), "Depreciation": dep, "Closing Book Value": r2(input.cost - accEnd) });
      add(led.expenseLedger, cc, dep, 0, `Depreciation ${a.type}`);
      add(led.accDepLedger, cc, 0, dep, `Depreciation ${a.type}`);
    }
    if (input.disposalDate && input.disposalDate >= from && input.disposalDate <= to) {
      const acc = accumulated(input, input.disposalDate);
      const book = r2(input.cost - acc), sale = Number(a.disposalValue) || 0, gl = r2(sale - book);
      disposals.push({ "Asset Tag": a.assetTag, "Asset": a.name, "Type": a.type, "Department": cc, "Disposal Date": input.disposalDate, "Method": a.disposalMethod || a.status, "Cost": input.cost, "Acc Dep": r2(acc), "Book Value": book, "Sale Value": sale, "Gain / (Loss)": gl });
      add(led.accDepLedger, cc, r2(acc), 0, `Disposal ${a.assetTag}`);
      if (sale > 0) add(st.ledger_disposal_proceeds, cc, sale, 0, `Disposal ${a.assetTag}`);
      if (gl < 0) add(st.ledger_loss, cc, -gl, 0, `Disposal ${a.assetTag}`);
      if (gl > 0) add(st.ledger_gain, cc, 0, gl, `Disposal ${a.assetTag}`);
      add(led.assetLedger, cc, 0, input.cost, `Disposal ${a.assetTag}`);
    }
  }
  const voucherNo = `DEP-${month}`;
  const lines = [...agg.values()].sort((x, y) => (y.dr > 0 ? 1 : 0) - (x.dr > 0 ? 1 : 0) || x.ledger.localeCompare(y.ledger) || x.costCentre.localeCompare(y.costCentre))
    .map(e => ({ "Voucher Date": to, "Voucher No": voucherNo, "Voucher Type": st.voucher_type || "Journal", "Ledger": e.ledger, "Cost Centre": e.costCentre, "Debit": r2(e.dr) || "", "Credit": r2(e.cr) || "",
      "Narration": `IT assets — ${[...e.narr].length > 3 ? `${[...e.narr].slice(0, 3).join(", ")} …` : [...e.narr].join(", ")} for ${monthName(month)}` }));
  const dr = r2(lines.reduce((t, l) => t + (Number(l.Debit) || 0), 0)), cr = r2(lines.reduce((t, l) => t + (Number(l.Credit) || 0), 0));
  return { month, label: monthName(month), from, to, voucherNo, lines, detail, disposals, totals: { debit: dr, credit: cr, balanced: Math.abs(dr - cr) < 0.01, depreciation: r2(detail.reduce((t, d) => t + d.Depreciation, 0)), assets: detail.length, disposals: disposals.length } };
}

router.get("/asset-depreciation/journal", requireAuth, async (req, res) => {
  try {
    const now = today().slice(0, 7);
    const month = s(req.query.month) || now;
    if (!MONTH_RE.test(month)) return fail(res, 400, "Month must be YYYY-MM");
    if (month > now) return fail(res, 400, "Cannot prepare a journal for a future month");
    const j = await buildJournal(month);
    const exports = rowsOf(await db.execute(sql`SELECT id, batch_no AS "batchNo", created_by AS "createdBy", created_at AS "createdAt" FROM data_archive_batches WHERE kind = 'asset_journal_export' AND summary ->> 'month' = ${month} ORDER BY id DESC`));
    const lock = await getLock();
    res.json({ ...j, exports, partial: month === now, locked: !!lock && j.to <= lock.lockDate });
  } catch (e) { handleError(res, e); }
});

router.post("/asset-depreciation/journal/export", requireAuth, async (req, res) => {
  try {
    const u = await me(req);
    const month = s(req.body?.month);
    if (!month || !MONTH_RE.test(month)) return fail(res, 400, "Month must be YYYY-MM");
    if (month >= today().slice(0, 7)) return fail(res, 400, "Export a month only after it has ended");
    const j = await buildJournal(month);
    if (!j.totals.balanced) return fail(res, 500, `Journal does not balance (Dr ${j.totals.debit} / Cr ${j.totals.credit}) — contact support`);
    if (!j.lines.length) return fail(res, 400, `No depreciation or disposals in ${j.label}`);
    const prior = rowsOf(await db.execute(sql`SELECT batch_no FROM data_archive_batches WHERE kind = 'asset_journal_export' AND summary ->> 'month' = ${month} ORDER BY id DESC LIMIT 1`))[0];
    const batch = await createBatch({ kind: "asset_journal_export", module: "IT Asset Management", title: `Depreciation journal — ${j.label}${prior ? " (re-export)" : ""}`, rowCount: j.lines.length, by: u.by,
      summary: { month, voucherNo: j.voucherNo, debit: j.totals.debit, credit: j.totals.credit, depreciation: j.totals.depreciation, assets: j.totals.assets, disposals: j.totals.disposals, reExportOf: prior?.batch_no || "" },
      sections: { journal: j.lines, detail: j.detail, disposals: j.disposals } });
    await safeLog({ entityType: "asset_journal", action: "export", performedBy: u.by, summary: `Depreciation journal ${j.label} exported (${batch.batchNo}) — Dr/Cr ₹${j.totals.debit}${prior ? `, re-export of ${prior.batch_no}` : ""}`, context: buildContext(req, "Depreciation") });
    const wb = await batchWorkbook(batch.id);
    void notify("asset_journal_export", {
      subject: `Depreciation journal ${j.label}${prior ? " (re-export)" : ""} — ₹${j.totals.depreciation}`,
      html: `<p>The monthly IT asset journal for <b>${j.label}</b> is attached (Tally-ready).</p>${htmlTable([["Voucher", `${j.voucherNo} dated ${j.to}`], ["Depreciation", `₹${j.totals.depreciation} on ${j.totals.assets} assets`], ["Disposals", j.totals.disposals], ["Total Dr = Cr", `₹${j.totals.debit}`], ["Archive batch", batch.batchNo], ["Exported by", u.by], ...(prior ? [["Replaces", prior.batch_no]] as [string, unknown][] : [])])}`,
      attachment: { name: wb.name, content: wb.buffer, contentType: XLSX_TYPE }, batchId: batch.id,
    });
    res.json({ ok: true, batchId: batch.id, batchNo: batch.batchNo, reExport: !!prior });
  } catch (e) { handleError(res, e); }
});

export default router;
