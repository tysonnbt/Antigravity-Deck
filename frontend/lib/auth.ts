// === Auth Key Management ===
// Stores auth key in localStorage. When set, all API calls include X-Auth-Key header
// and WebSocket connections include ?auth_key= query param.

const AUTH_KEY_STORAGE = 'antigravity_auth_key';

export function getAuthKey(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(AUTH_KEY_STORAGE) || '';
}

export function setAuthKey(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTH_KEY_STORAGE, key);
}

export function clearAuthKey(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(AUTH_KEY_STORAGE);
}

// Build headers with auth key
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const key = getAuthKey();
    return {
        'Content-Type': 'application/json',
        ...(key ? { 'X-Auth-Key': key } : {}),
        ...extra,
    };
}

// Build WebSocket URL with auth key as query param
// DEPRECATED: Auth is now via message after connect (see ws-service.ts)
// Kept for backward compatibility with older clients
export function authWsUrl(baseUrl: string): string {
    const key = getAuthKey();
    if (!key) return baseUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}auth_key=${encodeURIComponent(key)}`;
}
