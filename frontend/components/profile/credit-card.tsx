import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function CreditCard({ label, icon, used, available, total, pct }: {
    label: string; icon: ReactNode; used: number; available: number; total: number; pct: number;
}) {
    return (
        <div className="p-4 rounded-lg bg-muted/15 border border-border/50">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium flex items-center gap-1.5">
                    <span>{icon}</span> {label}
                </span>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold">{available.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">/ {total.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden mb-1.5">
                <div className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pct > 50 ? "bg-green-500/80" :
                        pct > 20 ? "bg-amber-500/80" : "bg-red-500/80"
                )} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{pct}% remaining</span>
                <span className="text-[10px] text-muted-foreground">{used.toLocaleString()} used</span>
            </div>
        </div>
    );
}
