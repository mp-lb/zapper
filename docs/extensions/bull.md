# Bull extension

How to add [BullMQ](https://docs.bullmq.io/) background jobs.

BullMQ requires Redis. Install the Redis extension first:

```bash
dx read extensions/redis.md
```

## Dependencies

Install queue dependencies in the package that owns queue definitions:

```bash
pnpm --filter=<queue-package> add bullmq ioredis
```

Install Bull Board:

```bash
pnpm --filter=<backend-package> add @bull-board/api @bull-board/fastify
```

## Local development

Merge this into `zap.yaml`:

```yaml
ports: [BULLBOARD_PORT]
links:
  - name: bullboard
    url: http://localhost:${BULLBOARD_PORT}
native:
  worker:
    aliases: [w]
    cmd: pnpm --filter=<worker-package> dev
    env: "*"
```

The port will be assigned automatically by zapper. This extension uses `REDIS_URL` from the Redis extension.

## Code

BullMQ usually adds three local/app-level pieces:

1. Queue definitions that producers use to enqueue work.
2. Worker process code that consumes jobs.
3. Optional Bull Board UI for local queue inspection.

Queue definitions and connection code should live in a shared package like `packages/server`.

Use lazy initialization for Redis connections and BullMQ queues. Do not instantiate queues at module initialization time; it makes tests harder and can create circular dependency problems.

### Queue connection

```typescript
// packages/<queue-package>/src/queueConnection.ts
import Redis from "ioredis";

let queueConnection: Redis | null = null;

export const getQueueConnection = (redisUrl: string): Redis => {
  if (!queueConnection) {
    queueConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return queueConnection;
};

export const closeQueueConnection = async () => {
  if (queueConnection) {
    await queueConnection.quit();
    queueConnection = null;
  }
};
```

### Queue definitions

```typescript
// packages/<queue-package>/src/queues.ts
import { Queue } from "bullmq";
import { getQueueConnection } from "./queueConnection";

export interface ExampleJobData {
  id: string;
}

let exampleQueue: Queue<ExampleJobData> | null = null;

export const getExampleQueue = (redisUrl: string): Queue<ExampleJobData> => {
  if (!exampleQueue) {
    exampleQueue = new Queue<ExampleJobData>("example", {
      connection: getQueueConnection(redisUrl),
    });
  }
  return exampleQueue;
};
```

### Enqueue jobs

Use the queue from a backend route, tRPC procedure, or service function:

```typescript
import { getExampleQueue } from "<queue-package>";
import { env } from "./config";

await getExampleQueue(env.REDIS_URL).add("example-job", {
  id: "job-input-id",
});
```

### Worker process

Create a worker process, e.g. `apps/worker/package.json`:

```json
{
  "name": "<package-scope>/<project-slug>-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "rm -rf dist && tsc --project tsconfig.build.json",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "<queue-package>": "workspace:*",
    "bullmq": "workspace:*",
    "tsx": "workspace:*"
  }
}
```

Example worker implementation, you will probably want to break out job handlers into their own files:

```typescript
// apps/worker/src/index.ts
import { Worker, type Job } from "bullmq";
import { closeQueueConnection, getQueueConnection, type ExampleJobData } from "<queue-package>";
import { env } from "./config";

let worker: Worker<ExampleJobData> | null = null;

const startWorker = () => {
  if (worker) return worker;

  worker = new Worker<ExampleJobData>(
    "example",
    async (job: Job<ExampleJobData>) => {
      console.log(`Processing job ${job.id}`);
      return { ok: true };
    },
    {
      connection: getQueueConnection(env.REDIS_URL),
      concurrency: 5,
      lockDuration: 60000,
      stalledInterval: 30000,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed`, err);
  });

  return worker;
};

const stopWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await closeQueueConnection();
};

process.on("SIGTERM", () => {
  void stopWorker().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void stopWorker().then(() => process.exit(0));
});

startWorker();
```

### Bull board integration

Expose Bull Board only in local development:

```typescript
// Somewhere in the backend setup
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { getExampleQueue } from "<queue-package>";
import { env, isProd } from "./config";

export const registerBullBoard = async (app: import("fastify").FastifyInstance) => {
  if (isProd) return;
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [new BullMQAdapter(getExampleQueue(env.REDIS_URL))],
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: "/admin/queues",
  });
};
```

### Testing

For tests, either:

- run against the Zapper Redis service, or
- mock queue producers at the service boundary.

Always close workers and Redis connections in test cleanup.
