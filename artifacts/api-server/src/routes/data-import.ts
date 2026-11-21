/** ITH-119 — Admin › Data import: download an Excel template per object, upload it, see a validated preview (every
 *  row checked, nothing saved), then import. Records are matched by a natural key (email, name, code, old ticket number)
 *  so a corrected file can be uploaded again: existing rows are updated, new ones added. All-or-nothing per upload.
 *  Super Admin only. Every upload (accepted or rejected) is kept in data_import_batches and the audit log. */
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getAccess } from "../lib/rbac";
import { requireAuth } from "./auth";
import { logAudit, getPerformedBy } from "./audit-logs";
import { ensureMasters, existingMasters } from "../lib/masters-auto";
import { route } from "../lib/itsm-routing";
import { slaConfig, slaColumns } from "../lib/itsm-sla";

const router = Router();
router.use("/data-import", requireAuth);
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const q = async (ex: any, s: any) => rowsOf(await ex.execute(s));
type Col = { key: string; header: string; required?: boolean; rule: string; sample: string[]; list?: string[] };
type Err = { row: number; column: string; message: string };
type Plan = { row: number; action: "create" | "update"; label: string; data: any };
type Ctx = { by: string; userId: number };
type Obj = { key: string; label: string; group: string; order: number; keyNote: string; cols: Col[]; lists?: () => Promise<Record<string, string[]>>;
  count: () => Promise<number>; check: (rows: any[]) => Promise<{ errors: Err[]; plan: Plan[]; notes?: string[] }>; save: (tx: any, plan: Plan[], ctx: Ctx) => Promise<void> };

