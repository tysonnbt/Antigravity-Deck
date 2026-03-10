'use client';

import { useMemo } from 'react';
import { Step } from '@/lib/types';
import { getStepConfig } from '@/lib/step-utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TimelineProps {
    steps: Step[];
    onSelectStep: (index: number) => void;
}

const roleColors: Record<string, string> = {
    user: 'bg-blue-500',
    thinking: 'bg-gray-500',
    response: 'bg-purple-500',
    tool: 'bg-orange-500',
    system: 'bg-green-500',
    error: 'bg-red-500',
};

export function Timeline({ steps, onSelectStep }: TimelineProps) {
    const timelineData = useMemo(() => {
        return steps.map((step, idx) => {
            const config = getStepConfig(step.type);
            const isUserFacing = step.plannerResponse?.modifiedResponse || step.plannerResponse?.response;
            const role = isUserFacing ? 'response' : config.role;
            return { idx, role, config, isUserFacing };
        });
    }, [steps]);

    return (
        <div className="border-b border-border bg-background/50 backdrop-blur px-4 py-2 flex-shrink-0">
            <div className="flex items-center gap-0.5 h-6 overflow-x-auto">
                {timelineData.map(({ idx, role, config, isUserFacing }) => (
                    <Tooltip key={idx}>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onSelectStep(idx)}
                                className={`
                  h-full min-w-[3px] max-w-[6px] flex-1 rounded-sm transition-all hover:opacity-70 hover:scale-y-125
                  ${roleColors[role] || 'bg-gray-500'} opacity-80
                `}
                            />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-[10px]">
                            #{idx + 1} {isUserFacing ? 'Agent' : `${config.icon} ${config.label}`}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
            <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">Step #1</span>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> User</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500 inline-block" /> Agent</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" /> Tool</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> System</span>
                </div>
                <span className="text-[9px] text-muted-foreground">#{steps.length}</span>
            </div>
        </div>
    );
}
