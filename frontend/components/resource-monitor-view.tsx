"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { getWorkspaceResources } from "@/lib/cascade-api"
import type { ResourceSnapshot, SystemResources, WorkspaceResources, ResourceHistoryPoint, SelfStats } from "@/lib/cascade-api"
import { Cpu, MemoryStick, Activity, Monitor, HardDrive, Server, Box } from "lucide-react"

// === Donut Chart (SVG) ===
function DonutChart({ value, max = 100, size = 110, strokeWidth = 10, label, sublabel, color }: {
    value: number; max?: number; size?: number; strokeWidth?: number
    label: string; sublabel: string; color: string
}) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const percent = Math.min(value / max, 1)
    const offset = circumference * (1 - percent)

    return (
        <div className="flex flex-col items-center gap-1.5">
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background ring */}
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="currentColor" className="text-muted/20"
                    strokeWidth={strokeWidth} />
                {/* Value ring */}
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.8s ease' }} />
            </svg>
            {/* Center text overlay */}
            <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
                <span className="text-lg font-bold tabular-nums" style={{ color }}>
                    {value.toFixed(1)}%
                </span>
            </div>
            <span className="text-xs font-medium text-foreground/80">{label}</span>
            <span className="text-[10px] text-muted-foreground">{sublabel}</span>
        </div>
    )
}

// === Sparkline Chart (SVG) ===
function Sparkline({ data, width = 280, height = 50, color, label }: {
    data: number[]; width?: number; height?: number; color: string; label: string
}) {
    if (!data.length) return null
    const max = Math.max(...data, 1)
    const points = data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width
        const y = height - (v / max) * (height - 4) - 2
        return `${x},${y}`
    }).join(' ')

    const areaPoints = `0,${height} ${points} ${width},${height}`
    const latest = data[data.length - 1]

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
                    {latest.toFixed(1)}%
                </span>
            </div>
            <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {/* Fill area */}
                <polygon points={areaPoints} fill={color} opacity={0.1} />
                {/* Line */}
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
        </div>
    )
}

// === Per-workspace row ===
function WorkspaceRow({ pid, data }: { pid: string; data: WorkspaceResources }) {
    const cpuColor = getGradientColor(data.cpuPercent)
    const memColor = getGradientColor(Math.min((data.memMB / 2048) * 100, 100))

    return (
        <div className="grid grid-cols-[1fr_100px_100px_60px] items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
                <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{data.name || `PID ${pid}`}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                        width: `${Math.max(Math.min(data.cpuPercent, 100), 2)}%`,
                        backgroundColor: cpuColor,
                        transition: 'width 0.8s ease',
                    }} />
                </div>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-10 text-right">
                    {data.cpuPercent.toFixed(1)}%
                </span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                        width: `${Math.max(Math.min((data.memMB / 2048) * 100, 100), 2)}%`,
                        backgroundColor: memColor,
                        transition: 'width 0.8s ease',
                    }} />
                </div>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-14 text-right">
                    {data.memMB} MB
                </span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 text-right font-mono">{pid}</span>
        </div>
    )
}

// === Color helper ===
function getGradientColor(value: number): string {
    const clamped = Math.max(0, Math.min(100, value))
    if (clamped < 50) {
        const t = clamped / 50
        const h = 142 - t * (142 - 38)
        return `hsl(${h}, 80%, 48%)`
    }
    const t = (clamped - 50) / 50
    const h = 38 - t * 38
    return `hsl(${h}, 84%, 55%)`
}

