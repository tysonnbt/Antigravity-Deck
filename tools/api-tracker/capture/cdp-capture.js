#!/usr/bin/env node
// =============================================================================
// CDP Live-Capture for Antigravity Language Server (LS) Connect-RPC traffic
// =============================================================================
//
// Antigravity (Google's Electron AI IDE) launches with --remote-debugging-port=0.
// Chromium picks a random port and writes it to <user-data-dir>/DevToolsActivePort
// (line 1 = port, line 2 = browser ws path). The agent webview renderer talks
// Connect-RPC back to the LS HTTPS origin (https://127.0.0.1:<lsPort>/).
//
// This tool attaches to CDP over PLAIN ws (no TLS on the debug port), uses
// FLAT-SESSION auto-attach so it follows the top page AND every out-of-process
// subframe / dedicated worker (Electron renders the agent UI across several
// targets — RPC calls can originate from any of them), enables Network per
// session, and records every Connect-RPC request + response (including binary
// protobuf as base64) to captured-traffic.jsonl.
//
// READ-ONLY. It never relaunches, kills, or sends app commands. Network capture
// is passive; we only call CDP getters (getRequestPostData / getResponseBody).
//
// No new deps: built on the already-installed `ws` package (resolved from the
// repo root node_modules). Run with:
//   node tools/api-tracker/capture/cdp-capture.js [--seconds N] [--port P] [--ls-port P]
//
// =============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// Resolve `ws` from the repo root (this file lives at <root>/tools/api-tracker/capture).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
let WebSocket;
try {
  WebSocket = require(require.resolve('ws', { paths: [REPO_ROOT, __dirname] }));
} catch (e) {
  console.error('[fatal] could not load `ws`. Expected it at', path.join(REPO_ROOT, 'node_modules', 'ws'));
  console.error('        ', e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config / CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] != null ? argv[i + 1] : def;
}
const CAPTURE_SECONDS = parseInt(argVal('--seconds', '30'), 10);
const FORCED_CDP_PORT = argVal('--port', null);          // override CDP debug port
const LS_PORT = argVal('--ls-port', '50934');            // LS origin port (for RPC URL matching)
const OUT_PATH = path.join(__dirname, 'captured-traffic.jsonl');
const SUMMARY_PATH = path.join(__dirname, 'capture-summary.json');

// Candidate Antigravity user-data-dirs on Windows (and a couple of fallbacks).
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const USER_DATA_DIR_CANDIDATES = [
  path.join(APPDATA, 'Antigravity'),
  path.join(os.homedir(), '.antigravity'),
  path.join(LOCALAPPDATA, 'Antigravity'),
  path.join(LOCALAPPDATA, 'Programs', 'Antigravity'),
];

