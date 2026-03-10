import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { useState } from 'react';

// === Helpers ===

export function isUserInput(step: Step): boolean {
    return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
}

export function isAgentResponse(step: Step): boolean {
    if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
    if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
        return !!step.plannerResponse?.modifiedResponse;
    }
    return false;
}

export function isGenerateImage(step: Step): boolean {
    return step.type === 'CORTEX_STEP_TYPE_GENERATE_IMAGE' || !!step.generateImage;
}

// === Types ===
export interface StepGroup {
    type: 'user' | 'response' | 'processing' | 'image';
    steps: { step: Step; originalIndex: number }[];
}

// === Grouping ===
export function groupSteps(steps: Step[]): StepGroup[] {
    const groups: StepGroup[] = [];
    let proc: { step: Step; originalIndex: number }[] = [];
    const flush = () => {
        if (proc.length > 0) { groups.push({ type: 'processing', steps: [...proc] }); proc = []; }
    };
    steps.forEach((step, idx) => {
        if (isUserInput(step)) { flush(); groups.push({ type: 'user', steps: [{ step, originalIndex: idx }] }); }
        else if (isAgentResponse(step)) { flush(); groups.push({ type: 'response', steps: [{ step, originalIndex: idx }] }); }
        else if (isGenerateImage(step)) { flush(); groups.push({ type: 'image', steps: [{ step, originalIndex: idx }] }); }
        else { proc.push({ step, originalIndex: idx }); }
    });
    flush();
    return groups;
}

// === Copy hook ===
export function useCopy() {
    const [copied, setCopied] = useState(false);
    const copy = async (text: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return { copied, copy };
}
