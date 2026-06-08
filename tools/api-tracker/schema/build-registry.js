#!/usr/bin/env node
/**
 * Builds the complete RPC registry + message/enum schemas from descriptors.json
 * (produced by decode-descriptors.js).
 *
 * Outputs:
 *   - rpc-registry.json   : every service -> method -> {input, output, streaming}
 *   - rpc-registry.md     : human-readable method registry grouped by service
 *   - messages.json       : every message -> fields[{no,name,type,label,...}], every enum
 *   - language_server.proto.txt : reconstructed pseudo-.proto for the language_server file
 *
 * FieldDescriptorProto type enum (proto wire types):
 *   1=double 2=float 3=int64 4=uint64 5=int32 6=fixed64 7=fixed32 8=bool
 *   9=string 10=group 11=message 12=bytes 13=uint32 14=enum 15=sfixed32
 *   16=sfixed64 17=sint32 18=sint64
 * label: 1=optional 2=required 3=repeated
 */
const fs = require("fs");
const path = require("path");

const files = require("./descriptors.json");
const DIR = __dirname;

const TYPE = {
  1: "double", 2: "float", 3: "int64", 4: "uint64", 5: "int32",
  6: "fixed64", 7: "fixed32", 8: "bool", 9: "string", 10: "group",
  11: "message", 12: "bytes", 13: "uint32", 14: "enum", 15: "sfixed32",
  16: "sfixed64", 17: "sint32", 18: "sint64",
};
const LABEL = { 1: "optional", 2: "required", 3: "repeated" };

// protobufjs toObject leaves "type" as the enum string when enums:String was set.
// We used enums:String in decode, so type/label may be strings already. Normalize.
function typeName(t) {
  if (typeof t === "string") {
    // e.g. "TYPE_MESSAGE" -> "message"
    return t.replace(/^TYPE_/, "").toLowerCase();
  }
  return TYPE[t] || String(t);
}
function labelName(l) {
  if (typeof l === "string") return l.replace(/^LABEL_/, "").toLowerCase();
  return LABEL[l] || String(l);
}

// ---- Build full-qualified message/enum registry across all files ----
const allMessages = {}; // fqName -> {file, fields, oneofs, nested, mapEntry}
const allEnums = {}; // fqName -> {file, values:[{name,number}]}

function walkMessages(pkg, prefix, msgs, fileName) {
  for (const m of msgs || []) {
    const fq = (prefix ? prefix + "." : "") + m.name;
    const fields = (m.field || []).map((f) => {
      const out = {
        no: f.number,
        name: f.name,
        jsonName: f.jsonName,
        label: labelName(f.label),
        type: typeName(f.type),
      };
      if (f.typeName) out.typeRef = f.typeName.replace(/^\./, "");
      if (f.oneofIndex !== undefined && f.oneofIndex !== null)
        out.oneofIndex = f.oneofIndex;
      if (f.proto3Optional) out.proto3Optional = true;
      return out;
    });
    const isMapEntry = !!(m.options && m.options.mapEntry);
    allMessages[fq] = {
      file: fileName,
      mapEntry: isMapEntry,
      oneofs: (m.oneofDecl || []).map((o) => o.name),
      fields,
    };
    // nested enums
    for (const e of m.enumType || []) {
      const efq = fq + "." + e.name;
      allEnums[efq] = {
        file: fileName,
        values: (e.value || []).map((v) => ({ name: v.name, number: v.number })),
      };
    }
    // nested messages
    walkMessages(pkg, fq, m.nestedType, fileName);
  }
}

for (const f of files) {
  const pkg = f.package || "";
  walkMessages(pkg, pkg, f.messageType, f.name);
  for (const e of f.enumType || []) {
    const efq = (pkg ? pkg + "." : "") + e.name;
    allEnums[efq] = {
      file: f.name,
      values: (e.value || []).map((v) => ({ name: v.name, number: v.number })),
    };
  }
}

