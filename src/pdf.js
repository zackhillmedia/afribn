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

function renderCountryBriefPdf(brief) {
  const b = brief.brief || {};
  const pages = [
    [
      "AFRIBN Country Brief",
      `${brief.country} Brief`,
      "Strategic Markets Launch Edition",
      `Updated: ${new Date().toISOString().slice(0, 10)}`,
      "",
      "Executive Summary",
      b.overview?.executiveSummary || "",
      "",
      "Country Snapshot",
      b.overview?.countrySnapshot || ""
    ],
    [
      "Overview",
      `Risk Level: ${brief.summary?.riskLevel || "unknown"}`,
      `Published Intelligence: ${brief.summary?.publishedCount || 0}`,
      `Policy Developments: ${brief.summary?.policyCount || 0}`,
      `Investment Activity: ${brief.summary?.dealCount || 0}`,
      "",
      "Key Developments",
      ...brief.keyDevelopments.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}`)
    ],
    [
      "Political Intelligence",
      b.political?.outlook || "",
      "",
      "Government and Policy Developments",
      ...(b.political?.developments || []).slice(0, 10).map((item, index) => `${index + 1}. ${item.title}`)
    ],
    [
      "Economic & Investment Intelligence",
      "Investment Activity",
      ...(b.economicInvestment?.investmentActivity || []).slice(0, 10).map((item, index) => `${index + 1}. ${item.title} ${item.value ? `(${item.value})` : ""}`),
      "",
      "Emerging Opportunities",
      ...(b.economicInvestment?.emergingOpportunities || []).slice(0, 8)
    ],
    [
      "Regulatory, Infrastructure, Security & Risk",
      "Major Initiatives",
      ...(b.regulatoryInfrastructure?.majorInitiatives || []).slice(0, 8).map((item, index) => `${index + 1}. ${item.title}`),
      "",
      "Business Environment",
      b.securityRisk?.businessEnvironment || ""
    ],
    [
      "AFRIBN Outlook",
      "Opportunities",
      ...(b.outlook?.opportunities || []).slice(0, 6),
      "",
      "Risks",
      ...(b.outlook?.risks || []).slice(0, 6),
      "",
      "Analyst Observations",
      b.outlook?.analystObservations || "",
      "",
      "Sources",
      ...(b.outlook?.sources || []).slice(0, 6)
    ]
  ];
  return createSimplePdf(pages);
}

function createSimplePdf(lines) {
  if (Array.isArray(lines[0])) return createMultiPagePdf(lines);
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

function createMultiPagePdf(pages) {
  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const content = buildContent(pageLines);
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
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

module.exports = { renderReportPdf, renderCountryBriefPdf, sendPdf };
