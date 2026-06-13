#!/usr/bin/env python3
"""Minimal Markdown -> PDF converter (reportlab) for AFRIBN docs.
Handles: # ## ### headings, paragraphs, - and 1. lists, > quotes,
``` fenced code, | pipe | tables, --- rules, and inline **bold** / `code`."""
import re, sys, html
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Preformatted, HRFlowable)

src, out = sys.argv[1], sys.argv[2]
RED = colors.HexColor("#E8252D")
INK = colors.HexColor("#1a1f29")
MUTE = colors.HexColor("#5a6472")
LINE = colors.HexColor("#d8dde5")
PANEL = colors.HexColor("#f5f6f8")

ss = getSampleStyleSheet()
styles = {
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontSize=22, leading=27, spaceBefore=6, spaceAfter=10, textColor=INK),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=15.5, leading=20, spaceBefore=16, spaceAfter=7, textColor=RED),
    "h3": ParagraphStyle("h3", parent=ss["Heading3"], fontSize=12.5, leading=16, spaceBefore=11, spaceAfter=4, textColor=INK),
    "body": ParagraphStyle("body", parent=ss["BodyText"], fontSize=10, leading=15, spaceAfter=7, textColor=INK),
    "li": ParagraphStyle("li", parent=ss["BodyText"], fontSize=10, leading=15, leftIndent=14, spaceAfter=3, textColor=INK),
    "quote": ParagraphStyle("quote", parent=ss["BodyText"], fontSize=9.5, leading=14, leftIndent=12, textColor=MUTE, borderColor=RED),
    "cell": ParagraphStyle("cell", parent=ss["BodyText"], fontSize=8.5, leading=11.5, textColor=INK),
    "cellh": ParagraphStyle("cellh", parent=ss["BodyText"], fontSize=8.5, leading=11.5, textColor=colors.white, fontName="Helvetica-Bold"),
    "code": ParagraphStyle("code", parent=ss["Code"], fontSize=8, leading=11, textColor=INK, backColor=PANEL,
                           borderPadding=(8, 8, 8, 8), spaceBefore=4, spaceAfter=8),
}

def inline(t):
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.5" backColor="#eef0f3">\1</font>', t)
    t = re.sub(r"\[(.+?)\]\((.+?)\)", r'<font color="#E8252D">\1</font>', t)
    return t

lines = open(src, encoding="utf-8").read().split("\n")
flow, i = [], 0
def cell(txt, hdr=False):
    return Paragraph(inline(txt.strip()), styles["cellh" if hdr else "cell"])

while i < len(lines):
    ln = lines[i]
    if ln.strip().startswith("```"):                       # fenced code
        i += 1; buf = []
        while i < len(lines) and not lines[i].strip().startswith("```"):
            buf.append(lines[i]); i += 1
        flow.append(Preformatted("\n".join(buf), styles["code"])); i += 1; continue
    if re.match(r"^\s*\|.*\|\s*$", ln) and i + 1 < len(lines) and re.match(r"^\s*\|[ :\-|]+\|\s*$", lines[i+1]):
        rows = []                                          # pipe table
        while i < len(lines) and re.match(r"^\s*\|.*\|\s*$", lines[i]):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows.append(cells); i += 1
        header, data = rows[0], [r for r in rows[2:]]
        tbl = [[cell(c, True) for c in header]] + [[cell(c) for c in r] for r in data]
        t = Table(tbl, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PANEL]),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        flow.append(t); flow.append(Spacer(1, 8)); continue
    if re.match(r"^---+\s*$", ln):
        flow.append(Spacer(1, 4)); flow.append(HRFlowable(color=LINE, width="100%")); flow.append(Spacer(1, 6)); i += 1; continue
    if ln.startswith("### "): flow.append(Paragraph(inline(ln[4:]), styles["h3"]))
    elif ln.startswith("## "): flow.append(Paragraph(inline(ln[3:]), styles["h2"]))
    elif ln.startswith("# "): flow.append(Paragraph(inline(ln[2:]), styles["h1"]))
    elif ln.strip().startswith("> "): flow.append(Paragraph(inline(ln.strip()[2:]), styles["quote"]))
    elif re.match(r"^\s*[-*] ", ln): flow.append(Paragraph("• " + inline(re.sub(r"^\s*[-*] ", "", ln)), styles["li"]))
    elif re.match(r"^\s*\d+\. ", ln): flow.append(Paragraph(inline(ln.strip()), styles["li"]))
    elif ln.strip() == "": flow.append(Spacer(1, 3))
    else: flow.append(Paragraph(inline(ln), styles["body"]))
    i += 1

doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=18*mm, bottomMargin=18*mm,
                        title="AFRIBN — Developer Onboarding")
doc.build(flow)
print("wrote", out)
