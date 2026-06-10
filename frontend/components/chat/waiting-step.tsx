'use client';
import { useState, memo, useCallback, useEffect } from 'react';
import { Step, RequestedInteraction, AskQuestionEntry } from '@/lib/types';
import { fetchGate, PermissionGateInfo } from '@/lib/cascade-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { Play, Check, X, Loader2, Zap, FolderOpen, Keyboard, Bell, FileText, AlertTriangle, Shield, HelpCircle, MessageSquare, Infinity as InfinityIcon } from 'lucide-react';

interface WaitingStepProps {
    step: Step;
    originalIndex: number;
    cascadeId: string | null;
    onAccepted?: () => void;
}

// The member object sent as `interaction` — backend fills trajectoryId/stepIndex.
type InteractionMember = Record<string, unknown>;

function useSendInteraction(cascadeId: string | null, onDone: () => void) {
    const [acting, setActing] = useState(false);
    const send = useCallback(async (member: InteractionMember) => {
        if (!cascadeId || acting) return;
        setActing(true);
        try {
            const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ interaction: member }),
            });
            console.log('[WaitingStep] interaction response:', res.status);
            if (res.ok || res.status === 404) onDone();
        } catch (e) {
            console.log('[WaitingStep] interaction error (may be success):', e);
            onDone();
        } finally {
            setActing(false);
        }
    }, [cascadeId, acting, onDone]);
    return { acting, send };
}

// ── Permission gate ──────────────────────────────────────────────────────────
// Options are fetched from the backend (GET /api/cascade/:id/gate), which reproduces the
// exact list the Antigravity IDE would show for THIS spec (verb/scope labels, which
// "always" options appear, project vs not-in-project wording) — no hardcoded buttons.
// Falls back to a minimal allow-once/deny set if the fetch fails.

function PermissionGate({ spec, cascadeId, originalIndex, onDone }: {
    spec: NonNullable<RequestedInteraction['permission']>;
    cascadeId: string | null;
    originalIndex: number;
    onDone: () => void;
}) {
    const { acting, send } = useSendInteraction(cascadeId, onDone);
    const [gate, setGate] = useState<PermissionGateInfo | null>(null);
    const [denyOpen, setDenyOpen] = useState(false);
    const [denyText, setDenyText] = useState('');

    useEffect(() => {
        let alive = true;
        if (!cascadeId) return;
        fetchGate(cascadeId)
            .then(g => { if (alive && g.kind === 'permission') setGate(g); })
            .catch(() => { /* fall back to spec-only rendering below */ });
        return () => { alive = false; };
    }, [cascadeId]);

    const action = gate?.action || spec.resource?.action || 'access';
    const target = gate?.target || spec.resource?.target || '';
    const title = gate?.title || `Allow ${action}?`;
    const reason = gate?.reason || spec.reason || '';

    // Backend-computed options, or a safe fallback (allow once / always / deny).
    const options = gate?.options ?? [
        { id: 'once', label: 'Yes, allow this time', payload: { permission: { allow: true } } },
        { id: 'global', label: 'Yes, and always allow', payload: { permission: { allow: true, turnGrants: { allow: [`${action}(${target})`], deny: [] } } } },
    ];
    const denyWriteIn = gate?.denyWriteIn ?? { label: 'No', placeholder: '(tell the agent what to do instead)' };

    const submitDeny = () => send({ permission: { allow: false, ...(denyText.trim() ? { userDenyInstruction: denyText.trim() } : {}) } });

    return (
        <GateCard icon={<Shield className="h-4 w-4" />} title={title} originalIndex={originalIndex}>
            <div className="bg-muted rounded-md p-4 font-mono text-sm text-foreground border border-border overflow-x-auto whitespace-pre-wrap break-all">
                <span className="text-amber-500/80 mr-2 select-none">{action}</span>
                {target}
            </div>
            {reason && <div className="mt-2 text-xs text-muted-foreground">{reason}</div>}

            {!denyOpen ? (
                <div className="flex flex-col items-stretch gap-2 mt-4">
                    {options.map((opt, i) => (
                        <Button
                            key={opt.id}
                            variant={i === 0 ? 'default' : 'secondary'}
                            onClick={() => send(opt.payload)}
                            disabled={acting}
                            className="justify-start gap-2 h-auto py-2 text-left whitespace-normal"
                        >
                            {acting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                : opt.id === 'once' ? <Check className="h-4 w-4 shrink-0" />
                                    : <InfinityIcon className="h-4 w-4 shrink-0" />}
                            {opt.label}
                        </Button>
                    ))}
                    <Button variant="outline" onClick={() => setDenyOpen(true)} disabled={acting} className="justify-start gap-2">
                        <X className="h-4 w-4 shrink-0" />
                        {denyWriteIn.label}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-2 mt-4">
                    <textarea
                        autoFocus
                        value={denyText}
                        disabled={acting}
                        onChange={e => setDenyText(e.target.value)}
                        placeholder={denyWriteIn.placeholder}
                        rows={2}
                        className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
                    />
                    <div className="flex items-center gap-3">
                        <Button onClick={submitDeny} disabled={acting} className="gap-2">
                            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            Send to agent
                        </Button>
                        <Button variant="ghost" onClick={() => setDenyOpen(false)} disabled={acting}>Back</Button>
                    </div>
                </div>
            )}
        </GateCard>
    );
}

