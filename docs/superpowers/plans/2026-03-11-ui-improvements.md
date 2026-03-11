# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toast notifications, empty states, accessibility fixes, and spacing normalization to the Antigravity Deck frontend.

**Architecture:** Four independent improvements applied sequentially. Toast system provides the notification infrastructure used by subsequent changes. No new dependencies — all built on existing shadcn/ui + Radix primitives.

**Tech Stack:** Next.js 16, React 19, shadcn/ui (new-york style), Tailwind CSS 4, TypeScript 5, Radix UI, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-11-ui-improvements-design.md`

---

## Chunk 1: Toast Notification System

### Task 1: Generate shadcn Toast component

**Files:**
- Create: `frontend/components/ui/toast.tsx`
- Create: `frontend/components/ui/toaster.tsx`
- Create: `frontend/hooks/use-toast.ts`

- [ ] **Step 1: Generate toast via shadcn CLI**

Run from the `frontend/` directory:

```bash
cd frontend && npx shadcn@latest add toast
```

This generates `components/ui/toast.tsx`, `hooks/use-toast.ts`, and `components/ui/toaster.tsx`.
Expected: 3 new files created.

- [ ] **Step 2: Add custom `success` variant to toast.tsx**

The generated `toast.tsx` will have a `toastVariants` cva definition with `default` and `destructive`. Add `success`:

In `frontend/components/ui/toast.tsx`, find the `variants.variant` object and add:

```typescript
success:
  "border-emerald-500/50 bg-background text-foreground",
```

So the variants block looks like:

```typescript
variants: {
  variant: {
    default: "border bg-background text-foreground",
    destructive:
      "destructive group border-destructive bg-destructive text-white ...",
    success:
      "border-emerald-500/50 bg-background text-foreground",
  },
},
```

- [ ] **Step 3: Verify toast type exports include `success`**

In `frontend/hooks/use-toast.ts` (or wherever the Toast type is defined), ensure the variant type accepts `"success"`. If the type is derived from the cva variants, it should auto-include. Verify by checking that `toast({ variant: "success", ... })` compiles without error.

- [ ] **Step 4: Commit toast infrastructure**

```bash
git add frontend/components/ui/toast.tsx frontend/components/ui/toaster.tsx frontend/hooks/use-toast.ts
git commit -m "feat(ui): add shadcn toast component with custom success variant"
```

### Task 2: Mount Toaster in layout

**Files:**
- Modify: `frontend/app/layout.tsx:36-38`

- [ ] **Step 1: Add Toaster import and render**

In `frontend/app/layout.tsx`, add import at top:

```typescript
import { Toaster } from "@/components/ui/toaster";
```

Then add `<Toaster />` after `{children}` inside `TooltipProvider`:

```tsx
<TooltipProvider delayDuration={200}>
  {children}
  <Toaster />
</TooltipProvider>
```

- [ ] **Step 2: Verify app still renders**

```bash
cd frontend && npx next build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(ui): mount Toaster in root layout"
```

### Task 3: Add toasts to settings-view.tsx

**Files:**
- Modify: `frontend/components/settings-view.tsx:65-81`

- [ ] **Step 1: Add toast import**

At top of `frontend/components/settings-view.tsx`, add:

```typescript
import { useToast } from "@/hooks/use-toast";
```

Inside the component function, add:

```typescript
const { toast } = useToast();
```

- [ ] **Step 2: Add toast calls in handleSave and remove saveMsg state**

In `handleSave` (line 65-81), replace the existing `setSaveMsg` feedback with toasts. After `setSettings(updated)` at line 73:

```typescript
setSettings(updated);
toast({ variant: "success", title: "Settings saved" });
```

In the catch block at line 76:

```typescript
} catch {
    toast({ variant: "destructive", title: "Failed to save settings" });
}
```

Remove the following `saveMsg`-related code that toasts replace:
- Line 40: `const [saveMsg, setSaveMsg] = useState('');` — delete this state variable
- Line 67: `setSaveMsg('');` — delete this reset call
- Lines 74-75: `setSaveMsg('saved'); setTimeout(() => setSaveMsg(''), 2500);` — delete (replaced by toast)
- Line 77: `setSaveMsg('error');` — delete (replaced by toast)
- Lines 243-247: The entire `{saveMsg && (...)}` JSX block that renders the inline "Saved!" / "Error saving" feedback — delete

- [ ] **Step 3: Verify settings save shows toast**

Start dev server (`npm run dev`), navigate to Settings, change a value, click Save. Should see green-bordered "Settings saved" toast bottom-right. Force an error (disconnect backend) to verify destructive toast.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/settings-view.tsx
git commit -m "feat(ui): add toast notifications to settings save"
```

