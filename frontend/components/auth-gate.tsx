'use client';
import { useState, useCallback, useEffect } from 'react';
import { login, checkAuth } from '@/lib/auth';
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
        // Check if user has valid JWT token
        // Note: This PR implements JWT authentication as the primary auth mode
        // Backend must have JWT_SECRET set. For local dev without auth, set ALLOW_LOCALHOST_BYPASS=true
        checkAuth().then(isAuth => {
            if (isAuth) setAuthenticated(true);
        });
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!key.trim()) return;
        setChecking(true);
        setError('');

        const result = await login(key.trim());
        if (result.success) {
            setAuthenticated(true);
        } else {
            setError(result.error || 'Invalid key');
        }
        setChecking(false);
    }, [key]);

    if (authenticated) return <>{children}</>;

    return (
        <div className="min-h-dvh bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center pb-2">
                    <div className="mb-3"><Lock className="h-8 w-8 text-muted-foreground mx-auto" /></div>
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
