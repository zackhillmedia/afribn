const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { badRequest } = require("./http");

const uploadRoot = process.env.AFRIBN_UPLOAD_DIR || path.join(process.cwd(), "uploads");

async function parseMultipartUpload(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw badRequest("multipart/form-data boundary is required");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  return parseMultipartBuffer(buffer, boundary);
}

function parseMultipartBuffer(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (buffer.slice(start, start + 2).toString() === "--") break;
    if (buffer.slice(start, start + 2).toString() === "\r\n") start += 2;
    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    const part = buffer.slice(start, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const rawHeaders = part.slice(0, headerEnd).toString("utf8");
      const body = part.slice(headerEnd + 4);
      parts.push(parsePart(rawHeaders, body));
    }
    start = next;
  }
  return parts;
}

function parsePart(rawHeaders, body) {
  const headers = {};
  for (const line of rawHeaders.split("\r\n")) {
    const index = line.indexOf(":");
    if (index !== -1) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  const disposition = headers["content-disposition"] || "";
  const name = readDisposition(disposition, "name");
  const filename = readDisposition(disposition, "filename");
  return {
    name,
    filename,
    contentType: headers["content-type"] || "application/octet-stream",
    data: body
  };
}

function readDisposition(disposition, key) {
  const match = disposition.match(new RegExp(`${key}="([^"]*)"`));
  return match ? match[1] : null;
}

function saveUploadedFile(store, part, metadata = {}) {
  if (!part?.filename) throw badRequest("file field is required");
  fs.mkdirSync(uploadRoot, { recursive: true });
  const safeName = part.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const id = crypto.randomUUID();
  const filePath = path.join(uploadRoot, `${id}-${safeName}`);
  fs.writeFileSync(filePath, part.data);
  const sha256 = crypto.createHash("sha256").update(part.data).digest("hex");
  return store.insert("uploadedFiles", {
    originalName: part.filename,
    storedName: path.basename(filePath),
    path: filePath,
    size: part.data.length,
    mimeType: part.contentType,
    sha256,
    ...metadata
  });
}

module.exports = { parseMultipartUpload, saveUploadedFile, parseMultipartBuffer };
