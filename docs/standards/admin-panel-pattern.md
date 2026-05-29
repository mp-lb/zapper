# Admin Panel Pattern

The admin panel lives inside the main frontend, not in a separate app. It uses the same authentication, providers, routing, styling, and deployment path as the product UI, but is only discoverable and usable by users with an admin Clerk role.

Think of this as the product's internal Clerk admin panel: a hidden operational surface for inspecting users, scan jobs, logs, development helpers, and other support workflows.

## Shape

- Admin routes are normal frontend routes under `/admin`.
- The main app may show a small admin entry point for admins only.
- Non-admin users should not see admin navigation or admin buttons.
- Direct visits to admin URLs must be guarded and redirected away if the user is not an admin.
- Admin screens should use the same app shell primitives, UI components, tRPC client, and auth state as the rest of the frontend.

## Access Model

Clerk owns the role assignment. The application reads the resolved role through the normal auth context described in [Clerk RBAC](clerk-rbac.md).

Frontend checks are for product experience:

- hide admin entry points;
- avoid showing admin loading states to normal users;
- redirect non-admin users away from admin routes.

Backend checks are the security boundary:

- every admin tRPC procedure must check `ctx.isAdmin`;
- admin procedures should return `FORBIDDEN` for non-admin callers;
- do not rely on hidden routes or hidden buttons for authorization.

## Route Guard

Admin pages should sit behind the same signed-in and onboarding guards as the main product, then add an admin-specific guard.

Typical order:

```text
ProtectedRoute
OnboardingGuard
AdminRoute
AdminPage
```

This means a user must be signed in, have completed onboarding, and have an admin role before seeing the admin surface.

## Navigation

The admin panel is intentionally low-profile. It should not become a public product area or a second marketing surface.

Preferred navigation:

- an icon button or compact link in the authenticated app header;
- only rendered when `auth.me` reports `isAdmin: true`;
- admin tabs or subroutes kept inside the `/admin` section.

Avoid adding admin links to public pages, signed-out pages, or non-admin product navigation.

## Implementation Notes

Keep admin code grouped by feature, usually under an `Admin` page directory plus a small `AdminRoute` guard. Admin tRPC procedures should live under the `admin` router and should be integration tested at the procedure level.

Development-only controls can live in the admin panel, but must be gated by environment checks as well as admin access. Dangerous actions should require explicit confirmation and still be enforced server-side.
