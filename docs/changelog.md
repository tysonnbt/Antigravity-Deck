# Changelog

All notable changes made by Claude Code are documented here.

## [2026-03-09]

### Refactored
- **Source Control & Explorer mobile responsiveness**: Cải thiện trải nghiệm mobile cho cả hai panel.
  - Explorer panel: thêm mobile toggle/collapse (slide in/out overlay)
  - Source Control panel: giảm chiều rộng overlay trên mobile cho thoáng hơn
  - Cả hai panel: thêm nút đóng (X) trên mobile header
  - Cả hai panel: thêm nút "Open file tree/list" khi panel đóng và chưa chọn file
  - Thay text "EXPLORER" bằng FolderOpen icon + file count badge
  - Thay text "CHANGES" bằng FileDiff icon
  - Chuẩn hoá chiều cao header tất cả panel thành h-8 cho đồng nhất
  - Căn refresh/close buttons sát cạnh phải với -mr-2.5
  - Tách +/- stats khỏi action buttons trong Changes header cho icon positioning nhất quán

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

- **Sidebar toggle icon**: Đổi thành hamburger icon (Menu) trên mobile. Desktop dùng PanelLeftClose khi menu mở, PanelLeftOpen khi menu đóng.

- **Connected indicator dot**: Mobile chỉ hiển thị dot (không text, không pill border). Desktop giữ nguyên full pill.

- **Delete button mobile**: Luôn hiển thị trên mobile (trước đó chỉ hiện khi hover). Căn giữa dọc icon với text conversation.

- **Cursor-pointer**: Thêm cursor-pointer cho toàn bộ button, sidebar actions, menu items (Tailwind v4 không set mặc định).

- **Header "Chat Mirror v3"**: Hiển thị trên cả mobile. Khi mở workspace → rút gọn thành tên workspace thay vì "Chat Mirror v3".

- **Chat input text**: Căn giữa text/placeholder theo chiều dọc trong textarea.

- **Model selector width**: Tăng max-width hiển thị tên model (200px mobile, 240px desktop).

- **Emoji cleanup bổ sung**: Thay 5 emoji UI còn sót (💬→MessageCircle, ⭐→Star, 🚀→Rocket, ▶→ChevronRight) + 6 emoji chat message (⏳✅❌🆕 → text prefix).

- **Persist state across refresh**: Lưu navigation state (workspace, conversation, settings, logs, bridge, stats, tokens) vào localStorage. Refresh giữ nguyên trang đang xem thay vì reset về welcome screen.

- **Sidebar logo → Home link**: Click vào icon + "Chat Mirror" trong sidebar để quay về welcome screen.

- **Stats panel mobile**: Grid 2 cột (thay vì 6), giảm padding card cho compact hơn trên điện thoại.

- **Stats panel close animation**: Thêm hiệu ứng slide up + fade out khi đóng panel (trước đó chỉ có mở).

- **Sidebar sections**: Thêm SidebarSeparator full-width giữa các section (Header, Active Workspaces, Available, New Workspace, Playground).

- **Profile menu icon**: Đổi ChevronsUpDown → EllipsisVertical (⋮) cho trực quan hơn.

- **Connected indicator mobile**: Hiển thị full pill (dot + text) trên mobile, thay vì chỉ dot.

- **Footer cleanup**: Xoá separator thừa sau Shortcuts, hiển thị text "Shortcuts" trên mobile.
