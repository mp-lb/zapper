# Environment Variables

## Mental Model

Environment variables have two orthogonal properties:

**Not Secret** **Secret** **Present in both envs** Standard case Needs secure handling **Only in one env** Local debugging / prod-only services Rare

**Key insight:** "Secret" is a property of the value in a specific environment, not of the variable itself. `DATABASE_URL` might be `localhost:5432/dev` locally (not secret) but `user:password@prod-host` in prod (secret).

**Values are always different between environments.** We never try to share values. What we share is:

1.  The **list** of variables (which ones exist)
    
2.  The **whitelists** (which services need which vars)
    

## Where Things Live

Environment Not Secret Secret **Local** `.env.local` (committed) `.env` (gitignored) **Prod** `.env.production` (committed) GitHub Secrets

The storage location implies secrecy — no metadata needed.

## Whitelists

Whitelists define which services can access which variables.

File Purpose `zap.yaml` Local dev — Zapper uses these `env-map.yaml` Production — CI reads these

**These are temporarily duplicated.** When you add a new env var:

1.  Add to both whitelist files
    
2.  Add value to `.env.local` (local) and `.env.production` or GitHub Secrets (prod)
    

TODO: Add `zap env export` command to eliminate duplication.

## Adding a New Environment Variable

### Standard case (present in both envs, not secret)

1.  Add to `zap.yaml` under the service's `env:` array
    
2.  Add to `env-map.yaml` under the service
    
3.  Add value to `.env.local` (local value)
    
4.  Add value to `.env.production` (prod value)
    
5.  Add to app's `src/config.ts` for validation
    

### Secret (in prod)

1.  Same as above for whitelists
    
2.  Add local value to `.env.local` or `.env` (depending on local secrecy)
    
3.  Add prod value to GitHub Secrets (not `.env.production`)
    
4.  Update `deploy.yml` to pass the secret to the service
    
5.  **Add to [deployment-runbook.md](./deployment-runbook.md)** "Production Secrets" table — this is what developers check when deploying
    

### Local-only variable

1.  Add to `zap.yaml` only
    
2.  Add to `.env.local` or `.env`
    
3.  Don't add to `env-map.yaml` or `.env.production`
    

### Prod-only variable

1.  Add to `env-map.yaml` only
    
2.  Add to `.env.production` or GitHub Secrets
    
3.  Don't add to `zap.yaml` or `.env.local`
    

## File Reference

File Committed Purpose `.env.local` Yes Local non-secret values `.env` No Local secret values `.env.production` Yes Prod non-secret values `zap.yaml` Yes Local whitelists `env-map.yaml` Yes Prod whitelists (temporary) GitHub Secrets N/A Prod secret values

## GitHub Secrets Baseline

**Org-level secrets (inherited by all private repos):** `GCP_PROJECT_ID`, `GCP_SA_KEY`, `GCP_REGION`, `VERCEL_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`

Note: We use **Secrets**, not Actions variables, for these org-level values.

**Repo-level secrets (add per-project):**

-   `PRODUCTION_SECRETS` — app-specific secrets as KEY=value pairs, one per line. The deploy workflow appends this to `.env.production` at build time.
    
-   `UPSTASH_EMAIL` — Upstash account email (Terraform)
    
-   `UPSTASH_API_KEY` — Upstash API key (Terraform)
    
-   `UPSTASH_REDIS_URL` — Optional override if your Upstash account already has a Redis DB (Terraform)
    

## Config Validation

Each app validates its env vars at startup:

```
// apps/backend/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.enum(["development", "production"]).default("production"),
  BACKEND_PORT: z.string().transform(Number),
  FRONTEND_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

## Packages

Packages must NOT access `process.env` directly. They receive config through context:

```
// App validates and wires
import { env } from './config';
createClient(env.DATABASE_URL);

// Package receives, never reads process.env
export function createClient(databaseUrl: string) { ... }
```

## Current Variables

Variable Services Local Prod Notes `APP_ENV` backend `.env.local` `.env.production` `development` / `production` `BACKEND_PORT` backend `.env.local` `.env.production` Must match `backend_port` in terraform.tfvars `FRONTEND_URL` backend `.env.local` `.env.production` For CORS `FRONTEND_PORT` frontend `.env.local` N/A Local only `REDIS_URL` backend, worker `.env.local` Terraform (Upstash) Set locally for dev; injected in prod `VITE_API_BASE_URL` frontend `.env.local` `.env.production` Backend URL `VITE_APP_ENV` frontend `.env.local` `.env.production` `development` / `production`