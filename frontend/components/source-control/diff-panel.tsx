'use client';
import dynamic from 'next/dynamic';
import { DiffModeEnum, DiffFile, getLang } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
const DiffView = dynamic(() => import('@git-diff-view/react').then(m => ({ default: m.DiffView })), { ssr: false });
import { GitBranch } from 'lucide-react';
import { CodeViewer, SkeletonLines } from './file-viewer';

// ─── Build DiffFile instance from raw data ───────────────────────────────────

export function buildDiffFile(
    fileName: string,
    oldContent: string,
    newContent: string,
    rawDiff: string,
): DiffFile {
    const lang = getLang(fileName);
    const file = new DiffFile(
        fileName, oldContent,
        fileName, newContent,
        [rawDiff],
        lang, lang,
    );
    file.initTheme('dark');
    file.init();
    file.buildUnifiedDiffLines();
    return file;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiffData {
    diffFile: DiffFile | null;
    oldContent: string;
    newContent: string;
    hasDiff: boolean;
    rawDiff: string;
}

// ─── Diff content area ───────────────────────────────────────────────────────

interface DiffContentProps {
    diffData: DiffData | null;
    diffLoading: boolean;
    diffError: string | null;
    viewMode: 'diff' | 'original' | 'current';
    selectedFile: string;
}

export function DiffContent({
    diffData, diffLoading, diffError, viewMode, selectedFile,
}: DiffContentProps) {
    if (diffLoading) return <SkeletonLines />;

    if (diffError) {
        return (
            <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400/80">
                {diffError}
            </div>
        );
    }

    if (!diffData) return null;

    if (viewMode === 'diff') {
        if (diffData.hasDiff === false || !diffData.diffFile) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/30">
                    <GitBranch className="w-8 h-8" />
                    <p className="text-xs">No changes (untracked file or empty diff)</p>
                </div>
            );
        }
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-auto">
                    {(diffData.diffFile?.unifiedLineLength ?? 0) > 0 ? (
                        <DiffView
                            diffFile={diffData.diffFile!}
                            diffViewMode={DiffModeEnum.Unified}
                            diffViewTheme="dark"
                            diffViewHighlight
                            diffViewFontSize={12}
                        />
                    ) : (
                        <pre className="p-4 text-[10px] font-mono text-foreground/60 whitespace-pre overflow-x-auto leading-relaxed">
                            {diffData.rawDiff}
                        </pre>
                    )}
                </div>
            </div>
        );
    }

    if (viewMode === 'original') {
        return <CodeViewer content={diffData.oldContent} ext={selectedFile.split('.').pop()} />;
    }

    return <CodeViewer content={diffData.newContent} ext={selectedFile.split('.').pop()} />;
}
