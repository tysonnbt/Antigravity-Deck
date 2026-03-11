# UI Improvements Design Spec

## Overview

Four incremental improvements to the Antigravity Deck frontend, implemented in sequence: Toast System, Empty States, Text/Accessibility fixes, and Spacing Consistency.

**Tech context:** Next.js 16, React 19, shadcn/ui (Radix), Tailwind CSS 4, TypeScript 5.

---

## Part 1: Toast Notification System

### Problem

No user feedback after actions. Settings save, conversation delete, copy-to-clipboard, cascade accept/reject — all happen silently.

### Solution

Add shadcn/ui Toast component (built on `@radix-ui/react-toast`, already installed via `radix-ui` package). Generate via `npx shadcn add toast`.

### New files

- `frontend/components/ui/toast.tsx` — Toast primitives (Toast, ToastAction, ToastTitle, ToastDescription, ToastClose, ToastViewport)
- `frontend/components/ui/toaster.tsx` — Renders active toasts, mounted once in `layout.tsx`
- `frontend/hooks/use-toast.ts` — `toast()` function and state store

### Toast variants

The `success` variant is **custom** (not built-in to shadcn/ui). It must be added manually to the toast variant definitions in `toast.tsx`.

| Variant | Use case | Visual |
|---------|----------|--------|
| `default` | Neutral info (deleted, toggled) | Standard background |
| `success` | Positive confirmation (saved, exported, accepted) | `border-emerald-500/50` green accent border |
| `destructive` | Errors (save failed, API error) | Red accent, existing destructive style |

### Toast behavior

- Position: bottom-right of viewport
- Max visible: 3 stacked
- Auto-dismiss: 3 seconds
- Pause timer on hover, resume on mouse leave (Radix default)
- Mobile: swipe-to-dismiss (Radix built-in)

### Integration points (v1)

| Component | Action | Message | Variant |
|-----------|--------|---------|---------|
| `settings-view.tsx` | Save settings | "Settings saved" | success |
| `settings-view.tsx` | Save error | "Failed to save settings" | destructive |
| `app-sidebar.tsx` | Create conversation | "Conversation created" | success |
| `app-sidebar.tsx` | Delete conversation | "Conversation deleted" | default |
| `chat-view.tsx` | Export markdown | "Exported to clipboard" | success |
| `chat-view.tsx` | Copy code/badge | "Copied to clipboard" | default |
| `chat-view.tsx` | Auto-accept toggle | "Auto-accept enabled/disabled" | default |
| `chat-area.tsx` | Accept changes | "Changes accepted" | success |
| `chat-area.tsx` | Reject changes | "Changes rejected" | default |
| `cascade-panel.tsx` | Abort cascade | "Cascade aborted" | default |

**Out of scope for v1** (can be added later):
- `conversation-list.tsx` — "Failed to load conversations" (currently `console.error` only)
- `agent-bridge-view.tsx` — Bridge start/stop (currently has inline `saveMsg` state feedback)
- `plugin-manager.tsx` — Plugin install/uninstall success/failure

### Layout integration

Add `<Toaster />` to `frontend/app/layout.tsx` as a sibling after `{children}` inside `TooltipProvider`.

---

## Part 2: Empty States

### Problem

Views show blank/empty content when no data exists, leaving users confused about whether the app is loading or broken.

### Solution

Add contextual empty state UI to each view — icon + message + optional CTA.

### Empty state locations

| View | File | Condition | Icon | Title | Description | CTA | Notes |
|------|------|-----------|------|-------|-------------|-----|-------|
| Conversation List | `conversation-list.tsx` | No conversations | `MessageSquare` | "No conversations yet" | — | "Start a new chat" | **Already exists** (lines 128-142). Update icon to 48px and opacity to match pattern below. |
| Chat Area | `page.tsx` | `currentConvId === null` | `MessageCircle` | "Select a conversation or start a new one" | — | "New Chat" button | Render in `page.tsx` where view switching happens, not in `chat-area.tsx`. |
| Agent Logs | `agent-logs-view.tsx` | Empty log array | `ScrollText` | "No activity logs yet" | "Logs appear when bridge is active" | — | New |
| Resource Monitor | `resource-monitor-view.tsx` | No workspaces detected | `Activity` | "No workspaces detected" | "Waiting for Language Server..." | — | New |
| Source Control | `source-control-view.tsx` | No changes | `GitBranch` | "No changes detected" | "Working tree is clean" | — | New |
| Plugin Manager | `plugin-manager.tsx` | No plugins | `Plug` | "No plugins installed" | — | — | New. Uses `Plug` icon to match existing plugin manager UI. |

