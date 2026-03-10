# Phase 3.2 Frontend JWT Migration - Manual Test Plan

## Prerequisites
- Backend server running with JWT_SECRET and AUTH_KEY environment variables
- Frontend dev server running (npm run dev)
- Browser DevTools open (Network + Application tabs)

## Test Scenarios

### 1. Login Flow
**Test 1.1: Valid Login**
- [ ] Navigate to frontend URL
- [ ] Enter valid AUTH_KEY in login form
- [ ] Click "Enter" button
- [ ] **Expected**: Redirected to main app, cookies set (access_token, refresh_token, csrf_token)
- [ ] **Verify**: Check Application > Cookies - all 3 cookies present with httpOnly flag

**Test 1.2: Invalid Login**
- [ ] Clear cookies and reload page
- [ ] Enter invalid key
- [ ] Click "Enter"
- [ ] **Expected**: Error message "Invalid key" displayed
- [ ] **Verify**: No cookies set

**Test 1.3: Localhost Bypass**
- [ ] Access from localhost/127.0.0.1
- [ ] **Expected**: Login screen bypassed, direct access to app
- [ ] **Verify**: Works without authentication

### 2. API Calls with Cookies
**Test 2.1: Authenticated API Calls**
- [ ] After successful login, open Network tab
- [ ] Navigate through app (workspaces, conversations)
- [ ] **Expected**: All API calls include Cookie header with tokens
- [ ] **Expected**: All POST/PUT/DELETE requests include X-CSRF-Token header
- [ ] **Verify**: Check request headers in Network tab

**Test 2.2: CSRF Protection**
- [ ] After login, open Console
- [ ] Run: `fetch('http://localhost:3500/api/settings', {method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'}, body: '{}'})`
- [ ] **Expected**: Request fails (missing CSRF token)
- [ ] **Verify**: Backend rejects request with 403

### 3. Token Refresh on 401
**Test 3.1: Automatic Refresh**
- [ ] Login successfully
- [ ] Wait 16 minutes (access token expires at 15 min)
- [ ] Perform any API action (create workspace, load conversations)
- [ ] **Expected**: Request succeeds after automatic token refresh
- [ ] **Verify**: Network tab shows /api/auth/refresh call followed by retry

**Test 3.2: Refresh Token Expiry**
- [ ] Login successfully
- [ ] Manually delete access_token cookie (keep refresh_token)
- [ ] Perform API action
- [ ] **Expected**: Token refresh succeeds, new access_token set
- [ ] **Verify**: Check cookies - new access_token present

### 4. Automatic Token Refresh Timer
**Test 4.1: Background Refresh**
- [ ] Login successfully
- [ ] Keep browser tab open for 14 minutes
- [ ] **Expected**: At 13-minute mark, automatic refresh occurs
- [ ] **Verify**: Network tab shows /api/auth/refresh call
- [ ] **Verify**: New access_token cookie set

### 5. Logout Flow
**Test 5.1: Manual Logout**
- [ ] Login successfully
- [ ] Click user avatar dropdown
- [ ] Click "Logout" menu item
- [ ] **Expected**: All cookies cleared, redirected to login screen
- [ ] **Verify**: Application > Cookies shows no auth cookies

**Test 5.2: Logout Clears Timer**
- [ ] Login successfully
- [ ] Logout
- [ ] Wait 15 minutes
- [ ] **Expected**: No background refresh attempts
- [ ] **Verify**: Network tab shows no /api/auth/refresh calls

### 6. WebSocket Authentication
**Test 6.1: WebSocket Connection with Cookies**
- [ ] Login successfully
- [ ] Open Network tab > WS filter
- [ ] Navigate to a conversation
- [ ] **Expected**: WebSocket connection established
- [ ] **Verify**: WS connection URL has NO auth_key query parameter
- [ ] **Verify**: Connection succeeds (cookies sent automatically)

**Test 6.2: WebSocket Reconnection**
- [ ] Establish WebSocket connection
- [ ] Stop backend server
- [ ] Start backend server
- [ ] **Expected**: WebSocket reconnects automatically
- [ ] **Verify**: Connection re-established with cookies

### 7. Session Persistence
**Test 7.1: Page Reload**
- [ ] Login successfully
- [ ] Reload page (F5)
- [ ] **Expected**: Remain logged in, no login screen
- [ ] **Verify**: Cookies persist across reload

**Test 7.2: New Tab**
- [ ] Login in Tab 1
- [ ] Open new tab with same URL
- [ ] **Expected**: New tab authenticated (cookies shared)
- [ ] **Verify**: No login screen in new tab

### 8. Security Validation
**Test 8.1: Cookie Flags**
- [ ] Login successfully
- [ ] Open Application > Cookies
- [ ] **Expected**: access_token and refresh_token have httpOnly flag
- [ ] **Expected**: All cookies have sameSite=Strict
- [ ] **Expected**: secure flag present in production (not localhost)

**Test 8.2: XSS Protection**
- [ ] Login successfully
- [ ] Open Console
- [ ] Run: `document.cookie`
- [ ] **Expected**: access_token and refresh_token NOT visible
- [ ] **Expected**: Only csrf_token visible (not httpOnly)

**Test 8.3: Token Reuse Detection**
- [ ] Login successfully
- [ ] Copy refresh_token cookie value
- [ ] Logout
- [ ] Manually set refresh_token cookie to copied value
- [ ] Try to refresh token
- [ ] **Expected**: Refresh fails (token already consumed)

## Success Criteria
- All 20+ test cases pass
- No localStorage usage for auth tokens
- All API calls use cookies automatically
- CSRF protection working on all mutations
- Token refresh transparent to user
- WebSocket auth works without query params
- Logout fully clears session

## Known Issues / Notes
- Localhost bypass remains for development convenience
- Token refresh timer starts on login, stops on logout
- Refresh token rotation prevents concurrent refresh attempts
- CSRF token readable by JS (required for header injection)
