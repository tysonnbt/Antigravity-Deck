# API Tracker — Integration Plan

> **Status:** Plan only. No source files are modified by this document.
> **Author role:** Integration Architect.
> **Goal:** Turn the four sibling API-tracker tools (CDP capture, static schema extraction, Deck inventory, test/diff harness) into a maintainable, on-demand Deck subsystem that keeps the LS proxy whitelist, the protobuf field maps, and the living API docs in sync as Antigravity's local Connect-RPC API evolves.

---

## 0. What the code actually looks like today (evidence)

The plan below is grounded in a read-through of the live integration points. Key facts that constrain the design:

- **Transport is hand-rolled, not generated.** `src/api.js:37` (`callApi`) builds the URL as `/exa.language_server_pb.LanguageServerService/${method}` (`src/api.js:22`, `makeUrl`) and POSTs JSON with `Connect-Protocol-Version: 1` + `X-Codeium-Csrf-Token`. Binary calls (`callApiBinary`, `src/api.js:106`) hand-encode a 3-field protobuf request. There is **no Connect/grpc client library** — so "adopting the schema" means feeding *data* (method lists, field maps), not swapping the transport.
- **The whitelist is a hardcoded `Set` literal.** `src/routes/cascade.js:11-30` (`ALLOWED_LS_METHODS`) gates the generic proxy `POST /api/ls/:method` at `src/routes/cascade.js:245-261`. 18 methods, all read-ish + a few explicitly-needed mutating ones (`UpdateSettings`, `InstallCascadePlugin`, `StartCascadeInvocation`, `SendCascadeMessage`, `DeleteCascadeTrajectory`).
- **`src/protobuf.js` is a reverse-engineered field-number atlas.** `STEP_TYPE_MAP`, `STEP_STATUS_MAP`, `CONTENT_FIELD_MAP`, and `NESTED_FIELD_MAPS` (`src/protobuf.js:31-110`) were discovered by hand-diffing JSON vs binary responses (see comment at `:91`). The decoder (`decodeStepMessage`, `:150`) reads field numbers and looks names up in these maps; unknown fields fall through to numeric keys via `decodeGenericMessage` (`:227`). This is exactly the part the static schema can replace with ground truth.
- **Routes are wired by a flat require list.** `src/routes.js:5-19` (`setupRoutes`) calls each `require('./routes/<domain>')(app)`. Adding a subsystem route = add one `require(...)` line. Entry point is **`server.js` at repo root** (not `src/server.js`).
- **`console.*` IS the production logger here.** `src/logger.js` monkey-patches `console.log/warn/error` at process start (required first in `server.js:2`) and broadcasts every line as an `app_log` WS event to the Live Logs panel. So the global "no console.log" rule is *inverted* for this repo: use `console.log`/`logger.info(module,…)` — that is the structured logging path. New code should prefer the explicit `logger.info('api-tracker', …)` form (`src/logger.js:171`).
- **Redaction already exists.** `server.js:86-95` (`redactSensitive`) strips 16+ hex char keys, JWTs, and emails from HTTP logs. The CSRF token is a UUID (`--csrf_token` in `src/detector.js:105`), which that regex does **not** catch — the tracker must add UUID + `x-codeium-csrf-token` header redaction itself.
- **Config follows a `*.settings.json` repo-root pattern.** `src/config.js:25-67` (settings.json), plus bridge/agent-api/orchestrator settings each with `DEFAULT_*` + `load*/save*`. A tracker settings file should follow the same shape.
- **Frontend panels use a boolean-flag pattern.** `frontend/app/page.tsx` holds one `showX` state per panel (`:150-163`), persists each to localStorage (`:178-184`), resets them all in `resetPanels()` (`:216-226`), and renders `{detected && showX && <XView/>}` (`:641-698`). The sidebar fires `onShowX` callbacks (`:463-471`). Adding a panel = one state + one handler + one render block + one sidebar entry + one lib call.

### The decisive finding about the captured bundle

`tools/api-tracker/schema/bundles/main.js` (7.4 MB) embeds the **full proto schema as ~135 base64-encoded `FileDescriptorProto` blobs** (protobuf-ES / `@bufbuild/protobuf` style). Decoding them (verified during analysis) yields real message names **with their field numbers and types**, including the new API surface:

```
CascadeState, TrajectoryUpdate, AgentStateUpdate, AgentMessage, TurnCostSummary,
JetboxAppState, AgentOnboardingState, CortexStepStatus, CortexTrajectoryMetadata,
CascadeTrajectorySummaries, GetAvailableCascadePluginsRequest, UserStatus, …
```

28 of the 135 blobs are LS-domain (the rest are `google.protobuf.*` infra and Google-internal annotation protos like `datapol_classification.proto`). **RPC method names** (`GetAllCascadeTrajectories`, etc.) do **not** appear as plain JS string literals (0 matches) — they live inside the binary `ServiceDescriptorProto.method[].name` fields of those blobs, and are recovered by decoding, not grepping.