/* ── value helpers ── */
const str = (v: any) => (v === undefined || v === null ? "" : String(v).trim());
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** dd-MMM-yyyy, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd (optionally with HH:mm) → { date: yyyy-mm-dd, time: HH:mm|null } or null */
function parseWhen(v: any): { date: string; time: string | null } | null {
  const s = str(v); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  let y: number, mo: number, d: number, hh: string | undefined, mm: string | undefined;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; hh = m[4]; mm = m[5]; }
  else if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/))) { d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = +m[3]; hh = m[4]; mm = m[5]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; hh = m[4]; mm = m[5]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (!(mo >= 1 && mo <= 12) || dt.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  if (hh !== undefined && (+hh > 23 || +mm! > 59)) return null;
  return { date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, time: hh !== undefined ? `${hh.padStart(2, "0")}:${mm}` : null };
}
const toTs = (w: { date: string; time: string | null }) => new Date(`${w.date}T${w.time || "10:00"}:00+05:30`);   // IST, 10:00 when no time
const yes = (v: any, dflt: boolean) => { const s = str(v).toLowerCase(); if (!s) return dflt; if (["yes", "y", "true", "1", "active"].includes(s)) return true; if (["no", "n", "false", "0", "inactive"].includes(s)) return false; return null; };
const pick = (v: string, list: readonly string[]) => list.find(x => x.toLowerCase() === v.toLowerCase()) || null;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const num = (v: any) => { const s = str(v).replace(/[,₹\s]/g, ""); if (!s) return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN; };

function checker(rows: any[], cols: Col[]) {
  const errors: Err[] = []; const H = Object.fromEntries(cols.map(c => [c.key, c.header]));
  const out = rows.map((raw, i) => {
    const rowNo = Number(raw?.__row) || i + 2; const r: any = { __row: rowNo };
    for (const c of cols) r[c.key] = str(raw?.[c.key]);
    return r;
  });
  const err = (r: any, key: string, message: string) => errors.push({ row: r.__row, column: H[key] || key, message });
  for (const r of out) for (const c of cols) if (c.required && !r[c.key]) err(r, c.key, "Required");
  const sample = (r: any) => cols.some(c => /^sample/i.test(r[c.key]));
  return { errors, rows: out.filter(r => !sample(r) || (err(r, cols[0].key, "Sample row from the template — delete it before uploading"), false)), err };
}
function dupCheck(rows: any[], key: string, err: any, label: string) {
  const seen = new Map<string, number>();
  for (const r of rows) { const k = r[key]?.toLowerCase(); if (!k) continue; if (seen.has(k)) err(r, key, `${label} "${r[key]}" appears twice in the file (row ${seen.get(k)})`); else seen.set(k, r.__row); }
}

/* ── 1. Users ── */
const SYS_ROLES = ["User", "Admin", "CXO", "HR", "KPI Employee"]; const SYS_ROLE_KEY: Record<string, string> = { user: "user", admin: "admin", cxo: "cxo", hr: "hr", "kpi employee": "kpi_employee" };
const usersObj: Obj = {
  key: "users", label: "Users (User Master)", group: "People & organisation", order: 1, keyNote: "Matched by email: existing users are updated, new ones added.",
  cols: [
    { key: "email", header: "Email", required: true, rule: "Required. Sign-in email, unique.", sample: ["sample.user@company.com", "sample.manager@company.com"] },
    { key: "name", header: "Full Name", required: true, rule: "Required.", sample: ["Sample User", "Sample Manager"] },
    { key: "employeeCode", header: "Employee Code", required: true, rule: "Required. Unique. Assets are assigned by this code.", sample: ["SAMPLE-E001", "SAMPLE-E002"] },
    { key: "userType", header: "User Type", rule: "Internal (default) or External.", sample: ["Internal", "Internal"], list: ["Internal", "External"] },
    { key: "department", header: "Department", required: true, rule: "Required. New departments are added to the list automatically.", sample: ["Operations", "Operations"] },
    { key: "designation", header: "Designation", required: true, rule: "Required.", sample: ["Executive", "Manager"] },
    { key: "mobile", header: "Mobile", rule: "Optional.", sample: ["", ""] },
    { key: "manager", header: "Reporting Manager Email", rule: "Optional. Must be an existing user or another row in this file. Used for manager approvals.", sample: ["sample.manager@company.com", ""] },
    { key: "systemRole", header: "System Role", rule: `Optional. ${SYS_ROLES.join(", ")} (default User). Admin = full access to everything.`, sample: ["User", "User"], list: SYS_ROLES },
    { key: "roles", header: "IT Hub Roles", rule: "Optional. Role names separated by commas (see the Lists sheet). Added to the user; existing roles are kept.", sample: ["Employee", "Employee, ITSM Agent"] },
    { key: "active", header: "Active", rule: "Yes (default) or No.", sample: ["Yes", "Yes"], list: ["Yes", "No"] },
    { key: "password", header: "Temporary Password", rule: "Optional, at least 8 characters — only for users who sign in with a password (not single sign-on). Ask them to change it. Delete this column after use.", sample: ["", ""] },
  ],
  lists: async () => ({ "IT Hub Roles": (await q(db, sql`SELECT name FROM roles ORDER BY name`)).map(r => r.name) }),
  count: async () => Number((await q(db, sql`SELECT count(*)::int n FROM users`))[0].n),
  async check(input) {
    const { errors, rows, err } = checker(input, this.cols);
    const users = await q(db, sql`SELECT id, lower(email) email, employee_code code FROM users`);
    const byEmail = new Map(users.map(u => [u.email, u])); const roles = new Map((await q(db, sql`SELECT id, name FROM roles`)).map(r => [String(r.name).toLowerCase(), r]));
    dupCheck(rows, "email", err, "Email"); dupCheck(rows, "employeeCode", err, "Employee code");
    const fileEmails = new Set(rows.map(r => r.email.toLowerCase())); const plan: Plan[] = [];
    for (const r of rows) {
      const email = r.email.toLowerCase();
      if (r.email && !EMAIL.test(r.email)) err(r, "email", `"${r.email}" is not a valid email`);
      const ut = r.userType ? pick(r.userType, ["Internal", "External"]) : "Internal"; if (!ut) err(r, "userType", "Use Internal or External");
      const sr = r.systemRole ? SYS_ROLE_KEY[r.systemRole.toLowerCase()] : "user"; if (!sr) err(r, "systemRole", `Use one of: ${SYS_ROLES.join(", ")}`);
      const act = yes(r.active, true); if (act === null) err(r, "active", "Use Yes or No");
      const mgr = r.manager.toLowerCase(); if (mgr) { if (!EMAIL.test(mgr)) err(r, "manager", "Not a valid email"); else if (mgr === email) err(r, "manager", "A user cannot be their own manager"); else if (!byEmail.has(mgr) && !fileEmails.has(mgr)) err(r, "manager", `${r.manager} is not a user and not in this file`); }
      const roleIds: number[] = []; for (const n of r.roles.split(",").map((x: string) => x.trim()).filter(Boolean)) { const ro = roles.get(n.toLowerCase()); if (!ro) err(r, "roles", `Role "${n}" does not exist (see the Lists sheet)`); else roleIds.push(ro.id); }
      if (r.password && r.password.length < 8) err(r, "password", "At least 8 characters");
      const clash = users.find(u => u.code && r.employeeCode && u.code.toLowerCase() === r.employeeCode.toLowerCase() && u.email !== email);
      if (clash) err(r, "employeeCode", `Already used by ${clash.email}`);
      const ex = byEmail.get(email);
      plan.push({ row: r.__row, action: ex ? "update" : "create", label: `${r.name} <${email}>`, data: { id: ex?.id, email, name: r.name, employeeCode: r.employeeCode, userType: (ut || "Internal").toLowerCase(), department: r.department, designation: r.designation, mobile: r.mobile || null, manager: mgr || null, role: sr, roleIds, isActive: act !== false, password: r.password || null } });
    }
    return { errors, plan };
  },
  async save(tx, plan, ctx) {
    await ensureMasters(tx, "department", plan.map(p => p.data.department));
    // users keep the department KEY (as the user form does); match by label or key, any case
    const keyOf = new Map<string, string>(); for (const m of await q(tx, sql`SELECT key, label FROM masters WHERE category = 'department'`)) { keyOf.set(String(m.label).toLowerCase(), m.key); keyOf.set(String(m.key).toLowerCase(), m.key); }
    for (const p of plan) {
      const d = p.data; const dep = keyOf.get(d.department.toLowerCase()) || d.department; const hash = d.password ? await bcrypt.hash(d.password, 10) : null;
      const status = d.isActive ? "active" : "inactive";
      if (d.id) {
        await tx.execute(sql`UPDATE users SET name = ${d.name}, employee_code = ${d.employeeCode}, user_type = ${d.userType}, department = ${dep}, designation = ${d.designation},
          mobile = coalesce(${d.mobile}, mobile), role = CASE WHEN role = 'admin' AND ${d.role} = 'user' THEN role ELSE ${d.role} END, is_active = ${d.isActive}, status = ${status},
          password_hash = coalesce(${hash}, password_hash), updated_at = now() WHERE id = ${d.id}`);
      } else {
        const [u] = await q(tx, sql`INSERT INTO users (email, name, employee_code, user_type, department, designation, mobile, role, is_active, status, password_hash, identity_source)
          VALUES (${d.email}, ${d.name}, ${d.employeeCode}, ${d.userType}, ${dep}, ${d.designation}, ${d.mobile}, ${d.role}, ${d.isActive}, ${status}, ${hash}, 'local') RETURNING id`);
        d.id = u.id;
      }
      for (const rid of d.roleIds) await tx.execute(sql`INSERT INTO user_roles (user_id, role_id, assigned_by) SELECT ${d.id}, ${rid}, ${ctx.userId} WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ${d.id} AND role_id = ${rid})`);
    }
    for (const p of plan) if (p.data.manager) await tx.execute(sql`UPDATE users SET reporting_manager_id = (SELECT id FROM users WHERE lower(email) = ${p.data.manager}) WHERE id = ${p.data.id}`);
    const { defaultRoleId } = await import("../lib/default-role"); const rid = await defaultRoleId();
    if (rid) for (const p of plan) if (p.data.userType === "internal" && p.data.isActive) await tx.execute(sql`INSERT INTO user_roles (user_id, role_id, assigned_by)
      SELECT ${p.data.id}, ${rid}, ${ctx.userId} WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ${p.data.id})`);
  },
};

/* ── 2–3. simple lists (masters) ── */
function masterObj(key: string, label: string, category: string, order: number, samples: string[]): Obj {
  return {
    key, label, group: "People & organisation", order, keyNote: "Matched by name: existing entries are updated (active / inactive), new ones added.",
    cols: [
      { key: "name", header: "Name", required: true, rule: "Required. Shown in drop-downs.", sample: samples },
      { key: "active", header: "Active", rule: "Yes (default) or No.", sample: samples.map(() => "Yes"), list: ["Yes", "No"] },
    ],
    count: async () => Number((await q(db, sql`SELECT count(*)::int n FROM masters WHERE category = ${category}`))[0].n),
    async check(input) {
      const { errors, rows, err } = checker(input, this.cols); dupCheck(rows, "name", err, "Name");
      const have = await existingMasters(category); const plan: Plan[] = [];
      for (const r of rows) { const a = yes(r.active, true); if (a === null) err(r, "active", "Use Yes or No"); if (r.name.length > 80) err(r, "name", "At most 80 characters");
        plan.push({ row: r.__row, action: have.has(r.name.toLowerCase()) ? "update" : "create", label: r.name, data: { name: r.name, active: a !== false } }); }
      return { errors, plan };
    },
    async save(tx, plan) {
      const m = (await ensureMasters(tx, category, plan.map(p => p.data.name))).map;
      for (const p of plan) await tx.execute(sql`UPDATE masters SET is_active = ${p.data.active} WHERE category = ${category} AND label = ${m.get(p.data.name.toLowerCase()) || p.data.name}`);
    },
  };
}

/* ── 4. Business units ── */
const buObj: Obj = {
  key: "business_units", label: "Business units / companies", group: "People & organisation", order: 4, keyNote: "Matched by code.",
  cols: [
    { key: "code", header: "Code", required: true, rule: "Required. Short unique code, e.g. MF.", sample: ["SAMPLE-MF", "SAMPLE-HO"] },
    { key: "name", header: "Name", required: true, rule: "Required.", sample: ["Mutual Fund", "Head Office"] },
    { key: "description", header: "Description", rule: "Optional.", sample: ["", ""] },
    { key: "active", header: "Active", rule: "Yes (default) or No.", sample: ["Yes", "Yes"], list: ["Yes", "No"] },
  ],
  count: async () => Number((await q(db, sql`SELECT count(*)::int n FROM business_units`))[0].n),
  async check(input) {
    const { errors, rows, err } = checker(input, this.cols); dupCheck(rows, "code", err, "Code");
    const have = new Map((await q(db, sql`SELECT id, lower(code) c FROM business_units`)).map(b => [b.c, b.id])); const plan: Plan[] = [];
    for (const r of rows) { const a = yes(r.active, true); if (a === null) err(r, "active", "Use Yes or No");
      plan.push({ row: r.__row, action: have.has(r.code.toLowerCase()) ? "update" : "create", label: `${r.code} — ${r.name}`, data: { id: have.get(r.code.toLowerCase()), code: r.code.toUpperCase(), name: r.name, description: r.description || null, active: a !== false } }); }
    return { errors, plan };
  },
  async save(tx, plan) {
    for (const p of plan) { const d = p.data;
      if (d.id) await tx.execute(sql`UPDATE business_units SET code = ${d.code}, name = ${d.name}, description = coalesce(${d.description}, description), is_active = ${d.active} WHERE id = ${d.id}`);
      else await tx.execute(sql`INSERT INTO business_units (code, name, description, is_active, sort_order) VALUES (${d.code}, ${d.name}, ${d.description}, ${d.active}, (SELECT coalesce(max(sort_order), 0) + 1 FROM business_units))`); }
  },
};

/* ── 5. Vendors ── */
const vendorObj: Obj = {
  key: "vendors", label: "Vendors", group: "Assets", order: 10, keyNote: "Matched by vendor name.",
  cols: [
    { key: "name", header: "Vendor Name", required: true, rule: "Required. Unique.", sample: ["Sample Vendor Pvt Ltd"] },
    { key: "contact", header: "Contact Person", rule: "Optional.", sample: ["Sample Contact"] },
    { key: "email", header: "Email", rule: "Optional.", sample: ["sales@samplevendor.com"] },
    { key: "phone", header: "Phone", rule: "Optional.", sample: [""] },
    { key: "address", header: "Address", rule: "Optional.", sample: [""] },
    { key: "start", header: "Contract Start", rule: "Optional. dd-MMM-yyyy", sample: ["01-Apr-2026"] },
    { key: "end", header: "Contract End", rule: "Optional. dd-MMM-yyyy", sample: ["31-Mar-2027"] },
    { key: "active", header: "Active", rule: "Yes (default) or No.", sample: ["Yes"], list: ["Yes", "No"] },
    { key: "notes", header: "Notes", rule: "Optional.", sample: [""] },
  ],
  count: async () => Number((await q(db, sql`SELECT count(*)::int n FROM asset_vendors`))[0].n),
  async check(input) {
    const { errors, rows, err } = checker(input, this.cols); dupCheck(rows, "name", err, "Vendor");
    const have = new Map((await q(db, sql`SELECT id, lower(name) n FROM asset_vendors`)).map(v => [v.n, v.id])); const plan: Plan[] = [];
    for (const r of rows) {
      if (r.email && !EMAIL.test(r.email)) err(r, "email", "Not a valid email");
      const s = parseWhen(r.start), e = parseWhen(r.end); if (r.start && !s) err(r, "start", "Use dd-MMM-yyyy, e.g. 01-Apr-2026"); if (r.end && !e) err(r, "end", "Use dd-MMM-yyyy");
      if (s && e && e.date < s.date) err(r, "end", "Before the contract start");
      const a = yes(r.active, true); if (a === null) err(r, "active", "Use Yes or No");
      plan.push({ row: r.__row, action: have.has(r.name.toLowerCase()) ? "update" : "create", label: r.name, data: { id: have.get(r.name.toLowerCase()), ...r, start: s?.date || null, end: e?.date || null, active: a !== false } });
    }
    return { errors, plan };
  },
  async save(tx, plan, ctx) {
    for (const p of plan) { const d = p.data; const st = d.active ? "Active" : "Inactive";
      if (d.id) await tx.execute(sql`UPDATE asset_vendors SET contact_person = coalesce(nullif(${d.contact}, ''), contact_person), email = coalesce(nullif(${d.email}, ''), email), phone = coalesce(nullif(${d.phone}, ''), phone),
        address = coalesce(nullif(${d.address}, ''), address), contract_start = coalesce(${d.start}, contract_start), contract_end = coalesce(${d.end}, contract_end), notes = coalesce(nullif(${d.notes}, ''), notes),
        status = ${st}, is_active = ${d.active}, updated_by = ${ctx.by}, updated_at = now() WHERE id = ${d.id}`);
      else await tx.execute(sql`INSERT INTO asset_vendors (name, contact_person, email, phone, address, contract_start, contract_end, status, notes, is_active, created_by, updated_by)
        VALUES (${d.name}, nullif(${d.contact}, ''), nullif(${d.email}, ''), nullif(${d.phone}, ''), nullif(${d.address}, ''), ${d.start}, ${d.end}, ${st}, nullif(${d.notes}, ''), ${d.active}, ${ctx.by}, ${ctx.by})`); }
  },
};

/* ── 6. Software licences ── */
const LIC_TYPES = ["Subscription", "Per User", "Per Device", "Concurrent", "Perpetual", "Volume", "OEM", "Site License", "Enterprise Agreement"];
const CYCLES = ["Monthly", "Quarterly", "Half-yearly", "Yearly", "Multi-year", "One-time"];
const licObj: Obj = {
  key: "licenses", label: "Software licences", group: "Assets", order: 12, keyNote: "Matched by Product + Edition + PO Number.",
  cols: [
    { key: "product", header: "Product Name", required: true, rule: "Required.", sample: ["Sample Office Suite"] },
    { key: "edition", header: "Edition", rule: "Optional.", sample: ["Business Standard"] },
    { key: "vendor", header: "Vendor", rule: "Optional. New vendors are added to the vendor list.", sample: ["Sample Vendor Pvt Ltd"] },
    { key: "type", header: "Licence Type", required: true, rule: LIC_TYPES.join(", "), sample: ["Subscription"], list: LIC_TYPES },
    { key: "seats", header: "Seats", required: true, rule: "Required. Whole number.", sample: ["50"] },
    { key: "key", header: "Licence Key", rule: "Optional.", sample: [""] },
    { key: "start", header: "Start Date", rule: "Optional. dd-MMM-yyyy", sample: ["01-Apr-2026"] },
    { key: "expiry", header: "Expiry Date", rule: "Optional (blank = perpetual). dd-MMM-yyyy", sample: ["31-Mar-2027"] },
    { key: "cost", header: "Cost (INR)", rule: "Optional. Number only.", sample: ["150000"] },
    { key: "renewal", header: "Renewal Cost (INR)", rule: "Optional. Number only.", sample: [""] },
    { key: "cycle", header: "Billing Cycle", rule: CYCLES.join(", "), sample: ["Yearly"], list: CYCLES },
    { key: "autoRenew", header: "Auto Renew", rule: "Yes or No (default).", sample: ["No"], list: ["Yes", "No"] },
    { key: "po", header: "PO Number", rule: "Optional.", sample: ["SAMPLE-PO-001"] },
    { key: "owner", header: "Owner", rule: "Optional. Person responsible.", sample: [""] },
    { key: "notes", header: "Notes", rule: "Optional.", sample: [""] },
  ],
  count: async () => Number((await q(db, sql`SELECT count(*)::int n FROM asset_licenses WHERE is_active`))[0].n),
  async check(input) {
    const { errors, rows, err } = checker(input, this.cols); const plan: Plan[] = [];
    const k = (p: string, e: string, po: string) => [p, e, po].map(x => x.toLowerCase()).join("|");
    const have = new Map((await q(db, sql`SELECT id, product_name p, coalesce(edition, '') e, coalesce(po_number, '') po FROM asset_licenses WHERE is_active`)).map(l => [k(l.p, l.e, l.po), l.id]));
    const seen = new Set<string>();
    for (const r of rows) {
      const t = pick(r.type, LIC_TYPES); if (r.type && !t) err(r, "type", `Use one of: ${LIC_TYPES.join(", ")}`);
      const seats = Number(r.seats); if (r.seats && !(Number.isInteger(seats) && seats >= 0)) err(r, "seats", "Whole number");
      const s = parseWhen(r.start), e = parseWhen(r.expiry); if (r.start && !s) err(r, "start", "Use dd-MMM-yyyy"); if (r.expiry && !e) err(r, "expiry", "Use dd-MMM-yyyy");
      if (s && e && e.date < s.date) err(r, "expiry", "Before the start date");
      const cost = num(r.cost), ren = num(r.renewal); if (Number.isNaN(cost)) err(r, "cost", "Number only"); if (Number.isNaN(ren)) err(r, "renewal", "Number only");
      const cy = r.cycle ? pick(r.cycle, CYCLES) : null; if (r.cycle && !cy) err(r, "cycle", `Use one of: ${CYCLES.join(", ")}`);
      const ar = yes(r.autoRenew, false); if (ar === null) err(r, "autoRenew", "Use Yes or No");
      const kk = k(r.product, r.edition, r.po); if (seen.has(kk)) err(r, "product", "Same Product + Edition + PO appears twice in the file"); seen.add(kk);
      plan.push({ row: r.__row, action: have.has(kk) ? "update" : "create", label: [r.product, r.edition].filter(Boolean).join(" "), data: { id: have.get(kk), ...r, type: t, seats, start: s?.date || null, expiry: e?.date || null, cost, ren, cycle: cy, autoRenew: ar === true } });
    }
    return { errors, plan };
  },
  async save(tx, plan, ctx) {
    for (const p of plan) { const d = p.data;
      let vid: number | null = null;
      if (d.vendor) { const [v] = await q(tx, sql`SELECT id FROM asset_vendors WHERE lower(name) = lower(${d.vendor})`);
        vid = v?.id ?? (await q(tx, sql`INSERT INTO asset_vendors (name, status, is_active, created_by, updated_by) VALUES (${d.vendor}, 'Active', true, ${ctx.by}, ${ctx.by}) RETURNING id`))[0].id; }
      const cost = d.cost == null ? null : d.cost.toFixed(2), ren = d.ren == null ? null : d.ren.toFixed(2);
      if (d.id) await tx.execute(sql`UPDATE asset_licenses SET vendor_name = coalesce(nullif(${d.vendor}, ''), vendor_name), vendor_id = coalesce(${vid}, vendor_id), license_type = ${d.type}, seats_total = ${d.seats},
        license_key = coalesce(nullif(${d.key}, ''), license_key), start_date = coalesce(${d.start}, start_date), expiry_date = ${d.expiry}, cost = coalesce(${cost}::numeric, cost), renewal_cost = coalesce(${ren}::numeric, renewal_cost),
        billing_cycle = coalesce(${d.cycle}, billing_cycle), auto_renew = ${d.autoRenew}, owner_name = coalesce(nullif(${d.owner}, ''), owner_name), notes = coalesce(nullif(${d.notes}, ''), notes), updated_by = ${ctx.by}, updated_at = now() WHERE id = ${d.id}`);
      else await tx.execute(sql`INSERT INTO asset_licenses (product_name, edition, vendor_name, vendor_id, license_type, seats_total, seats_used, license_key, start_date, expiry_date, cost, renewal_cost, billing_cycle, auto_renew, po_number, owner_name, notes, status, is_active, reminder_days, created_by, updated_by)
        VALUES (${d.product}, nullif(${d.edition}, ''), nullif(${d.vendor}, ''), ${vid}, ${d.type}, ${d.seats}, 0, nullif(${d.key}, ''), ${d.start}, ${d.expiry}, ${cost}::numeric, ${ren}::numeric, ${d.cycle}, ${d.autoRenew}, nullif(${d.po}, ''), nullif(${d.owner}, ''), nullif(${d.notes}, ''), 'Active', true, 30, ${ctx.by}, ${ctx.by})`); }
  },
};

/* ── 7–8. Tickets (history from the previous tool) ── */
const PRIOS = ["Critical", "High", "Medium", "Low"], SEVS = ["S1", "S2", "S3", "S4"];
const INC_ST = ["Open", "In Progress", "On Hold", "Escalated", "Resolved", "Closed"], SR_ST = ["Open", "Approved", "Rejected", "In Progress", "On Hold", "Completed", "Cancelled"];
function ticketObj(kind: "incident" | "request"): Obj {
  const inc = kind === "incident"; const table = inc ? "itsm_incidents" : "itsm_service_requests", noCol = inc ? "ticket_no" : "request_no", prefix = inc ? "INC" : "SR";
  const STS = inc ? INC_ST : SR_ST, DONE = inc ? ["Resolved", "Closed"] : ["Completed", "Cancelled", "Rejected"];
  const cols: Col[] = [
    { key: "legacy", header: "Old Ticket No", rule: "Recommended. Number in the previous tool — kept on the ticket; uploading again updates it instead of adding a duplicate.", sample: ["SAMPLE-1001"] },
    { key: "title", header: "Title", required: true, rule: "Required, at least 3 characters.", sample: [inc ? "Outlook not opening" : "New laptop for joiner"] },
    { key: "description", header: "Description", rule: "Optional.", sample: [""] },
    { key: "category", header: "Category", required: true, rule: `Required. Must be a ${inc ? "Incident" : "Service Request"} category from Admin › ITSM Setup (see the Lists sheet).`, sample: [inc ? "Application" : "Hardware"] },
    { key: "subcategory", header: "Sub-category", rule: "Required when the category has sub-categories.", sample: [""] },
    { key: "priority", header: "Priority", required: true, rule: PRIOS.join(", "), sample: ["Medium"], list: PRIOS },
    ...(inc ? [{ key: "severity", header: "Severity", rule: "S1–S4 (default S3).", sample: ["S3"], list: SEVS }] : []),
    { key: "status", header: "Status", rule: `${STS.join(", ")} (default Open).`, sample: ["Closed"], list: STS },
    { key: "requester", header: "Requester Email", required: true, rule: "Required. Must be a user (import Users first).", sample: ["sample.user@company.com"] },
    { key: "team", header: "Assigned Team", rule: "Optional. Team name; blank = the team mapped to the category.", sample: [""] },
    { key: "assignee", header: "Assigned To Email", rule: "Optional. Must be a user.", sample: [""] },
    { key: "created", header: "Created On", rule: "Optional (default now). dd-MMM-yyyy or dd-MMM-yyyy HH:mm (IST).", sample: ["05-Jan-2026 11:30"] },
    { key: "done", header: inc ? "Resolved On" : "Completed On", rule: `Needed when Status is ${DONE.join(" / ")}. dd-MMM-yyyy HH:mm`, sample: ["05-Jan-2026 15:00"] },
    { key: "notes", header: inc ? "Resolution Notes" : "Fulfilment Notes", rule: inc ? "Required when Resolved / Closed." : "Optional.", sample: ["Profile repaired"] },
  ];
  return {
    key: inc ? "incidents" : "service_requests", label: inc ? "Incidents (history)" : "Service requests (history)", group: "Service desk", order: inc ? 20 : 21,
    keyNote: "Matched by Old Ticket No. New IT Hub numbers are given; no approvals, workflows or emails are triggered for imported tickets.", cols,
    lists: async () => {
      const cat = await q(db, sql`SELECT category, subcategory FROM itsm_catalog WHERE ticket_type = ${inc ? "Incident" : "Service Request"} AND is_active ORDER BY category, subcategory NULLS FIRST`);
      return { "Category": [...new Set(cat.map(c => c.category))], "Category › Sub-category": cat.filter(c => c.subcategory).map(c => `${c.category} › ${c.subcategory}`), "Assigned Team": (await q(db, sql`SELECT name FROM itsm_teams WHERE is_active ORDER BY name`)).map(t => t.name) };
    },
    count: async () => Number((await q(db, sql.raw(`SELECT count(*)::int n FROM public.${table}`)))[0].n),
    async check(input) {
      const { errors, rows, err } = checker(input, cols); dupCheck(rows, "legacy", err, "Old ticket no");
      const users = new Map((await q(db, sql`SELECT id, lower(email) e, name FROM users`)).map(u => [u.e, u]));
      const teams = new Map((await q(db, sql`SELECT id, lower(name) n, name FROM itsm_teams WHERE is_active`)).map(t => [t.n, t]));
      const have = new Map((await q(db, sql.raw(`SELECT id, lower(legacy_ref) l FROM public.${table} WHERE legacy_ref IS NOT NULL`))).map(t => [t.l, t.id]));
      const plan: Plan[] = []; const now = new Date();
      for (const r of rows) {
        if (r.title && r.title.length < 3) err(r, "title", "At least 3 characters");
        const pr = pick(r.priority, PRIOS); if (r.priority && !pr) err(r, "priority", `Use one of: ${PRIOS.join(", ")}`);
        const sv = inc ? (r.severity ? pick(r.severity, SEVS) : "S3") : null; if (inc && !sv) err(r, "severity", "Use S1, S2, S3 or S4");
        const st = r.status ? pick(r.status, STS) : "Open"; if (!st) err(r, "status", `Use one of: ${STS.join(", ")}`);
        const rq = users.get(r.requester.toLowerCase()); if (r.requester && !rq) err(r, "requester", `${r.requester} is not a user — import Users first`);
        const as = r.assignee ? users.get(r.assignee.toLowerCase()) : null; if (r.assignee && !as) err(r, "assignee", `${r.assignee} is not a user`);
        const c = r.created ? parseWhen(r.created) : null; if (r.created && !c) err(r, "created", "Use dd-MMM-yyyy or dd-MMM-yyyy HH:mm");
        const createdAt = c ? toTs(c) : now; if (createdAt > now) err(r, "created", "Is in the future");
        const dn = r.done ? parseWhen(r.done) : null; if (r.done && !dn) err(r, "done", "Use dd-MMM-yyyy or dd-MMM-yyyy HH:mm");
        const doneAt = dn ? toTs(dn) : null;
        if (st && DONE.includes(st) && !doneAt) err(r, "done", `Needed when Status is ${st}`);
        if (doneAt && st && !DONE.includes(st)) err(r, "done", `Only for ${DONE.join(" / ")} tickets`);
        if (doneAt && doneAt < createdAt) err(r, "done", "Before Created On"); if (doneAt && doneAt > now) err(r, "done", "Is in the future");
        if (inc && st && ["Resolved", "Closed"].includes(st) && !r.notes) err(r, "notes", "Required when Resolved / Closed");
        let rt: any = null; try { if (r.category) rt = await route(kind, r.category, r.subcategory, createdAt); } catch (e: any) { err(r, /sub-categor/i.test(e.message) ? "subcategory" : "category", e.message); }
        const tm = r.team ? teams.get(r.team.toLowerCase()) : null; if (r.team && !tm) err(r, "team", `"${r.team}" is not an active team (see the Lists sheet)`);
        const ex = r.legacy ? have.get(r.legacy.toLowerCase()) : undefined;
        plan.push({ row: r.__row, action: ex ? "update" : "create", label: `${r.legacy ? r.legacy + " — " : ""}${r.title}`, data: { id: ex, legacy: r.legacy || null, title: r.title, description: r.description || null, priority: pr, severity: sv, status: st,
          category: rt?.category, subcategory: rt?.subcategory, teamId: tm?.id ?? rt?.team?.id ?? null, teamName: tm?.name ?? rt?.team?.name ?? null, expected: rt?.expectedClosureDate ?? null,
          requester: rq, assignee: as?.name ?? null, createdAt, doneAt, notes: r.notes || null } });
      }
      return { errors, plan };
    },
    async save(tx, plan, ctx) {
      const cfg = await slaConfig();
      for (const p of plan) {
        const d = p.data; const sla: any = slaColumns(kind, { priority: d.priority, createdAt: d.createdAt, status: d.status, resolvedAt: d.doneAt, completedAt: d.doneAt, slaPausedMins: 0 }, cfg);
        const closedAt = inc && d.status === "Closed" ? d.doneAt : null; let id = d.id;
        if (inc) {
          if (id) await tx.execute(sql`UPDATE itsm_incidents SET title = ${d.title}, description = ${d.description}, priority = ${d.priority}, severity = ${d.severity}, status = ${d.status}, category = ${d.category}, subcategory = ${d.subcategory},
            team_id = ${d.teamId}, assigned_group = ${d.teamName}, assigned_to = ${d.assignee}, requester_user_id = ${d.requester.id}, reported_by = ${d.requester.name}, reporter_email = ${d.requester.e},
            resolution_notes = ${d.notes}, resolved_at = ${d.doneAt}, closed_at = ${closedAt}, created_at = ${d.createdAt}, sla_id = ${sla.slaId}, sla_breach_at = ${sla.slaBreachAt}, response_due_at = ${sla.responseDueAt}, updated_by = ${ctx.by}, updated_at = now() WHERE id = ${id}`);
          else { const n = await nextNo(tx, table, noCol, prefix);
            id = (await q(tx, sql`INSERT INTO itsm_incidents (ticket_no, legacy_ref, title, description, priority, severity, status, source, category, subcategory, team_id, assigned_group, assigned_to, requester_user_id, reported_by, reporter_email,
              resolution_notes, resolved_at, closed_at, expected_closure_date, first_response_at, sla_id, sla_breach_at, response_due_at, is_active, created_by, updated_by, created_at, updated_at)
              VALUES (${n}, ${d.legacy}, ${d.title}, ${d.description}, ${d.priority}, ${d.severity}, ${d.status}, 'Import', ${d.category}, ${d.subcategory}, ${d.teamId}, ${d.teamName}, ${d.assignee}, ${d.requester.id}, ${d.requester.name}, ${d.requester.e},
              ${d.notes}, ${d.doneAt}, ${closedAt}, ${d.expected}, ${d.assignee ? d.createdAt : null}, ${sla.slaId}, ${sla.slaBreachAt}, ${sla.responseDueAt}, true, ${ctx.by}, ${ctx.by}, ${d.createdAt}, now()) RETURNING id`))[0].id; }
        } else {
          if (id) await tx.execute(sql`UPDATE itsm_service_requests SET title = ${d.title}, description = ${d.description}, priority = ${d.priority}, status = ${d.status}, category = ${d.category}, subcategory = ${d.subcategory},
            team_id = ${d.teamId}, assigned_group = ${d.teamName}, assigned_to = ${d.assignee}, requester_user_id = ${d.requester.id}, requested_by = ${d.requester.name}, fulfillment_notes = ${d.notes}, completed_at = ${d.doneAt},
            created_at = ${d.createdAt}, sla_id = ${sla.slaId}, sla_breach_at = ${sla.slaBreachAt}, response_due_at = ${sla.responseDueAt}, updated_by = ${ctx.by}, updated_at = now() WHERE id = ${id}`);
          else { const n = await nextNo(tx, table, noCol, prefix);
            id = (await q(tx, sql`INSERT INTO itsm_service_requests (request_no, legacy_ref, title, description, priority, status, category, subcategory, team_id, assigned_group, assigned_to, requester_user_id, requested_by,
              fulfillment_notes, completed_at, expected_closure_date, first_response_at, sla_id, sla_breach_at, response_due_at, is_active, created_by, updated_by, created_at, updated_at)
              VALUES (${n}, ${d.legacy}, ${d.title}, ${d.description}, ${d.priority}, ${d.status}, ${d.category}, ${d.subcategory}, ${d.teamId}, ${d.teamName}, ${d.assignee}, ${d.requester.id}, ${d.requester.name},
              ${d.notes}, ${d.doneAt}, ${d.expected}, ${d.assignee ? d.createdAt : null}, ${sla.slaId}, ${sla.slaBreachAt}, ${sla.responseDueAt}, true, ${ctx.by}, ${ctx.by}, ${d.createdAt}, now()) RETURNING id`))[0].id; }
        }
        await tx.execute(sql`INSERT INTO itsm_ticket_history (ticket_id, ticket_type, old_status, new_status, updated_by, notes)
          VALUES (${id}, ${inc ? "incident" : "service_request"}, NULL, ${d.status}, ${ctx.by}, ${`${d.id ? "Updated" : "Imported"} from the previous system${d.legacy ? ` (old no ${d.legacy})` : ""}`})`);
      }
    },
  };
}
async function nextNo(tx: any, table: string, col: string, prefix: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"itsm_no:" + table}))`);
  const [r] = await q(tx, sql.raw(`SELECT coalesce(max(nullif(regexp_replace(${col}, '\\D', '', 'g'), '')::bigint), 0) AS n FROM public.${table}`));
  return `${prefix}-${String(Number(r.n) + 1).padStart(5, "0")}`;
}

const OBJECTS: Obj[] = [usersObj, masterObj("departments", "Departments", "department", 2, ["Sample Operations", "Sample Finance"]), masterObj("locations", "Locations", "asset_location", 3, ["Sample Head Office", "Sample Branch"]),
  buObj, vendorObj, licObj, ticketObj("incident"), ticketObj("request")];
const byKey = (k: string) => OBJECTS.find(o => o.key === k);
/** Uploads that already have their own screen (kept there, listed on the Data import page). */
const EXTERNAL = [
  { key: "assets", label: "Assets (asset register)", group: "Assets", order: 11, keyNote: "Uses the asset register upload (template, validation and import).", table: "assets" },
  { key: "itsm_catalog", label: "Service catalog (categories, teams, days)", group: "Service desk", order: 19, keyNote: "Uses the ITSM Setup › Categories upload.", table: "itsm_catalog" },
];

async function superAdmin(req: Request, res: Response) {
  const a = await getAccess(req); if (!a?.isAdmin) { res.status(403).json({ error: "Data import is for Super Admin only" }); return null; } return a;
}
const userName = async (id: number) => getPerformedBy(id).catch(() => "Administrator");

router.get("/data-import/objects", async (req, res) => {
  if (!await superAdmin(req, res)) return;
  const out: any[] = [];
  for (const o of OBJECTS) out.push({ key: o.key, label: o.label, group: o.group, order: o.order, keyNote: o.keyNote, records: await o.count(), columns: o.cols.map(c => ({ key: c.key, header: c.header, required: !!c.required, rule: c.rule })) });
  for (const e of EXTERNAL) out.push({ ...e, external: true, records: Number((await q(db, sql.raw(`SELECT count(*)::int n FROM public.${e.table}`)))[0].n) });
  const history = await q(db, sql`SELECT id, object, file_name AS "fileName", total, created, updated, failed, status, user_name AS "by", created_at AS "at" FROM data_import_batches ORDER BY id DESC LIMIT 30`);
  res.json({ objects: out.sort((a, b) => a.order - b.order), history });
});

router.get("/data-import/template/:key", async (req, res) => {
  if (!await superAdmin(req, res)) return;
  const o = byKey(String(req.params.key)); if (!o) { res.status(404).json({ error: "Unknown object" }); return; }
  const XLSX = await import("xlsx"); const wb = XLSX.utils.book_new();
  const n = Math.max(...o.cols.map(c => c.sample.length));
  const data = XLSX.utils.aoa_to_sheet([o.cols.map(c => c.header + (c.required ? " *" : "")), ...Array.from({ length: n }, (_, i) => o.cols.map(c => c.sample[i] ?? ""))]);
  data["!cols"] = o.cols.map(c => ({ wch: Math.max(14, c.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, data, "Data");
  const help = XLSX.utils.aoa_to_sheet([[`${o.label} — how to fill this template`], [], ["1. Fill one row per record on the Data sheet. Columns marked * are required."], ["2. Delete the SAMPLE row(s) before uploading."],
    [`3. ${o.keyNote}`], ["4. Dates: dd-MMM-yyyy, e.g. 05-Jan-2026 (time optional: 05-Jan-2026 14:30)."], ["5. Upload in Admin › Data import — every row is checked first; nothing is saved until you press Import."], [],
    ["Column", "Required", "Rule"], ...o.cols.map(c => [c.header, c.required ? "Yes" : "", c.rule])]);
  help["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 110 }]; XLSX.utils.book_append_sheet(wb, help, "Instructions");
  const lists: Record<string, string[]> = { ...Object.fromEntries(o.cols.filter(c => c.list).map(c => [c.header, c.list!])), ...(o.lists ? await o.lists() : {}) };
  if (Object.keys(lists).length) { const keys = Object.keys(lists); const len = Math.max(...keys.map(k => lists[k].length));
    const ls = XLSX.utils.aoa_to_sheet([keys, ...Array.from({ length: len }, (_, i) => keys.map(k => lists[k][i] ?? ""))]); ls["!cols"] = keys.map(() => ({ wch: 34 })); XLSX.utils.book_append_sheet(wb, ls, "Lists"); }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="IT_Hub_Template_${o.key}.xlsx"`); res.send(buf);
});

