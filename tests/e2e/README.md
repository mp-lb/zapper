# E2E Tests

End-to-end tests for the Zapper CLI that run against real PM2 processes.

## Structure

- `tests/e2e/` - E2E test files
- `tests/e2e/fixtures/` - Fixture projects with simple test configurations
  - `simple-project/` - Multi-service project (server + worker)
  - `minimal-project/` - Single-service project
- `tests/e2e/test-data/create-worktree-fixture.sh` - Builds a temporary git repo + git worktree fixture with a `zap.yaml`
- `tests/e2e/test-data/worktree-fixtures/` - Generated git/worktree fixtures (gitignored)

## Running E2E Tests

```bash
# Run all e2e tests (builds CLI first)
npm run test:e2e

# Run regular unit tests only
npm test
```

## Test Features

The e2e tests exercise the full CLI workflow:

1. **`zap up`** - Starts processes via PM2
2. **`zap status`** - Reports running processes (human + JSON output)
3. **`zap logs`** - Shows process output
4. **`zap down`** - Stops all processes
5. **PM2 process naming** - Verifies `zap.{project}.{service}` convention
6. **Cleanup** - Ensures no test processes remain after tests

## Key Design Decisions

- **Unique project names**: Each test run uses `e2e-test-{timestamp}-{random}` to avoid collisions
- **Real PM2 processes**: No Docker/mocking - tests actual PM2 integration
- **Simple fixture code**: Uses `node -e "..."` with no dependencies
- **Robust cleanup**: `afterAll`/`afterEach` hooks ensure test processes are removed
- **Longer timeouts**: E2E tests have 60s timeout vs 5s for unit tests
- **Built CLI**: Tests run against `dist/index.js`, not source code

## Fixture Projects

### simple-project
- 2 services: `server` and `worker`
- Both run simple Node.js loops with console output
- Tests multi-service orchestration

### minimal-project
- 1 service: `app`
- Minimal setup for basic functionality testing

## Troubleshooting

If tests fail:

1. **Check PM2**: `pm2 list` to see if test processes are still running
2. **Manual cleanup**: `pm2 delete all` to clear all processes
3. **Build CLI**: Ensure `npm run build` completed successfully
4. **PM2 installation**: Ensure PM2 is installed globally (`npm i -g pm2`)
