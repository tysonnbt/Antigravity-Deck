# Antigravity LS API Tracker

Công cụ **bắt, đối chiếu và theo dõi thay đổi** của API Connect-RPC mà Language Server (LS) của Antigravity expose. Mục tiêu: mỗi khi Antigravity cập nhật, ta phát hiện ngay method mới / bị xoá / đổi schema, rồi bổ sung vào Deck.

> ⚠️ **Local-only.** Thư mục `capture/`, `schema/bundles/`, và `test/replay-results.json` chứa CSRF token, PII và bundle độc quyền của Antigravity → đã được `.gitignore`. Chỉ commit các **script**.

## Vì sao cần
Antigravity là app **Electron** → bật sẵn Chrome DevTools Protocol (`--remote-debugging-port=0`). LS (`language_server.exe`) phục vụ cả API lẫn webview UI tại `https://127.0.0.1:50934`, và **nhúng toàn bộ định nghĩa protobuf** trong `main.js`. Ta khai thác cả hai:

- **Động (CDP capture):** thấy method nào *thực sự* được gọi + payload JSON thật.
- **Tĩnh (bundle extract):** lấy *toàn bộ* danh sách method + schema thật (field number chuẩn), kể cả method chưa ai gọi.

## Phát hiện chính (Antigravity v2.0.11)
| Hạng mục | Số liệu |
|---|---|
| Tổng service / method trong bundle | **23 service / 645 method** |
| `exa.language_server_pb.LanguageServerService` | **237 method** |
| Method Deck đang dùng | **22** |
| Message / enum trích được (kèm field number) | 3.305 / 458 |
| Paradigm mới | package `exa.jetski_cortex_pb` (AgentState / Turn / Jetbox) |

**Wire format (chốt từ code transport):** Connect protocol, **JSON** (`useBinaryFormat:false`), path `/<pkg>.<Service>/<Method>`, headers `Connect-Protocol-Version: 1` + `x-codeium-csrf-token`. Đây chính xác là cái `src/api.js` đang làm → mọi method mới gọi được ngay bằng JSON, không cần protobuf binary.

**Regression phát hiện qua replay thật:** `GetSettings`, `GetWorkspaceFolders`, `GetSubscriptionStatus` → **404** (vẫn nằm trong whitelist/code của Deck nhưng LS build này đã bỏ).

## Cấu trúc & cách chạy

### 1. `capture/` — bắt traffic động qua CDP
```bash
node tools/api-tracker/capture/cdp-capture.js --seconds 70 --ls-port 50934
node tools/api-tracker/capture/decode-traffic.js          # xem gọn (đã bóc khung grpc-web)
```
Tự dò cổng CDP từ `%APPDATA%\Antigravity\DevToolsActivePort`, dùng flat auto-attach để bám cả page + worker. Chỉ quan sát (read-only), không gửi lệnh. Lưu ý: chạy lúc đang tương tác với agent để bắt được nhiều method (lúc idle chỉ có vài method poll).

### 2. `schema/` — trích schema tĩnh từ bundle
```bash
node tools/api-tracker/schema/decode-descriptors.js   # giải 135 blob FileDescriptorProto base64
node tools/api-tracker/schema/build-registry.js       # → rpc-registry.json/.md + messages.json + *.proto.txt
```
- `rpc-registry.md` — **danh mục đầy đủ 645 method** (service → method → I/O type → streaming kind).
- `messages.json` — mọi message/enum kèm field number/tên/type.
- `*.proto.txt` — `.proto` tái dựng cho các nhóm quan trọng (language_server, jetski_cortex, cortex, jetbox_state, trajectory...).

### 3. `inventory/` — Deck đang biết gì
`deck-known-methods.json` — 22 method Deck đang gọi + nội dung whitelist `/api/ls/:method` + độ phủ của `src/protobuf.js`.

### 4. `test/` — auto-test + diff (an toàn)
```bash
node tools/api-tracker/test/test-runner.js            # mặc định: CHỈ replay method read-only
node tools/api-tracker/test/test-runner.js --no-live  # chỉ phân loại + diff offline
node tools/api-tracker/test/safety.test.js            # unit test bộ phân loại
```
- Phân loại 3 nhóm: `safe` (Get/List/Stat/Stream*Updates...), `unsafe` (Write/Update/Delete/Send/Accept/Handle*Interaction...), `unknown`→coi như unsafe.
- **Mặc định không bao giờ gọi method mutating.** `--include-unsafe` chỉ in ra (dry-run); muốn gửi thật phải thêm `--no-dry-run`.
- Xuất `api-diff-report.md` (NEW / REMOVED / CHANGED) + `method-safety.json`.

### 5. Quét tự động + Client gọi thẳng + Backend
- **`autoscan/autoscan.js`** — scanner tự động hoàn toàn (không cần click UI):
  ```bash
  node tools/api-tracker/autoscan/autoscan.js --tier=1,2     # đọc (an toàn)
  node tools/api-tracker/autoscan/autoscan.js --tier=1,2,3   # + sandbox cascade nháp (agent run, tự xoá)
  ```
  Tier 1 (đọc no-arg) · Tier 2 (đọc có tham số, tự điền ID sống) · Tier 3 (sandbox: tạo→gửi ping→bắt flow→xoá) · Tier 4 (echo-back mutating, reversible). Deny-list hủy diệt + redact luôn bật. Xuất `api-catalog.{json,md}`.
- **`gen-client.js` → `src/ls-client.js`** — client gọi thẳng LS, 237 wrapper:
  ```js
  const { lsClient } = require('./src/ls-client');
  const diff = await lsClient.getTurnDiff({ conversationId, stepIndex });
  ```
- **`gen-whitelist.js` → `src/ls-method-whitelist.js`** — whitelist cho proxy `/api/ls/:method` (khối SAFE auto + MUTATING thủ công + `SENSITIVE_EXCLUDE` chặn đọc nhạy cảm như `ReadFile`/`GetTokenBase`).
- **Backend** — `src/api-tracker.js` + `src/routes/api-tracker.js`:
  - `POST /api/api-tracker/scan` `{tiers:"1,2"}` (HTTP chỉ cho tier 1,2 read-only; 3/4 chỉ qua CLI)
  - `GET /api/api-tracker/status` · `/catalog` · `/registry`

## Quy trình theo dõi drift (mỗi lần Antigravity update)
1. `cdp-capture.js` (lúc đang dùng agent) → traffic mới.
2. `decode-descriptors.js` + `build-registry.js` trên bundle mới → registry mới.
3. `test-runner.js` → `api-diff-report.md` cho biết method nào NEW/REMOVED/CHANGED.
4. Re-gen: `node tools/api-tracker/gen-whitelist.js` + `node tools/api-tracker/gen-client.js` → `src/ls-method-whitelist.js` & `src/ls-client.js` tự bám method mới. (Tùy chọn: cập nhật field map `src/protobuf.js` từ `messages.json`.)

Xem `INTEGRATION-PLAN.md` để biết kế hoạch wire toàn bộ vào backend Deck (route `/api/api-tracker/scan`, UI panel, v.v.).