/** Map uploaded column headers (any case, with or without *) to field keys. */
function mapRows(o: Obj, rows: any[]) {
  const norm = (s: string) => String(s).toLowerCase().replace(/\*|\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
  const H = new Map(o.cols.flatMap(c => [[norm(c.header), c.key], [norm(c.key), c.key]]));
  return rows.map((r, i) => { const out: any = { __row: Number(r?.__row) || i + 2 }; for (const [k, v] of Object.entries(r || {})) { const key = H.get(norm(k)); if (key) out[key] = v; } return out; });
}

router.post("/data-import/:key", async (req, res) => {
  const a = await superAdmin(req, res); if (!a) return;
  const o = byKey(String(req.params.key)); if (!o) { res.status(404).json({ error: "Unknown object" }); return; }
  const raw: any[] = Array.isArray(req.body?.rows) ? req.body.rows : []; const dryRun = req.body?.dryRun !== false; const fileName = String(req.body?.fileName || "").slice(0, 200) || null;
  if (!raw.length) { res.status(400).json({ error: "The file has no data rows (fill the Data sheet below the header row)." }); return; }
  if (raw.length > 10000) { res.status(400).json({ error: "At most 10,000 rows per upload — split the file." }); return; }
  const headers = new Set(raw.flatMap(r => Object.keys(r || {}))); const rows = mapRows(o, raw);
  const missing = o.cols.filter(c => c.required && !rows.some(r => c.key in r)).map(c => c.header);
  if (missing.length) { res.status(400).json({ error: `Columns missing: ${missing.join(", ")}. Download the template for the right layout.`, headers: [...headers] }); return; }
  try {
    const { errors, plan } = await o.check(rows);
    errors.sort((x, y) => x.row - y.row);
    const summary = { total: rows.length, create: plan.filter(p => p.action === "create").length, update: plan.filter(p => p.action === "update").length, errorRows: new Set(errors.map(e => e.row)).size, errors: errors.slice(0, 500), errorCount: errors.length };
    const by = await userName(a.userId);
    if (dryRun) { res.json({ ...summary, dryRun: true, preview: plan.slice(0, 8).map(p => ({ row: p.row, action: p.action, label: p.label })) }); return; }
    if (errors.length) {
      await db.execute(sql`INSERT INTO data_import_batches (object, file_name, total, failed, status, errors, user_id, user_name) VALUES (${o.key}, ${fileName}, ${rows.length}, ${summary.errorRows}, 'Rejected', ${JSON.stringify(errors.slice(0, 200))}::jsonb, ${a.userId}, ${by})`);
      res.status(400).json({ ...summary, error: `Nothing was imported: ${summary.errorRows} row(s) have problems. Fix them and upload again.` }); return;
    }
    await db.transaction(async tx => { await o.save(tx, plan, { by, userId: a.userId }); });
    const [b] = await q(db, sql`INSERT INTO data_import_batches (object, file_name, total, created, updated, status, user_id, user_name) VALUES (${o.key}, ${fileName}, ${rows.length}, ${summary.create}, ${summary.update}, 'Imported', ${a.userId}, ${by}) RETURNING id`);
    logAudit({ entityType: "data_import", entityId: Number(b.id), action: "import", performedBy: by, summary: `${o.label}: ${summary.create} added, ${summary.update} updated from ${fileName || "upload"} (${rows.length} rows)` }).catch(() => {});
    res.json({ ...summary, imported: true, batchId: Number(b.id) });
  } catch (e: any) {
    res.status(400).json({ error: `Nothing was imported: ${String(e?.message || e).replace(/\s+/g, " ").slice(0, 300)}` });
  }
});

export default router;
