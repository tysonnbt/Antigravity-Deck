'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState, useCallback, memo, useEffect, useRef } from 'react';
import { X, FileCode2, ExternalLink, Loader2, Copy, Check } from 'lucide-react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import dynamic from 'next/dynamic';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';

// Lazy-load syntax highlighter (heavy)
const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(m => m.Prism),
    { ssr: false, loading: () => <div className="p-4 text-xs text-muted-foreground/50">Loading…</div> }
);

// ── CCI link parser ──────────────────────────────────────────────────────────
// Format: cci:1://file:///C:/path/to/file.tsx:startLine:startCol-endLine:endCol

interface CciTarget {
    path: string;      // absolute fs path
    startLine: number; // 1-based
    endLine: number;
    ext: string;
}

function parseCciUrl(href: string): CciTarget | null {
    try {
        // cci:1://file:///C:/some/path.tsx:257:0-472:1
        const m = href.match(/^cci:\d+:\/\/file:\/\/\/(.*?)(?::(\d+):(\d+)-(\d+):(\d+))?$/);
        if (!m) return null;
        let path = decodeURIComponent(m[1]);
        // Windows: ensure drive letter casing
        if (/^[a-zA-Z]:/.test(path)) path = path[0].toUpperCase() + path.slice(1);
        const ext = path.split('.').pop()?.toLowerCase() || '';
        return {
            path,
            startLine: m[2] ? parseInt(m[2]) + 1 : 1, // convert 0-based to 1-based
            endLine: m[4] ? parseInt(m[4]) + 1 : 0,
            ext,
        };
    } catch { return null; }
}

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c',
    rb: 'ruby', php: 'php', sh: 'bash', md: 'markdown',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    css: 'css', scss: 'scss', html: 'html', sql: 'sql',
};

// ── File Viewer Modal ─────────────────────────────────────────────────────────

function FileViewerModal({ target, onClose }: { target: CciTarget; onClose: () => void }) {
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setContent(null);
        setError(null);
        fetch(`${API_BASE}/api/file/read`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: target.path }),
        })
            .then(r => r.json())
            .then(d => {
                if (d.content !== undefined) setContent(d.content);
                else setError(d.error || 'Failed to load');
            })
            .catch(e => setError(e.message));
    }, [target.path]);

    // Scroll to target line after render
    useEffect(() => {
        if (content && lineRef.current) {
            setTimeout(() => lineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
        }
    }, [content]);

    const filename = target.path.split(/[/\\]/).pop() || target.path;
    const lang = EXT_TO_LANG[target.ext] || 'text';

    // Highlight only target lines using custom line props
    const lineStart = target.startLine;
    const lineEnd = target.endLine || target.startLine;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative flex flex-col bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
                    <FileCode2 className="w-4 h-4 text-primary/60 shrink-0" />
                    <span className="text-xs font-mono text-foreground/70 truncate flex-1" title={target.path}>
                        {filename}
                        {target.startLine > 0 && (
                            <span className="text-muted-foreground/50 ml-2">
                                :{target.startLine}{target.endLine && target.endLine !== target.startLine ? `–${target.endLine}` : ''}
                            </span>
                        )}
                    </span>
                    <a
                        href={`vscode://file/${target.path}:${target.startLine}`}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
                        title="Open in VS Code"
                        onClick={e => e.stopPropagation()}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto">
                    {!content && !error && (
                        <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground/40">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Loading…</span>
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center justify-center h-32">
                            <span className="text-xs text-red-400/70">{error}</span>
                        </div>
                    )}
                    {content && (
                        <SyntaxHighlighter
                            language={lang}
                            style={vscDarkPlus}
                            showLineNumbers
                            startingLineNumber={1}
                            wrapLines
                            lineProps={(lineNumber: number) => {
                                const isHighlighted = lineNumber >= lineStart && lineNumber <= lineEnd;
                                return {
                                    ref: lineNumber === lineStart ? lineRef : undefined,
                                    style: {
                                        display: 'block',
                                        backgroundColor: isHighlighted ? 'rgba(255,220,100,0.08)' : undefined,
                                        borderLeft: isHighlighted ? '2px solid rgba(255,220,100,0.5)' : '2px solid transparent',
                                    },
                                };
                            }}
                            customStyle={{
                                margin: 0,
                                borderRadius: 0,
                                background: 'transparent',
                                fontSize: '12px',
                                lineHeight: '1.6',
                            }}
                            codeTagProps={{ style: { fontFamily: 'var(--font-mono, monospace)' } }}
                        >
                            {content}
                        </SyntaxHighlighter>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── CCI Link component ────────────────────────────────────────────────────────

function CciLink({ href, children }: { href: string; children: React.ReactNode }) {
    const [target, setTarget] = useState<CciTarget | null>(null);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const parsed = parseCciUrl(href);
        if (parsed) setTarget(parsed);
    }, [href]);

    return (
        <>
            <button
                onClick={handleClick}
                className="inline-flex items-center gap-0.5 text-primary/80 hover:text-primary underline decoration-dotted underline-offset-2 transition-colors cursor-pointer"
                title={`View file: ${href}`}
            >
                <FileCode2 className="w-3 h-3 opacity-60 shrink-0" />
                {children}
            </button>
            {target && <FileViewerModal target={target} onClose={() => setTarget(null)} />}
        </>
    );
}

// ── Remark plugins ────────────────────────────────────────────────────────────

// Hoist plugin arrays to module scope — prevents re-creation on every render
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

// Preprocess markdown: encode cci:// links as safe https:// so react-markdown doesn't strip them
const CCI_VIEWER_BASE = 'https://cci-viewer.internal/';
function preprocessCciLinks(content: string): string {
    return content.replace(
        /\[([^\]]+)\]\((cci:[^)]+)\)/g,
        (_match, text, cciUrl) => `[${text}](${CCI_VIEWER_BASE}${encodeURIComponent(cciUrl)})`
    );
}

