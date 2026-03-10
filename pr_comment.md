## 🔄 refactor: Rename "Chat Mirror" → "Antigravity Deck"

Unified branding across the entire codebase — all user-facing and internal references to "Chat Mirror" are now **Antigravity Deck**.

### Changes

| File | What changed |
|------|-------------|
| `package.json` | `name`: `antigravity-chat` → `antigravity-deck`, updated description |
| `README.md` | Title + intro paragraph |
| `layout.tsx` | `<title>` + Apple web app title |
| `page.tsx` | Header bar, onboarding instructions, footer label |
| `app-sidebar.tsx` | Sidebar header text |
| `chat-area.tsx` | Empty state placeholder |
| `server.js` | Console startup banner |
| `auto-accept.js` | Code comment |
| `step-utils.ts` | Markdown export header |
| `types.ts` | File header comment |

### Summary
- **10 files**, **16 lines** changed
- Pure rename — no logic or behavior changes
- Zero risk, no breaking changes
