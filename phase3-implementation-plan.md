# Phase 3: JWT Authentication Overhaul - Implementation Plan

**Status:** Planning Complete - Ready for Implementation
**Estimated Time:** ~14 hours
**Breaking Change:** YES - All users must re-authenticate

---

## Executive Summary

Replace localStorage-based auth key system with secure JWT tokens in HttpOnly cookies. This eliminates XSS vulnerability and implements industry-standard authentication.

**Current System:**
- Auth key stored in localStorage (XSS vulnerable)
- `X-Auth-Key` header sent with every request
- No token expiration
- No logout functionality
- No 401 error handling

**Target System:**
- JWT tokens in HttpOnly cookies (XSS protected)
- Short-lived access tokens (15 min) + refresh tokens (7 days)
- Automatic token refresh
- CSRF protection (double-submit cookie)
- Proper logout with token revocation
- 401 error handling with auto-refresh

---

## Research Findings Summary

### Backend Current Implementation
- **Auth middleware:** Inline anonymous function in server.js (lines 197-238)
- **Protected routes:** All `/api/*` except `/api/ws-url`
- **WebSocket auth:** Query param `auth_key` in ws.js (lines 12-29)
- **Validation:** Timing-safe comparison with `crypto.timingSafeEqual()`
- **CORS:** Already allows `Authorization` header ✅

### Frontend Current Implementation
- **Auth storage:** `lib/auth.ts` - localStorage with key `antigravity_auth_key`
- **API calls:** `lib/cascade-api.ts` - All use `authHeaders()` with `X-Auth-Key`
- **WebSocket:** `lib/websocket.ts` - Adds `auth_key` query param
- **Login UI:** `components/auth-gate.tsx` - Password input, validates against `/api/settings`
- **No logout:** `clearAuthKey()` exists but never called
- **No 401 handling:** API calls just throw generic errors

### JWT Best Practices (from Research)
- **Algorithm:** HS256 for simplicity (single backend), RS256 for multi-service
- **Access token:** 15 minutes expiry
- **Refresh token:** 7 days with rotation (single-use)
- **Cookie flags:** `httpOnly: true, secure: true, sameSite: 'strict'`
- **CSRF:** Double-submit cookie pattern for browser clients
- **WebSocket:** Verify JWT on upgrade handshake from query param or cookie

---

## Architecture Decisions

### 1. Token Strategy
**Decision:** HS256 with refresh token rotation

**Rationale:**
- Single backend server (no need for RS256 asymmetric keys)
- Refresh token rotation provides security against token theft
- Simpler key management (single secret vs key pair)

### 2. Token Storage
**Decision:** HttpOnly cookies for both access and refresh tokens

**Rationale:**
- Prevents XSS attacks (JavaScript cannot read cookies)
- Automatic sending by browser (no manual header management)
- Secure flag ensures HTTPS-only transmission

### 3. CSRF Protection
**Decision:** Double-submit cookie pattern

**Rationale:**
- Simple to implement (no server-side session storage)
- Effective against CSRF attacks
- Minimal performance overhead

### 4. Backward Compatibility
**Decision:** NO backward compatibility - clean break

**Rationale:**
- Security migration should be complete, not gradual
- Maintaining dual auth systems increases attack surface
- Users can re-authenticate once (acceptable for security fix)

### 5. Refresh Token Storage
**Decision:** In-memory Map (MVP), migrate to Redis later

**Rationale:**
- Simplest implementation for MVP
- Sufficient for single-instance deployment
- Easy to migrate to Redis when scaling

---

## Implementation Phases

### Phase 3.1: Backend JWT Infrastructure (~4 hours)

#### Step 1.1: Install Dependencies
```bash
npm install jsonwebtoken cookie-parser
npm install --save-dev @types/jsonwebtoken @types/cookie-parser
```

#### Step 1.2: Create JWT Utilities (`src/jwt-utils.js`)
- `generateTokens(userId)` - Create access + refresh token pair
- `verifyAccessToken(token)` - Verify and decode access token
- `verifyRefreshToken(token)` - Verify and decode refresh token
- Token payload structure: `{ sub: userId, jti: tokenId, iat, exp }`

#### Step 1.3: Create Token Store (`src/token-store.js`)
- In-memory Map for refresh tokens
- `storeRefreshToken(jti, userId, expiresAt)`
- `isRefreshTokenValid(jti)` - Check not revoked
- `revokeRefreshToken(jti)` - Mark as revoked
- `revokeAllUserTokens(userId)` - Revoke all on security incident

