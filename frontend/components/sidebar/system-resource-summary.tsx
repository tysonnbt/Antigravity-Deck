"use client"

import type { SystemResources } from "@/lib/cascade-api"
import { Cpu, MemoryStick } from "lucide-react"

function getBarColor(percent: number): string {
    const v = Math.max(0, Math.min(100, percent))
    if (v < 50) { const t = v / 50; return `hsl(${142 - t * 104}, 80%, 48%)` }
    const t = (v - 50) / 50; return `hsl(${38 - t * 38}, 84%, 55%)`
}

interface SystemResourceSummaryProps {
    system: SystemResources | null | undefined
    onClick?: () => void
}

export function SystemResourceSummary({ system, onClick }: SystemResourceSummaryProps) {
    if (!system) return null

    const cpuColor = getBarColor(system.cpuPercent)
    const memColor = getBarColor(system.memPercent)

    return (
        <button
            onClick={onClick}
            className="w-full px-3 py-2 flex flex-col gap-1.5 rounded-lg bg-sidebar-accent/30 hover:bg-sidebar-accent/60 transition-colors cursor-pointer border border-sidebar-border/30 group"
            title="Click to open Resource Monitor"
        >
            {/* CPU row */}
            <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="flex-1 h-[5px] rounded-full bg-sidebar-foreground/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                        width: `${Math.max(system.cpuPercent, 2)}%`,
                        backgroundColor: cpuColor,
                        transition: 'width 0.8s ease, background-color 0.8s ease',
                    }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-[38px] text-right">
                    {system.cpuPercent.toFixed(1)}%
                </span>
            </div>
            {/* RAM row */}
            <div className="flex items-center gap-2">
                <MemoryStick className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="flex-1 h-[5px] rounded-full bg-sidebar-foreground/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{
                        width: `${Math.max(system.memPercent, 2)}%`,
                        backgroundColor: memColor,
                        transition: 'width 0.8s ease, background-color 0.8s ease',
                    }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-[38px] text-right">
                    {(system.memUsedMB / 1024).toFixed(1)}G
                </span>
            </div>
        </button>
    )
}
