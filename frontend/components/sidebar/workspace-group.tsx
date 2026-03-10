"use client"

import { useState } from 'react'
import { Trash2, ChevronRight, FolderIcon, MessageSquare, Terminal } from 'lucide-react'
import { API_BASE } from '@/lib/config'
import { authHeaders } from '@/lib/auth'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Workspace } from '@/lib/cascade-api'

const SHOW_LIMIT = 4

export interface ConvSummary {
    id: string
    summary: string
    stepCount: number
    lastModifiedTime: string
}

export interface WorkspaceData {
    workspace: Workspace
    conversations: ConvSummary[]
    loading: boolean
    expanded: boolean
}

export function WorkspaceGroup({
    data,
    arrayIdx,
    showAll,
    currentConvId,
    showActiveIndicator = true,
    onToggleExpand,
    onSelectConv,
    onToggleShowAll,
}: {
    data: WorkspaceData
    arrayIdx: number
    showAll: boolean
    currentConvId: string | null
    showActiveIndicator?: boolean
    onToggleExpand: () => void
    onSelectConv: (convId: string) => void
    onToggleShowAll: () => void
}) {
    const [deleteTarget, setDeleteTarget] = useState<ConvSummary | null>(null)

    const visibleConvs = showAll ? data.conversations : data.conversations.slice(0, SHOW_LIMIT)
    const hasMore = !showAll && data.conversations.length > SHOW_LIMIT

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return
        try {
            await fetch(`${API_BASE}/api/cascade/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: authHeaders(),
            })
        } catch (err) {
            console.error('Failed to delete conversation:', err)
        } finally {
            setDeleteTarget(null)
        }
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <Collapsible
                        open={data.expanded}
                        onOpenChange={onToggleExpand}
                        className="group/collapsible"
                    >
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={data.workspace.workspaceName} className="text-xs !pr-2">
                                {data.workspace.headless
                                    ? <Terminal className="shrink-0 text-emerald-500" />
                                    : <FolderIcon className="shrink-0" />}
                                <span className="flex-1 truncate min-w-0">{data.workspace.workspaceName}</span>
                                {data.workspace.headless && (
                                    <span className="shrink-0 text-[8px] font-medium text-emerald-500/70 bg-emerald-500/10 px-1 py-0.5 rounded">HL</span>
                                )}
                                <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center">
                                    <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                </span>
                            </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {data.loading ? (
                                    <>
                                        <SidebarMenuSubItem>
                                            <SidebarMenuSkeleton showIcon />
                                        </SidebarMenuSubItem>
                                        <SidebarMenuSubItem>
                                            <SidebarMenuSkeleton showIcon />
                                        </SidebarMenuSubItem>
                                    </>
                                ) : data.conversations.length === 0 ? (
                                    <SidebarMenuSubItem>
                                        <span className="px-2 py-1 text-[10px] text-sidebar-foreground/40 italic">
                                            No conversations
                                        </span>
                                    </SidebarMenuSubItem>
                                ) : (
                                    <>
                                        {visibleConvs.map(conv => (
                                            <SidebarMenuSubItem key={conv.id} className="group/conv">
                                                <SidebarMenuSubButton
                                                    isActive={conv.id === currentConvId}
                                                    onClick={() => onSelectConv(conv.id)}
                                                    title={`${conv.summary}\n${conv.stepCount} steps · ${conv.id}`}
                                                    className="text-xs peer pr-8"
                                                >
                                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                                    <span className="truncate min-w-0">{conv.summary}</span>
                                                </SidebarMenuSubButton>
                                                <SidebarMenuAction
                                                    className="!top-1/2 !-translate-y-1/2 opacity-100 sm:opacity-0 sm:group-hover/conv:opacity-100 text-sidebar-foreground/30 hover:text-destructive hover:bg-destructive/10"
                                                    title="Delete conversation"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteTarget(conv)
                                                    }}
                                                >
                                                    <Trash2 />
                                                </SidebarMenuAction>
                                            </SidebarMenuSubItem>
                                        ))}
                                        {hasMore && (
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                    onClick={onToggleShowAll}
                                                    className="text-sidebar-foreground/50 text-[10px]"
                                                >
                                                    {data.conversations.length - SHOW_LIMIT} more…
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        )}
                                    </>
                                )}
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </Collapsible>
                </SidebarMenuItem>
            </SidebarMenu>

            {/* Delete confirmation dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete conversation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete &ldquo;{deleteTarget?.summary}&rdquo;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleConfirmDelete}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
