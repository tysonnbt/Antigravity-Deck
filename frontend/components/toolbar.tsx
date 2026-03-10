'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Search } from 'lucide-react';

interface ToolbarProps {
    searchQuery: string;
    onSearchChange: (q: string) => void;
    matchCount: number;
}

export function Toolbar({
    searchQuery, onSearchChange, matchCount,
}: ToolbarProps) {
    return (
        <div className="flex items-center px-2 sm:px-4 py-1.5 bg-background/80 backdrop-blur border-b border-border">
            <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search steps..."
                        className="h-7 pl-7 pr-16 text-xs bg-muted/50"
                    />
                    {searchQuery && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <span className="text-[10px] text-green-400 font-mono">{matchCount}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => onSearchChange('')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
