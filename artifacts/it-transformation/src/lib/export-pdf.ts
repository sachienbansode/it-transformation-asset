/* ITH-135 — download a screen section as a PDF that looks exactly like the page.
 * The section is drawn to an image by the browser itself (html-to-image), cut into A4 pages at card boundaries
 * (a card is never split unless it is taller than a page) and saved with jsPDF. Buttons are left out. */
export async function exportElementPdf(el: HTMLElement, opts: { fileName: string; title: string; subtitle?: string; footer?: string }) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const width = el.scrollWidth;
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const keep = (n: HTMLElement) => !(n instanceof HTMLElement) || (n.tagName !== "BUTTON" && !n.dataset?.noPdf);
  const scale = 2;
  const canvas = await toCanvas(el, { pixelRatio: scale, backgroundColor: bg, width, filter: keep as any, cacheBust: true });

  // safe break points = bottom edge of every block-level card / section (in CSS px from the top of el)
  const top0 = el.getBoundingClientRect().top;
  const breaks = new Set<number>();
  el.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *, [data-pdf-block]").forEach(c => {
    const r = c.getBoundingClientRect(); if (r.height > 0) breaks.add(Math.round(r.bottom - top0 + 6));
  });
  const sorted = [...breaks].sort((a, b) => a - b);

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const margin = 24, head = 40, foot = 22;
  const k = (pw - margin * 2) / width;                 // CSS px → pt
  const pagePx = (ph - head - foot - margin) / k;      // usable height per page in CSS px
  const totalPx = canvas.height / scale;

  const slices: [number, number][] = [];
  for (let y = 0; y < totalPx - 1;) {
    let end = Math.min(totalPx, y + pagePx);
    if (end < totalPx) { const cut = sorted.filter(b => b > y + pagePx * 0.35 && b <= end).pop(); if (cut) end = cut; }
    slices.push([y, end]); y = end;
  }
  const stamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
  slices.forEach(([y0, y1], i) => {
    if (i) pdf.addPage();
    const part = document.createElement("canvas"); part.width = canvas.width; part.height = Math.ceil((y1 - y0) * scale);
    const ctx = part.getContext("2d")!; ctx.fillStyle = bg; ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, Math.floor(y0 * scale), canvas.width, part.height, 0, 0, part.width, part.height);
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, head, pw - margin * 2, (y1 - y0) * k);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(30, 41, 59); pdf.text(opts.title, margin, 22);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
    if (opts.subtitle) pdf.text(opts.subtitle, margin, 33);
    pdf.text(`${opts.footer ? opts.footer + " · " : ""}Generated ${stamp} IST`, margin, ph - 10);
    pdf.text(`Page ${i + 1} of ${slices.length}`, pw - margin, ph - 10, { align: "right" });
  });
  pdf.save(opts.fileName);
}
