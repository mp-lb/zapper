# Redis extension

How to add Redis.

## Dependencies

Install `ioredis` in the package or app that owns Redis access:

```bash
pnpm --filter=<backend-or-shared-package> add ioredis
```

## Local development

Merge this into `zap.yaml`:

```yaml
ports: [REDIS_PORT]
docker:
  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT}:6379"
```

Add `REDIS_URL` to `.env.local` as `REDIS_URL=redis://localhost:${REDIS_PORT}`. The port will be assigned automatically by zapper.

## Code

Create a small connection helper:

```typescript
import Redis from "ioredis";

let redis: Redis | null = null;

export const getRedis = (url: string): Redis => {
  if (redis) return redis;

  redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  return redis;
};

export const closeRedis = async () => {
  if (!redis) return;
  await redis.quit();
  redis = null;
};
```

Use the helper from app config:

```typescript
import { env } from "./config";
import { getRedis } from "./redis";

const redis = getRedis(env.REDIS_URL);
```
