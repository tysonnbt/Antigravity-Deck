'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Step } from '@/lib/types';
import { computeStats } from '@/lib/step-utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart2, User, Bot, Wrench, Settings, XCircle } from 'lucide-react';

const barColors = [
    'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-green-500',
    'bg-yellow-500', 'bg-cyan-500', 'bg-red-500', 'bg-pink-500',
    'bg-lime-500', 'bg-sky-500',
];

interface AnalyticsPanelProps {
    steps: Step[];
}

export function AnalyticsPanel({ steps }: AnalyticsPanelProps) {
    const stats = useMemo(() => computeStats(steps), [steps]);

    const sortedTypes = useMemo(() =>
        Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1]),
        [stats.typeCounts]
    );

    const maxCount = Math.max(...Object.values(stats.typeCounts), 1);

    const cards = [
        { label: 'Total Steps', value: stats.total, icon: <BarChart2 className="h-3 w-3" /> },
        { label: 'User Inputs', value: stats.user, icon: <User className="h-3 w-3" /> },
        { label: 'Agent', value: stats.agent, icon: <Bot className="h-3 w-3" /> },
        { label: 'Tool Calls', value: stats.tool, icon: <Wrench className="h-3 w-3" /> },
        { label: 'System', value: stats.system, icon: <Settings className="h-3 w-3" /> },
        { label: 'Errors', value: stats.error, icon: <XCircle className="h-3 w-3" /> },
    ];

    return (
        <div className="border-b border-border bg-background/50 backdrop-blur px-4 py-3 space-y-3 animate-in slide-in-from-top duration-200">
            {/* Stat Cards */}
            <div className="grid grid-cols-6 gap-2">
                {cards.map(c => (
                    <Card key={c.label} className="bg-muted/30 border-border/50 hover:bg-muted/50 transition-all">
                        <CardContent className="p-3 text-center">
                            <div className="text-xl font-bold font-mono">{c.value}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">{c.icon} {c.label}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Bar Chart */}
            <div className="flex items-end gap-1 h-14">
                {sortedTypes.map(([type, count], i) => {
                    const height = Math.max(6, (count / maxCount) * 52);
                    return (
                        <Tooltip key={type}>
                            <TooltipTrigger asChild>
                                <div
                                    className={`flex-1 min-w-4 rounded-t transition-all hover:opacity-80 ${barColors[i % barColors.length]}`}
                                    style={{ height: `${height}px` }}
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                {type}: {count}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}
