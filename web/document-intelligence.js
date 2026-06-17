"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DOCUMENT_DIR = path.join(os.homedir(), "Dorothy-inbox", "documents");
const OCR_SCRIPT = path.join(__dirname, "vision-ocr.swift");
const MAX_FILE_BYTES = 18 * 1024 * 1024;

function run(command, args, timeout = 60000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, stdout, stderr: stderr || "Timed out" });
    }, timeout);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function safeFileName(value) {
  const base = path.basename(String(value || "document"))
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "document").slice(0, 180);
}

async function saveUploadedDocument(input) {
  const name = safeFileName(input.name);
  const encoded = String(input.data || "").replace(/^data:[^,]+,/, "");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("Empty document");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("Document exceeds 18 MB");
  fs.mkdirSync(DOCUMENT_DIR, { recursive: true });
  const filePath = uniquePath(path.join(DOCUMENT_DIR, name));
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });
  const text = await extractText(filePath, String(input.type || ""));
  return {
    name: path.basename(filePath),
    path: filePath,
    type: String(input.type || ""),
    size: buffer.length,
    text: text.slice(0, 30000),
    insights: extractInsights(text),
  };
}

function uniquePath(candidate) {
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(candidate);
  const stem = candidate.slice(0, -ext.length);
  for (let index = 2; index < 1000; index += 1) {
    const next = `${stem}-${index}${ext}`;
    if (!fs.existsSync(next)) return next;
  }
  throw new Error("Could not allocate document path");
}

async function extractText(filePath, mimeType = "") {
  const ext = path.extname(filePath).toLowerCase();
  if ([".txt", ".md", ".csv", ".tsv", ".json", ".html", ".xml"].includes(ext)) {
    return fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf" || mimeType === "application/pdf") {
    const result = await run("/opt/homebrew/bin/pdftotext", ["-layout", filePath, "-"]);
    return result.ok ? result.stdout : "";
  }
  if ([".doc", ".docx", ".rtf", ".odt"].includes(ext)) {
    const result = await run("/usr/bin/textutil", ["-convert", "txt", "-stdout", filePath]);
    return result.ok ? result.stdout : "";
  }
  if (/^image\//.test(mimeType) || [".png", ".jpg", ".jpeg", ".heic", ".tiff", ".webp"].includes(ext)) {
    const result = await run("/usr/bin/xcrun", ["swift", OCR_SCRIPT, filePath], 90000);
    return result.ok ? result.stdout : "";
  }
  const metadata = await run("/usr/bin/mdls", ["-raw", "-name", "kMDItemTextContent", filePath]);
  return metadata.ok && metadata.stdout !== "(null)" ? metadata.stdout : "";
}

function extractInsights(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const amounts = [...clean.matchAll(/(?:€\s*)?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s*€?/g)]
    .map(match => match[0].trim())
    .filter(value => /€|,\d{2}/.test(value))
    .slice(0, 8);
  const dates = [...clean.matchAll(/\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)]
    .map(match => match[0])
    .slice(0, 8);
  const emails = [...new Set(clean.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [])].slice(0, 8);
  return {
    excerpt: clean.slice(0, 700),
    amounts,
    dates,
    emails,
    characters: clean.length,
  };
}

module.exports = {
  extractInsights,
  saveUploadedDocument,
};
