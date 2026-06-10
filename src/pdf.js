function renderReportPdf(report, sections = []) {
  const lines = [
    "AFRIBN Intelligence Report",
    report.title,
    `Type: ${report.reportType}`,
    `Generated: ${report.generatedAt || new Date().toISOString()}`,
    "",
    ...sections.flatMap((section) => [
      section.heading,
      ...String(section.body || "").split("\n"),
      ""
    ])
  ];
  return createSimplePdf(lines);
}

function createSimplePdf(lines) {
  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const content = buildContent(lines);
  const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  const pagesId = add(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function buildContent(lines) {
  const commands = ["BT", "/F1 12 Tf", "50 750 Td", "16 TL"];
  for (const line of lines.slice(0, 42)) {
    commands.push(`(${escapePdfText(line).slice(0, 110)}) Tj`);
    commands.push("T*");
  }
  commands.push("ET");
  return commands.join("\n");
}

function escapePdfText(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sendPdf(res, filename, buffer) {
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length
  });
  res.end(buffer);
}

module.exports = { renderReportPdf, sendPdf };
