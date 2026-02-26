# Quick Start

Get your dev environment running in under 5 minutes.

## Install

```bash
npm install -g pm2 @maplab/zapper
```

## Create `zap.yaml`

In your project root:

```yaml
project: myapp
env_files: [.env]

native:
  backend:
    cmd: pnpm dev
    env:
      - DATABASE_URL
      - PORT

  frontend:
    cmd: pnpm dev
    cwd: ./frontend
    env:
      - VITE_API_URL

docker:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
```

## Run

```bash
zap up        # start everything
zap status    # check what's running
zap down      # stop everything
```

That's it. For the full reference, see [usage.md](./usage.md).
