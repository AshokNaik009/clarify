# [AUTH-1234] Token refresh fails when refresh_token is rotated mid-flight

## Context
Users on the new device-binding flow occasionally see a 401 right after a successful refresh because the rotated `refresh_token` is being checked twice.

## Acceptance Criteria
- The refresh handler accepts the rotated `refresh_token` for the in-flight request and persists the new token atomically.
- A second refresh within the cooldown window returns the cached new token rather than a 401.
- A unit test in `src/auth/refresh.test.ts` reproduces the bug and now passes.

## Notes
- Reuse the existing JWT module in `src/auth/jwt.ts`.
- No new dependencies.
