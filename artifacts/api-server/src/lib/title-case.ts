/** ITH-123 — master values are kept in Title Case (same rules as db function ithub_title_case): known acronyms upper-case,
 *  short ALL-CAPS words and mixed-case words (iPhone, McAfee) kept, small joining words lower-case, brackets preserved. */
const KEEP = new Set(["IT","HR","HO","DC","DR","AMC","MF","AIF","IB","IE","NBFC","KPI","CXO","CEO","CTO","CFO","COO","CISO","UPS","PCG","ECM","OEM","AWS","HP","IBM","SAP","ERP","CRM","PMS","RMS","BU","QA","UAT","NOC","SOC","VIP","PC","IP","ID","HQ","LAN","WAN","VPN","PO","GST","TDS","KYC","AML","SEBI","RBI","NSE","BSE","MCX","IRDAI","DP","RTA","CDSL","NSDL","EOL","IDC","LLM","RPA","ML","AI","BI","NLP","API","SAAS","GPL","LGPL","MIT","BSD","PII","PDPA","II","III","IV"]);
const SMALL = new Set(["and","or","of","the","for","to","in","on","at","by","with","a","an"]);
export function titleCase(t: string): string {
  let s = String(t ?? "").replace(/\s+/g, " ").trim(); if (!s) return s;
  if (!/[a-z]/.test(s) && /[A-Z]{2,}.*\s/.test(s)) s = s.split(" ").map(w => KEEP.has(w.replace(/[^A-Za-z]/g, "").toUpperCase()) ? w : w.toLowerCase()).join(" ");   // typed in CAPS LOCK
  const parts = s.split(/(?=[ /-])|(?<=[ /-])/); const n = parts.length;
  return parts.map((w, i) => {
    if (/^[ /-]$/.test(w)) return w;
    const m = w.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)!; const [, pre, core0, suf] = m; let core = core0;
    if (!core) return w;
    if (KEEP.has(core.toUpperCase())) core = core.toUpperCase();
    else if (/[a-z][A-Z]/.test(core) || (/^[A-Z0-9&.]+$/.test(core) && core.length >= 2 && core.length <= 6) || /^[0-9]/.test(core)) { /* keep */ }
    else if (i > 0 && i < n - 1 && !pre && SMALL.has(core.toLowerCase())) core = core.toLowerCase();
    else core = core[0].toUpperCase() + core.slice(1).toLowerCase();
    return pre + core + suf;
  }).join("");
}
