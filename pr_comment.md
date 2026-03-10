## 🎯 feat: Open workspace dialog with IDE/Headless options

Clicking an available workspace now opens a **chooser dialog** instead of directly launching the IDE.

### UI
The dialog presents two side-by-side option cards:

| Option | Icon | Description |
|--------|------|-------------|
| **Open with IDE** | 📁 FolderOpen (blue) | Full Antigravity editor UI |
| **Open Headless** | 💻 Terminal (green) | No IDE UI — agent/background mode |

Each card has hover effects (border highlight + background tint) for clear visual feedback.

### Flow
1. User clicks workspace name in **Available Workspaces**
2. Dialog pops with workspace name in description
3. User picks an option → dialog closes → workspace starts loading
4. Loading spinner appears on the workspace item while opening

### Files
| File | Change |
|------|--------|
| `app-sidebar.tsx` | Added `selectedFolder` state, replaced direct click with dialog, new `Dialog` with 2 option cards |
