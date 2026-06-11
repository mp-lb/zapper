# Clerk RBAC

## Roles

Example roles, snake case:

```text
super_admin
admin
user
```

## Clerk Metadata

To create the first super admin, set the user's public metadata in the Clerk dashboard:

```json
{
  "role": "super_admin"
}
```

## Session Token Claim

Add the role to Clerk's session token so the application can read it from the verified JWT on every request.

In the Clerk dashboard under Sessions:

```json
{
  "role": "{{user.public_metadata.role}}"
}
```

## Request Flow

On authenticated backend requests:

1. `@clerk/fastify` verifies the Clerk session and exposes `userId` and `sessionClaims`.
2. The application extracts the access role from the JWT claims.
3. If no valid role claim exists, the application falls back to the local application user profile role.
4. If neither source has a valid role, the user is treated as `user`.
5. tRPC procedures use the internal auth context and access flags, not direct Clerk API calls, for normal authorization.

Expose a `ctx.isAdmin` boolean on the tRPC context that's true for `"admin" | "super_admin"` so procedures can easily check admin access.