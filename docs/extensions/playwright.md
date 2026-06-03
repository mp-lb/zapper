# Playwright extension

How to add Playwright end-to-end tests to a zapper-managed project.

Playwright's standard setup is intentionally small: install `@playwright/test`,
create a `playwright.config.ts`, put specs under a test directory, and run
`playwright test`. In zapper projects, prefer letting zapper own local services,
ports, and environment variables instead of hardcoding ports in the Playwright
config.

## Dependencies

Create `packages/e2e-tests/package.json`:

```json
{
  "name": "<package-scope>/<project-slug>-e2e-tests",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "typecheck": "tsc --project tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@types/node": "latest",
    "typescript": "latest",
    "zod": "latest"
  }
}
```

Install dependencies and browser binaries:

```bash
pnpm install
pnpm --filter=<e2e-package> exec playwright install chromium
```

Install service-specific helper dependencies only when the tests need direct
access to those services.

## Zapper task

Prefer an isolated `e2e` profile when browser tests should not share ports,
volumes, or database state with the default local development stack.

```yaml
profiles:
  default:
    env_files:
      - .env.local
      - .env
    services: "*"
    isolate: false

  e2e:
    env_files:
      - .env.local
      - .env
      - .env.e2e
    services: [<database-service>, <backend-service>, <frontend-service>]
    isolate: true
```

Then add an `e2e` task to `zap.yaml`. Keep service startup in zapper so local
ports and env vars remain centralized. A small delegating task lets `zap t e2e`
use the isolated profile by default.

```yaml
tasks:
  e2e:
    cmds:
      - "zap --profile e2e task e2e-run -- {{REST}}"

  e2e-run:
    env: "*"
    cmds:
      - zap --profile e2e up <database-service>
      - <run migrations>
      - zap --profile e2e restart <backend-service> <frontend-service>
      - "pnpm --filter=<e2e-package> exec playwright test {{REST}}"
```

Run the suite:

```bash
zap t e2e
```

Run a single spec or pass ordinary Playwright flags after `--`:

```bash
zap t e2e -- tests/<domain>/crud.spec.ts
zap t e2e -- --headed
zap t e2e -- --ui
```

## Package structure

Use this package shape:

```text
packages/e2e-tests/
├── helpers/
│   ├── auth.ts
│   ├── config.ts
│   └── index.ts
├── tests/
│   └── *.spec.ts
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

## Playwright config

Create `packages/e2e-tests/playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";
import { config } from "./helpers/config";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: config.frontendUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
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

Make required environment variables explicit:

```typescript
// packages/e2e-tests/helpers/config.ts
import { z } from "zod";

const envSchema = z.object({
  FRONTEND_URL: z.string().url(),
});

const env = envSchema.parse(process.env);

export const config = {
  frontendUrl: env.FRONTEND_URL,
};
```

## Authentication

Do not automate third-party hosted login flows unless the product specifically
requires that coverage. Prefer a non-production test authentication path:

- Backend accepts a signed or secret-bearing test identity only outside
  production.
- Frontend test helpers set that identity before navigation.
- API clients include the test identity on requests.
- The bypass is disabled in production and covered by backend tests.

Example helper shape:

```typescript
import type { Page } from "@playwright/test";

export async function loginAsTestUser(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("app:e2e-test-user", "test-user-id");
  });
}
```

## Spec style

Use normal Playwright TypeScript tests. Prefer clear `Given`, `When`, and `Then`
comments inside the test body rather than Cucumber feature files.

```typescript
import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "../helpers";

test("opens a protected page for a signed-in test user", async ({ page }) => {
  // Given
  await loginAsTestUser(page);

  // When
  await page.goto("/some-protected-route");

  // Then
  await expect(page.getByRole("heading", { name: "Some page" })).toBeVisible();
});
```

If there is no meaningful setup, omit `// Given`. Keep the comments short and
behavioral.

## Defaults

Start with:

- Chromium desktop only.
- One worker.
- No local retries, one CI retry.
- Traces on first retry.
- Screenshots only on failure.
- `list` reporter locally, `github` reporter in CI.

Add Firefox, WebKit, mobile projects, visual snapshots, or multiple workers only
when the current QA slice needs them.

## When adding tests

- Use role and label locators first: `getByRole`, `getByLabel`, `getByText`.
- Seed through helpers or API calls rather than clicking through setup screens.
- Keep backend business rules in integration tests. Use Playwright for browser
  behavior, route wiring, form ergonomics, and full user flows.
- Keep tests deterministic. Avoid relying on existing local data unless the test
  is deliberately a smoke test.
- Prefer one clear user workflow per spec over large tours of the whole app.
