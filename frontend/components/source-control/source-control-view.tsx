'use client';
import { useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { GitBranch, FolderOpen, X } from 'lucide-react';
import type { SourceControlViewProps } from './shared';
import { ExplorerTab } from './file-viewer';
import { SourceControlTab } from './file-status-panel';

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabId = 'explorer' | 'source-control';

export const SourceControlView = memo(function SourceControlView({
    workspace, onClose,
}: SourceControlViewProps) {
    const [activeTab, setActiveTab] = useState<TabId>('explorer');

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* Header */}
            <div className="flex items-center gap-1 px-2 pt-1.5 pb-0 border-b border-border/40 bg-background/95 backdrop-blur shrink-0">
                {/* Tab buttons */}
                <button
                    onClick={() => setActiveTab('explorer')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-all -mb-px',
                        activeTab === 'explorer'
                            ? 'text-foreground border-primary bg-background'
                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-muted/20'
                    )}
                >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Explorer</span>
                </button>

                <button
                    onClick={() => setActiveTab('source-control')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-all -mb-px',
                        activeTab === 'source-control'
                            ? 'text-foreground border-primary bg-background'
                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-muted/20'
                    )}
                >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Source Control</span>
                </button>

                <span className="flex-1" />

                {workspace && (
                    <span className="text-[10px] text-muted-foreground/30 truncate max-w-[140px] hidden md:inline pr-1">
                        {workspace}
                    </span>
                )}

                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Body */}
            {activeTab === 'explorer'
                ? <ExplorerTab key={workspace} workspace={workspace} />
                : <SourceControlTab key={workspace} workspace={workspace} />
            }
        </div>
    );
});
SourceControlView.displayName = 'SourceControlView';
