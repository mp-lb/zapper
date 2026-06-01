# Managing Services & Infrastructure

How to add a service under zapper.

## Configuration Files

-   **`zap.yaml`** - Local services (`native` for Node.js apps, `docker` for containers)
    
-   **`infra/`** **(Terraform)** - Production deployment (Cloud Run, GCE, Vercel, Cloudflare)
    
-   **`.env.local`** - Environment variables for local dev
    

## Adding a New Service

### 1\. Add a port var if you need a port

Zapper will generate random ports per stack for you, just choose an appropriate name e.g.:

```
ports: [FRONTEND_PORT, BACKEND_PORT, MY_PORT]
```

### 2\. Add to zap.yaml

**Node.js service:**

```
native:
  my-service:
    cmd: pnpm --filter=@maplab-oss/my-service dev
```

**Docker service:**

```
docker:
  my-database:
    image: postgres:16
    ports:
      - "${MY_PORT}:5432"  # random:container
```

### 3\. Add to Terraform

Add the service to `infra/` as a new Terraform resource. Key things to configure:

-   Compute target (Cloud Run vs GCE vs Vercel)
    
-   Container image and environment variables
    
-   Networking, IAM, and DNS if needed
    
-   Outputs for URLs or connection strings
    

### 4\. Create package.json

Use `@mp-lb/package-name` naming with `dev`, `start`, and `build` scripts.

### 5\. Start Service

```
zap up my-service
```

## Environment Variables Checklist

Add env vars to `.env.production` (if non sensitive) and `env-map.yaml` (always) which routes vars to services for security reasons in prod.