#### Step 1.4: Create Auth Endpoints (`src/auth-routes.js`)
- `POST /api/auth/login` - Exchange AUTH_KEY for JWT tokens
- `POST /api/auth/refresh` - Rotate refresh token, issue new access token
- `POST /api/auth/logout` - Revoke refresh token, clear cookies

#### Step 1.5: Update Auth Middleware (`server.js`)
- Replace x-auth-key validation with JWT verification
- Extract token from `Authorization: Bearer <token>` header OR `access_token` cookie
- Set `req.user = { id: decoded.sub }` for downstream use

#### Step 1.6: Update WebSocket Auth (`src/ws.js`)
- Extract JWT from query param `token` or cookie `access_token`
- Verify JWT on upgrade handshake
- Attach `req.user` to WebSocket connection

---

### Phase 3.2: CSRF Protection (~2 hours)

#### Step 2.1: CSRF Token Generation
- Generate random token on login: `crypto.randomBytes(32).toString('hex')`
- Set as cookie: `csrf_token` (httpOnly: false, so client can read)
- Return in login response body

#### Step 2.2: CSRF Middleware (`src/csrf-middleware.js`)
- Verify `csrf_token` cookie matches `X-CSRF-Token` header
- Skip for stateless API clients (check `X-API-Client: true` header)
- Apply to state-changing endpoints (POST, PUT, DELETE)

#### Step 2.3: Update CORS Headers
- Add `X-CSRF-Token` to `Access-Control-Allow-Headers`

---

### Phase 3.3: Frontend Migration (~6 hours)

#### Step 3.1: Update Auth Module (`lib/auth.ts`)
- Remove `getAuthKey()`, `setAuthKey()`, `clearAuthKey()`
- Add `login(authKey)` - POST to `/api/auth/login`, store CSRF token
- Add `logout()` - POST to `/api/auth/logout`, clear CSRF token
- Add `getCsrfToken()` - Read from localStorage (not httpOnly)
- Remove `authHeaders()` - no longer needed (cookies sent automatically)

#### Step 3.2: Create API Client with Interceptors (`lib/api-client.ts`)
- Wrapper around `fetch` with automatic CSRF header
- 401 error interceptor: attempt token refresh, retry request
- On refresh failure: clear auth, redirect to login

#### Step 3.3: Update All API Calls (`lib/cascade-api.ts`)
- Replace `fetch()` with `apiClient.fetch()`
- Remove `authHeaders()` calls
- Add `credentials: 'include'` to all requests (send cookies)

#### Step 3.4: Update WebSocket (`lib/websocket.ts`)
- Remove `authWsUrl()` function
- WebSocket will use cookie automatically (no query param needed)
- Or keep query param for explicit token passing (backend supports both)

#### Step 3.5: Update Login UI (`components/auth-gate.tsx`)
- Change from key validation to login flow
- Call `login(authKey)` instead of `setAuthKey()`
- Handle login errors (invalid key, network failure)
- Remove localhost bypass (security requirement)

#### Step 3.6: Add Logout UI (`components/app-sidebar.tsx`)
- Add "Sign Out" button to user dropdown
- Call `logout()` on click
- Redirect to login page

#### Step 3.7: Add Token Refresh Logic (`lib/auth.ts`)
- Background timer to refresh token before expiry (13 min interval)
- On 401 response, attempt refresh once
- On refresh failure, logout user

---

### Phase 3.4: Testing & Validation (~2 hours)

#### Step 4.1: Backend Tests (`test-jwt-auth.js`)
- Login with valid AUTH_KEY → receives JWT cookies
- Login with invalid AUTH_KEY → 401 error
- Access protected endpoint with valid JWT → success
- Access protected endpoint with expired JWT → 401 error
- Refresh token rotation → new tokens issued, old token revoked
- Refresh token reuse detection → all user tokens revoked
- Logout → tokens revoked, cookies cleared
- CSRF protection → request without CSRF token rejected

#### Step 4.2: Frontend Tests (Manual)
- Login flow works
- API calls succeed with JWT cookies
- Token refresh happens automatically
- Logout clears session
- 401 errors trigger re-login
- WebSocket connection authenticated

#### Step 4.3: Security Validation
- Verify cookies have correct flags (httpOnly, secure, sameSite)
- Verify CSRF protection works
- Verify token expiration enforced
- Verify refresh token rotation works
- Verify logout revokes tokens

---

## File Changes Summary

### New Files
- `src/jwt-utils.js` - JWT generation/verification utilities
- `src/token-store.js` - Refresh token storage (in-memory)
- `src/auth-routes.js` - Login/refresh/logout endpoints
- `src/csrf-middleware.js` - CSRF protection middleware
- `lib/api-client.ts` - Fetch wrapper with interceptors
- `test-jwt-auth.js` - Backend JWT tests

