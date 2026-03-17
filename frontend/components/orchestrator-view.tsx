'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workflow, Settings2, ChevronDown, ChevronUp, Save, Check } from 'lucide-react';
import { OrchestratorChat } from './orchestrator-chat';
import { useOrchestratorWs } from '@/hooks/use-orchestrator-ws';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import {
    fetchOrchestratorSettings, saveOrchestratorSettings,
    fetchPlannerPrompt, savePlannerPrompt,
} from '@/lib/orchestrator-api';
import type { OrchestratorConfig } from '@/lib/orchestrator-api';

export function OrchestratorView() {
    const orch = useOrchestratorWs();

    // Auto-connect WS on mount
    useEffect(() => { orch.connect(); }, []);

    // ── Workspace selection ──────────────────────────────────────────────
    const [workspace, setWorkspace] = useState('');
    const [workspaces, setWorkspaces] = useState<string[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/workspaces`, { headers: authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    const names = Array.isArray(data)
                        ? data.map((w: { name?: string; workspaceName?: string }) => w.name || w.workspaceName || '').filter(Boolean)
                        : [];
                    setWorkspaces(names);
                    if (names.length > 0 && !workspace) setWorkspace(names[0]);
                }
            } catch { /* silent */ }
        })();
    }, []);

    // ── Orchestrator Settings ────────────────────────────────────────────
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [orchSettings, setOrchSettings] = useState<OrchestratorConfig | null>(null);
    const [orchOriginal, setOrchOriginal] = useState<OrchestratorConfig | null>(null);
    const [orchSaving, setOrchSaving] = useState(false);
    const [orchMsg, setOrchMsg] = useState('');
    const [orchPrompt, setOrchPrompt] = useState('');
    const [orchPromptOriginal, setOrchPromptOriginal] = useState('');
    const [orchPromptSaving, setOrchPromptSaving] = useState(false);

    useEffect(() => {
        fetchOrchestratorSettings()
            .then(d => { setOrchSettings(d); setOrchOriginal(d); })
            .catch(() => {});
        fetchPlannerPrompt()
            .then(d => { const p = d.prompt || ''; setOrchPrompt(p); setOrchPromptOriginal(p); })
            .catch(() => {});
    }, []);

    const hasOrchChanges = JSON.stringify(orchSettings) !== JSON.stringify(orchOriginal);
    const hasPromptChanges = orchPrompt !== orchPromptOriginal;

    const handleSaveOrch = async () => {
        if (!orchSettings) return;
        setOrchSaving(true);
        setOrchMsg('');
        try {
            const saved = await saveOrchestratorSettings(orchSettings);
            setOrchSettings(saved);
            setOrchOriginal(saved);
            setOrchMsg('saved');
            setTimeout(() => setOrchMsg(''), 2000);
        } catch {
            setOrchMsg('error');
        } finally {
            setOrchSaving(false);
        }
    };

    const handleSavePrompt = async () => {
        setOrchPromptSaving(true);
        try {
            await savePlannerPrompt(orchPrompt);
            setOrchPromptOriginal(orchPrompt);
        } catch { /* silent */ }
        finally { setOrchPromptSaving(false); }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-2">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-semibold text-foreground/80">Orchestrator</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Workspace selector */}
                    <Select value={workspace} onValueChange={setWorkspace}>
                        <SelectTrigger className="h-7 w-[160px] text-[10px]">
                            <SelectValue placeholder="Select workspace" />
                        </SelectTrigger>
                        <SelectContent>
                            {workspaces.map(ws => (
                                <SelectItem key={ws} value={ws} className="text-[11px]">{ws}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {/* Settings toggle */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setSettingsOpen(o => !o)}
                    >
                        <Settings2 className={cn('h-3.5 w-3.5', settingsOpen && 'text-blue-400')} />
                    </Button>
                </div>
            </div>

            {/* Settings panel (collapsible) */}
            {settingsOpen && orchSettings && (
                <div className="border-b border-border/20 px-4 py-3 space-y-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground/70">Enable Orchestrator</Label>
                        <Switch checked={orchSettings.enabled}
                            onCheckedChange={v => setOrchSettings(s => s ? { ...s, enabled: v } : s)}
                            className="scale-75" />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Max Parallel</Label>
                            <Input type="number" value={orchSettings.maxParallel} min={1} max={10}
                                onChange={e => setOrchSettings(s => s ? { ...s, maxParallel: parseInt(e.target.value) || 1 } : s)}
                                className="font-mono text-[11px] h-7" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Max Subtasks</Label>
                            <Input type="number" value={orchSettings.maxSubtasks} min={1} max={20}
                                onChange={e => setOrchSettings(s => s ? { ...s, maxSubtasks: parseInt(e.target.value) || 1 } : s)}
                                className="font-mono text-[11px] h-7" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Max Concurrent</Label>
                            <Input type="number" value={orchSettings.maxConcurrentOrchestrations} min={1} max={10}
                                onChange={e => setOrchSettings(s => s ? { ...s, maxConcurrentOrchestrations: parseInt(e.target.value) || 1 } : s)}
                                className="font-mono text-[11px] h-7" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Fail Threshold</Label>
                            <Input type="number" value={orchSettings.failureThreshold} min={0} max={1} step={0.1}
                                onChange={e => setOrchSettings(s => s ? { ...s, failureThreshold: parseFloat(e.target.value) || 0 } : s)}
                                className="font-mono text-[11px] h-7" />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        {orchMsg && (
                            <span className={cn('text-[10px] font-medium', orchMsg === 'saved' ? 'text-emerald-400' : 'text-red-400')}>
                                {orchMsg === 'saved' ? <><Check className="h-3 w-3 inline mr-0.5" />Saved</> : 'Error'}
                            </span>
                        )}
                        <Button size="sm" variant="outline" onClick={handleSaveOrch}
                            disabled={orchSaving || !hasOrchChanges} className="h-6 text-[10px] gap-1 px-2">
                            <Save className="w-3 h-3" /> {orchSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>

                    {/* Planner prompt */}
                    <div className="space-y-1.5 pt-2 border-t border-border/20">
                        <Label className="text-[10px] text-muted-foreground/70">Planner Prompt</Label>
                        <Textarea
                            value={orchPrompt}
                            onChange={e => setOrchPrompt(e.target.value)}
                            className="min-h-[80px] text-[10px] bg-background/50 resize-y font-mono"
                            placeholder="Custom planner system prompt (leave empty for default)..."
                        />
                        <div className="flex justify-end">
                            <Button size="sm" variant="outline" onClick={handleSavePrompt}
                                disabled={orchPromptSaving || !hasPromptChanges} className="h-6 text-[10px] gap-1 px-2">
                                <Save className="w-3 h-3" /> {orchPromptSaving ? 'Saving...' : 'Save Prompt'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky progress bar */}
            {(orch.activityState === 'executing' || orch.activityState === 'reviewing') && (
                <div className="border-b border-border/20 px-3 py-1.5 flex items-center justify-between bg-muted/5">
                    <div className="flex items-center gap-2 text-[10px]">
                        <div className="h-1 w-24 bg-muted/20 rounded-full">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.round(orch.progress * 100)}%` }}
                            />
                        </div>
                        <span className="text-muted-foreground">
                            {Math.round(orch.progress * 100)}% · {Math.round(orch.elapsed / 1000)}s
                        </span>
                    </div>
                </div>
            )}

            {/* Main orchestrator chat */}
            <div className="flex-1 min-h-0">
                <OrchestratorChat orch={orch} />
            </div>
        </div>
    );
}
