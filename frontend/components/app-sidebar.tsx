"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createWorkspace } from "@/lib/cascade-api"
import type { ResourceSnapshot } from "@/lib/cascade-api"
import { loadConversationIndex, groupByProject } from "@/lib/conversations"
import type { Project, ConvRow } from "@/lib/conversations"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
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
import { Settings, User, Plug, Book, Globe, Moon, Sun, Plus, FolderPlus, EllipsisVertical, Activity, FolderSync, Loader2, GitBranch, Monitor, Workflow, Brain, History, MessageSquare } from "lucide-react"

import { ProjectGroup } from "./sidebar/project-group"
import { SystemResourceSummary } from "./sidebar/system-resource-summary"

interface AppSidebarProps {
    currentConvId: string | null
    conversationsVersion: number
    /** Whether Antigravity Language Server is detected by backend */
    detected: boolean
    onSelectConversation: (convId: string | null, wsName: string) => void
    /** Start a fresh conversation (no project/workspace required). */
    onNewConversation: () => void
    /** A new project folder was created — launch straight into a new chat there. */
    onProjectCreated: (name: string) => void
    /** Start a fresh conversation scoped to an existing project's folder. */
    onNewProjectConversation: (project: Project) => void
    onShowAccountInfo: () => void
    onShowSettings: () => void
    onShowLogs: () => void
    onShowSourceControl: () => void
    onShowResources: () => void
    onShowMcp: () => void
    onShowWorkflows: () => void
    onShowMemories: () => void
    onShowRepoInfo: () => void
    /** Open the full Conversation History view, optionally filtered to a project. */
    onShowHistory: (projectId?: string | null) => void
    onGoHome: () => void
    workspaceResources?: ResourceSnapshot | null
    /** Called after a conversation is deleted, with the deleted conv ID */
    onConvDeleted?: (convId: string) => void
}

const LOOSE_LIMIT = 8

