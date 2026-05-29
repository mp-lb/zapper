# Playwright extension

How to add Playwright end-to-end tests.

## Dependencies

Create `packages/e2e-tests/package.json`:

```json
{
  "name": "<package-scope>/<project-slug>-e2e-tests",
  "version": "0.0.1",
  "private": true,
  "type": "module"
}
```

Install Playwright and helper dependencies:

```bash
pnpm --filter=<e2e-package> add -D @playwright/test @types/node zod
pnpm --filter=<e2e-package> exec playwright install
```

Install service-specific test dependencies, such as `mongodb`, only when helpers need direct access to those services.

## Local development

E2E tests run against a separate local test stack with its own zap configuration and environment variables.

Create `.env.e2e`:

```bash
APP_ENV=test
BACKEND_PORT=2821
FRONTEND_PORT=9775
VITE_API_BASE_URL=http://localhost:2821
DATABASE_URL=mongodb://localhost:6320/mydb-test?directConnection=true
```

Create `zap.e2e.yaml` and include only the services the app needs:

```yaml
project: myproject-e2e
env_files: [.env.local, .env, .env.e2e]

native:
  backend:
    cmd: pnpm --filter=<backend-package> dev
    env: "*"
  frontend:
    cmd: pnpm --filter=<frontend-package> dev
    env: "*"

docker:
  mongodb:
    image: mongo:latest
    ports:
      - "6320:27017"
    env:
      - MONGO_INITDB_DATABASE=mydb-test
    volumes:
      - mongodb-e2e-data:/data/db

tasks:
  e2e:
    env: "*"
    cmds:
      - FRONTEND_URL=http://localhost:9775 BACKEND_URL=http://localhost:2821 pnpm --filter=<e2e-package> exec playwright test {{REST}}
```

Use different local ports from the normal development stack. Add worker services and Docker services only when the project needs them.

Run tests manually:

```bash
zap --config zap.e2e.yaml up
zap --config zap.e2e.yaml t e2e
zap --config zap.e2e.yaml down
```

## Code

Create this package structure:

```text
packages/e2e-tests/
├── helpers/
│   ├── auth.ts
│   ├── config.ts
│   ├── dbReset.ts
│   ├── seed.ts
│   ├── testUsers.ts
│   └── index.ts
├── tests/
│   └── *.spec.ts
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

Create `packages/e2e-tests/playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";
import { config } from "./helpers/config";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: "html",
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: config.frontendUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined,
});
```

Create `packages/e2e-tests/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "@playwright/test"]
  },
  "include": ["**/*.ts"]
}
```

Make environment variables required with strict validation:

```typescript
// packages/e2e-tests/helpers/config.ts
import { z } from "zod";

const envSchema = z.object({
  FRONTEND_URL: z.string(),
  BACKEND_URL: z.string(),
  DATABASE_URL: z.string(),
});

const env = envSchema.parse(process.env);

export const config = {
  frontendUrl: env.FRONTEND_URL,
  backendUrl: env.BACKEND_URL,
  databaseUrl: env.DATABASE_URL,
};
```

Reset and seed service state in `beforeAll`:

```typescript
test.beforeAll(async () => {
  await resetDatabase();
  await seedTestUser(TEST_USERS.alice);
});
```

Use separate browser contexts for multi-user tests:

```typescript
const aliceContext = await browser.newContext();
const alicePage = await aliceContext.newPage();

const bobContext = await browser.newContext();
const bobPage = await bobContext.newPage();
```

If the project uses third-party authentication, mock authentication in non-production environments. On the backend, read a test user header only in test mode:

```typescript
const createContext = ({ req }: { req: Request }) => {
  let userId: string | undefined;

  if (process.env.APP_ENV === "test") {
    userId = req.headers["x-test-user-id"] as string | undefined;
  }

  return { userId };
};
```

On the frontend, create wrapper hooks that return mock data in test mode:

```typescript
// lib/e2e-mocks/testMode.ts
export const getTestUserId = () => localStorage.getItem("x-test-user-id");
export const isTestMode = () => import.meta.env.DEV && !!getTestUserId();

// lib/e2e-mocks/useAppUser.ts
export const useAppUser = () => {
  const authResult = useAuth();

  if (isTestMode()) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: getTestUser(),
    };
  }

  return authResult;
};
```

Include the test header from the API client:

```typescript
httpBatchLink({
  url: `${baseUrl}/trpc`,
  headers: () => {
    const testUserId = getTestUserId();
    if (testUserId) return { "x-test-user-id": testUserId };
    return {};
  },
});
```

Create a login helper:

```typescript
export async function loginAsTestUser(
  page: Page,
  user: TestUser,
  options?: { clearOnboarding?: boolean },
): Promise<void> {
  await page.addInitScript(
    ({ userId, clearOnboarding }) => {
      window.localStorage.setItem("x-test-user-id", userId);

      if (clearOnboarding) {
        window.localStorage.removeItem(`app:onboarding-complete:${userId}`);
      } else {
        window.localStorage.setItem(`app:onboarding-complete:${userId}`, "true");
      }
    },
    { userId: user.id, clearOnboarding: options?.clearOnboarding ?? false },
  );
}
```
