# 🔮 Antigravity Deck

Full-featured workspace dashboard for [Windsurf (Antigravity)](https://codeium.com/windsurf). View, send, and manage AI conversations across multiple workspaces — with resource monitoring, source control, headless IDE, agent bridge, and remote access.

---

## ✨ Feature Highlights

### 💬 Chat & Conversations
- **Full conversation history** — Bypasses the 598-step JSON API limit via hybrid JSON + binary protobuf fetching
- **Real-time updates** — WebSocket-powered polling with adaptive rates (1s active → 5s idle)
- **Send messages** — Compose and send directly to Windsurf cascades from the web UI
- **Image upload** — Attach images via paste or file picker for multimodal AI interactions
- **Model selection** — Choose from available AI models (fetched live from LS API)
- **Create & delete conversations** — Full CRUD for cascade conversations
- **All step types** — User input, agent responses, tool calls, code actions, commands, browser subagent, generated images, and 17+ more
- **Smart rendering** — Markdown with syntax highlighting, collapsible thinking blocks, step type tags
- **Workflow autocomplete** — Suggests available workflow commands while typing

### 🖥️ Multi-Workspace Management
- **Auto-detection** — Discovers all running LS processes, ports, and CSRF tokens automatically (Windows/macOS/Linux)
- **Workspace switching** — Switch between multiple Windsurf workspaces seamlessly
- **Workspace creation** — Launch new Windsurf IDE instances with auto-binding
- **Workspace folders** — Configure a default root directory; existing subfolders appear as available workspaces
- **Open mode dialog** — Click any available workspace to choose: **Open with IDE** or **Open Headless**
- **Auto-rescan** — Detects new LS instances every 10 seconds

### 🧠 Headless Language Server
Run Antigravity LS instances **without the IDE UI** — directly from the Deck.

- **Full lifecycle management** — Launch, kill, and list headless instances
- **Auto-auth** — Reuses extension server (port + CSRF) from a running IDE for cloud API access
- **HL badge** — Visual indicators (Terminal icon + green "HL" badge) in sidebar and resource monitor
- **Kill from dashboard** — Terminate headless instances via styled AlertDialog in Resource Monitor
- **Workspace binding** — Proper `AddTrackedWorkspace` + `GetWorkspaceInfos` for correct routing
- **Mock parent pipe** — Keeps LS alive and allows port binding
- **Protobuf metadata** — Binary encoding for LS stdin handshake

### 📊 Resource Monitor
Real-time system and per-workspace resource dashboard.

- **System overview** — CPU, RAM, Disk in animated donut charts with tooltips
- **Per-workspace breakdown** — CPU% and memory bars for each LS process, sorted by usage
- **Self-monitoring** — Backend + frontend process stats with PID display
- **History graph** — SVG sparkline showing CPU/RAM trends over time (5-minute window)
- **Compact sidebar bar** — Mini CPU/RAM bars always visible in sidebar header
- **Cross-platform** — Windows (PowerShell), macOS/Linux (ps) stat collection

### 🔀 Source Control
Built-in Git integration with visual diff viewer and file explorer.

- **Git status** — Modified, added, deleted, untracked, renamed files with color-coded badges
- **Side-by-side diffs** — Powered by `@git-diff-view`, with syntax highlighting
- **File explorer** — Tree view of workspace files with expand/collapse, file icons per extension
- **Code viewer** — Syntax-highlighted file viewer for 30+ languages
- **Git operations** — Stage, commit, push, pull — all from the UI
- **Branch display** — Current branch shown in header

### 🤖 Agent Bridge
Connect external AI agents (e.g., Pi, OpenClaw) to Antigravity via Discord.

- **Discord relay** — Real WebSocket via discord.js with slash commands and @mention routing
- **Cascade relay** — Stateless module that polls cascade completion and extracts full responses
- **Commands** — `/help`, `/listws`, `/setws`, `/start`, `/send`, `/status`, `/accept`, `/reject`, `/abort`, `/logs`
- **Auto cascade transition** — Automatic conversation switching when step limits are reached
- **State persistence** — Bridge state saved to `settings.json` across restarts
- **Live logs** — Bridge activity log viewable in the UI

### ⚡ Cascade Control
- **Cascade status** — Running, idle, or waiting for user input
- **Accept/Reject** — Approve or reject pending code changes from the web UI
- **Auto-accept** — Server-side mode that instantly approves all pending changes
- **Cancel cascades** — Stop active cascade invocations
- **Token usage** — View generator metadata and token consumption

### 🔒 Security & Remote Access
- **API key authentication** — `AUTH_KEY` env var + `AuthGate` login form
- **Cloudflare Tunnel** — One command: `npm run online` (auto-generates auth key, creates tunnels for BE + FE)
- **Workspace path validation** — Prevents command injection

### ⚙️ Settings & Extras
- **Default model** — Configure preferred AI model
- **Default workspace root** — Set where new workspaces are created
- **Plugin management** — List, install, uninstall cascade plugins
- **User profile** — Account info, plan tier, profile picture
- **Dark/Light theme** — Toggle between themes
- **Generic LS proxy** — Call any Language Server method via `POST /api/ls/:method`
- **Export conversations** — Export as formatted Markdown

---

## 🚀 Quick Start

### Local Development

```bash
# Install all dependencies
npm run setup

# Start both backend (port 3500) and frontend (port 3000)
npm run dev
```

Open **http://localhost:3000** in your browser.

### Remote Access (Cloudflare Tunnel)

```bash
npm run online
```

> **Prerequisite:** [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) must be installed.

### With Authentication

```bash
AUTH_KEY=your-secret-key npm run dev
```

---

## 📐 Architecture

```
┌──────────────────┐   JSON + Binary Proto   ┌───────────────┐
│  Windsurf LS     │ ◄───────────────────── │   server.js   │
│  (auto-detected) │   Connect Protocol     │   :3500 API   │
│                  │   HTTPS / HTTP         │               │
└──────────────────┘                         └──────┬────────┘
                                                    │ WebSocket
       ┌──────────────┐                      ┌──────┴────────┐
       │  Discord Bot  │ ◄─── Agent Bridge ──│   Next.js     │
       │  (optional)   │                     │   :3000 UI    │
       └──────────────┘                      └───────────────┘
```

- **Backend** (`server.js` + `src/`) — Express API proxy + WebSocket hub, adaptive polling, resource monitor, headless LS manager
- **Frontend** (`frontend/`) — Next.js 16 + React 19 + shadcn/ui + Tailwind CSS 4

---

## 📁 Project Structure

```
├── server.js                   # Express + WebSocket entry point
├── start-tunnel.js             # Cloudflare Tunnel deployment
├── settings.sample.json        # Sample settings (copy to settings.json)
├── src/
│   ├── config.js               # Shared state, constants, persistent settings
│   ├── detector.js             # LS process auto-detection & port scanning
│   ├── api.js                  # API call helpers (JSON, binary protobuf)
│   ├── protobuf.js             # Binary protobuf encoder/decoder
│   ├── poller.js               # Adaptive polling engine + WebSocket broadcast
│   ├── step-cache.js           # Step cache with dedup & binary fallback
│   ├── routes.js               # All HTTP route handlers (60+ endpoints)
│   ├── ws.js                   # WebSocket connection management
│   ├── cascade.js              # Cascade submit (Start + Send)
│   ├── auto-accept.js          # Server-side auto-accept for pending changes
│   ├── headless-ls.js          # Headless Language Server lifecycle manager
│   ├── resource-monitor.js     # Per-workspace CPU/RAM monitoring
│   ├── agent-bridge.js         # External agent relay (Pi/OpenClaw ↔ Antigravity)
│   ├── cascade-relay.js        # Cascade completion polling & response extraction
│   └── discord-relay.js        # Discord bot with slash commands & @mention relay
├── frontend/
│   ├── app/                    # Next.js pages, layout, globals.css
│   ├── components/
│   │   ├── chat-view.tsx           # Main chat with message input & image upload
│   │   ├── chat-area.tsx           # Chat message rendering area
│   │   ├── chat/                   # Message components (user, agent, processing)
│   │   ├── app-sidebar.tsx         # Sidebar with workspace tree & conversations
│   │   ├── source-control-view.tsx # Git status, diffs, file explorer
│   │   ├── resource-monitor-view.tsx # System & workspace resource dashboard
│   │   ├── agent-bridge-view.tsx   # Agent bridge control panel
│   │   ├── agent-logs-view.tsx     # Live bridge activity logs
│   │   ├── cascade-panel.tsx       # Cascade control panel
│   │   ├── settings-view.tsx       # App settings page
│   │   ├── plugin-manager.tsx      # Plugin install/uninstall UI
│   │   ├── user-profile.tsx        # User profile & account info
│   │   ├── workflow-autocomplete.tsx # Workflow suggestions in chat input
│   │   └── ui/                     # shadcn/ui primitives (21 components)
│   └── lib/                    # API clients, WebSocket, auth, types
└── docs/
    └── antigravity-api.md      # Full LS API reference (70+ methods)
```

---

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 4 |
| WebSocket | ws 8 |
| Protobuf | protobufjs 8 |
| Frontend | Next.js 16 (Turbopack) + React 19 |
| Components | shadcn/ui (Radix UI) |
| Styling | Tailwind CSS 4 |
| Source Control | @git-diff-view |
| Markdown | react-markdown + rehype-highlight |
| Discord | discord.js 14 |
| Language | TypeScript 5 (FE) / JavaScript (BE) |
| Tunnel | cloudflared |

---

## 📄 License

MIT