export function AppSidebar({
    currentConvId,
    conversationsVersion,
    detected,
    onSelectConversation,
    onNewConversation,
    onProjectCreated,
    onNewProjectConversation,
    onShowAccountInfo,
    onShowSettings,
    onShowLogs,
    onShowSourceControl,
    onShowResources,
    onShowMcp,
    onShowWorkflows,
    onShowMemories,
    onShowRepoInfo,
    onShowHistory,
    onGoHome,
    workspaceResources,
    onConvDeleted,
}: AppSidebarProps) {
    const { isDark, toggle: toggleTheme } = useTheme()
    const { isMobile } = useSidebar()

    const [projects, setProjects] = useState<Project[]>([])
    const [byProject, setByProject] = useState<Map<string, ConvRow[]>>(new Map())
    const [loose, setLoose] = useState<ConvRow[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({})

    const [newName, setNewName] = useState("")
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState("")
    const [showCreateDialog, setShowCreateDialog] = useState(false)

    // User profile state
    const [userProfile, setUserProfile] = useState<{ name: string; tier: string; avatar: string | null } | null>(null)

    const hasLoadedRef = useRef(false)
    const didInitExpandRef = useRef(false)

    const nameValidationError = useMemo(() => {
        const trimmed = newName.trim()
        if (!trimmed) return ""
        if (/[/\\:*?"<>|]/.test(trimmed)) return "Invalid characters in name"
        if (trimmed.length > 100) return "Name too long (max 100)"
        const lower = trimmed.toLowerCase()
        if (projects.some((p) => p.name.toLowerCase() === lower))
            return "Project already exists"
        return ""
    }, [newName, projects])

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
            const attempts = [5000, 8000, 12000];
            attempts.forEach(delay => setTimeout(() => fetchUserProfile(), delay));
        }
        window.addEventListener('profile-swapped', handler)
        return () => window.removeEventListener('profile-swapped', handler)
    }, [fetchUserProfile])

    const loadIndex = useCallback(async () => {
        try {
            const { projects: projs, rows } = await loadConversationIndex()
            const { byProject: bp, loose: lo } = groupByProject(rows)
            setProjects(projs)
            setByProject(bp)
            setLoose(lo)
            // Expand the first project once, the first time we get data (AG IDE behaviour).
            if (!didInitExpandRef.current && projs.length > 0) {
                didInitExpandRef.current = true
                setExpandedMap({ [projs[0].id]: true })
            }
        } catch {
            // keep previous state on transient failures
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!hasLoadedRef.current) {
            hasLoadedRef.current = true
            loadIndex()
        }
    }, [loadIndex])

    // Refresh when backend broadcasts conversations_updated via WS
    useEffect(() => {
        if (conversationsVersion > 0) loadIndex()
    }, [conversationsVersion, loadIndex])

    const toggleProject = useCallback((projectId: string) => {
        setExpandedMap((prev) => ({ ...prev, [projectId]: !prev[projectId] }))
    }, [])

    const handleConvDeleted = useCallback(
        (convId: string) => {
            // Optimistically drop from both buckets, then re-fetch for consistency.
            setByProject((prev) => {
                const next = new Map(prev)
                for (const [pid, list] of next) {
                    if (list.some((c) => c.id === convId)) {
                        next.set(pid, list.filter((c) => c.id !== convId))
                    }
                }
                return next
            })
            setLoose((prev) => prev.filter((c) => c.id !== convId))
            onConvDeleted?.(convId)
            loadIndex()
        },
        [loadIndex, onConvDeleted]
    )

    const handleCreateProject = useCallback(async () => {
        const name = newName.trim()
        if (!name || creating || nameValidationError) return
        setCreating(true)
        setCreateError("")
        try {
            const res = await createWorkspace(name, true)
            const createdName = res.workspace?.workspaceName || name
            setNewName("")
            setShowCreateDialog(false)
            await loadIndex()
            onProjectCreated(createdName)
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to create project"
            setCreateError(msg)
        } finally {
            setCreating(false)
        }
    }, [newName, creating, nameValidationError, loadIndex, onProjectCreated])

    // Build the ordered project list with their conversations + total counts.
    const projectRows = useMemo(
        () => projects.map((p) => ({
            project: p,
            conversations: byProject.get(p.id) || [],
            total: p.conversationCount || (byProject.get(p.id) || []).length,
        })),
        [projects, byProject]
    )

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

                    {/* Top actions: New Conversation + Conversation History */}
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <div className="px-2 pb-1">
                                <Button
                                    size="sm"
                                    onClick={onNewConversation}
                                    className="w-full h-8 text-xs gap-1.5 justify-start"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    New Conversation
                                </Button>
                            </div>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={() => onShowHistory(null)} tooltip="Conversation History" className="text-xs">
                                        <History className="shrink-0" />
                                        <span>Conversation History</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarSeparator className="mx-0" />

                    {/* Projects */}
                    <SidebarGroup>
                        <SidebarGroupLabel>Projects</SidebarGroupLabel>
                        <SidebarGroupAction title="New Project" onClick={() => setShowCreateDialog(true)}>
                            <Plus /> <span className="sr-only">New Project</span>
                        </SidebarGroupAction>
                        <SidebarGroupContent>
                            {loading && projectRows.length === 0 && (
                                <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>
                            )}
                            {!loading && projectRows.length === 0 && (
                                <div className="px-3 py-3 text-[11px] text-muted-foreground/50 text-center">
                                    No projects yet. Open a folder in Antigravity, or create one with ＋.
                                </div>
                            )}
                            {projectRows.map(({ project, conversations, total }) => (
                                <ProjectGroup
                                    key={project.id}
                                    name={project.name}
                                    totalCount={total}
                                    conversations={conversations}
                                    currentConvId={currentConvId}
                                    expanded={!!expandedMap[project.id]}
                                    onToggle={() => toggleProject(project.id)}
                                    onSelectConv={(convId) => onSelectConversation(convId, project.name)}
                                    onSeeAll={() => onShowHistory(project.id)}
                                    onNewConversation={() => onNewProjectConversation(project)}
                                    onDeleted={handleConvDeleted}
                                />
                            ))}
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {/* Loose conversations (no project) */}
                    {loose.length > 0 && (
                        <>
                            <SidebarSeparator className="mx-0" />
                            <SidebarGroup>
                                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                                <SidebarGroupContent>
                                    <SidebarMenu>
                                        {loose.slice(0, LOOSE_LIMIT).map((conv) => (
                                            <SidebarMenuItem key={conv.id}>
                                                <SidebarMenuButton
                                                    isActive={conv.id === currentConvId}
                                                    onClick={() => onSelectConversation(conv.id, conv.projectName || 'unknown')}
                                                    tooltip={conv.title}
                                                    className="text-xs"
                                                >
                                                    <MessageSquare className="shrink-0" />
                                                    <span className="truncate min-w-0">{conv.title}</span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                        {loose.length > LOOSE_LIMIT && (
                                            <SidebarMenuItem>
                                                <SidebarMenuButton
                                                    onClick={() => onShowHistory(null)}
                                                    className="text-sidebar-foreground/50 text-[10px]"
                                                >
                                                    See all ({loose.length})
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        )}
                                    </SidebarMenu>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        </>
                    )}

                    {/* Tools (kept Deck features) */}
                    <SidebarSeparator className="mx-0" />
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowMcp} tooltip="MCP Servers" className="text-xs">
                                        <Plug className="shrink-0" />
                                        <span>MCP Servers</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowWorkflows} tooltip="Workflows" className="text-xs">
                                        <Workflow className="shrink-0" />
                                        <span>Workflows</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowMemories} tooltip="Memories" className="text-xs">
                                        <Brain className="shrink-0" />
                                        <span>Memories</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton onClick={onShowRepoInfo} tooltip="Repo Info" className="text-xs">
                                        <GitBranch className="shrink-0" />
                                        <span>Repo Info</span>
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
            </Sidebar>

            <Dialog open={showCreateDialog} onOpenChange={(open) => {
                setShowCreateDialog(open)
                if (!open) { setNewName(""); setCreateError("") }
            }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderPlus className="h-5 w-5" />
                            New Project
                        </DialogTitle>
                        <DialogDescription>
                            Create a new project folder and jump straight into a conversation.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2.5">
                            <label className="text-xs font-medium text-muted-foreground">Project Name</label>
                            <Input
                                value={newName}
                                onChange={(e) => { setNewName(e.target.value); setCreateError("") }}
                                onKeyDown={(e) => e.key === "Enter" && !nameValidationError && handleCreateProject()}
                                placeholder="my-awesome-project"
                                className={cn(nameValidationError && newName.trim() && "border-destructive focus-visible:ring-destructive")}
                                disabled={creating}
                                autoFocus
                            />
                            {(nameValidationError || createError) && newName.trim() && (
                                <p className="text-xs text-destructive">{nameValidationError || createError}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Creates a folder in your workspace root directory, opens it, and starts a new chat.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowCreateDialog(false); setNewName(""); setCreateError("") }}
                            disabled={creating}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={async () => { await handleCreateProject() }}
                            disabled={creating || !newName.trim() || !!nameValidationError}
                        >
                            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                            Create Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
