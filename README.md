# 🔮 Antigravity Deck

Full-featured workspace dashboard for [Windsurf (Antigravity)](https://codeium.com/windsurf) conversations. Extracts and displays **all** conversation steps from the Language Server API — including steps beyond the JSON API's 598-step cap — with a full-featured chat UI that lets you **view, send messages, manage workspaces, and control cascades**.

## ✨ Features

### Core
- **Full conversation history** — Bypasses the 598-step JSON API limit via hybrid JSON + binary protobuf fetching
- **Real-time updates** — WebSocket-powered polling with adaptive rates (1s active / 3s default / 5s idle)
- **All step types** — User input, agent responses, tool calls, code actions, commands, browser subagent, and 17+ more
- **Smart rendering** — Markdown with syntax highlighting, collapsible thinking blocks, step type tags

### Chat & Interaction
- **Send messages** — Compose and send messages directly to Windsurf cascades from the web UI
- **Image upload** — Attach images via paste or file picker for multimodal AI interactions
- **Model selection** — Choose from available AI models (fetched live from the LS API)
- **Create conversations** — Start new cascade conversations from the UI
- **Delete conversations** — Remove cascade conversations

### Multi-Workspace
- **Auto-detection** — Discovers all running LS processes, ports, and CSRF tokens automatically (macOS/Linux/Windows)
- **Workspace switching** — Switch between multiple Windsurf workspaces seamlessly
- **Workspace creation** — Launch new Windsurf IDE instances and auto-bind them
- **Workspace folders** — Configure a default root directory; existing subfolders appear as available workspaces
- **Workspace-scoped conversations** — Filter conversations by workspace folder URI
- **Auto-rescan** — Detects new LS instances every 10 seconds

### Cascade Control (Gateway API)
- **Cascade status** — Check if a cascade is running, idle, or waiting for user input
- **Accept/Reject changes** — Accept or reject pending code changes from the web UI
- **Auto-accept** — Server-side auto-accept mode that instantly approves pending code changes
- **Cancel cascades** — Stop active cascade invocations
- **Token usage** — View generator metadata and token consumption

### Security & Remote Access
- **API key authentication** — Protect with `AUTH_KEY` env var; gated by `AuthGate` login form on the frontend
- **Cloudflare Tunnel deployment** — One command to deploy securely via `npm run online` (auto-generates auth key, creates tunnels for BE + FE)
- **CORS enabled** — All origins allowed for cross-domain access

### Settings & Configuration
- **Default model** — Configure a preferred AI model for new conversations
- **Default workspace root** — Set where new workspaces are created
- **Persistent settings** — Saved to `settings.json` (auto-created from `settings.sample.json`)

### Extras
- **Plugin management** — List, install, and uninstall cascade plugins
- **User profile** — Fetch user status and profile picture
- **Generic LS proxy** — Call any Language Server method via `POST /api/ls/:method`
- **Dark/Light theme** — Toggle between dark and light mode

## 🚀 Quick Start

### Local Development

```bash
# Install all dependencies (backend + frontend)
npm install
cd frontend && npm install && cd ..

# Start both backend (port 3500) and frontend (port 3000)
npm run dev
```

Open **http://localhost:3000** in your browser.

### Remote Access (Cloudflare Tunnel)

```bash
# Deploy with auto-generated auth key & Cloudflare tunnels
npm run online
```

This starts backend on port 9807, frontend on port 9808, creates Cloudflare tunnels for both, and prints the public URL + auth key. Tunnel info is also saved to `.tunnel-info.txt`.

> **Prerequisite:** [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) must be installed.

### With Authentication (local)

```bash
AUTH_KEY=your-secret-key npm run dev
```

The frontend will show a login form; enter the key to access.

## 📐 Architecture

```
┌─────────────────┐   JSON + Binary Proto   ┌──────────────┐
│  Windsurf LS     │ ◄───────────────────── │   server.js  │
│  (port auto-     │   Connect Protocol     │  :3500 API   │
│   detected)      │   HTTPS / HTTP         │              │
└─────────────────┘                         └──────┬───────┘
                                                   │ WebSocket
                                            ┌──────┴───────┐
                                            │   Next.js    │
                                            │   :3000 UI   │
                                            └──────────────┘
```

- **Backend** (`server.js` + `src/`) — Express API proxy + WebSocket hub, caches steps, polls LS with adaptive rate
- **Frontend** (`frontend/`) — Next.js 16 + React 19 + shadcn/ui + Tailwind CSS 4, receives steps via WebSocket

## 🔧 How It Works: Binary Protobuf Pagination

The Windsurf Language Server has a bug where JSON API requests (`Content-Type: application/json`) **ignore `startIndex`/`endIndex` parameters** and always return the first ~598 steps.

**Solution:** Binary protobuf requests (`Content-Type: application/proto`) correctly respect pagination:

1. **JSON** — First request gets ~598 steps with perfect JSON decoding
2. **Binary protobuf** — Subsequent requests with `startIndex = 598+` fetch remaining steps
3. **Schema-aware decoder** — Binary steps decoded to JSON using field name maps auto-discovered by cross-referencing JSON and binary responses

### Field Mapping

| Step Type | Binary Enum | Content Field# | JSON Key |
|-----------|:-----------:|:--------------:|----------|
| USER_INPUT | 14 | 19 | `userInput` |
| PLANNER_RESPONSE | 15 | 20 | `plannerResponse` |
| CODE_ACTION | 5 | 10 | `codeAction` |
| RUN_COMMAND | 21 | 28 | `runCommand` |
| VIEW_FILE | 8 | 14 | `viewFile` |
| BROWSER_SUBAGENT | 84 | 97 | `browserSubagent` |
| TASK_BOUNDARY | 81 | 93 | `taskBoundary` |
| NOTIFY_USER | 82 | 94 | `notifyUser` |
| *...17+ types total* | | | |

## 📁 Project Structure

```
├── server.js               # Express + WebSocket entry point (auth middleware)
├── start-tunnel.js         # Cloudflare Tunnel deployment script
├── settings.sample.json    # Sample settings file (copy to settings.json)
├── src/
│   ├── config.js           # Shared state, constants, persistent settings
│   ├── detector.js         # LS process auto-detection, port scanning, workspace resolution
│   ├── api.js              # API call helpers (JSON, binary protobuf, streaming)
│   ├── protobuf.js         # Binary protobuf encoder/decoder, field name maps
│   ├── poller.js           # Adaptive polling engine (JSON + binary hybrid, WebSocket broadcast)
│   ├── step-cache.js       # Step cache with deduplication and binary fallback
│   ├── auto-accept.js      # Server-side auto-accept for pending code changes
│   ├── cascade.js          # Cascade submit (StartCascade, SendUserCascadeMessage)
│   ├── ws.js               # WebSocket connection management and broadcasting
│   ├── cache.js            # Cache setup and coordination (delegates to poller/step-cache)
│   └── routes.js           # All Express HTTP route handlers
├── frontend/
│   ├── app/                # Next.js pages, layout, globals.css
│   ├── components/
│   │   ├── auth-gate.tsx       # Authentication gate (login form for AUTH_KEY)
│   │   ├── chat-view.tsx       # Main chat view with message input & image upload
│   │   ├── chat-area.tsx       # Chat message rendering area
│   │   ├── chat/
│   │   │   ├── user-message.tsx       # User message bubble
│   │   │   ├── agent-response.tsx     # Agent response with file diffs
│   │   │   ├── processing-group.tsx   # Collapsible processing steps group
│   │   │   ├── waiting-step.tsx       # Accept/reject pending changes UI
│   │   │   ├── raw-json-viewer.tsx    # Raw JSON step viewer
│   │   │   ├── streaming-indicator.tsx # Typing/streaming animation
│   │   │   └── chat-helpers.ts        # Step grouping utilities
│   │   ├── sidebar.tsx         # Workspace tree with conversation list
│   │   ├── conversation-list.tsx # Full conversation list view
│   │   ├── cascade-panel.tsx   # Cascade control panel
│   │   ├── settings-view.tsx   # Settings page (default model, workspace root)
│   │   ├── step-detail.tsx     # Detailed step inspector
│   │   ├── toolbar.tsx         # Top toolbar
│   │   ├── timeline.tsx        # Visual step timeline
│   │   ├── token-usage.tsx     # Token usage display
│   │   ├── analytics-panel.tsx # Conversation analytics
│   │   ├── plugin-manager.tsx  # Plugin install/uninstall UI
│   │   ├── user-profile.tsx    # User profile & account info display
│   │   ├── markdown-renderer.tsx # Markdown with syntax highlighting
│   │   └── ui/                 # shadcn/ui primitives (14+ components)
│   ├── lib/
│   │   ├── auth.ts             # Auth key storage & header helpers
│   │   ├── config.ts           # Frontend config (API_BASE, WS_URL, isLocalhost)
│   │   ├── websocket.ts        # WebSocket client with reconnection & auth
│   │   ├── cascade-api.ts      # Cascade API client (send, start, models, settings)
│   │   ├── step-utils.ts       # Step type parsing & display utilities
│   │   ├── types.ts            # TypeScript type definitions
│   │   ├── theme.ts            # Dark/light theme toggle
│   │   ├── notifications.ts    # Browser notification helpers
│   │   └── utils.ts            # General utilities (cn)
│   └── public/                 # Static assets
├── docs/
│   └── antigravity-api.md      # Full LS API reference (70+ methods documented)
├── package.json                # Backend dependencies + scripts
└── .gitignore
```

## ⚙️ API Endpoints (port 3500)

### Status & Workspace Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | LS connection status |
| `GET` | `/api/workspaces` | List all detected LS instances |
| `POST` | `/api/workspaces/switch` | Switch active workspace `{ index }` |
| `POST` | `/api/workspaces/create` | Launch new IDE & detect LS `{ path }` or `{ name }` |
| `GET` | `/api/workspaces/folders` | List folders in default workspace root |

### Conversations & Steps

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/conversations` | List all conversations (active workspace) |
| `GET` | `/api/workspaces/:index/conversations` | Conversations for a specific workspace |
| `GET` | `/api/conversations/:id/steps` | Get steps (JSON, with `?start=&end=`) |

### Cascade Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/cascade/start` | Create new cascade conversation |
| `POST` | `/api/cascade/send` | Send message to cascade `{ cascadeId, message, modelId?, images? }` |
| `POST` | `/api/cascade/submit` | Start + send in one call `{ message, modelId?, images? }` |
| `GET` | `/api/cascade/:id/status` | Cascade run status |
| `POST` | `/api/cascade/:id/accept` | Accept pending code changes |
| `POST` | `/api/cascade/:id/cancel` | Cancel active cascade |
| `GET` | `/api/cascade/:id/metadata` | Token usage / generator metadata |
| `DELETE` | `/api/cascade/:id` | Delete a conversation |

### Auto-Accept

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auto-accept` | Get current auto-accept state |
| `POST` | `/api/auto-accept` | Toggle auto-accept `{ enabled }` |

### User, Models & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user` | User status info |
| `GET` | `/api/user/profile` | User profile + picture |
| `GET` | `/api/models` | Available AI models |
| `GET` | `/api/settings` | Get app settings |
| `POST` | `/api/settings` | Update app settings |
| `POST` | `/api/media/save` | Save media as artifact (for image upload) |

### Plugins & Cache

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/plugins` | List available plugins |
| `POST` | `/api/plugins/install` | Install a plugin |
| `DELETE` | `/api/plugins/:id` | Uninstall a plugin |
| `DELETE` | `/api/cache` | Clear entire step cache |
| `DELETE` | `/api/cache/:id` | Clear cache for one conversation |

### Generic Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ls/:method` | Call any LS API method |

### WebSocket

| Event | Direction | Description |
|-------|-----------|-------------|
| `set_conversation` | Client → Server | Subscribe to a conversation's updates |
| `steps_init` | Server → Client | Full step list for the conversation |
| `steps_new` | Server → Client | New steps appended |
| `step_updated` | Server → Client | Existing step content changed (streaming) |
| `cascade_status` | Server → Client | Cascade run status changed |
| `conversations_updated` | Server → Client | Conversation list changed (new/removed) |
| `status` | Server → Client | LS connection status on connect |

## 🔒 Authentication

When `AUTH_KEY` environment variable is set:
- All `/api/*` routes require `X-Auth-Key` header or `?auth_key=` query param
- WebSocket connections require `?auth_key=` query param
- Frontend shows a login form (`AuthGate`) before granting access
- Key is stored in `localStorage` and sent with all requests

## 🌐 Cloudflare Tunnel Deployment

The `start-tunnel.js` script handles:
1. Generates a random auth key
2. Starts backend on port 9807 with auth enabled
3. Creates a Cloudflare tunnel for the backend
4. Starts frontend on port 9808 with `NEXT_PUBLIC_BACKEND_URL` pointing to the backend tunnel
5. Creates a Cloudflare tunnel for the frontend
6. Prints the public URL and auth key
7. Saves tunnel info to `.tunnel-info.txt`

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js |
| Backend framework | Express 4 |
| WebSocket | ws 8 |
| Protobuf | protobufjs 8 |
| Frontend framework | Next.js 16 (Turbopack) |
| UI library | React 19 |
| Component library | shadcn/ui (Radix UI) |
| Styling | Tailwind CSS 4 |
| Markdown | react-markdown + rehype-highlight + remark-gfm |
| Language | TypeScript 5 (frontend), JavaScript (backend) |
| Tunnel | cloudflared (Cloudflare Tunnel) |

## 📄 License

MIT