### Visual pattern

All empty states follow the same layout:
- Centered vertically and horizontally in container
- Icon: 48px (`h-12 w-12`), `text-muted-foreground/40`
- Title: `text-sm font-medium text-muted-foreground`
- Description: `text-xs text-muted-foreground/60`
- CTA: `<Button variant="secondary" size="sm">` (when applicable)

No shared EmptyState component — each is inlined because content differs per view. If a pattern emerges post-implementation, extract then.

---

## Part 3: Text Size + Accessibility

### Problem

- Text as small as 9px is illegible on mobile
- Icon-only buttons lack screen reader labels
- Some touch targets are too small for mobile use

### 3a. Minimum text size

Scale: ~43 occurrences of `text-[9px]` and ~96 of `text-[10px]` across the frontend.

**v1 scope:** Fix only in the four feature components (`app-sidebar.tsx`, `chat-view.tsx`, `chat-area.tsx`, `settings-view.tsx`) plus `agent-logs-view.tsx` and `source-control-view.tsx`. Remaining files deferred to future passes.

Rules:
- Replace `text-[9px]` with `text-[10px]` minimum
- Replace `text-[10px]` with `text-xs` (12px) where the text is primary/readable content
- **Exception:** Monospace metadata annotations (conversation IDs, step indices, hex hashes, timestamps in compact views) may remain at `text-[10px]` because they are secondary reference data, not reading content

### 3b. ARIA labels

- Find all `<Button>` or `<button>` elements containing only an icon (no visible text)
- Add `aria-label` describing the button's function
- Examples:
  - Close buttons: `aria-label="Close"`
  - Copy buttons: `aria-label="Copy to clipboard"`
  - Delete buttons: `aria-label="Delete"`
  - Toggle buttons: `aria-label="Toggle [feature]"`

### 3c. Touch targets

The button component (`button.tsx`) defines these icon variants:
- `size="icon"` → `size-9` (36px) — already meets 36px minimum
- `size="icon-sm"` → `size-8` (32px) — below target
- `size="icon-xs"` → `size-6` (24px) — significantly below target

Additionally, some components override icon button sizes downward (e.g., `chat-view.tsx:674` overrides to `h-5 w-5`, `agent-bridge-view.tsx:267` overrides to `h-7 w-7`).

Fix approach:
- For `icon-xs` and `icon-sm` buttons in feature components, add wrapper padding or `min-h-9 min-w-9` to ensure 36px tap area
- Do **not** change the button variant definitions themselves (would affect all usages globally)
- Only affects interactive elements (buttons), not display-only icons

### Scope

v1: Fix in the six feature components listed in 3a. No surrounding code refactoring.

---

## Part 4: Spacing Consistency

### Problem

Spacing uses many intermediate values (gap-1.5, gap-2.5, p-2.5) without a clear system. Border opacity and icon sizes also vary inconsistently.

### Spacing scale (4px grid)

| Token | px | Use |
|-------|-----|-----|
| `1` | 4px | Tight (icon-text pairs, inline items) |
| `2` | 8px | Default (list items, form field gaps) |
| `3` | 12px | Section (card content padding) |
| `4` | 16px | Major section gaps |
| `6` | 24px | Page-level padding |

### Rules

- Remove `gap-1.5`, `gap-2.5`, `p-2.5` — round to nearest grid value
- Border opacity: only 2 tiers — `border-border` (full) and `border-border/50` (subtle). Remove `/30`
- Icon sizes: `h-3.5 w-3.5` (inline), `h-4 w-4` (in buttons), `h-5 w-5` (headers)

### Scope

**Intentionally limited** to four feature components: `app-sidebar.tsx`, `chat-view.tsx`, `chat-area.tsx`, `settings-view.tsx`. The codebase has 53+ occurrences of off-grid spacing across 20+ files, but limiting to these four reduces risk and keeps the PR reviewable. Other files can be normalized in future passes. Border opacity normalization also applies only within these four files. shadcn UI primitives are left unchanged.

---

## Implementation Order

1. **Toast System** — highest UX impact, enables feedback for all subsequent changes
2. **Empty States** — second highest UX impact, fills blank screens
3. **Text + Accessibility** — improves mobile usability and screen reader support
4. **Spacing Consistency** — polish pass, lowest risk

Each part is independent and can be committed separately.

## Testing

- Manual verification: trigger each toast, view each empty state, check ARIA with browser devtools
- Mobile check: verify text readability and touch targets on 375px viewport
- Dark mode: confirm all new elements respect theme
