'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Web Speech API types ---------- */
interface SpeechEvent extends Event { results: SpeechRecognitionResultList; resultIndex: number }
interface SpeechErrorEvent extends Event { error: string }
interface SR extends EventTarget {
    lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
    start(): void; stop(): void; abort(): void;
    onresult: ((e: SpeechEvent) => void) | null;
    onerror: ((e: SpeechErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}
declare global { interface Window { SpeechRecognition: new () => SR; webkitSpeechRecognition: new () => SR } }

const canSpeak = () => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/* ---------- Sound wave (memoized — won't re-render from timer) ---------- */
const SoundWave = memo(function SoundWave() {
    return (
        <div className="flex items-center gap-[3px] h-5">
            {[0, 1, 2, 3, 4].map(i => (
                <span
                    key={i}
                    className="w-[3px] rounded-full bg-sky-400"
                    style={{ animation: `voice-wave 1s ease-in-out ${i * 0.12}s infinite`, height: '6px' }}
                />
            ))}
            <style jsx>{`
                @keyframes voice-wave {
                    0%, 100% { height: 6px; opacity: 0.4; }
                    50% { height: 18px; opacity: 1; }
                }
            `}</style>
        </div>
    );
});

/* ---------- Component ---------- */
interface Props {
    onTranscript: (text: string) => void;
    lang?: string;
    className?: string;
    disabled?: boolean;
}

export function VoiceInputButton({ onTranscript, lang, className, disabled = false }: Props) {
    const [listening, setListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [supported, setSupported] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const recRef = useRef<SR | null>(null);
    const bufRef = useRef('');
    const manualStop = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Stable ref for onTranscript to avoid stale closures
    const onTranscriptRef = useRef(onTranscript);
    onTranscriptRef.current = onTranscript;

    useEffect(() => { setSupported(canSpeak()); }, []);
    useEffect(() => () => {
        try { recRef.current?.abort(); } catch { }
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);
    useEffect(() => {
        if (!error) return;
        const t = setTimeout(() => setError(null), 4000);
        return () => clearTimeout(t);
    }, [error]);

    // Elapsed timer
    useEffect(() => {
        if (!listening) {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            return;
        }
        setElapsed(0);
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
        return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    }, [listening]);

    const emitAndStop = useCallback(() => {
        const txt = bufRef.current.trim();
        if (txt) onTranscriptRef.current(txt);
        bufRef.current = '';
        setListening(false);
        recRef.current = null;
    }, []);

    const start = useCallback(() => {
        if (!canSpeak()) { setError('Not supported'); return; }

        bufRef.current = '';
        manualStop.current = false;
        setError(null);

        const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
        const r = new Ctor();
        r.lang = lang || navigator.language || 'en-US';
        r.continuous = true;
        r.interimResults = false;
        r.maxAlternatives = 1;

        r.onstart = () => setListening(true);

        r.onresult = (e: SpeechEvent) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) bufRef.current += e.results[i][0].transcript;
            }
        };

        r.onerror = (e: SpeechErrorEvent) => {
            if (manualStop.current || e.error === 'aborted') return;
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                setError('Mic access denied');
                setListening(false);
            }
        };

        r.onend = () => {
            if (manualStop.current) return;
            try { r.start(); } catch { emitAndStop(); }
        };

        recRef.current = r;
        try { r.start(); } catch { setError('Could not start'); }
    }, [lang, emitAndStop]);

    const stop = useCallback(() => {
        manualStop.current = true;
        try { recRef.current?.abort(); } catch { }
        recRef.current = null;
        emitAndStop();
    }, [emitAndStop]);

    const toggle = useCallback(() => {
        listening ? stop() : start();
    }, [listening, start, stop]);

    if (!supported) return null;

    return (
        <>
            <div className="relative">
                <Button
                    variant="ghost" size="icon"
                    className={cn(
                        'shrink-0 h-9 w-9 sm:h-11 sm:w-11 rounded-lg border transition-all duration-200',
                        listening ? 'border-sky-500/50 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20' : 'border-border/50 text-muted-foreground hover:text-foreground',
                        className,
                    )}
                    onClick={toggle} disabled={disabled}
                    title={listening ? 'Stop recording' : 'Voice input'}
                >
                    <Mic className="h-4 w-4" />
                </Button>

                {listening && (
                    <span className="absolute inset-0 rounded-lg pointer-events-none">
                        <span className="absolute inset-0 rounded-lg animate-ping bg-sky-500/20" />
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                    </span>
                )}

                {error && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-destructive text-destructive-foreground text-[10px] rounded-md whitespace-nowrap shadow-lg z-50 animate-in fade-in slide-in-from-bottom-1 duration-200">
                        {error}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-destructive" />
                    </div>
                )}
            </div>

            {listening && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
                    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-sky-500/30 shadow-2xl shadow-sky-500/10">
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/15">
                            <span className="w-3 h-3 rounded-full bg-sky-500 animate-pulse" />
                            <span className="absolute inset-0 rounded-full animate-ping bg-sky-500/20" />
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-[140px]">
                            <div className="flex items-center gap-2">
                                <SoundWave />
                                <span className="text-xs font-medium text-sky-400">Listening...</span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                                </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Tap Stop when done</p>
                        </div>

                        <button
                            onClick={stop}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-xs font-medium transition-colors border border-sky-500/20"
                        >
                            <MicOff className="w-3.5 h-3.5" />
                            Stop
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