// Hoist component map to module scope — prevents ReactMarkdown from re-rendering
const MD_COMPONENTS = {
    a({ href, children, ...props }: any) {
        // Recover encoded cci:// links
        if (href?.startsWith(CCI_VIEWER_BASE)) {
            const cciUrl = decodeURIComponent(href.slice(CCI_VIEWER_BASE.length));
            return <CciLink href={cciUrl}>{children}</CciLink>;
        }
        // Regular links
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
            </a>
        );
    },
    img({ src, alt, ...props }: any) {
        if (!src) return null;
        return <img src={src} alt={alt || ''} {...props} />;
    },
    pre({ children }: any) {
        return <pre className="code-block">{children}</pre>;
    },
    code({ className, children, ...props }: any) {
        const isBlock = className?.includes('hljs') || className?.includes('language-');
        const language = className?.replace(/language-/, '').replace(/hljs\s*/, '') || '';
        if (!isBlock) {
            return <code className="inline-code" {...props}>{children}</code>;
        }
        return (
            <div className="code-block-wrapper">
                {language && <span className="code-lang-label">{language}</span>}
                <CopyButton text={String(children).replace(/\n$/, '')} />
                <code className={className} {...props}>{children}</code>
            </div>
        );
    },
};

interface Props {
    content: string;
    className?: string;
}

// Memoized: only re-renders when content or className actually change
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className }: Props) {
    const processed = preprocessCciLinks(content);
    return (
        <div className={`markdown-body ${className || ''}`}>
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={MD_COMPONENTS}
            >
                {processed}
            </ReactMarkdown>
        </div>
    );
});

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [text]);
    return (
        <button onClick={handleCopy} className="copy-btn" title="Copy code">
            {copied ? <><Check className="h-3 w-3 mr-1 inline" />Copied</> : <><Copy className="h-3 w-3 mr-1 inline" />Copy</>}
        </button>
    );
}
