import {
    User, MessageCircle, Megaphone, FileEdit, CheckCircle, Zap, BarChart2,
    Keyboard, FileText, FolderOpen, Globe, ClipboardList, Search, XCircle,
    Save, MessageSquare, ScrollText, BookOpen, FileSearch, Settings, Wrench,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Map icon name → Lucide component */
const ICON_MAP: Record<string, LucideIcon> = {
    User,
    MessageCircle,
    Megaphone,
    FileEdit,
    CheckCircle,
    Zap,
    BarChart2,
    Keyboard,
    FileText,
    FolderOpen,
    Globe,
    ClipboardList,
    Search,
    XCircle,
    Save,
    MessageSquare,
    ScrollText,
    BookOpen,
    FileSearch,
    Settings,
    Wrench,
};

interface StepIconProps {
    name: string;
    className?: string;
}

/** Render a Lucide icon by name string. Falls back to Settings icon. */
export function StepIcon({ name, className }: StepIconProps) {
    const Icon = ICON_MAP[name] || Settings;
    return <Icon className={cn('h-3.5 w-3.5', className)} />;
}
