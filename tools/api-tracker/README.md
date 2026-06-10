# Antigravity LS API Tracker

A tool to **capture, reconcile, and track changes** to the Connect-RPC API exposed by Antigravity's Language Server (LS). Goal: every time Antigravity updates, we immediately detect new / removed / schema-changed methods, then fold them into the Deck.

> ⚠️ **Local-only.** The `capture/`, `schema/bundles/`, and `test/replay-results.json` directories contain CSRF tokens, PII, and Antigravity's proprietary bundle → they are `.gitignore`d. Commit only the **scripts**.

## Why it's needed
Antigravity is an **Electron** app → it ships with the Chrome DevTools Protocol enabled (`--remote-debugging-port=0`). The LS (`language_server.exe`) serves both the API and the webview UI at `https://127.0.0.1:50934`, and **embeds the entire protobuf definition** inside `main.js`. We exploit both:

- **Dynamic (CDP capture):** see which methods are *actually* called + the real JSON payloads.
- **Static (bundle extract):** get the *full* list of methods + the real schema (correct field numbers), including methods nobody has called yet.

## Key findings (Antigravity v2.0.11)
| Category | Figure |
|---|---|
| Total services / methods in bundle | **23 services / 645 methods** |
| `exa.language_server_pb.LanguageServerService` | **237 methods** |
| Methods the Deck currently uses | **22** |
| Messages / enums extracted (with field numbers) | 3,305 / 458 |
| New paradigm | `exa.jetski_cortex_pb` package (AgentState / Turn / Jetbox) |

**Wire format (confirmed from the transport code):** Connect protocol, **JSON** (`useBinaryFormat:false`), path `/<pkg>.<Service>/<Method>`, headers `Connect-Protocol-Version: 1` + `x-codeium-csrf-token`. This is exactly what `src/api.js` already does → any new method is immediately callable via JSON, no protobuf binary required.

**Regression found via live replay:** `GetSettings`, `GetWorkspaceFolders`, `GetSubscriptionStatus` → **404** (still in the Deck's whitelist/code but dropped in this LS build).

## Structure & how to run

### 1. `capture/` — capture live traffic via CDP
```bash
node tools/api-tracker/capture/cdp-capture.js --seconds 70 --ls-port 50934
node tools/api-tracker/capture/decode-traffic.js          # condensed view (grpc-web framing stripped)
```
Auto-discovers the CDP port from `%APPDATA%\Antigravity\DevToolsActivePort`, uses flat auto-attach to follow both the page + worker. Observe-only (read-only), sends no commands. Note: run it while interacting with the agent to capture more methods (when idle, only a few poll methods show up).

### 2. `schema/` — extract the static schema from the bundle
```bash
node tools/api-tracker/schema/decode-descriptors.js   # decode 135 base64 FileDescriptorProto blobs
node tools/api-tracker/schema/build-registry.js       # → rpc-registry.json/.md + messages.json + *.proto.txt
```
- `rpc-registry.md` — **full catalog of all 645 methods** (service → method → I/O type → streaming kind).
- `messages.json` — every message/enum with field number/name/type.
- `*.proto.txt` — reconstructed `.proto` for the important groups (language_server, jetski_cortex, cortex, jetbox_state, trajectory...).

### 3. `inventory/` — what the Deck already knows
`deck-known-methods.json` — the 22 methods the Deck calls + the `/api/ls/:method` whitelist contents + the coverage of `src/protobuf.js`.

### 4. `test/` — auto-test + diff (safe)
```bash
node tools/api-tracker/test/test-runner.js            # default: replay read-only methods ONLY
node tools/api-tracker/test/test-runner.js --no-live  # classify + offline diff only
node tools/api-tracker/test/safety.test.js            # unit test for the classifier
```
- Classifies into 3 groups: `safe` (Get/List/Stat/Stream*Updates...), `unsafe` (Write/Update/Delete/Send/Accept/Handle*Interaction...), `unknown` → treated as unsafe.
- **Never calls a mutating method by default.** `--include-unsafe` only prints them (dry-run); to actually send, you must add `--no-dry-run`.
- Emits `api-diff-report.md` (NEW / REMOVED / CHANGED) + `method-safety.json`.

### 5. Autoscan + direct-call client + backend
- **`autoscan/autoscan.js`** — fully automated scanner (no UI clicking required):
  ```bash
  node tools/api-tracker/autoscan/autoscan.js --tier=1,2     # reads (safe)
  node tools/api-tracker/autoscan/autoscan.js --tier=1,2,3   # + draft sandbox cascade (agent run, self-deleting)
  ```
  Tier 1 (no-arg reads) · Tier 2 (parameterized reads, auto-fills live IDs) · Tier 3 (sandbox: create→send ping→capture flow→delete) · Tier 4 (echo-back mutating, reversible). The destructive deny-list + redaction are always on. Emits `api-catalog.{json,md}`.
- **`gen-client.js` → `src/ls-client.js`** — direct-call LS client, 237 wrappers:
  ```js
  const { lsClient } = require('./src/ls-client');
  const diff = await lsClient.getTurnDiff({ conversationId, stepIndex });
  ```
- **`gen-whitelist.js` → `src/ls-method-whitelist.js`** — whitelist for the `/api/ls/:method` proxy (auto SAFE block + manual MUTATING + `SENSITIVE_EXCLUDE` to block sensitive reads such as `ReadFile`/`GetTokenBase`).
- **Backend** — `src/api-tracker.js` + `src/routes/api-tracker.js`:
  - `POST /api/api-tracker/scan` `{tiers:"1,2"}` (HTTP allows tier 1,2 read-only only; 3/4 via CLI only)
  - `GET /api/api-tracker/status` · `/catalog` · `/registry`

## Drift-tracking workflow (each time Antigravity updates)
1. `cdp-capture.js` (while using the agent) → new traffic.
2. `decode-descriptors.js` + `build-registry.js` on the new bundle → new registry.
3. `test-runner.js` → `api-diff-report.md` tells you which methods are NEW/REMOVED/CHANGED.
4. Re-gen: `node tools/api-tracker/gen-whitelist.js` + `node tools/api-tracker/gen-client.js` → `src/ls-method-whitelist.js` & `src/ls-client.js` automatically track the new methods. (Optional: update the `src/protobuf.js` field map from `messages.json`.)

See `INTEGRATION-PLAN.md` for the plan to wire everything into the Deck backend (the `/api/api-tracker/scan` route, UI panel, etc.).
