"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { getWorkspaces, createWorkspace, createHeadlessWorkspace, getWorkspaceFolders } from "@/lib/cascade-api"
import type { Workspace, WorkspaceFolder, WorkspaceResources, ResourceSnapshot } from "@/lib/cascade-api"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
import { PluginManager } from "./plugin-manager"
import { API_BASE } from "@/lib/config"
import { authHeaders } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, User, Plug, Book, Globe, Moon, Sun, Plus, FolderOpen, FolderPlus, EllipsisVertical, Activity, Bot, FolderSync, Loader2, Circle, GitBranch, Terminal, Monitor, Cable, Workflow } from "lucide-react"

import { WorkspaceGroup } from "./sidebar/workspace-group"
import type { ConvSummary, WorkspaceData } from "./sidebar/workspace-group"
import { SystemResourceSummary } from "./sidebar/system-resource-summary"

interface AppSidebarProps {
    currentConvId: string | null
    conversationsVersion: number
    /** Whether Antigravity Language Server is detected by backend */
    detected: boolean
    onSelectConversation: (convId: string | null, wsName: string) => void
    onSelectWorkspace: (wsName: string) => void
    onShowAccountInfo: () => void
    onShowSettings: () => void
    onShowLogs: () => void
    onShowAgentHub: () => void
    onShowOrchestrator: () => void
    onShowConnect: () => void
    onShowSourceControl: () => void
    onShowResources: () => void
    onGoHome: () => void
    activeWorkspace: string | null
    workspaceResources?: ResourceSnapshot | null
    wsVersion?: number
    onWorkspaceCreated?: () => void
    /** Called after a conversation is successfully deleted, with the deleted conv ID */
    onConvDeleted?: (convId: string, wsName: string) => void
}