**Consequences for the architecture:**
1. The **static bundle is the authoritative source for proto field numbers/types** (`src/protobuf.js` ground truth) and for the *full* method registry (every RPC the service declares).
2. The **CDP capture is the authoritative source for "what is actually called in practice" + live JSON payload shapes** (and confirms request/response field naming as the UI uses it).
3. The diff harness compares **(bundle ∪ capture) registry** against **Deck inventory** (`deck-known-methods.json` + the whitelist) to surface drift.

The decoder for these blobs is trivial with the already-present `protobufjs@^8` dependency (`package.json`) — `protobufjs` ships `google/protobuf/descriptor.proto` as `protobuf.common`/`descriptor`, so a `FileDescriptorSet`/`FileDescriptorProto` can be decoded directly with no new dependency.

---

## 1. Architecture

### 1.1 Shape: spawned tools + thin in-process orchestrator

```
                       ┌─────────────────────────── Deck backend (server.js) ────────────────────────────┐
                       │                                                                                  │
  Antigravity LS  ◀────┼── src/api.js (callApi/…)  ◀──  src/routes/cascade.js  (POST /api/ls/:method)     │
   (Connect-RPC)       │                                         ▲ whitelist (generated, see §2)          │
                       │                                         │                                        │
                       │   src/routes/api-tracker.js ── calls ── src/api-tracker.js  (orchestrator)       │
                       │       POST /api/api-tracker/scan                 │ spawn()                        │
                       │       GET  /api/api-tracker/report               ▼                                │
                       └──────────────────────────────────────────┬──────────────────────────────────────┘
                                                                   │ child process (read-only by default)
                                ┌──────────────────────────────────┼───────────────────────────────────┐
                                │                tools/api-tracker/ │ (standalone, runnable via node)    │
                                │                                   ▼                                    │
                                │  capture/cdp-capture.js  ─▶ capture/captured-traffic.jsonl            │
                                │  schema/extract-schema.js ─▶ schema/method-registry.json              │
                                │                              schema/proto-field-maps.json             │
                                │  inventory/build-inventory.js ─▶ inventory/deck-known-methods.json    │
                                │  test/test-runner.js     ─▶ test/api-diff-report.md                   │
                                │  lib/redact.js (shared)                                               │
                                └───────────────────────────────────────────────────────────────────────┘
```

**Decision: run the heavy tools as spawned child processes, orchestrated by a thin in-process module.** Rationale:

- **CDP capture must not live in the request thread.** It attaches to the IDE's DevTools endpoint (Chrome DevTools Protocol over a websocket), runs for a bounded window, and writes JSONL. Doing that inside Express would block the event loop / hold a socket open across requests. A spawned `node tools/api-tracker/capture/cdp-capture.js --duration 20000` is cancellable, sandboxed, and crash-isolated. This mirrors the existing `execGitSafe` spawn pattern (`src/routes/route-helpers.js:19`) and headless-LS child management (`src/headless-ls.js`).
- **Schema extraction is CPU-bound** (decode 135 base64 blobs, walk descriptors). Spawning keeps a 7.4 MB parse off the API thread. It is also pure/offline (no LS needed) so it can run anytime.
- **The orchestrator (`src/api-tracker.js`) stays in-process** because it only: (a) `spawn`s the tools in sequence, (b) streams their stdout to `logger.info('api-tracker', …)` so progress shows in Live Logs, (c) reads the resulting report files, (d) computes a small status object. It holds **one run at a time** (a module-level `state` guard) to avoid concurrent CDP attaches.

### 1.2 New modules

