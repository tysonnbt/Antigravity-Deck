#!/usr/bin/env node
/**
 * Extracts base64-encoded FileDescriptorProto blobs from the Antigravity
 * webview bundle (main.js) and decodes them into readable proto schemas.
 *
 * protobuf-es v2 (@bufbuild/protobuf) compiles .proto files into binary
 * FileDescriptorProto messages, base64-encodes them, and embeds them as
 * string literals passed to fileDesc(). This script recovers them.
 *
 * Usage: node decode-descriptors.js
 * Output: writes ./descriptors.json (raw decoded) and prints a summary.
 */
const fs = require("fs");
const path = require("path");
const descriptor = require("protobufjs/ext/descriptor");

const BUNDLE = path.join(__dirname, "bundles", "main.js");
const OUT_JSON = path.join(__dirname, "descriptors.json");

const FileDescriptorProto = descriptor.FileDescriptorProto;

function b64ToBuf(s) {
  return Buffer.from(s, "base64");
}

// Extract every string literal that is long and looks like base64.
// protobuf-es uses double-quoted strings. Some are concatenated with +.
function extractBase64Literals(src) {
  const results = [];
  // Match "..." string literals of base64 chars, optionally concatenated:  "..."+"..."+"..."
  // We capture a run starting at a quote, where the contents are base64 chars,
  // possibly joined by +"..." continuations (minifiers sometimes split long strings).
  const re = /"((?:[A-Za-z0-9+/]{20,}={0,2}))"((?:\s*\+\s*"(?:[A-Za-z0-9+/]+={0,2})")*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let full = m[1];
    if (m[2]) {
      // pull continuation chunks
      const contRe = /"([A-Za-z0-9+/]+={0,2})"/g;
      let cm;
      while ((cm = contRe.exec(m[2])) !== null) full += cm[1];
    }
    if (full.length >= 120) results.push(full);
  }
  return results;
}

function tryDecode(b64) {
  try {
    const buf = b64ToBuf(b64);
    const msg = FileDescriptorProto.decode(buf);
    const obj = FileDescriptorProto.toObject(msg, {
      enums: String,
      longs: String,
      bytes: String,
      defaults: false,
      arrays: true,
      objects: true,
    });
    // A valid FileDescriptorProto we care about has a name and (messages or services)
    if (obj && obj.name) return obj;
    return null;
  } catch (e) {
    return null;
  }
}

function main() {
  const src = fs.readFileSync(BUNDLE, "utf8");
  const blobs = extractBase64Literals(src);
  const seen = new Set();
  const files = [];
  for (const b of blobs) {
    if (seen.has(b)) continue;
    seen.add(b);
    const decoded = tryDecode(b);
    if (decoded) files.push({ b64len: b.length, file: decoded });
  }
  // Dedup by file name (keep richest)
  const byName = new Map();
  for (const f of files) {
    const name = f.file.name;
    const prev = byName.get(name);
    const score =
      (f.file.messageType?.length || 0) +
      (f.file.service?.length || 0) * 10 +
      (f.file.enumType?.length || 0);
    if (!prev || score > prev.score) byName.set(name, { ...f, score });
  }
  const unique = [...byName.values()].sort((a, b) =>
    (a.file.name || "").localeCompare(b.file.name || "")
  );

  fs.writeFileSync(OUT_JSON, JSON.stringify(unique.map((u) => u.file), null, 2));

  console.log(`Total base64 literals >=120 chars: ${blobs.length}`);
  console.log(`Successfully decoded as FileDescriptorProto: ${files.length}`);
  console.log(`Unique proto files: ${unique.length}`);
  console.log("");
  console.log("=== PROTO FILES (name | #msgs | #enums | #services | services) ===");
  for (const u of unique) {
    const f = u.file;
    const svcNames = (f.service || []).map((s) => s.name).join(",");
    console.log(
      `${f.name} | msgs=${(f.messageType || []).length} | enums=${
        (f.enumType || []).length
      } | svcs=${(f.service || []).length}${svcNames ? " [" + svcNames + "]" : ""}`
    );
  }
}

main();
