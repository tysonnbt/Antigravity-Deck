# Changelog

All notable changes made by Claude Code are documented here.

## [2026-03-09]

### Changed
- **Replace all UI emoji with Lucide React icons**: Thay thế ~87 emoji Unicode bằng lucide-react icons trên toàn bộ frontend cho UI nhất quán, chuyên nghiệp. Giữ nguyên emoji trong markdown content strings (`extractStepContent`).
  - File tạo: `frontend/components/ui/step-icon.tsx` — helper component map icon name → Lucide component
  - File sửa `step-utils.ts`: `STEP_DISPLAY` icon field đổi từ emoji → Lucide icon name string (21 step types)
  - File sửa `chat-area.tsx`: 👤→User, 🤖→Bot, ⭐→Star, 📋→Copy, 🔧→Wrench, ↑→ArrowUp, ↓→ArrowDown, 💬→MessageSquare, config.icon→StepIcon
  - File sửa `chat-view.tsx`: 🚀→Rocket, ⬇→ArrowDown, 📸→Camera, 🧠→Brain, 🖼️→ImageIcon
  - File sửa `markdown-renderer.tsx`: 📋/✓→Copy/Check icons
  - File sửa `settings-view.tsx`: ⚙️→Settings, 🌐→Globe, 📷→Camera, ⭐→Star, ✅/❌→Check/X, getModelIcon()→JSX Lucide
  - File sửa `analytics-panel.tsx`: 📊→BarChart2, 👤→User, 🤖→Bot, 🔧→Wrench, ⚙️→Settings, ❌→XCircle
  - File sửa `token-usage.tsx`: 📊→BarChart2, ⚡→Zap
  - File sửa `step-detail.tsx`: ⭐/☆→Star, 📋→Copy, config.icon→StepIcon
  - File sửa `plugin-manager.tsx`: 🔌→Plug
  - File sửa `user-profile.tsx`: 👤→User, 🔄→RefreshCw, credit-card icon→React.ReactNode
  - File sửa `credit-card.tsx`: icon prop string→ReactNode
  - File sửa `feature-badge.tsx`: ✅/❌→Check/X
  - File sửa `agent-response.tsx`: 🤖→Bot, 📄→FileText, ⚠️→AlertTriangle
  - File sửa `processing-group.tsx`: 🔧→Wrench, config.icon→StepIcon
  - File sửa `waiting-step.tsx`: ⚡→Zap, 📁→FolderOpen, ⌨️→Keyboard, 🔔→Bell, 📄→FileText, ⚠→AlertTriangle
  - File sửa `code-change-viewer.tsx`: ✅/❌→Check/X, ⚠→AlertTriangle
  - File sửa `conversation-list.tsx`: 📁→Folder, 💬→MessageSquare
  - File sửa `cascade-panel.tsx`: 🖼→ImageIcon
  - File sửa `app-sidebar.tsx`: 💭→MessageCircle, ⏳→Loader2, ⊙→Circle
  - File sửa `auth-gate.tsx`: 🔒→Lock
  - File sửa `timeline.tsx`: 🤖→text "Agent" (tooltip context)
  - File sửa `toolbar.tsx`: 🔍→Search icon

- **Delete conversation confirm**: Thay thế browser native `confirm()` bằng AlertDialog modal (shadcn/ui) cho UX chuyên nghiệp hơn.
  - File tạo: `frontend/components/ui/alert-dialog.tsx`
  - File sửa: `frontend/components/sidebar/workspace-group.tsx`

### Fixed
- **Plugin Manager modal**: Description text bị cắt mất do dùng `truncate` (1 dòng). Đổi sang `line-clamp-3` để hiển thị tối đa 3 dòng.
  - File: `frontend/components/plugin-manager.tsx` (dòng 128)