### Task 4: Add toasts to chat-view.tsx and waiting-step.tsx (accept/reject, auto-accept, cancel)

**Files:**
- Modify: `frontend/components/chat-view.tsx:347-357,598-604`
- Modify: `frontend/components/chat/waiting-step.tsx:85-106`

- [ ] **Step 1: Add toast import**

At top of `frontend/components/chat-view.tsx`, add:

```typescript
import { useToast } from "@/hooks/use-toast";
```

Inside the component function, add:

```typescript
const { toast } = useToast();
```

- [ ] **Step 2: Add toast to handleInteract (accept/reject)**

In `handleInteract` (line 352-357), add toast after the API call:

```typescript
const handleInteract = useCallback(async (action: 'accept' | 'reject') => {
    if (!activeCascadeId) return;
    try {
        await cascadeInteract(activeCascadeId, action);
        toast({
            variant: action === 'accept' ? "success" : "default",
            title: action === 'accept' ? "Changes accepted" : "Changes rejected",
        });
    } catch (e) {
        console.error('Interact error:', e);
    }
}, [activeCascadeId, toast]);
```

- [ ] **Step 3: Add toast to auto-accept toggle**

In the DropdownMenuItem onClick handler (line 598-604), add toast:

```typescript
onClick={(e) => {
    e.preventDefault();
    const newVal = !autoAccept;
    setAutoAccept(newVal);
    setAutoAcceptState(newVal).catch(() => { });
    toast({ title: `Auto-accept ${newVal ? 'enabled' : 'disabled'}` });
}}
```

- [ ] **Step 4: Add toast to handleCancel (abort)**

In `handleCancel` (line 347-350), add toast:

```typescript
const handleCancel = useCallback(async () => {
    if (!activeCascadeId) return;
    try {
        await cascadeCancel(activeCascadeId);
        toast({ title: "Cascade aborted" });
    } catch (e) { console.error('Cancel error:', e); }
}, [activeCascadeId, toast]);
```

- [ ] **Step 5: Add toast to waiting-step.tsx (inline accept/reject)**

This is the primary UI where users click Accept/Reject on individual steps. In `frontend/components/chat/waiting-step.tsx`, add import at top:

```typescript
import { useToast } from "@/hooks/use-toast";
```

Inside the component function, add:

```typescript
const { toast } = useToast();
```

In `handleAction` (line 85-106), add toast after the success check at line 96:

```typescript
if (res.ok || res.status === 404) {
    setResult(action === 'accept' ? 'accepted' : 'rejected');
    onAccepted?.();
    toast({
        variant: action === 'accept' ? "success" : "default",
        title: action === 'accept' ? "Changes accepted" : "Changes rejected",
    });
}
```

Also in the catch block at line 99-102, add toast:

```typescript
} catch (e) {
    console.log(`[WaitingStep] ${action} error (may be success):`, e);
    setResult(action === 'accept' ? 'accepted' : 'rejected');
    onAccepted?.();
    toast({
        variant: action === 'accept' ? "success" : "default",
        title: action === 'accept' ? "Changes accepted" : "Changes rejected",
    });
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/chat-view.tsx frontend/components/chat/waiting-step.tsx
git commit -m "feat(ui): add toast to accept/reject, auto-accept toggle, and cascade abort"
```

### Task 5: Add toasts to page.tsx (export) and workspace-group.tsx (delete conversation)

**Files:**
- Modify: `frontend/app/page.tsx:264-266`
- Modify: `frontend/components/sidebar/workspace-group.tsx:78-90`
- Modify: `frontend/components/app-sidebar.tsx:259-281`

- [ ] **Step 1: Add toast to page.tsx for export**

In `frontend/app/page.tsx`, add import and hook:

