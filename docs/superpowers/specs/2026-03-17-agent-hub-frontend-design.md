# Agent Hub Frontend Design

**Date:** 2026-03-17
**Status:** Draft
**Scope:** Replace the Discord-only Agent Bridge View with a unified Agent Hub that supports all transport types (Discord, WebSocket, HTTP) and includes a built-in agent chat client.

---

## Problem

The current `AgentBridgeView` only surfaces Discord bot interactions. The backend now supports three transport types (Discord, WebSocket, HTTP REST) via the refactored `AgentSession` + `SessionManager` architecture, but the frontend has no way to:

1. View sessions from non-Discord transports
2. Send messages as an agent directly from the dashboard
3. Configure the Agent API settings
4. See unified logs across all transports

## Solution

Replace `AgentBridgeView` with **Agent Hub** — a tabbed view that unifies agent session management, provides a built-in chat client, exposes configuration, and streams logs from all transports.

**Approach:** WebSocket-first real-time. The UI connects to the existing UI WebSocket (`/ws`) for session updates and logs, and opens a dedicated Agent WebSocket (`/ws/agent`) for the chat panel — acting as a real agent client that dogfoods the protocol.

---

## Architecture

### Component Tree

```
AgentHubView (replaces AgentBridgeView)
├── Tabs (shadcn Tabs)
│   ├── "Sessions"  → AgentSessionsPanel
│   │   ├── SessionCard[]
│   │   └── EmptyState
│   ├── "Chat"      → AgentChatPanel
│   │   ├── WorkspaceSelector
│   │   ├── ConnectButton
│   │   ├── MessageList
│   │   ├── ChatInput
│   │   └── SessionControls
│   ├── "Config"    → AgentConfigPanel
│   │   ├── Enable/Disable toggle
│   │   ├── Max sessions input
│   │   ├── Timeout input
│   │   └── Step limit input
│   └── "Logs"      → AgentLogsPanel
│       ├── Transport filter
│       ├── Level filter
│       └── LogEntries (auto-scroll)
```

### Data Flow

```
Backend                              Frontend
───────                              ────────
SessionManager ──events──→ UI WS (/ws) ──→ useWebSocket hook
  (session_created,                         ↓
   session_destroyed,                  AgentHubView
   session_status_change,              ├── Sessions panel (reads session list)
   session_log)                        ├── Logs panel (reads log events)
                                       └── Chat panel ──→ Agent WS (/ws/agent)
                                                          ↕ (connect/send/response)
                                                        AgentSession
```

**Two WebSocket connections when chat is active:**
1. **UI WS** (`/ws`) — existing connection, extended to broadcast agent session events
2. **Agent WS** (`/ws/agent`) — opened only when Chat tab is active; UI acts as a real agent client

### Files

**New (frontend):**
- `components/agent-hub-view.tsx` — main container with Tabs
- `components/agent-hub/sessions-panel.tsx` — active sessions list
- `components/agent-hub/chat-panel.tsx` — built-in agent chat
- `components/agent-hub/config-panel.tsx` — API settings
- `components/agent-hub/logs-panel.tsx` — unified log stream
- `hooks/use-agent-ws.ts` — custom hook for Agent WS connection
- `lib/agent-api.ts` — TypeScript types + HTTP helpers for agent API

**Modified (frontend):**
- `app/page.tsx` — replace `showBridge`/`AgentBridgeView` with `showAgentHub`/`AgentHubView`
- `components/app-sidebar.tsx` — rename Bridge button to Agent Hub, update icon

**Modified (backend):**
- `src/agent-session-manager.js` — add EventEmitter, emit session lifecycle events
- `src/ws.js` — subscribe to session manager events, broadcast to UI clients
- `src/routes/agent-api.js` — add `GET/PUT /api/agent-api/settings` endpoints

---

## Sessions Panel

### Session Card

Each card displays:
- **Session ID** — truncated UUID (e.g., `a3f2...c891`)
- **Transport badge** — color-coded: Discord (purple), WebSocket (green), HTTP (blue), UI (orange)
- **Status indicator** — ACTIVE (green dot), BUSY (yellow dot), IDLE (gray dot), ERROR (red dot)
- **Workspace name** + cascade ID if available
- **Step count** vs soft limit (e.g., `42 / 500`)
- **Last activity** — relative timestamp
- **Destroy action** — trash icon with confirmation dialog

### Real-time Updates

- Backend broadcasts `agent_session_update` events via UI WS when sessions are created, destroyed, or change status
- Frontend receives events and updates the session list immediately
- Fallback: HTTP poll `GET /api/agent/sessions` on WS reconnect

### Empty State

- Text: "No active agent sessions"
- Subtitle: "Connect from the Chat tab or from an external agent via WebSocket/HTTP API"

---

## Chat Panel

### UX Flow

**State 1 — Not connected:**
- Workspace dropdown selector (populated from existing workspace list)
- Connect button
- Help text: "Select a workspace and connect to start"

