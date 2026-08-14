# Contributing

## Commits

We use conventional commits — most of the history already follows this format:

`type(scope): short description`

- `feat:` new feature
- `fix:` bug fix
- `docs:` docs/comments
- `chore:` maintenance, deps, scripts
- `refactor:` no behavior change
- `test:`, `perf:`, `style:`, `build:`, `ci:`, `revert:` — self-explanatory

A few rules:

- The description says what and why, not how. `fix: prevent disconnect flash on stale socket force-close` is good; `fix: change things` is not.
- Reference the issue when it fixes one: `fix: ... (closes #85)`
- Keep commits small: one logical change per commit (usually 1–4 files). If a commit touches 20+ files, split it.

## Workflow

- Branch names: `feat/x`, `fix/x`, `docs/x`, `refactor/x`. No direct commits to main.
- One PR = one thing. If you find yourself touching unrelated files (say, logging in another module), put that in its own PR.
- Fill the PR template. The "Files changed" list must match the diff exactly — easy to miss a file when the PR grew while working.
- Run the test plan BEFORE asking for review: `node test/*.test.js`, `npm run lint --prefix frontend`, `npx --prefix frontend tsc --noEmit`. An unchecked test plan means the PR is still a draft.
- Every PR needs at least one approval from someone else. Yes, including your own PRs — that's the whole point.
- Merge: squash when the branch has WIP noise, merge commit for long branches with meaningful history. Delete the branch after merging. Clean up old remote branches once in a while (we have a lot).

## Code review

### Before you ask for a review

- [ ] Diff only contains what the body says
- [ ] Input validation on new routes, especially destructive ones
- [ ] Errors reach the user, not just console.error
- [ ] If the change touches an invariant (step cache, WS events, frontend state), there's a path that updates/clears the old state
- [ ] Pure logic (computations, decisions) has a test

### While reviewing

- [ ] Does the code do what the PR says? Run it if you can
- [ ] Edge cases: out-of-range indices, empty states, first/last iteration, races (polling vs user actions)
- [ ] Follows existing patterns (auth, error handling, LS method whitelist)
- [ ] Frontend/backend payloads match the types and the real LS contract
- [ ] No dead code, no leftover debug logging

### Comment format

Use severity tags so the author knows what blocks:

- 🔴 Blocker — must fix before merge (bug, security, the fix doesn't fix the stated bug)
- 🟡 Should — should fix (can be a follow-up, decide in the thread)
- 🟢 Nit — style, naming, minor stuff

For each finding: where (file + line), what happens, why it matters, and how to fix it if you can. Quote the exact line. Close the loop: resolve threads when fixed, re-approve or ask for changes again. And say what's good too — reviews aren't just criticism.

## Repo patterns to respect

- LS calls go through `ALLOWED_LS_METHODS` (`src/ls-method-whitelist.js`). Regenerate after an Antigravity update: `node tools/api-tracker/gen-whitelist.js`.
- The poller owns the step cache. Any stepCount/cache change needs an invalidation path (see the `delete stepCache[id]` + `conversations_updated` pattern on RUNNING→DONE transitions).
- Don't leak LS error messages to clients; return 400/404/503 with readable errors.

## Todo (maintainer)

- [ ] Branch protection on main: require PR + 1 approval + CI green + auto-delete branches
- [ ] CODEOWNERS for sensitive paths (`src/`, `frontend/lib/`)
- [ ] `npm test` script that runs `node test/*.test.js`