| File | Responsibility | Notes |
|------|----------------|-------|
| `src/api-tracker.js` | Orchestrates a scan: spawn schema-extract → (optional) capture → inventory → diff; track `{ status, startedAt, finishedAt, lastReportPath, error }`; expose `runScan(opts)`, `getStatus()`, `getReport()`, `getRegistry()`. Single-flight guard. | ~150 lines. Pure orchestration, no business logic. |
| `src/routes/api-tracker.js` | Express routes (see §1.3). Thin: validate input, call `src/api-tracker.js`, return JSON. Mutating routes gated behind a settings flag + auth. | ~80 lines, same shape as `src/routes/system.js`. |
| `tools/api-tracker/schema/extract-schema.js` | Decode the base64 `FileDescriptorProto` blobs from `bundles/main.js`; emit `method-registry.json` (service → methods, with input/output type) and `proto-field-maps.json` (message → `{fieldNumber: {name, type, repeated}}`). Standalone CLI. | Uses `protobufjs` descriptor decoding. Phase 1. |
| `tools/api-tracker/inventory/build-inventory.js` | Statically scan `src/**` for: (a) every method string passed to `callApi*`/`callApiBinary`/path templates, (b) the current `ALLOWED_LS_METHODS` set, (c) field names referenced in `src/protobuf.js`. Emit `deck-known-methods.json`. | Regex/AST over `src/`. Phase 1. |
| `tools/api-tracker/test/test-runner.js` | Load registry (bundle ∪ capture) + inventory; compute diffs (new methods, removed methods, methods called-but-not-whitelisted, whitelisted-but-gone, field-number changes vs `src/protobuf.js`); classify SAFE vs UNSAFE; write `api-diff-report.md` + machine-readable `api-diff.json`. | The brain of the subsystem. Phase 1. |
| `tools/api-tracker/lib/redact.js` | Shared redaction (CSRF UUIDs, `x-codeium-csrf-token`, JWTs, emails, bearer tokens, `Authorization`). Imported by capture + orchestrator. | Superset of `server.js:redactSensitive`. **Build first** — §7. |
| `tools/api-tracker/capture/cdp-capture.js` | (Owned by sibling agent #1) Attach to IDE CDP, record Connect-RPC request/response pairs to `captured-traffic.jsonl`, **redacting through `lib/redact.js` before any write**. | Must import `lib/redact.js`. |

### 1.3 Route surface

```
POST /api/api-tracker/scan      → start a scan run.  Body: { capture?: boolean, durationMs?: number }
                                   • capture:false (default) → schema+inventory+diff only (no LS/IDE needed, fully safe)
                                   • capture:true            → also runs CDP capture (requires IDE + tracker.enableCapture flag)
                                   Returns 202 { runId, status:'running' } or 409 if a run is in progress.
GET  /api/api-tracker/status    → { status, startedAt, finishedAt, error, hasReport }
GET  /api/api-tracker/report    → { markdown, json } from the last run (404 if none)
GET  /api/api-tracker/registry  → the merged method registry + per-method {safe, whitelisted, calledInDeck}
```

- `scan` is **rate-limited** (reuse `strictLimiter` pattern from `server.js:158`) and, when `capture:true`, requires `getApiTrackerSettings().enableCapture === true` and (if `AUTH_KEY` set) auth — capture touches the live IDE.
- All four are registered by adding `require('./routes/api-tracker')(app);` to `src/routes.js:18` (after `orchestrator-api`).
- **No route ever invokes a mutating LS method.** The tracker only *reads* the registry and *probes safe* methods (see §6 risks).

### 1.4 Data-flow contract (files are the interface)

The tools communicate via files in `tools/api-tracker/`, so each is independently runnable and the orchestrator just sequences them and reads outputs:

```
schema/bundles/main.js ──extract-schema.js──▶ schema/method-registry.json
                                              schema/proto-field-maps.json
capture/captured-traffic.jsonl ──┐
schema/method-registry.json ─────┼──test-runner.js──▶ test/api-diff-report.md
inventory/deck-known-methods.json┘                    test/api-diff.json
src/protobuf.js (read) ──────────┘
```

This file-as-interface design means Phase 1 (tools) is fully testable with **zero backend changes**.

---

## 2. Auto-expanding the whitelist (safely)

### 2.1 Problem
`ALLOWED_LS_METHODS` (`src/routes/cascade.js:11-30`) is a hand-maintained literal. When the API gains methods (e.g. the new `AgentState*`/`Turn*`/`Jetbox*` surface), the proxy 403s them until someone edits the Set. We want discovery to *propose* additions while keeping mutating methods gated.

### 2.2 Decision: move the whitelist to a **generated + reviewed** file, never auto-merged into the live gate

Two-tier model:

1. **`src/ls-method-whitelist.js`** — the live gate. A small generated-but-committed module that exports `ALLOWED_LS_METHODS`. It is the single source the route imports. Generated by `test-runner.js --emit-whitelist`, but **committed to git and code-reviewed** like any source file. The generator only ever writes methods classified SAFE.
2. **The diff report** lists *candidate* methods (`new`, `called-but-not-whitelisted`) with a SAFE/UNSAFE classification, so a human decides before regenerating.

The route never reads a runtime/disk JSON for its allow-list (that would let a tracker bug widen the security boundary). The expansion path is: scan → report proposes → human runs `--emit-whitelist` → reviews the git diff → commits.

### 2.3 SAFE classification heuristic (conservative; default-deny)

A method is **SAFE-to-propose** only if **all** hold:
- Name matches a read prefix: `^(Get|List|Fetch|Read|Search|Resolve|Describe|Stream)` **and** does **not** match a mutating prefix anywhere: `(Create|Update|Delete|Install|Uninstall|Start|Send|Cancel|Handle|Set|Add|Remove|Kill|Run|Execute|Commit|Ingest|Enable|Disable|Edit|Migrate|Record|Save|Upload)`.
- Its `output` type is non-empty and its `input` type has no fields that look like write payloads (best-effort, from proto-field-maps).
- It appeared in capture as a **GET-shaped / idempotent** call (if capture data exists), or has zero observed side effects.

Everything else → **UNSAFE → never auto-proposed**, listed in report under "Requires manual review (mutating)". The existing mutating entries (`UpdateSettings`, `InstallCascadePlugin`, `StartCascadeInvocation`, `SendCascadeMessage`, `DeleteCascadeTrajectory`, `UninstallCascadePlugin`, `CancelCascadeInvocation`, `HandleCascadeUserInteraction`) stay exactly as they are — the generator preserves a hand-maintained `MANUAL_ALLOW` block and only manages the auto-`SAFE` block.

### 2.4 Concrete diff

**Before** — `src/routes/cascade.js:10-30`:
```js
// Security: Method whitelist to prevent arbitrary LS method invocation
const ALLOWED_LS_METHODS = new Set([
    'GetCascadeModelConfigData',
    'GetAllCascadeTrajectories',
    // … 16 more, mixed read + mutating …
    'SendCascadeMessage',
]);
```

**After** — `src/routes/cascade.js`:
```js
// Security: method whitelist for POST /api/ls/:method.
// Split into a generated SAFE (read-only) block and a hand-maintained MANUAL block.
// Regenerate the SAFE block:  node tools/api-tracker/test/test-runner.js --emit-whitelist
// Review the git diff before committing — this file is the security boundary.
const { ALLOWED_LS_METHODS } = require('../ls-method-whitelist');
```

**New file** — `src/ls-method-whitelist.js` (generated SAFE block + frozen MANUAL block):
```js
// AUTO-GENERATED SAFE block — edit via tools/api-tracker (test-runner --emit-whitelist).
// Generated against bundle appVersion 2.0.11 on <ISO date>. Do not hand-edit the SAFE list.
const SAFE_READ_METHODS = [
    'GetCascadeModelConfigData', 'GetAllCascadeTrajectories', 'GetCascadeTrajectory',
    'GetCascadeTrajectorySteps', 'GetCascadeTrajectoryGeneratorMetadata',
    'GetUserStatus', 'GetProfileData', 'GetWorkspaceFolders', 'GetWorkspaceInfos',
    'GetSettings', 'GetAvailableCascadePlugins',
    // + newly-discovered reads proposed by the tracker, e.g.:
    // 'GetAgentState', 'ListAgentPlugins', 'GetCascadeNuxes', 'FetchAvailableModels',
];

// MANUAL block — mutating/sensitive methods. NEVER auto-generated. Add only via human review.
const MANUAL_ALLOW_METHODS = [
    'HandleCascadeUserInteraction', 'CancelCascadeInvocation', 'DeleteCascadeTrajectory',
    'UpdateSettings', 'InstallCascadePlugin', 'UninstallCascadePlugin',
    'StartCascadeInvocation', 'SendCascadeMessage',
];

const ALLOWED_LS_METHODS = new Set([...SAFE_READ_METHODS, ...MANUAL_ALLOW_METHODS]);
module.exports = { ALLOWED_LS_METHODS, SAFE_READ_METHODS, MANUAL_ALLOW_METHODS };
```

This is a behavior-preserving refactor (same 18 methods on day one), so existing `/api/ls/:method` calls keep working; the only change is *where the list lives* and *how it grows*.

---

## 3. Schema → `src/protobuf.js` migration

### 3.1 What we have vs what we want
`src/protobuf.js` hand-codes field numbers (`CONTENT_FIELD_MAP`, `NESTED_FIELD_MAPS`, `src/protobuf.js:68-110`). The bundle gives us the **real** numbers/types for the same messages (`Cortex*Step*`, `Trajectory*`, etc.). We want to replace guesses with ground truth **without breaking the working decoder**.

### 3.2 Decision: generate a data file, keep the decoder; augment then replace

Do **not** rewrite `decodeStepMessage` to be schema-driven in one shot (high regression risk against ~598-step real conversations). Instead:

**Step A — emit a generated map (additive, zero risk).**
`extract-schema.js` writes `tools/api-tracker/schema/proto-field-maps.json`:
```json
{
  "_meta": { "appVersion": "2.0.11", "generatedAt": "…", "source": "bundles/main.js" },
  "CortexStep": { "1": {"name":"type","type":"enum"}, "4": {"name":"status","type":"enum"}, "5": {"name":"metadata","type":"message"}, "10": {"name":"codeAction","type":"message"}, … },
  "CortexStepCodeAction": { "4": {"name":"useFastApply","type":"bool"}, "9": {"name":"markdownLanguage","type":"string"}, … },
  …
}
```

**Step B — introduce `src/protobuf-schema.js` (generated, committed).**
A thin module that `require`s the JSON and exposes the same shapes `protobuf.js` already uses (`CONTENT_FIELD_MAP`, `NESTED_FIELD_MAPS`, `STEP_TYPE_MAP`, `STEP_STATUS_MAP`) but **derived from the real descriptors**. Field names normalized to camelCase to match current JSON-API naming the decoder expects.

**Step C — validate before switching (the safety gate).**
`test-runner.js --verify-protobuf` cross-checks the generated maps against the *current hardcoded* maps in `src/protobuf.js` and reports:
- ✅ matches (number→name agree),
- ⚠️ **mismatches** (e.g. hand-coded `28: 'runCommand'` vs descriptor says field 28 is something else) — these are the bugs the migration fixes, but each must be eyeballed,
- ➕ additions (fields/messages the hand map lacks, e.g. new `Turn`/`AgentState` content fields).

**Step D — flip the source with a fallback.**
Change `src/protobuf.js` to prefer the generated maps and fall back to the legacy literals, behind a one-line merge so a missing/garbled JSON can never break decoding:
```js
// src/protobuf.js (migration shim)
let GEN = {};
try { GEN = require('./protobuf-schema'); } catch { /* fall back to literals below */ }
const CONTENT_FIELD_MAP   = { ...LEGACY_CONTENT_FIELD_MAP, ...(GEN.CONTENT_FIELD_MAP || {}) };
const NESTED_FIELD_MAPS   = mergeNested(LEGACY_NESTED_FIELD_MAPS, GEN.NESTED_FIELD_MAPS || {});
const STEP_TYPE_MAP       = { ...LEGACY_STEP_TYPE_MAP, ...(GEN.STEP_TYPE_MAP || {}) };
const STEP_STATUS_MAP     = { ...LEGACY_STEP_STATUS_MAP, ...(GEN.STEP_STATUS_MAP || {}) };
```
Generated values win on conflict (they are ground truth); legacy fills any gap. This is additive-with-override and reversible (delete the `require` to revert).

**Step E — regression test.**
Add `tools/api-tracker/test/fixtures/` with a few captured binary `GetCascadeTrajectorySteps` responses (redacted) and a decode-snapshot test: decode with legacy maps vs merged maps, assert no key disappears and known fields keep their names. Only after this passes do we trust the merge in prod.

### 3.3 Why not a full protobufjs `Type.decode`?
The current decoder is heuristic (string-vs-nested sniffing, `looksLikeString`, `src/protobuf.js:291`) precisely because the wire data has ambiguous bytes and the team only has partial schema. Now that we can extract the *full* descriptor, a future Phase could build real `protobuf.Root` types and call `Type.decode` — but that's a larger rewrite with its own regression surface. The map-merge approach captures 90% of the value (correct names/numbers) at ~5% of the risk. Note the full-decode rewrite as a Phase 4 stretch, not part of this plan.

---

## 4. Living docs — `docs/ls-api-captured.md`

### 4.1 Generated catalog
`test-runner.js --emit-docs` writes `docs/ls-api-captured.md` from the merged registry:

```
# Antigravity LS API — Captured Method Catalog
_Generated <ISO> from bundle appVersion 2.0.11 (+ capture session <id> if present). Do not edit by hand._

## Service: exa.language_server_pb.LanguageServerService

| Method | Input → Output | Classification | In Deck whitelist? | Called by Deck? | First seen |
|--------|----------------|----------------|--------------------|-----------------|------------|
| GetAllCascadeTrajectories | GetAllCascadeTrajectoriesRequest → …Response | SAFE (read) | ✅ | ✅ src/routes/conversations.js | bundle |
| GetAgentState             | GetAgentStateRequest → …Response             | SAFE (read) | ❌ candidate | ❌ | bundle 2.0.11 |
| HandleCascadeUserInteraction | … | MUTATING | ✅ (manual) | ✅ src/routes/cascade.js | bundle |
| StreamReactiveUpdates     | … (server-stream) | STREAM | ❌ | ❌ | bundle |
…

## New since last generation
- + GetAgentState, + StreamReactiveUpdates, + JetboxAppState (message) …

## Messages (field maps)
### CortexStep
| # | field | type | known in src/protobuf.js? |
| 1 | type | enum CortexStepType | ✅ |
| 5 | metadata | CortexStepMetadata | ✅ |
…
```

### 4.2 When regenerated
- **On demand:** part of every `POST /api/api-tracker/scan` (the orchestrator runs `--emit-docs` as the final step).
- **In CI (recommended, Phase 3):** a `check` mode (`test-runner.js --check-docs`) that regenerates to a temp file and fails if it differs from the committed `docs/ls-api-captured.md`, so the doc can't silently rot. Same pattern as a "generated code is up to date" CI gate.
- The doc carries the `appVersion` it was generated against (from `app-shell.html:5`, `__APP_CONFIG__.appVersion`) so staleness is visible.

The existing `docs/antigravity-api.md`, `docs/api-reference.md`, etc. are **hand-written narrative** and stay as-is; `ls-api-captured.md` is the machine-generated companion (clearly labeled "Do not edit by hand").

---

## 5. Optional UI — minimal "API Tracker" panel

Follows the exact `page.tsx` flag pattern; intentionally small (trigger a scan, show status, render the diff markdown).

### 5.1 Backend lib calls — add to `frontend/lib/cascade-api.ts` (end of file)
```ts
// === API Tracker ===
export interface ApiTrackerStatus { status: 'idle'|'running'|'done'|'error'; startedAt?: number; finishedAt?: number; error?: string; hasReport: boolean; }
export async function startApiTrackerScan(opts: { capture?: boolean } = {}): Promise<{ runId: string; status: string }> {
    const res = await fetch(`${API_BASE}/api/api-tracker/scan`, { method:'POST', headers: authHeaders(), body: JSON.stringify(opts) });
    if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
    return res.json();
}
export async function getApiTrackerStatus(): Promise<ApiTrackerStatus> {
    const res = await fetch(`${API_BASE}/api/api-tracker/status`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Status failed: ${res.status}`);
    return res.json();
}
export async function getApiTrackerReport(): Promise<{ markdown: string }> {
    const res = await fetch(`${API_BASE}/api/api-tracker/report`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Report failed: ${res.status}`);
    return res.json();
}
```

### 5.2 View component — `frontend/components/api-tracker-view.tsx`
- A header ("API Tracker"), two buttons: **Scan (schema only)** and **Scan + Live Capture** (the second disabled unless `detected`), a status pill driven by polling `getApiTrackerStatus()` every 2 s while `running`, and the report rendered via the existing `MarkdownRenderer` (`frontend/components/markdown-renderer.tsx`).
- Reuses styling/idioms from a simple existing panel (e.g. `resource-monitor-view.tsx`). ~120 lines, no new deps.

### 5.3 Wiring in `frontend/app/page.tsx` (one line each, mirroring existing panels)
```tsx
// 1. lazy import alongside line 41-42
const ApiTrackerView = dynamic(() => import('@/components/api-tracker-view').then(m => ({ default: m.ApiTrackerView })), { ssr: false });
// 2. state alongside :150-163
const [showApiTracker, setShowApiTracker] = useState(() => getStoredValue('antigravity-show-api-tracker', false));
// 3. persist alongside :178-184
useEffect(() => { localStorage.setItem('antigravity-show-api-tracker', JSON.stringify(showApiTracker)); }, [showApiTracker]);
// 4. add setShowApiTracker(false) inside resetPanels() :216-226 and the showWelcome guard :448-449
// 5. handler alongside :322-327
const handleShowApiTracker = useCallback(() => { selectConversation(null); resetPanels(); setActiveWorkspace(null); setShowApiTracker(true); }, [selectConversation, resetPanels]);
// 6. render alongside :693-698
{showApiTracker && (<div className="flex flex-col flex-1 min-h-0 overflow-hidden"><ApiTrackerView /></div>)}
```

### 5.4 Sidebar entry — `frontend/components/app-sidebar.tsx`
Add an `onShowApiTracker` prop (threaded from `page.tsx` like `onShowResources` at `:470`) and a nav item (a `lucide-react` icon, e.g. `Network`/`Radar`). **Gate it behind a dev/advanced flag** so it doesn't clutter the default UI for end users — e.g. only render when `getApiTrackerSettings().uiEnabled` (fetched once) or a localStorage dev toggle is set.

**Don't over-build:** no live tail of capture, no per-method drill-down, no editing the whitelist from the UI (whitelist changes go through git review, §2). The panel is a button + a status + a rendered report. That's it.

---

## 6. File-by-file change list, phased

### Phase 1 — Standalone tools work end-to-end (no backend/frontend changes)
*Goal: `node tools/api-tracker/test/test-runner.js` produces a correct diff report + registry + field maps from the committed bundle, with redaction in place. Fully testable offline.*

| # | Path | Change | New? |
|---|------|--------|------|
| 1 | `tools/api-tracker/lib/redact.js` | **Build first.** Redaction superset: CSRF UUID `[0-9a-f-]{36}`, header `x-codeium-csrf-token`, JWT (`eyJ…`), email, `Authorization`/`Bearer`, 16+ hex keys. Export `redactString`, `redactObject`, `redactHeaders`. | ✅ new |
| 2 | `tools/api-tracker/schema/extract-schema.js` | Decode base64 `FileDescriptorProto` blobs in `bundles/main.js` via `protobufjs` descriptor; emit `schema/method-registry.json` + `schema/proto-field-maps.json` (with `_meta.appVersion` from `app-shell.html`). | ✅ new |
| 3 | `tools/api-tracker/inventory/build-inventory.js` | Scan `src/**` for called methods (path templates + `callApi*` args), current whitelist, and `protobuf.js` field names; emit `inventory/deck-known-methods.json`. | ✅ new |
| 4 | `tools/api-tracker/test/test-runner.js` | Merge registry (bundle ∪ capture), diff vs inventory, classify SAFE/UNSAFE/STREAM, write `api-diff-report.md` + `api-diff.json`. Flags: `--emit-whitelist`, `--emit-docs`, `--verify-protobuf`, `--check-docs`. | ✅ new |
| 5 | `tools/api-tracker/capture/cdp-capture.js` | (Sibling #1) Ensure it **imports `lib/redact.js`** and redacts before writing JSONL; accept `--duration`, exit cleanly. | edit/coordinate |
| 6 | `tools/api-tracker/test/fixtures/*.bin` | A few redacted binary step responses for the protobuf regression snapshot (§3.5). | ✅ new |
| 7 | `tools/api-tracker/README.md` | How to run each tool standalone + the regen→review→commit flow. | ✅ new |

**Phase 1 exit criteria:** report lists current 18 whitelisted methods as "in whitelist", flags the new `AgentState*`/`Turn*`/`Jetbox*` methods as candidates, and `--verify-protobuf` runs clean-or-with-explained-mismatches against `src/protobuf.js`.

### Phase 2 — Wire into backend
*Goal: `POST /api/api-tracker/scan` runs the tools; `GET …/report` returns the markdown. Whitelist + protobuf migrations land behind safety gates.*

| # | Path | Change | New? |
|---|------|--------|------|
| 8 | `src/api-tracker.js` | Orchestrator: single-flight `runScan({capture,durationMs})` spawning the Phase-1 tools in order, streaming stdout → `logger.info('api-tracker',…)`; `getStatus/getReport/getRegistry`. | ✅ new |
| 9 | `src/routes/api-tracker.js` | Routes from §1.3; `capture:true` gated by `getApiTrackerSettings().enableCapture` + auth + `strictLimiter`. | ✅ new |
| 10 | `src/routes.js` | Add `require('./routes/api-tracker')(app);` after line 18. | edit (1 line) |
| 11 | `src/config.js` | Add `getApiTrackerSettings/saveApiTrackerSettings` + `DEFAULT_API_TRACKER_SETTINGS = { enabled:true, enableCapture:false, uiEnabled:false, captureDurationMs:20000 }` following the bridge/agent-api pattern (`:69-139`); export them (`:188-196`). | edit |
| 12 | `src/ls-method-whitelist.js` | New generated module (SAFE + MANUAL blocks) — §2.4. Day-one content == current 18 methods (no behavior change). | ✅ new (generated) |
| 13 | `src/routes/cascade.js` | Replace the inline `ALLOWED_LS_METHODS` literal (`:11-30`) with `const { ALLOWED_LS_METHODS } = require('../ls-method-whitelist');`. | edit |
| 14 | `tools/api-tracker/schema/proto-field-maps.json` | Generated output committed (so the backend has it without a scan). | ✅ new (generated) |
| 15 | `src/protobuf-schema.js` | Generated module exposing real maps from the JSON (§3.2 Step B). | ✅ new (generated) |
| 16 | `src/protobuf.js` | Add the merge shim (§3.2 Step D): `require('./protobuf-schema')` with legacy fallback; rename existing literals to `LEGACY_*`. Decoder logic unchanged. | edit |
| 17 | `tools/api-tracker/test/decode-snapshot.test.js` | Regression: decode fixtures with legacy vs merged maps; assert no key loss / no rename of known fields. | ✅ new |

**Phase 2 exit criteria:** scan runs from the API and shows progress in Live Logs; decode-snapshot test green; `/api/ls/:method` behavior identical to before for all 18 methods.

### Phase 3 — UI + docs automation (optional)
| # | Path | Change | New? |
|---|------|--------|------|
| 18 | `frontend/lib/cascade-api.ts` | Add the 3 tracker fetch helpers (§5.1). | edit |
| 19 | `frontend/components/api-tracker-view.tsx` | The panel (§5.2). | ✅ new |
| 20 | `frontend/app/page.tsx` | 6 one-line insertions (§5.3). | edit |
| 21 | `frontend/components/app-sidebar.tsx` | `onShowApiTracker` prop + dev-gated nav item (§5.4). | edit |
| 22 | `docs/ls-api-captured.md` | First generated catalog, committed. | ✅ new (generated) |
| 23 | CI (e.g. `.github/workflows/*` or `package.json` script `api-tracker:check`) | `test-runner.js --check-docs --verify-protobuf` as a non-blocking-then-blocking gate. | edit/new |

**Phase 3 exit criteria:** dev can open the panel, click Scan, see the diff; CI flags an out-of-date `ls-api-captured.md`.

---

## 7. Risks (and required mitigations)

| Severity | Risk | Mitigation |
|----------|------|------------|
| **CRITICAL** | **Whitelist widening = arbitrary LS RPC exposure.** Auto-adding a method to `/api/ls/:method` could expose a mutating/destructive RPC to any authed client. | Default-deny SAFE heuristic (§2.3); generator writes **only** the SAFE block, MANUAL block is frozen; the live gate is a **committed source file**, never runtime JSON; every expansion goes through a reviewed git diff. The route still 403s anything not in the Set. |
| **CRITICAL** | **Capturing secrets in logs/JSONL.** CDP traffic contains `x-codeium-csrf-token` (a UUID — *not* caught by `server.js:redactSensitive`), possibly auth headers, user content, file paths, emails. | `tools/api-tracker/lib/redact.js` is **built first (Phase 1, item #1)** and is a hard dependency of capture; capture redacts **before** any write. Redaction covers UUID CSRF + the specific header name + JWT/Bearer/email/hex-key. Add a Phase-1 unit test asserting a synthetic CSRF/JWT never reaches the JSONL. `captured-traffic.jsonl` and `logs/` are `.gitignore`d (note: `logs/` is already untracked per repo status). |
| **HIGH** | **Binary decode regression in `src/protobuf.js`.** A wrong generated field map could silently corrupt step rendering for real ~598-step conversations. | Merge-with-fallback (legacy wins on absence, generated wins on conflict) is reversible; `--verify-protobuf` surfaces every mismatch for human review; **decode-snapshot regression test** (item #17) gates the flip; never replace the heuristic decoder in this plan. |
| **HIGH** | **Bundle drift / extraction breakage.** A future bundle could change blob encoding (protobuf-es v3, different chunking, lazy-loaded service descriptor) and silently yield an empty/partial registry. | `extract-schema.js` asserts a **minimum expected method count** and known anchors (e.g. `GetAllCascadeTrajectories`, `CortexStep`) and exits non-zero if absent; the report header shows `appVersion` + method count so a regression is visible; capture remains an independent registry source so a bundle miss doesn't blind the diff. |
| **HIGH** | **CDP capture touches the live IDE.** Attaching to DevTools / interacting could perturb a running session. | Capture is **opt-in** (`enableCapture` flag, default false), **passive** (observe network only — never drive the UI or call mutating RPCs), **bounded** (duration cap), spawned/cancellable, and single-flight in the orchestrator. |
| **MEDIUM** | **7.4 MB bundle parse / 135-blob decode on the API path.** | Runs only inside the spawned tool, never in the request thread (§1.1). Orchestrator streams progress; results cached to files. |
| **MEDIUM** | **Scan endpoint abuse / concurrent CDP attaches.** | `strictLimiter` on `scan`; orchestrator single-flight returns 409 if a run is active; `capture:true` additionally auth-gated. |
| **MEDIUM** | **Generated files committed → noisy diffs / merge conflicts.** | Stable ordering (sort methods/fields) in generators so regen diffs are minimal; clear "AUTO-GENERATED — do not hand-edit" headers; `_meta` block isolates the only churny lines (timestamp). |
| **LOW** | **`tools/api-tracker/schema/bundles/main.js` is a large committed asset.** | Acceptable as a pinned snapshot for offline schema extraction; document how to refresh it (copy from the IDE install) in the tool README; consider Git LFS later if it grows. |

---

## 8. Summary of the moving parts

- **Two new backend modules** (`src/api-tracker.js` orchestrator, `src/routes/api-tracker.js` routes) + **one require line** in `src/routes.js` + **tracker settings** in `src/config.js`.
- **Whitelist** moves to a committed, generated-SAFE + frozen-MANUAL `src/ls-method-whitelist.js`; `cascade.js` just imports it. Growth = scan proposes → human reviews git diff → commit. Day-one behavior unchanged.
- **`src/protobuf.js`** gains a reversible merge shim over a generated `src/protobuf-schema.js` (real field numbers from the bundle), gated by a decode-snapshot regression test and `--verify-protobuf`. Heuristic decoder untouched.
- **Tools** (`extract-schema`, `build-inventory`, `test-runner`, shared `redact`) talk via files in `tools/api-tracker/`, so Phase 1 is fully standalone and offline-testable. **`lib/redact.js` is built first.**
- **Living docs** = generated `docs/ls-api-captured.md` with an `appVersion` stamp and an optional CI `--check-docs` gate.
- **Optional UI** = one flag, one view, one sidebar entry (dev-gated), three lib calls — render the diff via the existing `MarkdownRenderer`. Whitelist editing stays out of the UI by design.
- **Top risks** are the whitelist-widening security boundary and secret capture — both mitigated by default-deny + committed-source gating and a redact-before-write module built in Phase 1.

**Plan file:** `C:\Users\zacka\OneDrive\Desktop\Projects\Antigravity-Deck\tools\api-tracker\INTEGRATION-PLAN.md`
