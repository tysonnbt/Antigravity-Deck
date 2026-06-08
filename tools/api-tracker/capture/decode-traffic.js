#!/usr/bin/env node
// =============================================================================
// Decoder / pretty-printer for captured-traffic.jsonl
// =============================================================================
//
// The Antigravity renderer talks grpc-web with JSON payloads
// (content-type: application/grpc-web+json), NOT the Connect protocol that the
// Deck's own src/api.js uses (application/json + Connect-Protocol-Version: 1).
//
// grpc-web frames each message as: [1-byte flag][4-byte big-endian length][payload].
// A flag with bit 0x80 set marks the trailer frame (grpc-status etc.). This
// script strips that framing and prints decoded request/response JSON per call.
//
// If a payload is binary protobuf (content-type application/grpc-web+proto or
// application/proto), it cannot be JSON-decoded here — the raw bytes are shown
// as base64 and you'd need the .proto schema to decode.
//
//   node tools/api-tracker/capture/decode-traffic.js [--full]
//
// --full prints entire payloads; default truncates to 400 chars.
// =============================================================================

const fs = require('fs');
const path = require('path');

const FULL = process.argv.includes('--full');
const IN_PATH = path.join(__dirname, 'captured-traffic.jsonl');

function decodeGrpcWeb(str) {
  if (typeof str !== 'string') return [];
  const buf = Buffer.from(str, 'binary');
  const frames = [];
  let off = 0;
  while (off + 5 <= buf.length) {
    const flag = buf[off];
    const len = buf.readUInt32BE(off + 1);
    off += 5;
    const payload = buf.slice(off, off + len);
    off += len;
    frames.push({
      flag,
      isTrailer: (flag & 0x80) !== 0,
      text: payload.toString('utf8'),
    });
  }
  return frames;
}

function isGrpcWebJson(ct) {
  return /grpc-web\+json/i.test(ct || '');
}
function isProto(ct) {
  return /proto/i.test(ct || '');
}

function showBody(label, body, ct, base64Encoded) {
  if (body == null) {
    console.log(`  ${label}: (none)`);
    return;
  }
  if (base64Encoded) {
    console.log(`  ${label}: <base64, ${body.length} chars> ${FULL ? body : body.slice(0, 120) + '...'}`);
    return;
  }
  if (isGrpcWebJson(ct)) {
    const frames = decodeGrpcWeb(body);
    frames.forEach((f, i) => {
      if (f.isTrailer) {
        console.log(`  ${label}[${i}] TRAILER: ${JSON.stringify(f.text)}`);
      } else {
        let pretty = f.text;
        try {
          pretty = JSON.stringify(JSON.parse(f.text), null, FULL ? 2 : 0);
        } catch (_) {}
        console.log(`  ${label}[${i}] DATA: ${FULL ? pretty : pretty.slice(0, 400) + (pretty.length > 400 ? ' …' : '')}`);
      }
    });
    return;
  }
  if (isProto(ct)) {
    const b64 = Buffer.from(body, 'binary').toString('base64');
    console.log(`  ${label}: <protobuf, ${body.length} bytes; needs .proto to decode> base64=${b64.slice(0, 80)}...`);
    return;
  }
  // Plain JSON / text.
  console.log(`  ${label}: ${FULL ? body : body.slice(0, 400)}`);
}

function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`No capture file at ${IN_PATH}. Run cdp-capture.js first.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(IN_PATH, 'utf8').trim().split('\n').filter(Boolean);
  console.log(`Decoding ${lines.length} captured call(s) from ${IN_PATH}\n`);
  lines.forEach((l, i) => {
    let r;
    try {
      r = JSON.parse(l);
    } catch {
      return;
    }
    console.log(`──────────── [${i + 1}] ${r.methodPath} ${r.streaming ? '(STREAM open)' : ''} ────────────`);
    console.log(`  service : ${r.servicePrefix}`);
    console.log(`  url     : ${r.url}`);
    console.log(`  ${r.httpMethod} -> ${r.responseStatus || (r.failed ? 'FAILED ' + r.errorText : '?')}  req-ct=${r.requestContentType || '?'}  resp-ct=${r.responseContentType || '?'}`);
    console.log(`  csrf    : ${r.csrfToken ? r.csrfToken : '(none)'}  connect-protocol-version: ${r.connectProtocolVersion || '(none — grpc-web)'}`);
    showBody('request ', r.requestBody, r.requestContentType, false);
    if (r.streaming) {
      console.log('  response: <live stream — body intentionally not fetched>');
    } else {
      showBody('response', r.responseBody, r.responseContentType, r.responseBodyBase64Encoded);
    }
    console.log('');
  });
}

main();
