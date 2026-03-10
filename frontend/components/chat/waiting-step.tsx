'use client';
import { useState, memo } from 'react';
import { Step } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { Play, Check, X, Loader2, Zap, FolderOpen, Keyboard, Bell, FileText, AlertTriangle } from 'lucide-react';

interface WaitingStepProps {
    step: Step;
    originalIndex: number;
    cascadeId: string | null;
    onAccepted?: () => void;
}

export const WaitingStep = memo(function WaitingStep({ step, originalIndex, cascadeId, onAccepted }: WaitingStepProps) {
    const [acting, setActing] = useState(false);
    const [result, setResult] = useState<'accepted' | 'rejected' | null>(null);

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
        // Field "25" contains raw path like "\n.C:\Users\...\file.py\u0018\u0001" (Win)
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
    const toolName = step.metadata?.toolCall?.name || '';
    const termInput = step.sendCommandInput?.input || '';

    const isCommand = stepType === 'RUN_COMMAND';
    const isCodeAction = stepType === 'CODE_ACTION';
    const isFileAccess = isCodeAction && !!filePath;
    const isTermInput = stepType === 'SEND_COMMAND_INPUT';

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

    // After accept/reject, hide the waiting step entirely (step will update via poll)
    if (result) return null;

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