// A request is "Connect-RPC-ish" if its path looks like /<dotted.service>/<Method>
// on the LS origin. We do not hard-code the LanguageServerService prefix so we
// also catch any other service prefixes the bundle uses.
const RPC_PATH_RE = /\/[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+\/[A-Za-z][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function httpGetJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`GET ${url} -> bad JSON: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`GET ${url} timed out after ${timeoutMs}ms`));
    });
  });
}

// Read DevToolsActivePort from the first user-data-dir that has it.
function discoverCdpPort() {
  if (FORCED_CDP_PORT) {
    return { port: parseInt(FORCED_CDP_PORT, 10), source: 'cli --port', userDataDir: null };
  }
  for (const dir of USER_DATA_DIR_CANDIDATES) {
    const f = path.join(dir, 'DevToolsActivePort');
    try {
      if (fs.existsSync(f)) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        const port = parseInt(lines[0], 10);
        if (Number.isInteger(port) && port > 0) {
          return { port, source: f, userDataDir: dir, browserWsPath: lines[1] || null };
        }
      }
    } catch (_) {
      // keep scanning
    }
  }
  return null;
}

// Pick a header value case-insensitively.
function header(headers, name) {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) return headers[k];
  }
  return undefined;
}

function lastSegment(urlPath) {
  try {
    const u = new URL(urlPath);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || u.pathname;
  } catch {
    const noQuery = urlPath.split('?')[0];
    const parts = noQuery.split('/').filter(Boolean);
    return parts[parts.length - 1] || noQuery;
  }
}

function servicePrefix(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// CDP client over a single ws socket. Supports flat sessions: every command and
// event carries an optional sessionId, multiplexed over one connection.
// ---------------------------------------------------------------------------
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();      // id -> {resolve, reject}
    this.eventHandlers = [];       // fns (method, params, sessionId)
  }

  connect() {
    return new Promise((resolve, reject) => {
      // perMessageDeflate off: CDP payloads (esp. base64 bodies) are large; the
      // permessage-deflate context can blow memory on some `ws` versions.
      this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => {
        if (this.pending.size === 0) reject(err);
        else console.error('[cdp ws error]', err.message);
      });
      this.ws.on('close', () => {
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('CDP socket closed'));
        }
        this.pending.clear();
      });
      this.ws.on('message', (raw) => this._onMessage(raw));
    });
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const h of this.eventHandlers) {
        try {
          h(msg.method, msg.params || {}, msg.sessionId);
        } catch (e) {
          console.error('[event handler error]', e.message);
        }
      }
    }
  }

  onEvent(fn) {
    this.eventHandlers.push(fn);
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    try {
      this.ws && this.ws.close();
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Capture orchestration
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[${nowIso()}] CDP LS capture starting (window=${CAPTURE_SECONDS}s, ls-port=${LS_PORT})`);

  const disco = discoverCdpPort();
  if (!disco) {
    console.error('[fatal] Could not find DevToolsActivePort in any candidate user-data-dir:');
    USER_DATA_DIR_CANDIDATES.forEach((d) => console.error('         -', d));
    console.error('        Is Antigravity running with --remote-debugging-port? Pass --port <P> to override.');
    process.exit(1);
  }
  console.log(`[disco] CDP port ${disco.port} (from ${disco.source})`);
  if (disco.userDataDir) console.log(`[disco] user-data-dir: ${disco.userDataDir}`);

  // Verify the debug endpoint and grab the browser-level ws URL.
  const cdpBase = `http://127.0.0.1:${disco.port}`;
  let version;
  try {
    version = await httpGetJson(`${cdpBase}/json/version`);
  } catch (e) {
    console.error(`[fatal] ${cdpBase}/json/version did not respond: ${e.message}`);
    process.exit(1);
  }
  console.log(`[disco] Browser: ${version.Browser}  (${version['User-Agent'] ? 'Electron UA present' : 'no UA'})`);
  const browserWsUrl = version.webSocketDebuggerUrl;
  if (!browserWsUrl) {
    console.error('[fatal] /json/version has no webSocketDebuggerUrl');
    process.exit(1);
  }

  // Log the current target list for the report / sanity.
  try {
    const targets = await httpGetJson(`${cdpBase}/json/list`);
    console.log(`[disco] ${targets.length} target(s):`);
    targets.forEach((t) =>
      console.log(`         [${t.type}] ${JSON.stringify(t.title)} -> ${t.url}`)
    );
  } catch (e) {
    console.log(`[disco] /json/list failed (non-fatal): ${e.message}`);
  }

  // -------------------------------------------------------------------------
  // Connect to the BROWSER endpoint and use flat auto-attach. This is the
  // Electron-robust approach: instead of attaching to a single page target
  // (and missing OOPIF subframes / workers that issue RPC), we let CDP attach
  // us to every relevant target and multiplex over one socket via sessionId.
  // -------------------------------------------------------------------------
  const client = new CdpClient(browserWsUrl);
  await client.connect();
  console.log(`[cdp] connected to browser endpoint`);

  // Per-session state. requestId is only unique *within* a session, so key by
  // `${sessionId}::${requestId}`.
  const inflight = new Map();   // key -> partial record
  const sessions = new Map();   // sessionId -> {url, type}
  const seenMethodCount = new Map(); // methodPath -> times written (for de-dup)
  const preexistingStreams = new Map(); // sk -> {sessionId, requestId, dataLen, frames}
  const MAX_SAMPLES_PER_METHOD = 2;

  let writtenLines = 0;
  const outStream = fs.createWriteStream(OUT_PATH, { flags: 'w' });

  function keyFor(sessionId, requestId) {
    return `${sessionId || 'root'}::${requestId}`;
  }

  function isRpcUrl(url) {
    if (!url) return false;
    // Must be on the LS origin and look like a connect-rpc path.
    const onLsOrigin = url.includes(`127.0.0.1:${LS_PORT}`) || url.includes(`localhost:${LS_PORT}`);
    return onLsOrigin && RPC_PATH_RE.test(url.split('?')[0]);
  }

  // Enable Network + auto-attach for a freshly attached session.
  async function initSession(sessionId, targetInfo) {
    sessions.set(sessionId, { url: targetInfo && targetInfo.url, type: targetInfo && targetInfo.type });
    try {
      // Cascade auto-attach into this target's own children (OOPIFs/workers).
      await client.send(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, autoAttachRelated: true },
        sessionId
      ).catch(() => {});
      await client.send('Network.enable', { maxTotalBufferSize: 100 * 1024 * 1024, maxResourceBufferSize: 50 * 1024 * 1024 }, sessionId);
      console.log(`[attach] session=${sessionId.slice(0, 8)} type=${targetInfo && targetInfo.type} url=${(targetInfo && targetInfo.url) || ''}`);
    } catch (e) {
      console.log(`[attach] session=${sessionId.slice(0, 8)} Network.enable failed: ${e.message}`);
    }
  }

  client.onEvent(async (method, params, sessionId) => {
    // ----- new target attached (flat mode delivers a sessionId) -----
    if (method === 'Target.attachedToTarget') {
      const sid = params.sessionId;
      await initSession(sid, params.targetInfo);
      return;
    }
    if (method === 'Target.detachedFromTarget') {
      sessions.delete(params.sessionId);
      return;
    }

    // ----- request leaving the renderer -----
    if (method === 'Network.requestWillBeSent') {
      const req = params.request || {};
      if (!isRpcUrl(req.url)) return;
      const key = keyFor(sessionId, params.requestId);
      inflight.set(key, {
        capturedAt: nowIso(),
        sessionId: sessionId || null,
        sessionUrl: sessions.get(sessionId) ? sessions.get(sessionId).url : null,
        requestId: params.requestId,
        url: req.url,
        methodPath: lastSegment(req.url),
        servicePrefix: servicePrefix(req.url),
        httpMethod: req.method,
        requestHeaders: req.headers || {},
        connectProtocolVersion: header(req.headers, 'connect-protocol-version'),
        requestContentType: header(req.headers, 'content-type'),
        csrfToken: header(req.headers, 'x-codeium-csrf-token'),
        hasPostData: !!req.hasPostData,
        // body fields filled in later
        requestBody: null,
        requestBodyBase64Encoded: null,
      });
      return;
    }

    // ----- extra request headers (sometimes arrive separately) -----
    if (method === 'Network.requestWillBeSentExtraInfo') {
      const key = keyFor(sessionId, params.requestId);
      const rec = inflight.get(key);
      if (rec && params.headers) {
        rec.requestHeaders = { ...params.headers, ...rec.requestHeaders };
        rec.connectProtocolVersion = rec.connectProtocolVersion || header(params.headers, 'connect-protocol-version');
        rec.requestContentType = rec.requestContentType || header(params.headers, 'content-type');
        rec.csrfToken = rec.csrfToken || header(params.headers, 'x-codeium-csrf-token');
      }
      return;
    }

    // ----- response headers/status -----
    if (method === 'Network.responseReceived') {
      const key = keyFor(sessionId, params.requestId);
      const rec = inflight.get(key);
      if (!rec) return;
      const resp = params.response || {};
      rec.responseStatus = resp.status;
      rec.responseStatusText = resp.statusText;
      rec.responseHeaders = resp.headers || {};
      rec.responseContentType = header(resp.headers, 'content-type') || resp.mimeType;
      // Connect streaming RPCs hold the connection open: loadingFinished may
      // never fire while the stream is live. Flag them so we can emit a record
      // for the *opening* of the stream (with full request metadata) once data
      // starts flowing, rather than waiting forever.
      rec.isStream =
        /stream/i.test(rec.methodPath) ||
        /application\/connect\+/i.test(rec.responseContentType || '') ||
        header(resp.headers, 'transfer-encoding') === 'chunked';
      return;
    }

    // ----- streaming data frames (pre-existing or live streams) -----
    // For streams that started BEFORE we attached, we have no request record;
    // record a lightweight "stream-activity" line so the stream is still
    // observable in the output. For streams opened during the window we already
    // have the request record (rec) and emit it on first data.
    if (method === 'Network.dataReceived') {
      const key = keyFor(sessionId, params.requestId);
      const rec = inflight.get(key);
      if (rec && rec.isStream && !rec.streamEmitted) {
        rec.streamEmitted = true;
        rec.streaming = true;
        rec.note = 'Connect streaming RPC — request captured at stream open; response body is the live stream (not fetched).';
        // Capture the request body now; do NOT call getResponseBody (stream open).
        emitStreamOpen(rec).catch(() => {});
      } else if (!rec) {
        // Pre-existing stream we never saw open. Count its activity once.
        const sk = `preexisting::${key}`;
        if (!preexistingStreams.has(sk)) {
          preexistingStreams.set(sk, { sessionId, requestId: params.requestId, dataLen: 0, frames: 0 });
        }
        const ps = preexistingStreams.get(sk);
        ps.dataLen += params.dataLength || 0;
        ps.frames += 1;
      }
      return;
    }

    // ----- request finished: now pull bodies and write the record -----
    if (method === 'Network.loadingFinished') {
      const key = keyFor(sessionId, params.requestId);
      const rec = inflight.get(key);
      if (!rec) return;
      inflight.delete(key);
      rec.encodedDataLength = params.encodedDataLength;
      await fetchBodiesAndWrite(rec);
      return;
    }

    // ----- request failed -----
    if (method === 'Network.loadingFailed') {
      const key = keyFor(sessionId, params.requestId);
      const rec = inflight.get(key);
      if (!rec) return;
      inflight.delete(key);
      rec.failed = true;
      rec.errorText = params.errorText;
      await fetchBodiesAndWrite(rec); // request body may still be useful
      return;
    }
  });

  // For a streaming RPC captured at open-time: grab the request post data only
  // (the response is the live, unbounded stream — we must not block on it).
  async function emitStreamOpen(rec) {
    if (rec.hasPostData) {
      try {
        const r = await client.send(
          'Network.getRequestPostData',
          { requestId: rec.requestId },
          rec.sessionId || undefined
        );
        rec.requestBody = r.postData;
        rec.requestBodyIsProto = /proto/i.test(rec.requestContentType || '');
        if (rec.requestBodyIsProto && typeof rec.requestBody === 'string') {
          rec.requestBodyBase64 = Buffer.from(rec.requestBody, 'binary').toString('base64');
        }
      } catch (e) {
        rec.requestBodyError = e.message;
      }
    }
    rec.responseBody = null;
    rec.responseBodyNote = 'live stream — body not fetched';

    const n = seenMethodCount.get(rec.methodPath) || 0;
    seenMethodCount.set(rec.methodPath, n + 1);
    rec.sampleIndex = n + 1;
    outStream.write(JSON.stringify(rec) + '\n');
    writtenLines++;
    console.log(
      `[capture (stream-open)] ${rec.httpMethod} ${rec.methodPath}  ct=${rec.requestContentType || '?'} -> ${rec.responseStatus || '?'} (streaming)`
    );
  }

  async function fetchBodiesAndWrite(rec) {
    // Request post data (binary protobuf comes back base64-encoded).
    if (rec.hasPostData) {
      try {
        const r = await client.send(
          'Network.getRequestPostData',
          { requestId: rec.requestId },
          rec.sessionId || undefined
        );
        rec.requestBody = r.postData;
        // CDP returns string; if content-type is proto it's still a JS string of
        // raw bytes. Flag proto so the reader treats it as opaque/base64-able.
        rec.requestBodyIsProto = /proto/i.test(rec.requestContentType || '');
        if (rec.requestBodyIsProto && typeof rec.requestBody === 'string') {
          rec.requestBodyBase64 = Buffer.from(rec.requestBody, 'binary').toString('base64');
        }
      } catch (e) {
        rec.requestBodyError = e.message;
      }
    }

    // Response body (base64Encoded flag preserved as-is).
    if (!rec.failed) {
      try {
        const r = await client.send(
          'Network.getResponseBody',
          { requestId: rec.requestId },
          rec.sessionId || undefined
        );
        rec.responseBody = r.body;
        rec.responseBodyBase64Encoded = r.base64Encoded;
      } catch (e) {
        rec.responseBodyError = e.message;
      }
    }

    // De-dup: keep up to MAX_SAMPLES_PER_METHOD full samples per method path,
    // but always emit a lightweight count beyond that so totals stay accurate.
    const n = seenMethodCount.get(rec.methodPath) || 0;
    seenMethodCount.set(rec.methodPath, n + 1);
    if (n >= MAX_SAMPLES_PER_METHOD) {
      // Strip large bodies on repeats to keep the file lean.
      delete rec.requestBody;
      delete rec.requestBodyBase64;
      delete rec.responseBody;
      rec.deduped = true;
      rec.sampleIndex = n + 1;
    } else {
      rec.sampleIndex = n + 1;
    }

    outStream.write(JSON.stringify(rec) + '\n');
    writtenLines++;
    const tag = rec.deduped ? '(meta)' : '(full)';
    console.log(
      `[capture ${tag}] ${rec.httpMethod} ${rec.methodPath}  ct=${rec.requestContentType || '?'} -> ${rec.responseStatus || (rec.failed ? 'FAILED:' + rec.errorText : '?')}`
    );
  }

  // -------------------------------------------------------------------------
  // Kick off flat auto-attach at the browser level. This both attaches us to
  // existing targets (delivering Target.attachedToTarget per target, each with
  // a sessionId) and to any created during the window.
  // -------------------------------------------------------------------------
  await client.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
    autoAttachRelated: true,
  });
  console.log(`[cdp] flat auto-attach enabled; capturing for ${CAPTURE_SECONDS}s ...`);

  // -------------------------------------------------------------------------
  // Run the capture window.
  // -------------------------------------------------------------------------
  await new Promise((resolve) => setTimeout(resolve, CAPTURE_SECONDS * 1000));

  // Drain a brief grace period for in-flight loadingFinished/body fetches.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // -------------------------------------------------------------------------
  // Summarize.
  // -------------------------------------------------------------------------
  const distinctMethods = [...seenMethodCount.entries()]
    .map(([m, c]) => ({ method: m, count: c }))
    .sort((a, b) => b.count - a.count);

  const preexistingStreamStats = [...preexistingStreams.values()];
  const summary = {
    capturedAt: nowIso(),
    cdpPort: disco.port,
    userDataDir: disco.userDataDir,
    lsPort: LS_PORT,
    captureSeconds: CAPTURE_SECONDS,
    attachedSessions: [...sessions.entries()].map(([sid, s]) => ({ sessionId: sid, type: s.type, url: s.url })),
    totalLinesWritten: writtenLines,
    distinctMethods,
    preexistingStreamCount: preexistingStreamStats.length,
    preexistingStreamFramesTotal: preexistingStreamStats.reduce((a, s) => a + s.frames, 0),
    preexistingStreamBytesTotal: preexistingStreamStats.reduce((a, s) => a + s.dataLen, 0),
    outputFile: OUT_PATH,
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  outStream.end();
  client.close();

  console.log('');
  console.log('================ CAPTURE SUMMARY ================');
  console.log(`Lines written : ${writtenLines}  ->  ${OUT_PATH}`);
  console.log(`Summary JSON  : ${SUMMARY_PATH}`);
  console.log(`Distinct RPC methods (${distinctMethods.length}):`);
  distinctMethods.forEach((m) => console.log(`   ${String(m.count).padStart(4)}x  ${m.method}`));
  if (preexistingStreamStats.length) {
    console.log(
      `Pre-existing streams (opened before attach): ${preexistingStreamStats.length}, ` +
        `${summary.preexistingStreamFramesTotal} data frame(s), ${summary.preexistingStreamBytesTotal} bytes`
    );
    console.log('   (request metadata unavailable for these — see gotchas)');
  }
  console.log('================================================');

  // Give the write stream a moment to flush before exit.
  setTimeout(() => process.exit(0), 300);
}

main().catch((e) => {
  console.error('[fatal]', e && e.stack ? e.stack : e);
  process.exit(1);
});