export function AppSidebar({
    currentConvId,
    conversationsVersion,
    detected,
    onSelectConversation,
    onSelectWorkspace,
    onShowAccountInfo,
    onShowSettings,
    onShowLogs,
    onShowAgentHub,
    onShowOrchestrator,
    onShowConnect,
    onShowSourceControl,
    onShowResources,
    onGoHome,
    activeWorkspace,
    workspaceResources,
    wsVersion,
    onWorkspaceCreated,
    onConvDeleted,
}: AppSidebarProps) {
    const { isDark, toggle: toggleTheme } = useTheme()
    const { isMobile } = useSidebar()

    const [wsData, setWsData] = useState<WorkspaceData[]>([])
    const [folders, setFolders] = useState<WorkspaceFolder[]>([])
    const [loading, setLoading] = useState(true)
    const [openingFolder, setOpeningFolder] = useState<string | null>(null)
    const [newWsName, setNewWsName] = useState("")
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState("")
    const [showPlugins, setShowPlugins] = useState(false)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showAllMap, setShowAllMap] = useState<Record<string, boolean>>({})
    const [headlessMode, setHeadlessMode] = useState(false)
    const [selectedFolder, setSelectedFolder] = useState<WorkspaceFolder | null>(null)

    // User profile state
    const [userProfile, setUserProfile] = useState<{ name: string; tier: string; avatar: string | null } | null>(null)

    const hasLoadedRef = useRef(false)

    const nameValidationError = useMemo(() => {
        const trimmed = newWsName.trim()
        if (!trimmed) return ""
        if (/[/\\:*?"<>|]/.test(trimmed)) return "Invalid characters in name"
        if (trimmed.length > 100) return "Name too long (max 100)"
        const lower = trimmed.toLowerCase()
        if (wsData.some((d) => d.workspace.workspaceName.toLowerCase() === lower))
            return "Workspace already active"
        if (folders.some((f) => f.name.toLowerCase() === lower))
            return "Folder already exists — open it from Available Workspaces"
        return ""
    }, [newWsName, wsData, folders])

    // Fetch user profile on mount and when connection is established
    const fetchUserProfile = useCallback(() => {
        if (!detected) {
            setUserProfile(null)
            return
        }
        fetch(`${API_BASE}/api/user/profile`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const u = d.user
                if (!u) return
                setUserProfile({
                    name: u.name || 'User',
                    tier: u.userTier?.name || u.planStatus?.planInfo?.planName || '',
                    avatar: d.profilePicture || null,
                })
            })
            .catch(() => { })
    }, [detected])

    useEffect(() => {
        fetchUserProfile()
    }, [fetchUserProfile])

    // Re-fetch profile when profile swap happens
    useEffect(() => {
        const handler = () => {
            // Retry a few times — IDE takes ~5-10s to restart
            const attempts = [5000, 8000, 12000];
            attempts.forEach(delay => setTimeout(() => fetchUserProfile(), delay));
        }
        window.addEventListener('profile-swapped', handler)
        return () => window.removeEventListener('profile-swapped', handler)
    }, [fetchUserProfile])

    const loadAll = useCallback(async () => {
        try {
            const wss = await getWorkspaces()

            // Fetch conversations for all workspaces in parallel
            const conversationsData = await Promise.all(
                wss.map(async (ws) => {
                    try {
                        const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(ws.workspaceName)}/conversations`, { headers: authHeaders() })
                        if (!res.ok) return [] as ConvSummary[]
                        const data = await res.json()
                        // API returns { trajectorySummaries: { [id]: info, ... } } — not an array
                        const summaries = data.trajectorySummaries || {}
                        return Object.entries(summaries).map(([id, info]: [string, any]) => ({
                            id,
                            summary: info.summary || 'Untitled',
                            stepCount: info.stepCount ?? 0,
                            lastModifiedTime: info.lastModifiedTime ?? '',
                        })).sort((a, b) => (b.lastModifiedTime).localeCompare(a.lastModifiedTime)) as ConvSummary[]
                    } catch {
                        return [] as ConvSummary[]
                    }
                })
            )

            // Build a map keyed by workspace name
            const convMap = new Map<string, ConvSummary[]>()
            wss.forEach((ws, i) => convMap.set(ws.workspaceName, conversationsData[i] || []))

            setWsData((prev) => {
                // Build a map of previous expanded state keyed by workspace index
                const prevExpandedMap = new Map<string, boolean>(prev.map((d) => [d.workspace.workspaceName, d.expanded]))
                return wss.map((ws) => ({
                    workspace: ws,
                    conversations: convMap.get(ws.workspaceName) || [],
                    // Preserve user's manual expand/collapse; first workspace defaults to expanded
                    expanded: prevExpandedMap.has(ws.workspaceName) ? prevExpandedMap.get(ws.workspaceName)! : false,
                    loading: false,
                }))
            })

            try {
                const { folders: f } = await getWorkspaceFolders()
                setFolders(f)
            } catch { }
        } catch {
            setLoading(false)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!hasLoadedRef.current) {
            hasLoadedRef.current = true
            loadAll()
        }
    }, [loadAll])

    useEffect(() => {
        if (wsVersion && wsVersion > 0) loadAll()
    }, [wsVersion, loadAll])

    // Refresh workspace list when backend broadcasts conversations_updated or status change via WS
    useEffect(() => {
        if (conversationsVersion > 0) loadAll()
    }, [conversationsVersion, loadAll])

    // TODO: Temporarily disabled 30s polling — workspace updates now driven by WS events
    // (conversationsVersion from useWebSocket). Re-enable if WS proves unreliable.
    // useEffect(() => {
    //     let interval: ReturnType<typeof setInterval> | null = null
    //     const start = () => {
    //         if (!interval) interval = setInterval(loadAll, 30000)
    //     }
    //     const stop = () => {
    //         if (interval) {
    //             clearInterval(interval)
    //             interval = null
    //         }
    //     }
    //     const onVisibility = () => (document.hidden ? stop() : start())
    //
    //     start()
    //     document.addEventListener("visibilitychange", onVisibility)
    //     return () => {
    //         stop()
    //         document.removeEventListener("visibilitychange", onVisibility)
    //     }
    // }, [loadAll])

    const handleWorkspaceClick = useCallback(
        (arrayIdx: number) => {
            const wd = wsData[arrayIdx]
            if (!wd) return
            // Always expand when selecting; only collapse if already expanded (toggle)
            setWsData((prev) => prev.map((d, i) => {
                if (i !== arrayIdx) return d
                // If clicking the already-expanded workspace, collapse it; otherwise always expand
                return { ...d, expanded: !d.expanded }
            }))
            onSelectWorkspace(wd.workspace.workspaceName)
        },
        [wsData, onSelectWorkspace]
    )

    const handleSelectConv = useCallback(
        async (convId: string, arrayIdx: number) => {
            const wd = wsData[arrayIdx]
            if (!wd) return
            onSelectConversation(convId, wd.workspace.workspaceName)
        },
        [wsData, onSelectConversation]
    )

    // Called by WorkspaceGroup after a conversation is successfully deleted.
    // Optimistically removes the conv from local state so the UI updates instantly,
    // then re-fetches from the server to stay in sync.
    const handleConvDeleted = useCallback(
        (convId: string, wsName: string) => {
            setWsData((prev) =>
                prev.map((wd) => {
                    // Only touch the workspace that owned this conversation —
                    // all others return the same reference (no re-render).
                    if (wd.workspace.workspaceName !== wsName) return wd
                    return {
                        ...wd,
                        conversations: wd.conversations.filter((c) => c.id !== convId),
                    }
                })
            )
            // Notify page.tsx so ConversationList (Recent/Pinned panel) also refreshes
            onConvDeleted?.(convId, wsName)
            // Re-fetch in the background to ensure full consistency
            loadAll()
        },
        [loadAll, onConvDeleted]
    )

    const handleCreateByName = useCallback(async () => {
        const name = newWsName.trim()
        if (!name || creating || nameValidationError) return
        setCreating(true)
        setCreateError("")
        try {
            if (headlessMode) {
                await createHeadlessWorkspace(name, true)
            } else {
                await createWorkspace(name, true)
            }
            setNewWsName("")
            await loadAll()
            onWorkspaceCreated?.()
            setShowCreateDialog(false)
            setHeadlessMode(false)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to create workspace"
            setCreateError(msg)
        } finally {
            setCreating(false)
        }
    }, [newWsName, creating, nameValidationError, headlessMode, loadAll, onWorkspaceCreated])

    const handleOpenFolder = useCallback(
        async (folder: WorkspaceFolder) => {
            if (folder.open || openingFolder === folder.name) return
            setOpeningFolder(folder.name)
            try {
                await createWorkspace(folder.path)
                await loadAll()
                onWorkspaceCreated?.()
            } catch (e) {
                console.error("Open failed:", e)
            } finally {
                setOpeningFolder(null)
            }
        },
        [openingFolder, loadAll, onWorkspaceCreated]
    )

    const handleOpenFolderHeadless = useCallback(
        async (folder: WorkspaceFolder) => {
            if (openingFolder === folder.name) return
            setOpeningFolder(folder.name)
            try {
                await createHeadlessWorkspace(folder.path)
                await loadAll()
                onWorkspaceCreated?.()
            } catch (e) {
                console.error("Open headless failed:", e)
            } finally {
                setOpeningFolder(null)
            }
        },
        [openingFolder, loadAll, onWorkspaceCreated]
    )

    const regularWs = wsData.filter((d) => d.workspace.category !== "playground")
    const playgroundWs = wsData.filter((d) => d.workspace.category === "playground")

    const activeWsNames = new Set(wsData.map((d) => d.workspace.workspaceName.toLowerCase()))
    const closedFolders = folders.filter((f) => !f.open && !activeWsNames.has(f.name.toLowerCase()))

    return (
        <>
            <Sidebar variant="inset">
                <SidebarHeader>
                    <button
                        onClick={onGoHome}
                        className="flex items-center gap-2 px-4 py-2 mt-2 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <FolderSync className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-lg tracking-tight">Antigravity Deck</span>
                    </button>
                </SidebarHeader>

                {/* System Resource Summary — compact CPU/RAM bars */}
                <div className="px-3 pb-1">
                    <SystemResourceSummary
                        system={workspaceResources?.system}
                        onClick={onShowResources}
                    />
                </div>

                <SidebarContent>
                    <SidebarSeparator className="mx-0" />
                    <SidebarGroup>
                        <SidebarGroupLabel>Active Workspaces</SidebarGroupLabel>
                        <SidebarGroupContent>
                            {loading && <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>}
                            {regularWs.map((wd) => {
                                const arrayIdx = wsData.indexOf(wd)
                                return (
                                    <WorkspaceGroup
                                        key={wd.workspace.workspaceName}
                                        data={wd}
                                        arrayIdx={arrayIdx}
                                        showAll={!!showAllMap[arrayIdx]}
                                        currentConvId={currentConvId}
                                        resources={workspaceResources?.workspaces?.[wd.workspace.pid]}
                                        onToggleExpand={() => handleWorkspaceClick(arrayIdx)}
                                        onSelectConv={(convId) => handleSelectConv(convId, arrayIdx)}
                                        onToggleShowAll={() => setShowAllMap((prev) => ({ ...prev, [arrayIdx]: true }))}
                                        onDeleted={handleConvDeleted}
                                    />
                                )
                            })}
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {closedFolders.length > 0 && (
                        <>
                            <SidebarSeparator className="mx-0" />
                            <SidebarGroup>
                                <SidebarGroupLabel>Available Workspaces</SidebarGroupLabel>
                                <SidebarGroupContent>
                                    <SidebarMenu>
                                        {closedFolders.map((folder) => (
                                            <SidebarMenuItem key={folder.name}>
                                                <SidebarMenuButton
                                                    onClick={() => setSelectedFolder(folder)}
                                                    disabled={openingFolder === folder.name}
                                                    tooltip={folder.name}
                                                    className="text-xs !pr-2"
                                                >
                                                    <FolderOpen className="shrink-0" />
                                                    <span className="flex-1 truncate min-w-0">{folder.name}</span>
                                                    <span className="ml-auto opacity-0 group-hover/menu-item:opacity-100 text-[9px] text-muted-foreground/50 transition-opacity shrink-0">
                                                        {openingFolder === folder.name ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Open'}
                                                    </span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </SidebarMenu>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        </>
                    )}

                    <SidebarSeparator className="mx-0" />

                    <div className="px-4 py-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCreateDialog(true)}
                            className="w-full h-8 text-xs gap-1.5"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New Workspace
                        </Button>
                    </div>

                    {playgroundWs.length > 0 && (
                        <>
                            <SidebarSeparator className="mx-0" />
                            <SidebarGroup>
                                <SidebarGroupLabel className="flex items-center justify-between">
                                    <span>Playground</span>
                                    <Circle className="h-3 w-3 text-muted-foreground/30" />
                                </SidebarGroupLabel>
                                <SidebarGroupContent>
                                    {playgroundWs.map((wd) => {
                                        const arrayIdx = wsData.indexOf(wd)
                                        return (
                                            <WorkspaceGroup
                                                key={wd.workspace.workspaceName}
                                                data={wd}
                                                arrayIdx={arrayIdx}
                                                showAll={!!showAllMap[arrayIdx]}
                                                currentConvId={currentConvId}
                                                showActiveIndicator={false}
                                                resources={workspaceResources?.workspaces?.[wd.workspace.pid]}
                                                onToggleExpand={() => handleWorkspaceClick(arrayIdx)}
                                                onSelectConv={(convId) => handleSelectConv(convId, arrayIdx)}
                                                onToggleShowAll={() => setShowAllMap((prev) => ({ ...prev, [arrayIdx]: true }))}
                                                onDeleted={handleConvDeleted}
                                            />
                                        )
                                    })}
                                </SidebarGroupContent>
                            </SidebarGroup>
                        </>
                    )}
                    <SidebarSeparator className="mx-0" />
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowAgentHub} tooltip="Agent Hub" className="text-xs">
                                        <Bot className="shrink-0" />
                                        <span>Agent Hub</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                {/* Orchestrator hidden while chat-first redesign is in progress
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowOrchestrator} tooltip="Orchestrator" className="text-xs">
                                        <Workflow className="shrink-0" />
                                        <span>Orchestrator</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                */}
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowConnect} tooltip="Connect" className="text-xs">
                                        <Cable className="shrink-0" />
                                        <span>Connect</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <SidebarMenuButton
                                        size="lg"
                                        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                    >
                                        <Avatar className="h-8 w-8 rounded-lg">
                                            {userProfile?.avatar && (
                                                <AvatarImage src={`data:image/png;base64,${userProfile.avatar}`} alt={userProfile.name} />
                                            )}
                                            <AvatarFallback className={cn(
                                                "rounded-lg text-xs font-semibold",
                                                detected ? "bg-indigo-500/20 text-indigo-400" : "bg-muted text-muted-foreground"
                                            )}>
                                                {userProfile?.name?.[0]?.toUpperCase() ?? (detected ? '?' : '—')}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-medium text-xs">
                                                {userProfile?.name ?? (detected ? 'Loading...' : 'Not Connected')}
                                            </span>
                                            <span className="truncate text-[10px] text-sidebar-foreground/60">
                                                {userProfile?.tier ?? (detected ? '' : 'Open Antigravity IDE')}
                                            </span>
                                        </div>
                                        <EllipsisVertical className="ml-auto size-4" />
                                    </SidebarMenuButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    side={isMobile ? "bottom" : "right"}
                                    align="end"
                                    sideOffset={4}
                                    className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                                >
                                    <DropdownMenuItem onClick={onShowAccountInfo}>
                                        <User className="mr-2 h-4 w-4" />
                                        <span>Account & Plan</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onShowLogs}>
                                        <Activity className="mr-2 h-4 w-4" />
                                        <span>Live Logs</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onShowSourceControl}>
                                        <GitBranch className="mr-2 h-4 w-4" />
                                        <span>Source Control</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onShowResources}>
                                        <Monitor className="mr-2 h-4 w-4" />
                                        <span>Resources</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={toggleTheme}>
                                        {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                                        <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setShowPlugins(true)}>
                                        <Plug className="mr-2 h-4 w-4" />
                                        <span>Plugins</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>
                                        <Book className="mr-2 h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Knowledge (Coming Soon)</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>
                                        <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Browser (Coming Soon)</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onShowSettings}>
                                        <Settings className="mr-2 h-4 w-4" />
                                        <span>App Settings</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>

                <PluginManager open={showPlugins} onClose={() => setShowPlugins(false)} />
            </Sidebar>

            <Dialog open={showCreateDialog} onOpenChange={(open) => {
                setShowCreateDialog(open)
                if (!open) { setNewWsName(""); setCreateError(""); setHeadlessMode(false) }
            }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderPlus className="h-5 w-5" />
                            New Workspace
                        </DialogTitle>
                        <DialogDescription>
                            Create a new workspace to start coding with Antigravity.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2.5">
                            <label className="text-xs font-medium text-muted-foreground">Workspace Name</label>
                            <Input
                                value={newWsName}
                                onChange={(e) => { setNewWsName(e.target.value); setCreateError("") }}
                                onKeyDown={(e) => e.key === "Enter" && !nameValidationError && handleCreateByName()}
                                placeholder="my-awesome-project"
                                className={cn(nameValidationError && newWsName.trim() && "border-destructive focus-visible:ring-destructive")}
                                disabled={creating}
                                autoFocus
                            />
                            {(nameValidationError || createError) && newWsName.trim() && (
                                <p className="text-xs text-destructive">{nameValidationError || createError}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                This will create a folder in your workspace root directory.
                            </p>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                            <div className="flex items-center gap-2">
                                <Terminal className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <p className="text-xs font-medium">Headless Mode</p>
                                    <p className="text-[10px] text-muted-foreground">No IDE UI — requires running IDE for auth</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={headlessMode}
                                onClick={() => setHeadlessMode(!headlessMode)}
                                className={cn(
                                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                                    headlessMode ? "bg-primary" : "bg-muted"
                                )}
                            >
                                <span className={cn(
                                    "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                                    headlessMode ? "translate-x-4" : "translate-x-0"
                                )} />
                            </button>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowCreateDialog(false); setNewWsName(""); setCreateError("") }}
                            disabled={creating}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={async () => { await handleCreateByName() }}
                            disabled={creating || !newWsName.trim() || !!nameValidationError}
                        >
                            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : headlessMode ? <Terminal className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                            {headlessMode ? 'Create Headless' : 'Create Workspace'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedFolder} onOpenChange={(open) => { if (!open) setSelectedFolder(null) }}>
                <DialogContent className="sm:max-w-[380px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5" />
                            Open Workspace
                        </DialogTitle>
                        <DialogDescription>
                            Choose how to open <span className="font-medium text-foreground">{selectedFolder?.name}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-3 py-2">
                        <button
                            onClick={() => { if (selectedFolder) { handleOpenFolder(selectedFolder); setSelectedFolder(null) } }}
                            disabled={openingFolder === selectedFolder?.name}
                            className="flex flex-col items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 p-4 hover:bg-blue-500/5 hover:border-blue-500/30 transition-all cursor-pointer group"
                        >
                            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                                <FolderOpen className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium">Open with IDE</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Full Antigravity editor</p>
                            </div>
                        </button>

                        <button
                            onClick={() => { if (selectedFolder) { handleOpenFolderHeadless(selectedFolder); setSelectedFolder(null) } }}
                            disabled={openingFolder === selectedFolder?.name}
                            className="flex flex-col items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 p-4 hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all cursor-pointer group"
                        >
                            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/15 transition-colors">
                                <Terminal className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium">Open Headless</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">No IDE UI — agent mode</p>
                            </div>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
