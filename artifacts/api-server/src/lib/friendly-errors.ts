import type { Request, Response, NextFunction } from "express";

/*
 * Every API error reaches the user as one readable sentence.
 *  - Validation errors (a JSON list of issues) → "Login email: enter a full email address …"
 *  - Database errors (duplicate key, missing value, bad date, wrong number …) → plain words, no SQL / table names
 *  - Anything else unexpected (500) → a generic message; the technical detail goes to the server log only
 */
const FIELD: Record<string, string> = { email: "Login email", employeeCode: "Employee code", employee_code: "Employee code", name: "Name", mobile: "Mobile number", password: "Password",
  designation: "Designation", department: "Department", targetDate: "Target date", periodFrom: "Audit period from", periodTo: "Audit period to", startDate: "Start date", validUntil: "Access until",
  assetTag: "Asset tag", asset_tag: "Asset tag", serialNumber: "Serial number", serial_number: "Serial number", title: "Title", key: "Key", label: "Label" };
const join = (f: string, m: string) => (f ? (/^(is|needs|can|should|must|choose) /.test(m) ? `${f} ${m}` : `${f}: ${m}`) : m.replace(/^./, c => c.toUpperCase()));
const words = (k: string) => FIELD[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").replace(/^./, c => c.toUpperCase());

function issue(i: any) {
  const field = Array.isArray(i?.path) && i.path.length ? words(String(i.path.filter((p: any) => typeof p === "string").pop() ?? i.path[i.path.length - 1])) : "";
  let m = String(i?.message || "is not valid");
  if (/invalid email/i.test(m) || i?.validation === "email" || i?.format === "email") m = "enter a full email address, e.g. name@ashikagroup.com";
  else if (i?.code === "too_small" && i?.minimum !== undefined) m = (i.type === "string" || i.origin === "string") ? (Number(i.minimum) <= 1 ? "is required" : `needs at least ${i.minimum} characters`) : (i.type === "array" || i.origin === "array") ? `choose at least ${i.minimum}` : `must be at least ${i.minimum}`;
  else if (i?.code === "too_big" && i?.maximum !== undefined) m = (i.type === "string" || i.origin === "string") ? `can be at most ${i.maximum} characters` : `must be at most ${i.maximum}`;
  else if (i?.code === "invalid_type" && (/undefined|received null/i.test(m) || i.received === "undefined")) m = "is required";
  else if (i?.code === "invalid_type") m = `should be ${i.expected === "number" ? "a number" : i.expected === "boolean" ? "yes or no" : i.expected === "string" ? "text" : i.expected === "array" ? "a list" : i.expected}`;
  else if (i?.code === "invalid_enum_value" || i?.code === "invalid_value") m = Array.isArray(i.options || i.values) ? `choose one of: ${(i.options || i.values).join(", ")}` : "choose a value from the list";
  else if (/^Required$/i.test(m)) m = "is required";
  return join(field, m);
}

export function friendlyMessage(raw: unknown, status = 400): string {
  const t = String(raw ?? "").trim(); let m: RegExpMatchArray | null;
  if (!t) return status >= 500 ? "Something went wrong on the server. Please try again; if it keeps happening, tell the IT team." : "The request could not be completed.";
  if (t.startsWith("[") || t.startsWith("{")) {
    try { const j = JSON.parse(t); const list = Array.isArray(j) ? j : j?.issues || j?.errors; if (Array.isArray(list) && list.length) return list.map(issue).join(" · "); } catch { /* not JSON */ }
  }
  // "field: message; other.field: message" (routes that join validation issues themselves)
  if (/^[A-Za-z_][\w.]*: /.test(t) && !/\s(SELECT|INSERT|UPDATE)\s/i.test(t)) {
    const parts = t.split(/;\s+(?=[A-Za-z_][\w.]*: )/).map(seg => {
      const k = seg.indexOf(": "); const f = seg.slice(0, k), msg = seg.slice(k + 2);
      const last = f.split(".").filter(x => !/^\d+$/.test(x)).pop() || f;
      let mm = msg;
      if (/^Required$/i.test(mm) || /received (null|undefined)/i.test(mm)) mm = "is required";
      else if (/invalid email/i.test(mm)) mm = "enter a full email address, e.g. name@ashikagroup.com";
      else if ((m = mm.match(/at least (\d+) character/i))) mm = Number(m[1]) <= 1 ? "is required" : `needs at least ${m[1]} characters`;
      else if ((m = mm.match(/at most (\d+) character/i))) mm = `can be at most ${m[1]} characters`;
      else if ((m = mm.match(/^Expected (number|boolean|string|array), received (\w+)/i))) mm = `should be ${m[1] === "number" ? "a number" : m[1] === "boolean" ? "yes or no" : m[1] === "array" ? "a list" : "text"}`;
      else if ((m = mm.match(/^Invalid enum value\. Expected (.+?), received/i))) mm = `choose one of: ${m[1].replace(/'/g, "").replace(/ \| /g, ", ")}`;
      else mm = mm.charAt(0).toLowerCase() === mm.charAt(0) ? mm : mm.replace(/^Not /, "is not ").replace(/^Use /, "use ").replace(/^Invalid/, "is not valid");
      return join(words(last), mm);
    });
    return parts.join(" · ");
  }
  // PostgreSQL messages
  if ((m = t.match(/duplicate key value violates unique constraint.*?(?:Key \(([^)]+)\)=\(([^)]*)\))?/i))) return m[1] ? `${words(m[1].split(",")[0].trim())} "${m[2]}" already exists — it must be unique.` : "This record already exists — a value that must be unique is already used.";
  if ((m = t.match(/null value in column "([^"]+)"/i))) return `${words(m[1])} is required.`;
  if (/violates foreign key constraint/i.test(t)) return /delete|update/i.test(t) && /still referenced/i.test(t) ? "This record is in use elsewhere and cannot be removed. Deactivate it instead." : "A linked record (user, company, category …) no longer exists. Refresh and choose again.";
  if (/violates check constraint/i.test(t)) return "One of the values is not allowed here. Check the choices and try again.";
  if ((m = t.match(/invalid input syntax for type (\w+)(?:: "([^"]*)")?/i))) return m[1] === "date" || m[1] === "timestamp" ? `"${m[2] ?? ""}" is not a valid date.` : m[1] === "integer" || m[1] === "numeric" || m[1] === "bigint" ? `"${m[2] ?? ""}" is not a valid number.` : "One of the values has the wrong format.";
  if (/date\/time field value out of range/i.test(t)) return "One of the dates is not a valid calendar date.";
  if ((m = t.match(/value too long for type character varying\((\d+)\)/i))) return `One of the texts is too long (maximum ${m[1]} characters).`;
  if (/numeric field overflow|out of range for type/i.test(t)) return "One of the numbers is too large.";
  if (/relation "[^"]+" does not exist|column "[^"]+" does not exist/i.test(t)) return "This feature needs a database update that has not been applied yet. Ask the IT team to run the latest deploy.";
  if (/ECONNREFUSED|connection terminated|timeout exceeded/i.test(t)) return "The database is not reachable right now. Please try again in a minute.";
  if (status >= 500 && /(SELECT|INSERT|UPDATE|DELETE) |syntax error|TypeError|ReferenceError|Cannot read propert|undefined is not|is not a function/i.test(t)) return "Something went wrong on the server. Please try again; if it keeps happening, tell the IT team.";
  return t;
}

/** Wraps res.json so every error body ({ error }) is rewritten before it is sent. */
export function friendlyErrors(req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 400 && body && typeof body === "object" && !Array.isArray(body)) {
      const raw = body.error ?? body.message;
      if (raw !== undefined) {
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        const nice = friendlyMessage(text, res.statusCode);
        if (nice !== text) { if (res.statusCode >= 500) console.error(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode}: ${text}`); body = { ...body, error: nice, ...(body.message !== undefined && body.error === undefined ? { message: nice } : {}) }; }
      }
    }
    return json(body);
  };
  next();
}
