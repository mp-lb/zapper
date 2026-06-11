# Clerk RBAC

## Roles

Example roles, snake case:

```text
super_admin
admin
user
```

## Clerk Metadata

The role lives in Clerk public metadata because it must be readable by the session token template, but only trusted backend code should write it.

For manual setup in the Clerk dashboard, set the user's public metadata to:

```json
{
  "role": "admin"
}
```

## Session Token Claim

Add the role to Clerk's session token so the application can read it from the verified JWT on every request.

In the Clerk dashboard:

1. Open the application.
2. Go to **Sessions**.
3. Open **Customize session token**.
4. Add this claim template:

```json
{
  "role": "{{user.public_metadata.role}}"
}
```

5. Save the changes.
6. Sign out and back in, or refresh the session token, before testing role changes.

## Request Flow

On authenticated backend requests:

1. `@clerk/fastify` verifies the Clerk session and exposes `userId` and `sessionClaims`.
2. The application extracts the access role from the JWT claims.
3. If no valid role claim exists, the application falls back to the local the application user profile role.
4. If neither source has a valid role, the user is treated as `user`.
5. tRPC procedures use the internal auth context and access flags, not direct Clerk API calls, for normal authorization.

## Updating Roles

Manual changes:

1. Open **Clerk Dashboard > Users**.
2. Select the user.
3. Edit **Public metadata**.
4. Set `role` to `super_admin`, `admin`, or `user`.
5. Save, then refresh the user's session.

App-managed changes:

- Admin tRPC procedures call the Clerk Backend SDK with `CLERK_SECRET_KEY`.
- Role updates are written to Clerk public metadata.
- The application updates the local user profile snapshot after Clerk succeeds.
- Admin mutations are audited in the application.

Do not call Clerk from the frontend for privileged user-management operations. The frontend should call the application tRPC procedures, and the backend should enforce the current user's role before calling Clerk.

## Operational Notes

- Session token claims are cached in active sessions. A metadata change may not appear until the user's token refreshes.
- For urgent demotions or suspensions, use Clerk account controls such as ban/lock in addition to changing metadata.
- Keep Clerk secret keys server-side only. `CLERK_SECRET_KEY` belongs in `.env`, not `.env.local`.
- `.env.local` may contain non-secret Clerk frontend configuration such as the publishable key.