// ── Ask-question gate (agent asks the user to pick options / write an answer) ─

function AskQuestionGate({ spec, cascadeId, originalIndex, onDone }: {
    spec: { questions?: AskQuestionEntry[] };
    cascadeId: string | null;
    originalIndex: number;
    onDone: () => void;
}) {
    const { acting, send } = useSendInteraction(cascadeId, onDone);
    const questions = spec.questions || [];
    const [selections, setSelections] = useState<Record<number, string[]>>({});
    const [writeIns, setWriteIns] = useState<Record<number, string>>({});

    const toggleOption = (qi: number, optId: string, multi: boolean) => {
        setSelections(prev => {
            const cur = prev[qi] || [];
            if (multi) {
                return { ...prev, [qi]: cur.includes(optId) ? cur.filter(id => id !== optId) : [...cur, optId] };
            }
            return { ...prev, [qi]: cur.includes(optId) ? [] : [optId] };
        });
    };

    const answered = (qi: number, q: AskQuestionEntry) =>
        (selections[qi]?.length || 0) > 0 || (writeIns[qi] || '').trim().length > 0 || !(q.options?.length);
    const canSubmit = questions.length > 0 && questions.every((q, qi) => answered(qi, q));

    const submit = () => {
        const responses = questions.map((q, qi) => ({
            question: q.question,
            options: q.options,
            isMultiSelect: q.isMultiSelect,
            selectedOptionIds: selections[qi] || [],
            ...((writeIns[qi] || '').trim() ? { writeInResponse: writeIns[qi].trim() } : {}),
        }));
        send({ askQuestion: { responses } });
    };
    const skip = () => send({ askQuestion: { cancelled: true } });

    return (
        <GateCard icon={<HelpCircle className="h-4 w-4" />} title="Question from Agent" originalIndex={originalIndex}>
            <div className="space-y-4">
                {questions.map((q, qi) => (
                    <div key={qi}>
                        <div className="text-sm text-foreground mb-2 whitespace-pre-wrap">{q.question}</div>
                        {(q.options?.length || 0) > 0 && (
                            <div className="flex flex-col gap-1.5">
                                {q.options!.map((opt, oi) => {
                                    const optId = opt.id ?? String(oi);
                                    const selected = (selections[qi] || []).includes(optId);
                                    return (
                                        <button
                                            key={optId}
                                            type="button"
                                            disabled={acting}
                                            onClick={() => toggleOption(qi, optId, !!q.isMultiSelect)}
                                            className={cn(
                                                'text-left text-sm rounded-md border px-3 py-2 transition-colors',
                                                selected
                                                    ? 'border-primary bg-primary/10 text-foreground'
                                                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                                            )}
                                        >
                                            <span className={cn(
                                                'inline-flex items-center justify-center w-4 h-4 mr-2 rounded border text-[10px] align-middle',
                                                q.isMultiSelect ? 'rounded-sm' : 'rounded-full',
                                                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                                            )}>
                                                {selected ? '✓' : ''}
                                            </span>
                                            {opt.text || optId}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <input
                            type="text"
                            value={writeIns[qi] || ''}
                            disabled={acting}
                            onChange={e => setWriteIns(prev => ({ ...prev, [qi]: e.target.value }))}
                            placeholder={(q.options?.length || 0) > 0 ? 'Or write your own answer…' : 'Type your answer…'}
                            className="mt-2 w-full bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
                        />
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
                <Button onClick={submit} disabled={acting || !canSubmit} className="gap-2">
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Submit
                </Button>
                <Button variant="outline" onClick={skip} disabled={acting} className="gap-2">
                    <X className="h-4 w-4" />
                    Skip
                </Button>
            </div>
        </GateCard>
    );
}

// ── Elicitation gate (MCP server requests structured input) ──────────────────

function ElicitationGate({ spec, cascadeId, originalIndex, onDone }: {
    spec: NonNullable<RequestedInteraction['elicitation']>;
    cascadeId: string | null;
    originalIndex: number;
    onDone: () => void;
}) {
    const { acting, send } = useSendInteraction(cascadeId, onDone);
    const hasSchema = !!(spec.requestedSchemaJson && spec.requestedSchemaJson.trim() && spec.requestedSchemaJson.trim() !== '{}');
    const [contentJson, setContentJson] = useState('{}');
    const [jsonError, setJsonError] = useState<string | null>(null);

    const accept = () => {
        if (hasSchema) {
            try { JSON.parse(contentJson); } catch { setJsonError('Invalid JSON'); return; }
        }
        send({ elicitation: { action: 'accept', ...(hasSchema ? { contentJson } : {}) } });
    };

    return (
        <GateCard icon={<MessageSquare className="h-4 w-4" />} title={`Input Requested${spec.serverName ? ` — ${spec.serverName}` : ''}`} originalIndex={originalIndex}>
            {spec.message && (
                <div className="bg-muted rounded-md p-4 text-sm text-foreground border border-border whitespace-pre-wrap break-words">
                    {spec.message}
                </div>
            )}
            {spec.url && <div className="mt-2 text-xs font-mono text-muted-foreground break-all">{spec.url}</div>}
            {hasSchema && (
                <div className="mt-3">
                    <div className="text-[10px] text-muted-foreground mb-1">Response JSON (schema: <span className="font-mono">{spec.requestedSchemaJson!.slice(0, 120)}{spec.requestedSchemaJson!.length > 120 ? '…' : ''}</span>)</div>
                    <textarea
                        value={contentJson}
                        disabled={acting}
                        onChange={e => { setContentJson(e.target.value); setJsonError(null); }}
                        rows={3}
                        className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-primary/60"
                    />
                    {jsonError && <div className="text-xs text-red-400 mt-1">{jsonError}</div>}
                </div>
            )}
            <div className="flex items-center gap-3 mt-4">
                <Button onClick={accept} disabled={acting} className="gap-2">
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Accept
                </Button>
                <Button variant="outline" onClick={() => send({ elicitation: { action: 'decline' } })} disabled={acting} className="gap-2">
                    <X className="h-4 w-4" />
                    Decline
                </Button>
                <Button variant="ghost" onClick={() => send({ elicitation: { action: 'cancel' } })} disabled={acting}>
                    Cancel
                </Button>
            </div>
        </GateCard>
    );
}

// ── Shared card chrome ───────────────────────────────────────────────────────

function GateCard({ icon, title, originalIndex, children }: {
    icon: React.ReactNode;
    title: string;
    originalIndex: number;
    children: React.ReactNode;
}) {
    return (
        <div className="mx-4 mb-3 rounded-lg border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-muted-foreground">{icon}</span>
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    <span className="text-[10px] font-mono ml-auto text-muted-foreground/60">step #{originalIndex + 1}</span>
                    <span className="w-2 h-2 rounded-full animate-pulse bg-amber-400" />
                </div>
                {children}
            </div>
        </div>
    );
}

export const WaitingStep = memo(function WaitingStep({ step, originalIndex, cascadeId, onAccepted }: WaitingStepProps) {
    const [acting, setActing] = useState(false);
    const [result, setResult] = useState<'accepted' | 'rejected' | null>(null);

    const markDone = useCallback(() => {
        setResult('accepted');
        onAccepted?.();
    }, [onAccepted]);

    const stepType = (step.type || '').replace('CORTEX_STEP_TYPE_', '');
    const command = step.runCommand?.commandLine || step.runCommand?.command || '';

    // Try multiple paths to find the file path
    let filePath = step.codeAction?.targetFile || step.codeAction?.filePath
        || step.codeAction?.actionSpec?.command?.replacementChunks?.[0]?.targetFile || '';
    // Fallback: check metadata.toolCall.argumentsJson for TargetFile
    if (!filePath && step.metadata?.toolCall?.argumentsJson) {
        try {
            const args = JSON.parse(step.metadata.toolCall.argumentsJson);
            filePath = args.TargetFile || args.AbsolutePath || args.FilePath || '';
        } catch { }
    }
    // Fallback 2: check metadata.argumentsJson
    if (!filePath && step.metadata?.argumentsJson) {
        try {
            const args = JSON.parse(step.metadata.argumentsJson);
            filePath = args.TargetFile || args.AbsolutePath || args.FilePath || '';
        } catch { }
    }
    // Fallback 3: extract from binary-decoded codeAction numeric fields
    if (!filePath && step.codeAction) {
        const ca = step.codeAction as Record<string, unknown>;
        // Field "25" contains raw path like "\n.C:\Users\...\file.py" (Win)
        // or "/Users/.../file.py" (macOS)
        if (ca['25'] && typeof ca['25'] === 'string') {
            const cleaned = (ca['25'] as string).replace(/[\x00-\x1f]/g, '').trim();
            const winMatch = cleaned.match(/([A-Za-z]:\\[^\x00]+)/);
            const macMatch = cleaned.match(/(\/[^\x00]+)/);
            if (winMatch) filePath = winMatch[1];
            else if (macMatch) filePath = macMatch[1];
        }
        // Field "1" may contain file:/// URI
        if (!filePath && ca['1'] && typeof ca['1'] === 'string') {
            const uriMatch = (ca['1'] as string).match(/file:\/\/(\/[^\s\x00]+)/);
            if (uriMatch) filePath = decodeURIComponent(uriMatch[1]);
        }
    }
    const termInput = step.sendCommandInput?.input || '';

    const isCommand = stepType === 'RUN_COMMAND';
    const isCodeAction = stepType === 'CODE_ACTION';
    const isFileAccess = isCodeAction && !!filePath;
    const isTermInput = stepType === 'SEND_COMMAND_INPUT';

    // After accept/reject, hide the waiting step entirely (step will update via poll)
    if (result) return null;

    // ── Gate-specific UIs: answer the member the LS explicitly requested ─────
    const requested: RequestedInteraction | undefined = step.requestedInteraction;
    if (requested?.permission) {
        return <PermissionGate spec={requested.permission} cascadeId={cascadeId} originalIndex={originalIndex} onDone={markDone} />;
    }
    if (requested?.askQuestion) {
        return <AskQuestionGate spec={requested.askQuestion} cascadeId={cascadeId} originalIndex={originalIndex} onDone={markDone} />;
    }
    if (requested?.elicitation) {
        return <ElicitationGate spec={requested.elicitation} cascadeId={cascadeId} originalIndex={originalIndex} onDone={markDone} />;
    }

    // ── Legacy generic accept/reject (no requestedInteraction on the step) ───

    // Build debug info for unknown/empty steps
    const debugData = (!isCommand && !isFileAccess && !isTermInput)
        ? JSON.stringify(step, null, 2).substring(0, 3000) : '';

    // Determine display info
    const icon = isCommand ? <Zap className="h-4 w-4" /> : (isFileAccess || isCodeAction) ? <FolderOpen className="h-4 w-4" /> : isTermInput ? <Keyboard className="h-4 w-4" /> : <Bell className="h-4 w-4" />;
    const title = isCommand ? 'Terminal Command'
        : isFileAccess ? 'File Access'
            : isCodeAction ? 'Code Action (File Permission?)'
                : isTermInput ? 'Terminal Input'
                    : stepType.replace(/_/g, ' ');
    const displayContent = isCommand ? command
        : isFileAccess ? filePath
            : isTermInput ? termInput
                : '';
    const AcceptIcon = isCommand || isTermInput ? Play : Check;
    const acceptLabel = isCommand ? 'Run' : (isFileAccess || isCodeAction) ? 'Allow' : isTermInput ? 'Send' : 'Allow';

    const handleAction = async (action: 'accept' | 'reject') => {
        if (!cascadeId || acting) return;
        setActing(true);
        try {
            const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(action === 'reject' ? { reject: true } : {}),
            });
            console.log(`[WaitingStep] ${action} response:`, res.status);
            if (res.ok || res.status === 404) {
                setResult(action === 'accept' ? 'accepted' : 'rejected');
                onAccepted?.();
            }
        } catch (e) {
            console.log(`[WaitingStep] ${action} error (may be success):`, e);
            setResult(action === 'accept' ? 'accepted' : 'rejected');
            onAccepted?.();
        } finally {
            setActing(false);
        }
    };

    return (
        <div className="mx-4 mb-3 rounded-lg border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-muted-foreground">{icon}</span>
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    <span className="text-[10px] font-mono ml-auto text-muted-foreground/60">step #{originalIndex + 1}</span>
                    <span className="w-2 h-2 rounded-full animate-pulse bg-amber-400" />
                </div>

                {/* Content display */}
                {displayContent && (
                    <div className="bg-muted rounded-md p-4 font-mono text-sm text-foreground border border-border overflow-x-auto whitespace-pre-wrap break-all">
                        {isCommand && <span className="text-emerald-500/50 mr-2 select-none">$</span>}
                        {isFileAccess && <FileText className="h-3.5 w-3.5 text-blue-500/50 mr-2 select-none inline" />}
                        {displayContent}
                    </div>
                )}

                {/* Debug: show raw step data when content extraction fails */}
                {!displayContent && debugData && (
                    <div className="mt-3">
                        <div className="text-[10px] text-amber-400/60 mb-1 font-semibold"><AlertTriangle className="h-3 w-3 inline mr-1" /> Debug: Raw step data (file path not found)</div>
                        <pre className="bg-muted rounded-md p-3 font-mono text-[10px] text-muted-foreground border border-border max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                            {debugData}
                        </pre>
                    </div>
                )}

                {/* Inline Action buttons */}
                <div className="flex items-center gap-3 mt-4">
                    <Button
                        onClick={() => handleAction('accept')}
                        disabled={acting}
                        className="gap-2"
                    >
                        {acting
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <AcceptIcon className="h-4 w-4" />}
                        {acceptLabel}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleAction('reject')}
                        disabled={acting}
                        className="gap-2"
                    >
                        <X className="h-4 w-4" />
                        Reject
                    </Button>
                </div>
            </div>
        </div>
    );
});
WaitingStep.displayName = 'WaitingStep';