// ---- Build RPC registry ----
const registry = []; // {file, package, service, fqService, methods:[...]}
for (const f of files) {
  const pkg = f.package || "";
  for (const s of f.service || []) {
    const fqService = (pkg ? pkg + "." : "") + s.name;
    const methods = (s.method || []).map((m) => {
      const clientStreaming = !!m.clientStreaming;
      const serverStreaming = !!m.serverStreaming;
      let kind = "unary";
      if (clientStreaming && serverStreaming) kind = "bidi_streaming";
      else if (serverStreaming) kind = "server_streaming";
      else if (clientStreaming) kind = "client_streaming";
      return {
        name: m.name,
        rpcPath: `/${fqService}/${m.name}`,
        input: (m.inputType || "").replace(/^\./, ""),
        output: (m.outputType || "").replace(/^\./, ""),
        kind,
      };
    });
    registry.push({
      file: f.name,
      package: pkg,
      service: s.name,
      fqService,
      methodCount: methods.length,
      methods,
    });
  }
}

// ---- Write JSON outputs ----
fs.writeFileSync(
  path.join(DIR, "rpc-registry.json"),
  JSON.stringify(registry, null, 2)
);
fs.writeFileSync(
  path.join(DIR, "messages.json"),
  JSON.stringify({ messages: allMessages, enums: allEnums }, null, 2)
);

// ---- Write markdown registry ----
let md = "# Antigravity language_server RPC Registry\n\n";
md += `Extracted from webview bundle main.js (Antigravity v2.0.11).\n`;
md += `Total services: ${registry.length}. `;
md += `Total methods: ${registry.reduce((a, s) => a + s.methodCount, 0)}.\n\n`;
md += "Wire format: Connect-RPC over HTTP POST. Method URL = `/<package>.<Service>/<Method>`.\n\n";
registry
  .sort((a, b) => b.methodCount - a.methodCount)
  .forEach((s) => {
    md += `## ${s.fqService}  (${s.methodCount} methods)\n\n`;
    md += "| Method | Kind | Input | Output |\n|---|---|---|---|\n";
    s.methods.forEach((m) => {
      md += `| ${m.name} | ${m.kind} | ${short(m.input)} | ${short(m.output)} |\n`;
    });
    md += "\n";
  });
fs.writeFileSync(path.join(DIR, "rpc-registry.md"), md);

function short(fq) {
  if (!fq) return "";
  // keep last 1-2 segments for readability but show package family
  return fq;
}

// ---- Reconstruct pseudo-.proto for language_server file ----
function reconstructFile(fileName, outName) {
  const f = files.find((x) => x.name === fileName);
  if (!f) return;
  const pkg = f.package || "";
  let out = `// Reconstructed from binary FileDescriptorProto embedded in main.js\n`;
  out += `// File: ${fileName}\n`;
  out += `syntax = "${f.syntax || "proto3"}";\n`;
  out += `package ${pkg};\n\n`;

  // top-level enums
  for (const e of f.enumType || []) out += renderEnum(e, "");
  // top-level messages
  for (const m of f.messageType || []) out += renderMessage(m, "");
  // services
  for (const s of f.service || []) {
    out += `service ${s.name} {\n`;
    for (const m of s.method || []) {
      const cs = m.clientStreaming ? "stream " : "";
      const ss = m.serverStreaming ? "stream " : "";
      out += `  rpc ${m.name}(${cs}${(m.inputType || "").replace(/^\./, "")}) returns (${ss}${(m.outputType || "").replace(/^\./, "")});\n`;
    }
    out += `}\n\n`;
  }
  fs.writeFileSync(path.join(DIR, outName), out);
}

function renderEnum(e, indent) {
  let s = `${indent}enum ${e.name} {\n`;
  for (const v of e.value || []) s += `${indent}  ${v.name} = ${v.number};\n`;
  s += `${indent}}\n`;
  return s;
}

