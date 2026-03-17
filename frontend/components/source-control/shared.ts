/**
 * Shared constants, types, and utility functions for source-control sub-components.
 */

import type React from 'react';
import {
    File, FileCode2, FileText, FileJson, Settings2,
    Image as ImageIcon, Table2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SourceControlViewProps {
    workspace: string;
    onClose?: () => void;
}

// ─── Status badge constants ──────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
    modified: 'text-amber-400', added: 'text-emerald-400',
    deleted: 'text-red-400', untracked: 'text-sky-400',
    renamed: 'text-violet-400', copied: 'text-cyan-400',
};
export const STATUS_BG: Record<string, string> = {
    modified: 'bg-amber-400/10', added: 'bg-emerald-400/10',
    deleted: 'bg-red-400/10', untracked: 'bg-sky-400/10',
    renamed: 'bg-violet-400/10', copied: 'bg-cyan-400/10',
};
export const STATUS_LABELS: Record<string, string> = {
    modified: 'M', added: 'A', deleted: 'D',
    untracked: 'U', renamed: 'R', copied: 'C',
};

// ─── Language mapping ────────────────────────────────────────────────────────

export const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    mjs: 'javascript', cjs: 'javascript', css: 'css', scss: 'scss',
    json: 'json', jsonc: 'json', html: 'markup', xml: 'markup', svg: 'markup',
    md: 'markdown', mdx: 'markdown', py: 'python', sh: 'bash',
    bash: 'bash', yaml: 'yaml', yml: 'yaml', sql: 'sql',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    cpp: 'cpp', c: 'c', cs: 'csharp', rb: 'ruby', php: 'php',
};
export function extToLang(ext?: string): string { return ext ? (EXT_TO_LANG[ext] ?? 'text') : 'text'; }

// ─── File icon config ────────────────────────────────────────────────────────

export const EXT_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
    ts: { icon: FileCode2, color: '#3178c6' },
    tsx: { icon: FileCode2, color: '#61dafb' },
    js: { icon: FileCode2, color: '#f7df1e' },
    jsx: { icon: FileCode2, color: '#61dafb' },
    mjs: { icon: FileCode2, color: '#f7df1e' },
    cjs: { icon: FileCode2, color: '#f7df1e' },
    json: { icon: FileJson, color: '#f0c040' },
    jsonc: { icon: FileJson, color: '#f0c040' },
    md: { icon: FileText, color: '#84cc16' },
    mdx: { icon: FileText, color: '#84cc16' },
    txt: { icon: FileText, color: '#94a3b8' },
    css: { icon: Settings2, color: '#38bdf8' },
    scss: { icon: Settings2, color: '#f472b6' },
    sass: { icon: Settings2, color: '#f472b6' },
    html: { icon: FileCode2, color: '#f97316' },
    xml: { icon: FileCode2, color: '#f97316' },
    svg: { icon: ImageIcon, color: '#fbbf24' },
    png: { icon: ImageIcon, color: '#a78bfa' },
    jpg: { icon: ImageIcon, color: '#a78bfa' },
    jpeg: { icon: ImageIcon, color: '#a78bfa' },
    gif: { icon: ImageIcon, color: '#a78bfa' },
    webp: { icon: ImageIcon, color: '#a78bfa' },
    csv: { icon: Table2, color: '#34d399' },
    py: { icon: FileCode2, color: '#3b82f6' },
    sh: { icon: FileCode2, color: '#22d3ee' },
    bash: { icon: FileCode2, color: '#22d3ee' },
    yaml: { icon: Settings2, color: '#facc15' },
    yml: { icon: Settings2, color: '#facc15' },
    lock: { icon: Settings2, color: '#6b7280' },
    env: { icon: Settings2, color: '#4ade80' },
};

// ─── Utility functions ───────────────────────────────────────────────────────

export function basename(p: string) { return p.split(/[/\\]/).pop() || p; }
export function dirname(p: string) { const ps = p.split(/[/\\]/); ps.pop(); return ps.join('/'); }

// ─── Skeleton loader ─────────────────────────────────────────────────────────
// (Re-exported as a shared component definition — rendered in file-viewer and diff-panel)
export const SKELETON_WIDTHS = [80, 60, 90, 40, 70, 55, 85, 65];
