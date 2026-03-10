'use client';
import { useState, useCallback, useEffect } from 'react';
import { setAuthKey, getAuthKey } from '@/lib/auth';
import { API_BASE } from '@/lib/config';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock } from 'lucide-react';

interface AuthGateProps {
    children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);

    // Client-side auth check after hydration (avoids SSR mismatch)
    useEffect(() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setAuthenticated(true);
        } else if (getAuthKey()) {
            setAuthenticated(true);
        }
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!key.trim()) return;
        setChecking(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/api/settings`, {
                headers: { 'X-Auth-Key': key.trim() }
            });
            if (res.ok) {
                setAuthKey(key.trim());
                setAuthenticated(true);
            } else {
                setError('Invalid key');
            }
        } catch {
            setError('Cannot reach server');
        } finally {
            setChecking(false);
        }
    }, [key]);

    if (authenticated) return <>{children}</>;

    return (
        <div className="min-h-dvh bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center pb-2">
                    <div className="mb-3"><Lock className="h-10 w-10 text-muted-foreground mx-auto" /></div>
                    <CardTitle className="text-xl">AntigravityChat</CardTitle>
                    <CardDescription>Enter your access key to continue</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            type="password"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="Access key"
                            autoFocus
                        />
                        {error && (
                            <p className="text-destructive text-xs text-center">{error}</p>
                        )}
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={checking || !key.trim()}
                        >
                            {checking ? 'Checking...' : 'Enter'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