function renderMessage(m, indent) {
  let s = `${indent}message ${m.name} {\n`;
  const ni = indent + "  ";
  // nested enums
  for (const e of m.enumType || []) s += renderEnum(e, ni);
  // nested messages (skip map entries — render inline as map)
  const mapEntries = {};
  for (const nm of m.nestedType || []) {
    if (nm.options && nm.options.mapEntry) {
      mapEntries[nm.name] = nm;
    } else {
      s += renderMessage(nm, ni);
    }
  }
  // oneof grouping
  const oneofs = m.oneofDecl || [];
  const oneofFields = {};
  const plainFields = [];
  for (const f of m.field || []) {
    if (
      f.oneofIndex !== undefined &&
      f.oneofIndex !== null &&
      !f.proto3Optional
    ) {
      (oneofFields[f.oneofIndex] = oneofFields[f.oneofIndex] || []).push(f);
    } else {
      plainFields.push(f);
    }
  }
  const renderField = (f) => {
    let t;
    // detect map: type message + typeName ends with an entry we captured
    if (f.type && typeName(f.type) === "message" && f.typeName) {
      const entryName = f.typeName.replace(/^\./, "").split(".").pop();
      const entry = mapEntries[entryName];
      if (entry) {
        const k = entry.field.find((x) => x.number === 1);
        const v = entry.field.find((x) => x.number === 2);
        const kt = typeName(k.type);
        const vt =
          typeName(v.type) === "message" || typeName(v.type) === "enum"
            ? v.typeName.replace(/^\./, "")
            : typeName(v.type);
        t = `map<${kt}, ${vt}>`;
        return `${ni}  ${t} ${f.name} = ${f.number};\n`;
      }
    }
    const lbl = labelName(f.label);
    const lblStr = lbl === "repeated" ? "repeated " : "";
    if (typeName(f.type) === "message" || typeName(f.type) === "enum") {
      t = f.typeName.replace(/^\./, "");
    } else {
      t = typeName(f.type);
    }
    return `${ni}  ${lblStr}${t} ${f.name} = ${f.number};\n`;
  };
  for (const f of plainFields) s += renderField(f);
  oneofs.forEach((o, idx) => {
    if (!oneofFields[idx]) return;
    s += `${ni}  oneof ${o.name} {\n`;
    for (const f of oneofFields[idx]) {
      let t =
        typeName(f.type) === "message" || typeName(f.type) === "enum"
          ? f.typeName.replace(/^\./, "")
          : typeName(f.type);
      s += `${ni}    ${t} ${f.name} = ${f.number};\n`;
    }
    s += `${ni}  }\n`;
  });
  s += `${indent}}\n`;
  return s;
}

reconstructFile(
  "third_party/jetski/language_server_pb/language_server.proto",
  "language_server.proto.txt"
);
reconstructFile(
  "third_party/jetski/jetbox_state_pb/jetbox_state.proto",
  "jetbox_state.proto.txt"
);
reconstructFile(
  "third_party/gemini_coder/cider/proto/trajectory_steps.proto",
  "trajectory_steps.proto.txt"
);
reconstructFile(
  "third_party/gemini_coder/proto/trajectory.proto",
  "trajectory.proto.txt"
);
reconstructFile(
  "third_party/jetski/jetski_cortex_pb/jetski_cortex.proto",
  "jetski_cortex.proto.txt"
);
reconstructFile(
  "third_party/jetski/cortex_pb/cortex.proto",
  "cortex.proto.txt"
);
reconstructFile(
  "third_party/jetski/codeium_common_pb/codeium_common.proto",
  "codeium_common.proto.txt"
);

console.log("Services:", registry.length);
console.log(
  "Total methods:",
  registry.reduce((a, s) => a + s.methodCount, 0)
);
console.log("Messages indexed:", Object.keys(allMessages).length);
console.log("Enums indexed:", Object.keys(allEnums).length);
console.log("Wrote: rpc-registry.json, rpc-registry.md, messages.json");
console.log("Wrote: language_server.proto.txt, jetbox_state.proto.txt, trajectory_steps.proto.txt, trajectory.proto.txt");
