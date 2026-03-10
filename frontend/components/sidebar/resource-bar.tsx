"use client"

import { useMemo } from "react"

export interface ResourceBarProps {
    cpuPercent: number
    memMB: number
}

/** Map a 0–100 value to a gradient color: green → yellow → red */
function getBarColor(value: number): string {
    const clamped = Math.max(0, Math.min(100, value))
    if (clamped < 50) {
        // green → yellow
        const t = clamped / 50
        const h = 142 - t * (142 - 38)  // hue 142 → 38
        return `hsl(${h}, 80%, 48%)`
    }
    // yellow → red
    const t = (clamped - 50) / 50
    const h = 38 - t * 38  // hue 38 → 0
    return `hsl(${h}, 84%, 55%)`
}

export function ResourceBar({ cpuPercent, memMB }: ResourceBarProps) {
    // Cap CPU display at 100% for the bar width, but show real value in tooltip
    const cpuWidth = useMemo(() => Math.min(cpuPercent, 100), [cpuPercent])
    // RAM: use log scale for bar (most LS processes use 100–2000 MB)
    // Map 0–2048 MB linearly for the bar width
    const memWidth = useMemo(() => Math.min((memMB / 2048) * 100, 100), [memMB])

    const cpuColor = useMemo(() => getBarColor(cpuWidth), [cpuWidth])
    const memColor = useMemo(() => getBarColor(memWidth), [memWidth])

    return (
        <div
            className="flex items-center gap-1 shrink-0 ml-1"
            title={`CPU: ${cpuPercent.toFixed(1)}%  |  RAM: ${memMB} MB`}
        >
            {/* CPU bar */}
            <div className="flex flex-col gap-[2px]">
                <div className="w-[32px] h-[3px] rounded-full bg-sidebar-foreground/10 overflow-hidden">
                    <div
                        className="h-full rounded-full"
                        style={{
                            width: `${Math.max(cpuWidth, 2)}%`,
                            backgroundColor: cpuColor,
                            transition: 'width 0.8s ease, background-color 0.8s ease',
                        }}
                    />
                </div>
                {/* RAM bar */}
                <div className="w-[32px] h-[3px] rounded-full bg-sidebar-foreground/10 overflow-hidden">
                    <div
                        className="h-full rounded-full"
                        style={{
                            width: `${Math.max(memWidth, 2)}%`,
                            backgroundColor: memColor,
                            transition: 'width 0.8s ease, background-color 0.8s ease',
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
