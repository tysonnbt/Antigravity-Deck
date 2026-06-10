"use client"

import { useState } from 'react'
import { Trash2, ChevronRight, FolderGit2, MessageSquare, Plus } from 'lucide-react'
import { API_BASE } from '@/lib/config'
import { authHeaders } from '@/lib/auth'
import type { ConvRow } from '@/lib/conversations'
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

const SHOW_LIMIT = 6

interface ProjectGroupProps {
    name: string
    /** Total conversation count for the "See all (N)" affordance. */
    totalCount: number
    conversations: ConvRow[]
    currentConvId: string | null
    expanded: boolean
    onToggle: () => void
    onSelectConv: (convId: string) => void
    /** Open the full History view filtered to this project. */
    onSeeAll: () => void
    /** Start a fresh conversation scoped to this project's folder. */
    onNewConversation: () => void
    onDeleted?: (convId: string) => void
}

export function ProjectGroup({
    name,
    totalCount,
    conversations,
    currentConvId,
    expanded,
    onToggle,
    onSelectConv,
    onSeeAll,
    onNewConversation,
    onDeleted,
}: ProjectGroupProps) {
    const [deleteTarget, setDeleteTarget] = useState<ConvRow | null>(null)

    const visible = conversations.slice(0, SHOW_LIMIT)
    const hasMore = totalCount > visible.length

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return
        const targetId = deleteTarget.id
        setDeleteTarget(null)
        try {
            const res = await fetch(`${API_BASE}/api/cascade/${targetId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            })
            if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
            onDeleted?.(targetId)
        } catch (err) {
            console.error('Failed to delete conversation:', err)
        }
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <Collapsible open={expanded} onOpenChange={onToggle} className="group/collapsible">
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={name} className="text-xs !pr-2">
                                <FolderGit2 className="shrink-0" />
                                <span className="flex-1 truncate min-w-0">{name}</span>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label="New conversation in this project"
                                    title="New conversation in this project"
                                    onClick={(e) => { e.stopPropagation(); onNewConversation(); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onNewConversation(); } }}
                                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </span>
                                <span className="text-[10px] text-sidebar-foreground/40 tabular-nums shrink-0">
                                    {totalCount}
                                </span>
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                    <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                </span>
                            </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                            <SidebarMenuSub>
                                {conversations.length === 0 ? (
                                    <SidebarMenuSubItem>
                                        <span className="px-2 py-1 text-[10px] text-sidebar-foreground/40 italic">
                                            No conversations
                                        </span>
                                    </SidebarMenuSubItem>
                                ) : (
                                    <>
                                        {visible.map(conv => (
                                            <SidebarMenuSubItem key={conv.id} className="group/conv">
                                                <SidebarMenuSubButton
                                                    isActive={conv.id === currentConvId}
                                                    onClick={() => onSelectConv(conv.id)}
                                                    title={`${conv.title}\n${conv.stepCount} steps · ${conv.id}`}
                                                    className="text-xs peer pr-8"
                                                >
                                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                                    <span className="truncate min-w-0">{conv.title}</span>
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
                                                    onClick={onSeeAll}
                                                    className="text-sidebar-foreground/50 text-[10px]"
                                                >
                                                    See all ({totalCount})
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

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete conversation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete &ldquo;{deleteTarget?.title}&rdquo;? This action cannot be undone.
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