```typescript
import { useToast } from "@/hooks/use-toast";
// Inside component:
const { toast } = useToast();
```

In `handleExport` (line 264-266), add toast:

```typescript
const handleExport = useCallback(() => {
    if (currentConvId && steps.length > 0) {
        exportToMarkdown(steps, currentConvId);
        toast({ variant: "success", title: "Exported to clipboard" });
    }
}, [steps, currentConvId, toast]);
```

Note: `handleCopyId` (line 278-283) is dead code — it is defined but never referenced in JSX or passed to children. Do NOT add toast to it. The actual copy-to-clipboard operations happen in `chat-area.tsx` and `markdown-renderer.tsx` via separate copy utilities — those are out of scope for v1.

- [ ] **Step 2: Add toast to workspace-group.tsx for delete conversation**

The delete conversation handler is in `frontend/components/sidebar/workspace-group.tsx` (NOT in `app-sidebar.tsx`). In `workspace-group.tsx`, add import at top:

```typescript
import { useToast } from "@/hooks/use-toast";
```

Inside the `WorkspaceGroup` component function, add:

```typescript
const { toast } = useToast();
```

In `handleConfirmDelete` (line 78-90), add toast after the delete API call succeeds:

```typescript
const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
        await fetch(`${API_BASE}/api/cascade/${deleteTarget.id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        })
        toast({ title: "Conversation deleted" });
    } catch (err) {
        console.error('Failed to delete conversation:', err)
    } finally {
        setDeleteTarget(null)
    }
}
```

- [ ] **Step 3: Add toast to app-sidebar.tsx for workspace creation**

In `frontend/components/app-sidebar.tsx`, add import and hook:

```typescript
import { useToast } from "@/hooks/use-toast";
// Inside component:
const { toast } = useToast();
```

In `handleCreateByName` (line 259-281), after `setShowCreateDialog(false)` at line 273:

```typescript
toast({ variant: "success", title: "Workspace created" });
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx frontend/components/sidebar/workspace-group.tsx frontend/components/app-sidebar.tsx
git commit -m "feat(ui): add toast to export, workspace create, and conversation delete"
```

---

## Chunk 2: Empty States

### Task 6: Update existing conversation-list empty state

**Files:**
- Modify: `frontend/components/conversation-list.tsx:128-142`

- [ ] **Step 1: Update icon size and opacity**

In `frontend/components/conversation-list.tsx`, find the empty state at lines 128-142. Update the icon from `h-8 w-8` to `h-12 w-12` to match the 48px standard:

```tsx
<MessageSquare className="h-12 w-12 text-muted-foreground/40" />
```

Update the layout to be vertically stacked (icon above text) instead of horizontal:

```tsx
) : conversations.length === 0 ? (
    <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <h3 className="text-sm font-medium text-muted-foreground">No conversations yet</h3>
            <p className="text-xs text-muted-foreground/60 max-w-xs">
                Start a new chat to begin working in this workspace.
            </p>
            <Button variant="secondary" size="sm" onClick={onNewChat} className="mt-2">
                Start a new chat
            </Button>
        </div>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/conversation-list.tsx
git commit -m "feat(ui): update conversation list empty state to match design pattern"
```

### Task 7: Add empty state to page.tsx (no conversation selected)

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Add MessageCircle import**

In `frontend/app/page.tsx`, add to the lucide-react import:

```typescript
import { MessageCircle } from "lucide-react";
```

- [ ] **Step 2: Add empty state when no conversation is selected**

Find where `showChat` is false but a workspace is selected (around where `showConversationList` renders). Add an empty state for when `detected && activeWorkspace && !currentConvId && !newChatMode` and none of the other views are active:

```tsx
{detected && activeWorkspace && !showChat && !showConversationList && !showAccountInfo && !showSettings && !showLogs && !showBridge && !showSourceControl && !showResources && (
    <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <h3 className="text-sm font-medium text-muted-foreground">Select a conversation or start a new one</h3>
            <Button variant="secondary" size="sm" onClick={handleStartConversation}>
                New Chat
            </Button>
        </div>
    </div>
)}
```

Place this in the main content area at approximately line 532 — after the `showWelcome && detected && !activeWorkspace` block (line 519-531) and before the `{detected && showAccountInfo && <AccountInfoView />}` block.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(ui): add empty state for no conversation selected"
```

### Task 8: Add empty states to agent-logs, resource-monitor, source-control, plugin-manager

**Files:**
- Modify: `frontend/components/agent-logs-view.tsx:433-444`
- Modify: `frontend/components/resource-monitor-view.tsx:426-430`
- Modify: `frontend/components/source-control-view.tsx:625-630`
- Modify: `frontend/components/plugin-manager.tsx:97-106`

- [ ] **Step 1: Update agent-logs-view.tsx empty state**

In `frontend/components/agent-logs-view.tsx`, find the empty state at lines 433-444. Replace with the standard pattern:

```tsx
{filtered.length === 0 ? (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <ScrollText className="h-12 w-12 text-muted-foreground/40" />
        <div>
            <p className="text-sm font-medium text-muted-foreground">No activity logs yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
                Logs appear when bridge is active
            </p>
        </div>
    </div>
) : (
```

Ensure `ScrollText` is imported from `lucide-react`. The existing import block (lines 7-10) imports `Activity, User, Bot, Wrench, Filter, Trash2, Wifi, WifiOff, ChevronDown, ChevronRight, Terminal, FileCode2, Search, Eye, Globe, Copy, Check` — add `ScrollText` to this import statement.

- [ ] **Step 2: Update resource-monitor-view.tsx empty state**

In `frontend/components/resource-monitor-view.tsx`, find lines 426-430. Replace:

```tsx
{workspaceList.length === 0 ? (
    <div className="text-center py-6">
        <Activity className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No workspaces detected</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Waiting for Language Server...</p>
    </div>
```

- [ ] **Step 3: Update source-control-view.tsx empty state**

In `frontend/components/source-control-view.tsx`, find lines 625-630. Replace:

```tsx
{!loading && !error && files.length === 0 && (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
        <GitBranch className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No changes detected</p>
        <p className="text-xs text-muted-foreground/60">Working tree is clean</p>
    </div>
)}
```

- [ ] **Step 4: Update plugin-manager.tsx empty state**

In `frontend/components/plugin-manager.tsx`, find lines 97-106. Replace:

```tsx
) : plugins.length === 0 ? (
    <div className="text-center py-8">
        <Plug className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No plugins installed</p>
    </div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/agent-logs-view.tsx frontend/components/resource-monitor-view.tsx frontend/components/source-control-view.tsx frontend/components/plugin-manager.tsx
git commit -m "feat(ui): add standardized empty states to logs, resources, source control, plugins"
```

---

## Chunk 3: Text Size + Accessibility

### Task 9: Fix text sizes in chat-area.tsx

**Files:**
- Modify: `frontend/components/chat-area.tsx`

- [ ] **Step 1: Fix text-[9px] occurrences**

In `frontend/components/chat-area.tsx`, find and replace:

- Line 86: `text-[9px]` on step type badge → keep `text-[10px]` (monospace metadata)
- Line 93: `text-[9px]` on step index badge → keep `text-[10px]` (monospace metadata)
- Line 121: `text-[9px]` on agent step type badge → keep `text-[10px]` (monospace metadata)
- Line 128: `text-[9px]` on step index badge → keep `text-[10px]` (monospace metadata)
- Line 172: `text-[9px]` on step range badge → keep `text-[10px]` (monospace metadata)
- Line 190: `text-[9px]` on step index badge → keep `text-[10px]` (monospace metadata)

All `text-[9px]` in chat-area are monospace metadata badges — upgrade to `text-[10px]`.

- [ ] **Step 2: Add aria-labels to scroll buttons**

At line 205-216, the scroll up/down buttons are icon-only. Add aria-labels:

```tsx
<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={scrollToTop} aria-label="Scroll to top">
    <ArrowUp className="h-4 w-4" />
</Button>
<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={scrollToBottom} aria-label="Scroll to bottom">
    <ArrowDown className="h-4 w-4" />
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat-area.tsx
git commit -m "fix(a11y): improve text sizes and add aria-labels in chat-area"
```

### Task 10: Fix text sizes and aria-labels in chat-view.tsx

**Files:**
- Modify: `frontend/components/chat-view.tsx`

- [ ] **Step 1: Fix text sizes**

- Line 550: `text-[9px]` "Recommended" badge → keep `text-[10px]` (metadata label)
- Line 553: `text-[9px]` image support icon → keep `text-[10px]` (metadata)
- Line 565: `text-[10px]` status text → `text-xs` (readable content: "Auto-accepting...", "Running")
- Line 685: `text-[10px]` "Clear all" button → `text-xs` (readable action text)
- Line 691: `text-[10px]` image count → keep `text-[10px]` (metadata count)

- [ ] **Step 2: Add aria-labels to icon-only buttons**

Line 674 — Remove image button (icon-only X on image thumbnail):

```tsx
<button ... aria-label="Remove image">
```

Line 748 — Cancel/Stop button:

```tsx
<Button ... aria-label="Stop generation">
```

- [ ] **Step 3: Fix touch target on remove image button**

Line 674 uses `h-5 w-5` which is too small. Add minimum tap area:

```tsx
<button className="... min-h-7 min-w-7 ..." aria-label="Remove image">
```

Note: This is a deliberate deviation from the spec's `min-h-9` target. This button sits as an absolute-positioned overlay on a ~56px image thumbnail, so 28px (`min-h-7`) is a compromise to avoid breaking the overlay layout. The thumbnail itself serves as the broader tap area.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chat-view.tsx
git commit -m "fix(a11y): text sizes, aria-labels, touch targets in chat-view"
```

### Task 11: Fix text sizes in settings-view.tsx

**Files:**
- Modify: `frontend/components/settings-view.tsx`

- [ ] **Step 1: Fix text sizes**

- Line 129: `text-[10px]` model description → `text-xs` (readable form description)
- Line 157: `text-[9px]` "API Default" badge → keep `text-[10px]` (metadata)
- Line 160: `text-[9px]` camera icon → keep `text-[10px]` (metadata icon)
- Line 177: `text-[9px]` "API Default" badge → keep `text-[10px]` (metadata)
- Line 180: `text-[9px]` camera icon → keep `text-[10px]` (metadata icon)
- Line 197: `text-[9px]` "API Default" badge → keep `text-[10px]` (metadata)
- Line 208: `text-[10px]` "Currently set to:" → `text-xs` (readable content)
- Line 221: `text-[10px]` workspace description → `text-xs` (readable form description)
- Line 249: `text-[10px]` "Unsaved changes" → `text-xs` (readable status message)

- [ ] **Step 2: Commit**

```bash
git add frontend/components/settings-view.tsx
git commit -m "fix(a11y): improve text sizes in settings-view"
```

### Task 12: Fix text sizes in app-sidebar.tsx

**Files:**
- Modify: `frontend/components/app-sidebar.tsx`

- [ ] **Step 1: Fix text sizes**

- Line 386: `text-[9px]` "Open" label → keep `text-[10px]` (metadata status indicator)
- Line 468: `text-[10px]` user tier info → `text-xs` (readable account info)
- Line 572: `text-[10px]` headless description → `text-xs` (readable helper text)
- Line 637: `text-[10px]` dialog description → `text-xs` (readable text)
- Line 651: `text-[10px]` dialog description → `text-xs` (readable text)

- [ ] **Step 2: Commit**

```bash
git add frontend/components/app-sidebar.tsx
git commit -m "fix(a11y): improve text sizes in app-sidebar"
```

### Task 13: Fix text sizes and aria-labels in agent-logs-view.tsx and source-control-view.tsx

**Files:**
- Modify: `frontend/components/agent-logs-view.tsx`
- Modify: `frontend/components/source-control-view.tsx`

- [ ] **Step 1: Fix agent-logs-view.tsx text sizes**

Monospace metadata (keep at `text-[10px]}`, upgrade from `text-[9px]`):
- Lines 204, 206, 208: `text-[9px]` conversation IDs, step indices, timestamps → `text-[10px]`
- Lines 361, 376, 385, 413: `text-[9px]` WS status, event count, auto-scroll, filter pills → `text-[10px]`

Readable content (upgrade to `text-xs`):
- Line 440: `text-[10px]` "Events appear here..." → `text-xs`

- [ ] **Step 2: Add aria-label to auto-scroll toggle (line 382-393)**

```tsx
<button ... aria-label="Toggle auto-scroll">
```

- [ ] **Step 3: Fix source-control-view.tsx text sizes**

Monospace metadata (keep at `text-[10px]`, upgrade from `text-[9px]`):
- Lines 579, 658, 667, 670: `text-[9px]` file count, dir path, +N/-N counts → `text-[10px]`

All `text-[10px]` usages in source-control are monospace metadata — keep as-is.

- [ ] **Step 4: Add aria-labels to source-control icon buttons**

Lines 356-361, 364-370, 596, 600-606 — Refresh and Close buttons:

```tsx
<Button ... aria-label="Refresh">
<Button ... aria-label="Close panel">
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/agent-logs-view.tsx frontend/components/source-control-view.tsx
git commit -m "fix(a11y): text sizes and aria-labels in logs and source control"
```

---

## Chunk 4: Spacing Consistency

### Task 14: Normalize spacing in chat-area.tsx

**Files:**
- Modify: `frontend/components/chat-area.tsx`

- [ ] **Step 1: Fix off-grid spacing**

- Line 83: `gap-2.5` → `gap-2` (user message header)
- Line 88: `gap-1.5` → `gap-1` (copy/bookmark controls — tight inline group)
- Line 118: `gap-2.5` → `gap-2` (agent response header)
- Line 123: `gap-1.5` → `gap-1` (copy/bookmark controls)
- Line 162: `gap-2.5` → `gap-2` (processing group button)
- Line 204: `gap-1.5` → `gap-1` (scroll controls)

- [ ] **Step 2: Fix border opacity**

- Line 164: `border-border/30` → `border-border/50`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat-area.tsx
git commit -m "fix(ui): normalize spacing and border opacity in chat-area"
```