### Modified Files
- `server.js` - Replace auth middleware, add cookie-parser, mount auth routes
- `src/ws.js` - JWT verification on WebSocket upgrade
- `src/routes.js` - No changes (inherits auth from server.js)
- `lib/auth.ts` - Replace localStorage with login/logout functions
- `lib/cascade-api.ts` - Use apiClient instead of fetch
- `lib/websocket.ts` - Remove auth query param (use cookies)
- `components/auth-gate.tsx` - Update login flow
- `components/app-sidebar.tsx` - Add logout button
- `package.json` - Add jsonwebtoken, cookie-parser dependencies

---

## Environment Variables

### New Required Variables
```bash
# JWT secret for signing tokens (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-key-here

# Optional: Separate secret for refresh tokens
REFRESH_TOKEN_SECRET=your-refresh-secret-here
```

### Existing Variables (Keep)
```bash
AUTH_KEY=your-auth-key  # Still used for initial login
ALLOW_LOCALHOST_BYPASS=false  # Disable for security
```

---

## Breaking Changes

### For Users
1. **Must re-authenticate** - All existing sessions invalidated
2. **No localhost bypass** - Must use AUTH_KEY even on localhost (security requirement)
3. **Logout required** - Can't just close browser, must explicitly logout

### For Developers
1. **Frontend API calls** - Must use `apiClient` instead of raw `fetch`
2. **WebSocket connection** - No longer needs manual auth_key in URL
3. **Testing** - Must set JWT_SECRET env var

---

## Migration Checklist

### Pre-Implementation
- [x] Research JWT best practices
- [x] Analyze current auth implementation
- [x] Create detailed implementation plan
- [ ] Review plan with team/user
- [ ] Generate JWT_SECRET for development

### Backend Implementation
- [ ] Install dependencies (jsonwebtoken, cookie-parser)
- [ ] Create jwt-utils.js
- [ ] Create token-store.js
- [ ] Create auth-routes.js
- [ ] Create csrf-middleware.js
- [ ] Update server.js auth middleware
- [ ] Update ws.js WebSocket auth
- [ ] Test backend with curl/Postman

### Frontend Implementation
- [ ] Update lib/auth.ts
- [ ] Create lib/api-client.ts
- [ ] Update lib/cascade-api.ts
- [ ] Update lib/websocket.ts
- [ ] Update components/auth-gate.tsx
- [ ] Update components/app-sidebar.tsx
- [ ] Test frontend login/logout flow

### Testing & Validation
- [ ] Create test-jwt-auth.js
- [ ] Run backend tests
- [ ] Manual frontend testing
- [ ] Security validation (cookie flags, CSRF, expiration)
- [ ] WebSocket authentication test
- [ ] Token refresh test
- [ ] Logout test

### Documentation & Deployment
- [ ] Update README with new env vars
- [ ] Document breaking changes
- [ ] Update security-plan.md
- [ ] Create migration guide for users
- [ ] Commit changes
- [ ] Create PR
- [ ] Deploy to production

---

## Security Considerations

### Implemented Protections
✅ **XSS Protection** - HttpOnly cookies prevent JavaScript access
✅ **CSRF Protection** - Double-submit cookie pattern
✅ **Token Expiration** - Short-lived access tokens (15 min)
✅ **Token Rotation** - Refresh tokens are single-use
✅ **Reuse Detection** - Revoke all tokens on suspicious activity
✅ **Secure Transport** - Secure flag ensures HTTPS-only
✅ **Timing Attacks** - Already using timingSafeEqual for AUTH_KEY

### Remaining Risks
⚠️ **Token Storage** - In-memory store lost on server restart (acceptable for MVP)
⚠️ **No Rate Limiting on Login** - Should add strict rate limit to /api/auth/login
⚠️ **No Account Lockout** - Multiple failed logins don't lock account
⚠️ **Single AUTH_KEY** - All users share same key (consider user-specific keys later)

---

## Timeline Estimate

| Phase | Task | Time | Cumulative |
|-------|------|------|------------|
| 3.1 | Backend JWT Infrastructure | 4h | 4h |
| 3.2 | CSRF Protection | 2h | 6h |
| 3.3 | Frontend Migration | 6h | 12h |
| 3.4 | Testing & Validation | 2h | 14h |

**Total: ~14 hours**

---

## Next Steps

1. **Review this plan** - Confirm approach and architecture decisions
2. **Generate JWT_SECRET** - Run `openssl rand -base64 32` for development
3. **Start Phase 3.1** - Begin backend implementation
4. **Incremental testing** - Test each phase before moving to next

---

**Ready to proceed?** This plan provides a complete roadmap for JWT migration. Implementation can start immediately after approval.
