# @mp-lb/zapper-react

React hooks for local Zapper project controls.

The package keeps the execution boundary explicit:

- Browser apps use `ZapperProvider` with an app-owned RPC/fetch client.
- Node-capable React environments can use `createZapperNodeClient()` from `@mp-lb/zapper-react/node`.
- Hooks never shell out to `zap`.

## Install

```sh
pnpm add @mp-lb/zapper-react @mp-lb/zapper-sdk
```

## Browser or Admin App

```tsx
import {
  ZapperProvider,
  createZapperFetchClient,
  useZapperProject,
} from "@mp-lb/zapper-react";

const client = createZapperFetchClient({ endpoint: "/api/zapper" });

export function App() {
  return (
    <ZapperProvider client={client}>
      <ZapperWidget dir="~/Code/my-app" />
    </ZapperProvider>
  );
}

function ZapperWidget({ dir }: { dir: string }) {
  const zapper = useZapperProject({ dir });

  if (zapper.loading) return <span>Loading</span>;
  if (zapper.error) return <button onClick={zapper.refresh}>Retry</button>;

  return (
    <section>
      <a href={zapper.homepage}>{zapper.data?.projectName}</a>
      <span>{zapper.counts?.up}/{zapper.counts?.total} up</span>
      <select
        value={zapper.selectedProfile ?? zapper.profile ?? "default"}
        disabled={zapper.settling}
        onChange={(event) => zapper.setProfile(event.target.value)}
      >
        {zapper.profiles.map((profile) => (
          <option key={profile} value={profile}>
            {profile}
          </option>
        ))}
      </select>
      <button disabled={zapper.settling} onClick={zapper.up}>Up</button>
      <button disabled={zapper.settling} onClick={zapper.restart}>
        Restart
      </button>
      <button disabled={zapper.settling} onClick={zapper.down}>Down</button>
    </section>
  );
}
```

Your endpoint should call the method named by the request body against a server-side `ZapperProjectClient`. Dash can adapt its existing tRPC router to this interface without changing where local access happens.

## Node-Capable React

```tsx
import { ZapperProvider, useZapperProject } from "@mp-lb/zapper-react";
import { createZapperNodeClient } from "@mp-lb/zapper-react/node";

const client = createZapperNodeClient();

export function LocalPanel() {
  return (
    <ZapperProvider client={client}>
      <ProjectControls />
    </ZapperProvider>
  );
}

function ProjectControls() {
  const { counts, refresh, up, down, error } = useZapperProject({
    dir: process.cwd(),
  });

  return (
    <div>
      <span>{counts?.up ?? 0} services up</span>
      {error ? <button onClick={refresh}>Retry</button> : null}
      <button onClick={up}>Up</button>
      <button onClick={down}>Down</button>
    </div>
  );
}
```

The Node client uses `@mp-lb/zapper-sdk` directly. It loads `zap.yaml`, reads status and links, and runs `up`, `down`, `restart`, `profile use`, and `profile reset` through SDK APIs.
