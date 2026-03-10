'use client';

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { WorkflowItem } from '@/lib/cascade-api';
import { cn } from '@/lib/utils';

export interface WorkflowAutocompleteHandle {
    handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface WorkflowAutocompleteProps {
    query: string;
    workflows: WorkflowItem[];
    visible: boolean;
    onSelect: (workflow: WorkflowItem) => void;
    onClose: () => void;
}

export const WorkflowAutocomplete = forwardRef<WorkflowAutocompleteHandle, WorkflowAutocompleteProps>(
    function WorkflowAutocomplete({ query, workflows, visible, onSelect, onClose }, ref) {
        const [selectedIdx, setSelectedIdx] = useState(0);
        const listRef = useRef<HTMLDivElement>(null);

        // Filter workflows by query
        const filtered = query
            ? workflows.filter(w =>
                w.slash.toLowerCase().includes(query.toLowerCase()) ||
                w.label.toLowerCase().includes(query.toLowerCase()) ||
                w.description.toLowerCase().includes(query.toLowerCase())
            )
            : workflows;

        // Reset selection when query changes
        useEffect(() => { setSelectedIdx(0); }, [query]);

        // Scroll selected item into view
        useEffect(() => {
            if (!listRef.current) return;
            const item = listRef.current.children[selectedIdx] as HTMLElement;
            item?.scrollIntoView({ block: 'nearest' });
        }, [selectedIdx]);

        // Expose handleKeyDown to parent via ref
        useImperativeHandle(ref, () => ({
            handleKeyDown(e: React.KeyboardEvent) {
                if (!visible || filtered.length === 0) return false;

                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx(prev => (prev - 1 + filtered.length) % filtered.length);
                    return true;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx(prev => (prev + 1) % filtered.length);
                    return true;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    onSelect(filtered[selectedIdx]);
                    return true;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                    return true;
                }
                return false;
            }
        }), [visible, filtered, selectedIdx, onSelect, onClose]);

        if (!visible || filtered.length === 0) return null;

        return (
            <div
                className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-xl"
                ref={listRef}
            >
                {filtered.map((w, idx) => (
                    <div
                        key={w.slash}
                        className={cn(
                            'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                            idx === selectedIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                        )}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        onMouseDown={(e) => { e.preventDefault(); onSelect(w); }}
                    >
                        <span className="font-mono text-sm font-medium text-primary shrink-0">{w.slash}</span>
                        <span className="text-xs text-muted-foreground truncate">{w.description || w.label}</span>
                        {w.source === 'workspace' && (
                            <span className="ml-auto text-[9px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded shrink-0">ws</span>
                        )}
                    </div>
                ))}
            </div>
        );
    }
);
