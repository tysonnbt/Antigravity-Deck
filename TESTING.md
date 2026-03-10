# Phase 3.2 JWT Migration - Testing Guide

**Time Required:** 30 minutes  
**Prerequisites:** Backend running with `JWT_SECRET=your-secret` and `AUTH_KEY=your-key`

## Setup

```bash
# Backend (Terminal 1)
JWT_SECRET=test-secret-key AUTH_KEY=test-key npm start

# Frontend (Terminal 2)
cd frontend && npm run dev
```

Open browser DevTools: Network tab + Application > Cookies

---

## Critical Path Tests (10 tests)

### 1. Login Flow
- [ ] **Test**: Enter valid AUTH_KEY, click "Enter"
- [ ] **Pass**: Redirected to app, 3 cookies set (access_token, refresh_token, csrf_token)
- [ ] **Verify**: Application > Cookies shows httpOnly flag on access_token and refresh_token

### 2. Invalid Login
- [ ] **Test**: Clear cookies, enter wrong key, click "Enter"
- [ ] **Pass**: Error "Invalid key" shown, no cookies set

### 3. API Calls Use Cookies
- [ ] **Test**: After login, navigate to workspaces/conversations
- [ ] **Pass**: Network tab shows Cookie header in all requests
- [ ] **Verify**: POST/DELETE requests include X-CSRF-Token header

### 4. CSRF Protection
- [ ] **Test**: Console: `fetch('http://localhost:3500/api/settings', {method: 'POST', credentials: 'include', body: '{}'})`
- [ ] **Pass**: Request fails with 403 (missing CSRF token)

### 5. Session Restoration
- [ ] **Test**: Login, reload page (F5)
- [ ] **Pass**: Stay logged in, no login screen shown
- [ ] **Verify**: Cookies persist across reload

### 6. Token Refresh on 401
- [ ] **Test**: Login, delete access_token cookie (keep refresh_token), perform any action
- [ ] **Pass**: Action succeeds, new access_token cookie appears
- [ ] **Verify**: Network shows /api/auth/refresh call before action

### 7. Automatic Refresh Timer
- [ ] **Test**: Login, wait 14 minutes (keep tab open)
- [ ] **Pass**: At 13-minute mark, /api/auth/refresh call appears in Network tab
- [ ] **Verify**: New access_token cookie set

### 8. WebSocket Authentication
- [ ] **Test**: Login, navigate to conversation, check Network > WS tab
- [ ] **Pass**: WebSocket connects successfully
- [ ] **Verify**: WS URL has NO auth_key query parameter (uses cookies)

### 9. Logout Success
- [ ] **Test**: Login, click avatar > Logout
- [ ] **Pass**: Redirected to login screen, all auth cookies cleared
- [ ] **Verify**: Application > Cookies shows no access_token/refresh_token/csrf_token

### 10. Logout Failure Handling
- [ ] **Test**: Login, delete access_token + refresh_token cookies, click Logout
- [ ] **Pass**: Error alert shown, page does NOT reload
- [ ] **Verify**: User remains on current page (logout failed gracefully)

---

## Security Validation (5 tests)

### 11. XSS Protection
- [ ] **Test**: Console: `document.cookie`
- [ ] **Pass**: access_token and refresh_token NOT visible (httpOnly)
- [ ] **Verify**: Only csrf_token visible in output

### 12. Cookie Security Flags
- [ ] **Test**: Application > Cookies, inspect access_token
- [ ] **Pass**: httpOnly=true, sameSite=Strict
- [ ] **Note**: secure=false on localhost (true in production)

### 13. Token Reuse Detection
- [ ] **Test**: Login, copy refresh_token value, logout, manually set refresh_token cookie, try refresh
- [ ] **Pass**: Refresh fails (token already consumed)
- [ ] **Verify**: Backend logs show token reuse detection

### 14. Concurrent Refresh Prevention
- [ ] **Test**: Login, open 2 tabs, delete access_token in both, trigger API call in both simultaneously
- [ ] **Pass**: Only 1 /api/auth/refresh call appears (single-flight lock)
- [ ] **Verify**: Both tabs get new access_token

### 15. Localhost Bypass (Dev Mode)
- [ ] **Test**: Access from localhost/127.0.0.1
- [ ] **Pass**: Login screen bypassed, direct access to app
- [ ] **Note**: Production requires authentication

---

## Pass Criteria

✅ All 15 tests pass  
✅ No localStorage usage for auth tokens  
✅ All API calls use cookies automatically  
✅ CSRF protection blocks unauthorized mutations  
✅ Token refresh transparent to user  
✅ Logout reliably clears server-side session  

## Troubleshooting

**Login fails with "Invalid key":**
- Check backend AUTH_KEY environment variable matches input

**401 errors on all requests:**
- Check JWT_SECRET is set on backend
- Clear all cookies and re-login

**WebSocket connection fails:**
- Check backend is running on correct port
- Verify cookies are being sent (Network > WS > Headers)

**Token refresh not working:**
- Check browser console for errors
- Verify refresh_token cookie exists and hasn't expired (7 days)
