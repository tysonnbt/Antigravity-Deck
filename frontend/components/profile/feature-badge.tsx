import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

export function FeatureBadge({ label, enabled, value }: { label: string; enabled?: boolean; value?: string }) {
    if (value !== undefined) {
        return (
            <div className="px-3 py-2 rounded-lg bg-muted/10 border border-border/30">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className="text-xs font-medium mt-0.5">{value}</div>
            </div>
        );
    }
    return (
        <div className={cn(
            "px-3 py-2 rounded-lg border flex items-center gap-1.5",
            enabled
                ? "bg-green-500/5 border-green-500/20 text-green-500"
                : "bg-muted/10 border-border/30 text-muted-foreground/50"
        )}>
            <span className="text-[10px]">{enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
            <span className="text-xs">{label}</span>
        </div>
    );
}
