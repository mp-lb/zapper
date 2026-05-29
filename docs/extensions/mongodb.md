# MongoDB extension

How to add MongoDB.

## Dependencies

```bash
pnpm --filter=<backend-or-shared-package> add mongodb
```

Add script runtime dependencies to the existing core package:

```bash
pnpm --filter=<core-package> add mongodb tsx zod
```

## Local development

Merge this into `zap.yaml`:

```yaml
ports: [MONGO_PORT]
docker:
  mongodb:
    aliases: [db]
    image: mongo:latest
    ports:
      - "${MONGO_PORT}:27017"
    volumes:
      - mongodb-data:/data/db
```

Add `MONGODB_URL` and `MONGODB_DB_NAME` to `.env.local`:

```bash
MONGODB_URL=mongodb://localhost:${MONGO_PORT}/<database-name>?directConnection=true
MONGODB_DB_NAME=<database-name>
```

The port will be assigned automatically by zapper.

### Reset task

For local development, add a reset task that drops the configured database through the core package script:

```yaml
tasks:
  db-reset:
    cmds:
      - zap down <backend-service>
      - zap up mongodb
      - pnpm --filter=<core-package> mongodb:drop
      - zap up <backend-service>
```

Include any workers or other services that hold MongoDB connections in the `zap down` and final `zap up` commands.

## Core package script

Add a maintenance script to the existing core package. Packages generally should not own app runtime env processing, but maintenance scripts are standalone entrypoints. Give each script its own local Zod env schema instead of adding shared package-level env config.

Update `packages/core/package.json`:

```json
{
  "scripts": {
    "mongodb:drop": "tsx src/scripts/mongodb/drop-database.ts"
  }
}
```

Then install the runtime dependencies:

```bash
pnpm --filter=<core-package> add mongodb tsx zod
```

Create `packages/core/src/scripts/mongodb/drop-database.ts`:

```typescript
import { MongoClient } from "mongodb";
import { z } from "zod";

const env = z
  .object({
    MONGODB_URL: z.string().url(),
    MONGODB_DB_NAME: z.string().min(1),
  })
  .parse(process.env);

const client = new MongoClient(env.MONGODB_URL);

try {
  await client.connect();
  await client.db(env.MONGODB_DB_NAME).dropDatabase();
  console.log(`Dropped database ${env.MONGODB_DB_NAME}`);
} finally {
  await client.close();
}
```

## Code

Add `MONGODB_URL` to the backend app config schema while preserving the existing `FRONTEND_URLS` transform:

```typescript
// apps/<backend-service>/src/config.ts
MONGODB_URL: z.string().url(),
```

Create a connection manager in your app:

```typescript
// apps/<backend-service>/src/db.ts
import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;

export const getMongoClient = async (url: string): Promise<MongoClient> => {
  if (client) return client;
  client = new MongoClient(url);
  await client.connect();
  return client;
};

export const getDb = async (url: string): Promise<Db> => {
  const c = await getMongoClient(url);
  return c.db();
};

export const closeDb = async () => {
  if (client) {
    await client.close();
    client = null;
  }
};
```

Wire it up in your app startup:

```typescript
import { env } from "./config";
import { getDb, closeDb } from "./db";

const db = await getDb(env.MONGODB_URL);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await closeDb();
  process.exit(0);
});
```

### Usage

```typescript
const users = db.collection("users");
await users.insertOne({ name: "Alice" });
const user = await users.findOne({ name: "Alice" });
```