### Task 15: Normalize spacing in chat-view.tsx

**Files:**
- Modify: `frontend/components/chat-view.tsx`

- [ ] **Step 1: Fix off-grid spacing**

- Line 530: `gap-1.5` → `gap-2` (pickers row)
- Line 534: `gap-1.5` → `gap-1` (model picker button — tight inline)
- Line 552: `gap-1.5` → `gap-1` (model quota bar)
- Line 565: `gap-1.5` → `gap-2` (status indicator)
- Line 587: `gap-1.5` → `gap-1` (settings button)

- [ ] **Step 2: Fix border opacity**

- Line 667: `border-border/30` → `border-border/50`
- Line 670: `border-border/30` → `border-border/50`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat-view.tsx
git commit -m "fix(ui): normalize spacing and border opacity in chat-view"
```

### Task 16: Normalize spacing in app-sidebar.tsx and settings-view.tsx

**Files:**
- Modify: `frontend/components/app-sidebar.tsx`
- Modify: `frontend/components/settings-view.tsx`

- [ ] **Step 1: Fix app-sidebar.tsx spacing**

- Line 405: `gap-1.5` → `gap-1` (button icon-text gap)
- Line 630: `gap-2.5` → `gap-2` (dialog button)
- Line 632: `p-2.5` → `p-2` (icon container padding)
- Line 644: `gap-2.5` → `gap-2` (dialog button)
- Line 646: `p-2.5` → `p-2` (icon container padding)

- [ ] **Step 2: Fix settings-view.tsx spacing**

- Line 121: `gap-1.5` → `gap-1` (header icon-text gap)
- Line 140: `gap-1.5` → `gap-1` (select item icon gap)

- [ ] **Step 3: Commit**

```bash
git add frontend/components/app-sidebar.tsx frontend/components/settings-view.tsx
git commit -m "fix(ui): normalize spacing in sidebar and settings"
```

### Task 17: Final visual verification

- [ ] **Step 1: Build to check for errors**

```bash
cd frontend && npx next build
```

Expected: No build errors.

- [ ] **Step 2: Visual spot check**

Start dev server and manually verify:
1. Trigger a toast (save settings) — appears bottom-right, green border, auto-dismiss
2. View empty conversation list — centered icon, correct size
3. Check agent logs empty state — ScrollText icon, descriptive text
4. Inspect a few buttons in devtools — aria-labels present
5. Toggle dark/light mode — toasts and empty states respect theme

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(ui): complete UI improvements — toast, empty states, a11y, spacing"
```
