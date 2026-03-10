// === API Client with JWT Cookie Authentication ===
// Wraps fetch() to automatically include credentials and handle token refresh

import { API_BASE } from './config';

// Read CSRF token from cookie
function getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : null;
}

// Global refresh lock - ensures only one refresh attempt at a time
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Refresh access token using refresh token cookie (single-flight)
async function refreshAccessToken(): Promise<boolean> {
    // If already refreshing, wait for that attempt
    if (isRefreshing && refreshPromise) {
        return refreshPromise;
    }

    // Start new refresh attempt
    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const csrf = getCsrfToken();
            const res = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                },
            });
            return res.ok;
        } catch {
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

// Fetch wrapper with automatic cookie credentials and 401 retry
export async function apiClient(url: string, options: RequestInit = {}): Promise<Response> {
    const csrf = getCsrfToken();
    
    // Merge default options with user options
    const defaultOptions: RequestInit = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            ...(options.headers || {}),
        },
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // First attempt
    let response = await fetch(url, mergedOptions);

    // If 401, try to refresh token and retry once
    if (response.status === 401) {
        const refreshed = await refreshAccessToken();

        if (refreshed) {
            // Retry original request with new access token
            const newCsrf = getCsrfToken();
            if (newCsrf && mergedOptions.headers) {
                (mergedOptions.headers as Record<string, string>)['X-CSRF-Token'] = newCsrf;
            }
            response = await fetch(url, mergedOptions);
        } else {
            // Bug fix: Refresh failed, redirect to login
            console.warn('[Auth] 401 and refresh failed - redirecting to login');
            stopTokenRefreshTimer();
            window.location.reload();
        }
    }

    return response;
}

// Start automatic token refresh timer (every 13 minutes)
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export function startTokenRefreshTimer(): void {
    if (refreshTimer) return; // Already running

    refreshTimer = setInterval(async () => {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            console.warn('[Auth] Token refresh failed - redirecting to login');
            // Bug fix: Redirect to login on refresh failure instead of silent fail
            stopTokenRefreshTimer();
            window.location.reload(); // Force re-auth
        }
    }, 13 * 60 * 1000); // 13 minutes (access token expires at 15 min)
}

export function stopTokenRefreshTimer(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}
