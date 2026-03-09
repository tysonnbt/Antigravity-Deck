"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { getWorkspaces, createWorkspace, getWorkspaceFolders } from "@/lib/cascade-api"
import type { Workspace, WorkspaceFolder } from "@/lib/cascade-api"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
import { PluginManager } from "./plugin-manager"
import { API_BASE } from "@/lib/config"
import { authHeaders } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

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

import { Settings, User, Plug, Book, Globe, Moon, Sun, Plus, FolderOpen, ChevronsUpDown, Activity, Bot, MessageCircle, Loader2, Circle } from "lucide-react"

import { WorkspaceGroup } from "./sidebar/workspace-group"
import type { ConvSummary, WorkspaceData } from "./sidebar/workspace-group"

interface AppSidebarProps {
    currentConvId: string | null
    conversationsVersion: number
    onSelectConversation: (convId: string | null, wsName: string) => void
    onSelectWorkspace: (wsName: string) => void
    onShowAccountInfo: () => void
    onShowSettings: () => void
    onShowLogs: () => void
    onShowBridge: () => void
    activeWorkspace: string | null
    wsVersion?: number
    onWorkspaceCreated?: () => void
}

export function AppSidebar({
    currentConvId,
    conversationsVersion,
    onSelectConversation,
    onSelectWorkspace,
    onShowAccountInfo,
    onShowSettings,
    onShowLogs,
    onShowBridge,
    activeWorkspace,
    wsVersion,
    onWorkspaceCreated,
}: AppSidebarProps) {
    const { isDark, toggle: toggleTheme } = useTheme()
    const { isMobile } = useSidebar()

    const [wsData, setWsData] = useState<WorkspaceData[]>([])
    const [folders, setFolders] = useState<WorkspaceFolder[]>([])
    const [loading, setLoading] = useState(true)
    const [openingFolder, setOpeningFolder] = useState<string | null>(null)
    const [newWsName, setNewWsName] = useState("")
    const [creating, setCreating] = useState(false)
    const [showPlugins, setShowPlugins] = useState(false)
    const [showAllMap, setShowAllMap] = useState<Record<string, boolean>>({})

    // User profile state
    const [userProfile, setUserProfile] = useState<{ name: string; tier: string; avatar: string | null } | null>(null)

    const hasLoadedRef = useRef(false)

    // Fetch user profile once on mount
    useEffect(() => {
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
    }, [])

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

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null
        const start = () => {
            if (!interval) interval = setInterval(loadAll, 30000)
        }
        const stop = () => {
            if (interval) {
                clearInterval(interval)
                interval = null
            }
        }
        const onVisibility = () => (document.hidden ? stop() : start())

        start()
        document.addEventListener("visibilitychange", onVisibility)
        return () => {
            stop()
            document.removeEventListener("visibilitychange", onVisibility)
        }
    }, [loadAll])

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

    const handleCreateByName = useCallback(async () => {
        const name = newWsName.trim()
        if (!name || creating) return
        setCreating(true)
        try {
            await createWorkspace(name, true)
            setNewWsName("")
            await loadAll()
            onWorkspaceCreated?.()
        } catch (e) {
            console.error("Create failed:", e)
        } finally {
            setCreating(false)
        }
    }, [newWsName, creating, loadAll, onWorkspaceCreated])

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

    const regularWs = wsData.filter((d) => d.workspace.category !== "playground")
    const playgroundWs = wsData.filter((d) => d.workspace.category === "playground")

    const activeWsNames = new Set(wsData.map((d) => d.workspace.workspaceName.toLowerCase()))
    const closedFolders = folders.filter((f) => !f.open && !activeWsNames.has(f.name.toLowerCase()))

    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-4 py-2 mt-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-lg tracking-tight">Chat Mirror</span>
                </div>
            </SidebarHeader>

            <SidebarContent>
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
                                    onToggleExpand={() => handleWorkspaceClick(arrayIdx)}
                                    onSelectConv={(convId) => handleSelectConv(convId, arrayIdx)}
                                    onToggleShowAll={() => setShowAllMap((prev) => ({ ...prev, [arrayIdx]: true }))}
                                />
                            )
                        })}
                    </SidebarGroupContent>
                </SidebarGroup>

                {closedFolders.length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel>Available Workspaces</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {closedFolders.map((folder) => (
                                    <SidebarMenuItem key={folder.name}>
                                        <SidebarMenuButton
                                            onClick={() => handleOpenFolder(folder)}
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
                )}

                <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="text"
                            value={newWsName}
                            onChange={(e) => setNewWsName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreateByName()}
                            placeholder="+ New workspace name"
                            className="h-8 text-xs flex-1 min-w-0"
                            disabled={creating}
                        />
                        {newWsName.trim() && (
                            <Button
                                size="sm"
                                onClick={handleCreateByName}
                                disabled={creating}
                                className="h-8 px-3 text-[10px] shrink-0"
                            >
                                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                            </Button>
                        )}
                    </div>
                </div>

                {playgroundWs.length > 0 && (
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
                                        onToggleExpand={() => handleWorkspaceClick(arrayIdx)}
                                        onSelectConv={(convId) => handleSelectConv(convId, arrayIdx)}
                                        onToggleShowAll={() => setShowAllMap((prev) => ({ ...prev, [arrayIdx]: true }))}
                                    />
                                )
                            })}
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
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
                                        <AvatarFallback className="rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-semibold">
                                            {userProfile?.name?.[0]?.toUpperCase() ?? '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium text-xs">{userProfile?.name ?? 'Loading...'}</span>
                                        <span className="truncate text-[10px] text-sidebar-foreground/60">{userProfile?.tier ?? ''}</span>
                                    </div>
                                    <ChevronsUpDown className="ml-auto size-4" />
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
                                <DropdownMenuItem onClick={onShowBridge}>
                                    <Bot className="mr-2 h-4 w-4" />
                                    <span>Agent Bridge</span>
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
    )
}