**State 2 — Connected, ready:**
- Session info bar (session ID, status dot, workspace name)
- Message list area (scrollable)
- Text input + send button
- Session controls: Accept, Reject, New Cascade, Disconnect

**State 3 — Waiting for response:**
- Input disabled
- Processing indicator on latest agent message bubble
- Status dot changes to yellow (BUSY)

### Message Rendering

- **User messages:** right-aligned bubble, muted background
- **Agent responses:** left-aligned bubble, rendered as markdown via `react-markdown` (already a project dependency)
- **System events:** centered inline text, small font (cascade transitions, errors, warnings)

### Session Controls

Below the input area:
- **Accept** — accept code diff (sends WS `accept` message)
- **Reject** — reject code diff (sends WS `reject` message)
- **New Cascade** ↺ — transition to a new cascade within the same session
- **Disconnect** — close session with confirmation dialog

### Hook: `useAgentWs`

```typescript
interface UseAgentWs {
  connected: boolean;
  sessionId: string | null;
  cascadeId: string | null;
  messages: AgentMessage[];
  isBusy: boolean;
  error: string | null;
  connect: (workspace: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  accept: () => void;
  reject: () => void;
  newCascade: () => void;
  disconnect: () => void;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}
```

Manages the full Agent WS lifecycle:
1. Opens WebSocket to `/ws/agent?auth_key=...`
2. Sends `connect` message with workspace
3. Receives `connected` confirmation with sessionId
4. Sends `send` messages, receives `response` events
5. Handles reconnection (3 retries with backoff)
6. Cleans up on disconnect or component unmount

---

## Config Panel

Matches the existing `SettingsView` visual style.

| Field | UI Element | Default | Validation |
|-------|-----------|---------|------------|
| Enable Agent API | Switch toggle | ON | — |
| Max Concurrent Sessions | Number input | 5 | min: 1, max: 20 |
| Session Timeout | Number input (minutes) | 30 | min: 1, max: 1440 |
| Step Soft Limit | Number input | 500 | min: 10, max: 10000 |

- Loads current values from `GET /api/agent-api/settings` on mount
- Save button calls `PUT /api/agent-api/settings`
- Toast notification on save success/failure
- Changes take effect immediately (session manager reconfigured on save)

---

## Logs Panel

### Log Entry Format

```
[HH:MM:SS] [Transport] [SessionID] Message
```

Examples:
```
[14:32:05] [WS]      [a3f2] Connected — workspace: MyProject
[14:32:08] [WS]      [a3f2] → "Fix the auth bug in login.ts"
[14:32:15] [WS]      [a3f2] ← Response (1,247 chars, 3 steps)
[14:33:01] [Discord]  [bridge] → "Deploy the new feature"
[14:33:02] [HTTP]    [b7e1] Session created
```

### Filters

- **Transport:** All | Discord | WebSocket | HTTP | UI
- **Level:** All | Info | Warn | Error

### Behavior

- Receives `agent_log` events via UI WS
- Max 500 entries in buffer (FIFO — oldest dropped)
- Auto-scroll to bottom by default
- "Scroll to bottom" button appears when user scrolls up
- Clear button to reset log buffer
- Color-coded: transport badge color + red for errors, yellow for warnings

---

## Backend Changes

### 1. SessionManager EventEmitter

`src/agent-session-manager.js` currently exports plain functions. Add an EventEmitter to broadcast lifecycle events:

- `session_created` — `{ sessionId, transport, workspace }`
- `session_destroyed` — `{ sessionId, reason }`
- `session_status_change` — `{ sessionId, oldState, newState }`
- `session_log` — `{ sessionId, transport, level, message, timestamp }`

### 2. UI WS Broadcast

`src/ws.js` subscribes to session manager events and broadcasts them to all connected UI clients:

- `{ type: 'agent_session_update', action: 'created'|'destroyed'|'status_change', ...data }`
- `{ type: 'agent_log', ...data }`

### 3. Settings Endpoints

`src/routes/agent-api.js` adds:
- `GET /api/agent-api/settings` — returns current agent API config
- `PUT /api/agent-api/settings` — updates config, reconfigures session manager

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent WS disconnect mid-chat | Reconnect banner, auto-retry 3x with backoff |
| Session destroyed externally | Chat panel notification, input disabled, "Session ended" message |
| Max sessions reached | Connect button disabled, tooltip explains limit |
| Backend offline | Sessions panel shows "Backend not responding", retry indicator |
| Send fails (busy) | Toast error: "Agent is busy processing a previous message" |
| Auth key missing/invalid | Redirect to connection status, show auth error |

---

## Testing Strategy

- **Unit:** Hook `useAgentWs` — mock WebSocket, verify state transitions
- **Integration:** Agent Hub tabs render correctly with mock data
- **E2E:** Connect from Chat tab → send message → verify response appears (requires running Antigravity IDE)
- **Visual:** Verify dark theme consistency, responsive behavior on mobile
