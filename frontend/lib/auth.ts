// === JWT Authentication ===
// Uses HttpOnly cookies for secure token storage (XSS protection)
// CSRF protection via double-submit cookie pattern

import { API_BASE } from './config';
import { startTokenRefreshTimer, stopTokenRefreshTimer, apiClient } from './api-client';

// Read CSRF token from cookie
export function getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : null;
}

// Login with auth key - exchanges for JWT tokens in HttpOnly cookies
export async function login(authKey: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authKey }),
        });

        if (res.ok) {
            // Start automatic token refresh (every 13 minutes)
            startTokenRefreshTimer();
            return { success: true };
        }

        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error || 'Invalid key' };
    } catch (err) {
        return { success: false, error: 'Cannot reach server' };
    }
}

// Logout - clears JWT cookies on server
export async function logout(): Promise<void> {
    try {
        // Use apiClient to handle token refresh if access token expired
        await apiClient(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
        });
    } catch {
        // Ignore errors - cookies will expire anyway
    } finally {
        stopTokenRefreshTimer();
    }
}

// Check if user is authenticated (has valid access token)
// If access token expired but refresh token valid, automatically refreshes
export async function checkAuth(): Promise<boolean> {
    try {
        const res = await apiClient(`${API_BASE}/api/auth/status`, {
            method: 'GET',
        });
        
        // If successful, start refresh timer (handles both fresh login and restored session)
        if (res.ok) {
            startTokenRefreshTimer();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}
