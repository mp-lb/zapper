# Clerk extension

How to add Clerk authentication.

## Dependencies

Install Clerk and React Router dependencies in each frontend app that needs authentication:

```bash
pnpm --filter=<frontend-package> add @clerk/react-router react-router react-router-dom
```

Install Clerk in each backend app that verifies sessions:

```bash
pnpm --filter=<backend-package> add @clerk/fastify
```

## Local development

1. Go to [clerk.com](https://clerk.com).
2. Create a new application for the project.
3. Configure the sign-in methods for local development.
4. Copy the publishable key and secret key.

Add the publishable key to the local frontend environment:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Add the secret key to the local backend environment:

```bash
CLERK_SECRET_KEY=sk_test_...
```

Current generated projects commonly use `env: "*"` in `zap.yaml`, so no Zapper change is needed when all local env files are already loaded. If the target project uses explicit Zapper env allowlists, add the Clerk variables to the matching frontend and backend services.

For local development, configure:

1. Allowed redirect URLs for each local frontend URL.
2. Sign-in/sign-up methods.
3. Session settings.

Use the generated Zapper frontend URLs when adding local redirect URLs.

## Code

### Frontend setup

Wrap the app with `BrowserRouter` and `ClerkProvider`:

```tsx
import { ClerkProvider } from "@clerk/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

Create a protected route component:

```tsx
// apps/<frontend>/src/components/auth/ProtectedRoute.tsx
import { useAuth } from "@clerk/react-router";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

interface Props {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: Props) => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) return <Navigate to="/sign-in" replace />;

  return <>{children}</>;
};
```

Create auth pages:

```tsx
// apps/<frontend>/src/pages/Auth/SignIn.tsx
import { SignIn as ClerkSignIn } from "@clerk/react-router";

export const SignIn = () => (
  <div className="flex min-h-screen w-full items-center justify-center">
    <ClerkSignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      forceRedirectUrl="/"
    />
  </div>
);
```

```tsx
// apps/<frontend>/src/pages/Auth/SignUp.tsx
import { SignUp as ClerkSignUp } from "@clerk/react-router";

export const SignUp = () => (
  <div className="flex min-h-screen w-full items-center justify-center">
    <ClerkSignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl="/"
    />
  </div>
);
```

```tsx
// apps/<frontend>/src/pages/Auth/SSOCallback.tsx
import { AuthenticateWithRedirectCallback } from "@clerk/react-router";

export const SSOCallback = () => (
  <div className="flex min-h-screen w-full items-center justify-center">
    <AuthenticateWithRedirectCallback />
  </div>
);
```

Add auth routes:

```tsx
import { Navigate, Route, Routes } from "react-router";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { SignIn } from "./pages/Auth/SignIn";
import { SignUp } from "./pages/Auth/SignUp";
import { SSOCallback } from "./pages/Auth/SSOCallback";

export const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/hello" replace />} />
    <Route
      path="/hello"
      element={
        <ProtectedRoute>
          <div>Hello</div>
        </ProtectedRoute>
      }
    />
    <Route path="/sign-in/*" element={<SignIn />} />
    <Route path="/sign-up/*" element={<SignUp />} />
    <Route path="/sso-callback" element={<SSOCallback />} />
  </Routes>
);
```

Use Clerk hooks in components:

```tsx
import { UserButton, useUser } from "@clerk/react-router";

export const Header = () => {
  const { user } = useUser();

  return (
    <header>
      <span>{user?.firstName ?? user?.username}</span>
      <UserButton />
    </header>
  );
};
```

### Backend setup

Register the Clerk plugin:

```typescript
import { clerkPlugin, getAuth } from "@clerk/fastify";
import { env } from "./config";

await app.register(clerkPlugin, {
  secretKey: env.CLERK_SECRET_KEY,
});

app.get("/api/protected", async (request, reply) => {
  const { userId } = getAuth(request);

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return { message: `Hello, user ${userId}` };
});
```

### tRPC context

If the backend uses tRPC, extract Clerk auth in the request context and expose app-owned auth fields to procedures:

```typescript
import { getAuth } from "@clerk/fastify";

export const createContext = async ({ req }: { req: FastifyRequest }) => {
  const auth = getAuth(req);

  return {
    auth: {
      userId: auth.userId,
      sessionId: auth.sessionId,
      claims: auth.sessionClaims,
    },
  };
};
```

Procedures should depend on the app context, not direct Clerk API calls.

### WebSocket authentication

For WebSocket connections, pass the Clerk session token from the frontend:

```typescript
import { useAuth } from "@clerk/react-router";

const { getToken } = useAuth();
const token = await getToken();
const ws = new WebSocket(`${wsUrl}?token=${token}`);
```

Verify it on the backend:

```typescript
import { verifyToken } from "@clerk/backend";
import { env } from "./config";

const payload = await verifyToken(token, {
  secretKey: env.CLERK_SECRET_KEY,
});

const userId = payload.sub;
```