// === Main Component ===
export function ResourceMonitorView() {
    const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null)
    const [loading, setLoading] = useState(true)


    const fetchData = useCallback(async () => {
        try {
            const data = await getWorkspaceResources()
            setSnapshot(data)
        } catch {
            // ignore — server might not be ready
        } finally {
            setLoading(false)
        }
    }, [])

    // Fetch on mount + poll every 5s
    useEffect(() => {
        fetchData()
        const timer = setInterval(fetchData, 5000)
        return () => clearInterval(timer)
    }, [fetchData])

    // Also listen for WebSocket updates via custom event
    useEffect(() => {
        const handler = (e: Event) => {
            const data = (e as CustomEvent).detail
            if (data) setSnapshot(data)
        }
        window.addEventListener('resource-update', handler)
        return () => window.removeEventListener('resource-update', handler)
    }, [])

    const system = snapshot?.system
    const deckStats = snapshot?.selfStats
    const workspaces = snapshot?.workspaces || {}
    const historyData = snapshot?.history || []
    const workspaceList = useMemo(() =>
        Object.entries(workspaces).sort((a, b) => b[1].memMB - a[1].memMB),
        [workspaces]
    )

    // Aggregate workspace totals
    const wsTotalCpu = useMemo(() =>
        workspaceList.reduce((sum, [, w]) => sum + w.cpuPercent, 0),
        [workspaceList]
    )
    const wsTotalMem = useMemo(() =>
        workspaceList.reduce((sum, [, w]) => sum + w.memMB, 0),
        [workspaceList]
    )

    const cpuHistory = useMemo(() => historyData.map(h => h.cpu), [historyData])
    const memHistory = useMemo(() => historyData.map(h => h.mem), [historyData])

    const cpuColor = system ? getGradientColor(system.cpuPercent) : 'hsl(142, 80%, 48%)'
    const memColor = system ? getGradientColor(system.memPercent) : 'hsl(142, 80%, 48%)'

    if (loading && !snapshot) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Activity className="w-8 h-8 text-muted-foreground/50 animate-pulse" />
                    <span className="text-sm text-muted-foreground">Loading resource data...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
                        <Monitor className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Resource Monitor</h2>
                        <p className="text-xs text-muted-foreground">
                            System: {system?.cpuCores || 0} cores • {system?.memTotalMB ? `${(system.memTotalMB / 1024).toFixed(1)} GB RAM` : '—'}
                        </p>
                    </div>
                </div>

                {/* System Overview — Donut charts */}
                <div className="rounded-xl border border-border/50 bg-card/50 p-5">
                    <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> System Overview
                    </h3>
                    <div className="grid grid-cols-3 gap-6 justify-items-center">
                        <div className="relative">
                            <DonutChart
                                value={system?.cpuPercent ?? 0}
                                label="CPU Usage"
                                sublabel={`${system?.cpuCores ?? 0} cores`}
                                color={cpuColor}
                            />
                        </div>
                        <div className="relative">
                            <DonutChart
                                value={system?.memPercent ?? 0}
                                label="Memory"
                                sublabel={`${system?.memUsedMB ? (system.memUsedMB / 1024).toFixed(1) : '0'} / ${system?.memTotalMB ? (system.memTotalMB / 1024).toFixed(1) : '0'} GB`}
                                color={memColor}
                            />
                        </div>
                        <div className="relative">
                            <DonutChart
                                value={workspaceList.length > 0 ? (wsTotalMem / (system?.memUsedMB || 1)) * 100 : 0}
                                label="Workspace Share"
                                sublabel={`${workspaceList.length} workspace${workspaceList.length !== 1 ? 's' : ''}`}
                                color="hsl(262, 80%, 55%)"
                            />
                        </div>
                    </div>
                </div>

                {/* Antigravity Deck App — Self Monitoring */}
                {deckStats && (
                    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
                        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <Box className="w-4 h-4" /> Antigravity Deck (This App)
                        </h3>
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_100px_100px_60px] gap-3 px-3 pb-1 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
                            <span>Component</span>
                            <span>CPU</span>
                            <span>Memory</span>
                            <span className="text-right">PID</span>
                        </div>
                        <div className="divide-y divide-border/30">
                            {/* Backend row */}
                            <div className="grid grid-cols-[1fr_100px_100px_60px] items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                    <span className="text-sm font-medium">Backend (Node.js)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                                        <div className="h-full rounded-full" style={{
                                            width: `${Math.max(Math.min(deckStats.backend.cpuPercent, 100), 2)}%`,
                                            backgroundColor: getGradientColor(deckStats.backend.cpuPercent),
                                            transition: 'width 0.8s ease',
                                        }} />
                                    </div>
                                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-10 text-right">
                                        {deckStats.backend.cpuPercent.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                                        <div className="h-full rounded-full" style={{
                                            width: `${Math.max(Math.min((deckStats.backend.memMB / 512) * 100, 100), 2)}%`,
                                            backgroundColor: getGradientColor(Math.min((deckStats.backend.memMB / 512) * 100, 100)),
                                            transition: 'width 0.8s ease',
                                        }} />
                                    </div>
                                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-14 text-right">
                                        {deckStats.backend.memMB} MB
                                    </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground/60 text-right font-mono">{deckStats.backend.pid}</span>
                            </div>
                            {/* Frontend row */}
                            <div className="grid grid-cols-[1fr_100px_100px_60px] items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Monitor className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                    <span className="text-sm font-medium">Frontend (Next.js)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                                        <div className="h-full rounded-full" style={{
                                            width: `${Math.max(Math.min(deckStats.frontend.cpuPercent, 100), 2)}%`,
                                            backgroundColor: getGradientColor(deckStats.frontend.cpuPercent),
                                            transition: 'width 0.8s ease',
                                        }} />
                                    </div>
                                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-10 text-right">
                                        {deckStats.frontend.cpuPercent.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                                        <div className="h-full rounded-full" style={{
                                            width: `${Math.max(Math.min((deckStats.frontend.memMB / 512) * 100, 100), 2)}%`,
                                            backgroundColor: getGradientColor(Math.min((deckStats.frontend.memMB / 512) * 100, 100)),
                                            transition: 'width 0.8s ease',
                                        }} />
                                    </div>
                                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-14 text-right">
                                        {deckStats.frontend.memMB} MB
                                    </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground/60 text-right font-mono">{deckStats.frontend.pid || '—'}</span>
                            </div>
                        </div>
                        {/* Totals */}
                        <div className="grid grid-cols-[1fr_100px_100px_60px] gap-3 px-3 pt-2 mt-2 border-t border-border/50 text-xs font-medium">
                            <span className="text-muted-foreground">Total Deck</span>
                            <span className="font-mono tabular-nums">{deckStats.totalCpuPercent.toFixed(1)}%</span>
                            <span className="font-mono tabular-nums">{deckStats.totalMemMB} MB</span>
                            <span></span>
                        </div>
                    </div>
                )}

                {/* Usage History — Sparklines */}
                {cpuHistory.length > 1 && (
                    <div className="rounded-xl border border-border/50 bg-card/50 p-5">
                        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                            <HardDrive className="w-4 h-4" /> Usage History
                            <span className="text-[10px] text-muted-foreground/50 ml-auto">Last {Math.round(cpuHistory.length * 5 / 60)} min</span>
                        </h3>
                        <div className="space-y-4">
                            <Sparkline data={cpuHistory} color={cpuColor} label="CPU %" />
                            <Sparkline data={memHistory} color={memColor} label="Memory %" />
                        </div>
                    </div>
                )}

                {/* Per-workspace Breakdown */}
                <div className="rounded-xl border border-border/50 bg-card/50 p-5">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                        <Cpu className="w-4 h-4" /> Workspace Breakdown
                    </h3>

                    {workspaceList.length === 0 ? (
                        <div className="text-center py-6">
                            <Server className="w-6 h-6 mx-auto text-muted-foreground/30 mb-2" />
                            <p className="text-sm text-muted-foreground/60">No active workspaces detected</p>
                        </div>
                    ) : (
                        <>
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_100px_100px_60px] gap-3 px-3 pb-1 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
                                <span>Workspace</span>
                                <span>CPU</span>
                                <span>Memory</span>
                                <span className="text-right">PID</span>
                            </div>
                            <div className="divide-y divide-border/30">
                                {workspaceList.map(([pid, data]) => (
                                    <WorkspaceRow key={pid} pid={pid} data={data} />
                                ))}
                            </div>
                            {/* Totals */}
                            <div className="grid grid-cols-[1fr_100px_100px_60px] gap-3 px-3 pt-2 mt-2 border-t border-border/50 text-xs font-medium">
                                <span className="text-muted-foreground">Total Antigravity</span>
                                <span className="font-mono tabular-nums">{wsTotalCpu.toFixed(1)}%</span>
                                <span className="font-mono tabular-nums">{wsTotalMem} MB</span>
                                <span></span>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer info */}
                <div className="text-center text-[10px] text-muted-foreground/40 pb-4">
                    Sampling every 5s • {historyData.length} / 60 history points
                </div>
            </div>
        </div>
    )
}

