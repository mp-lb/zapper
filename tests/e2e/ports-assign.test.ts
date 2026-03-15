import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const CLI_PATH = path.join(__dirname, "../../dist/index.js");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

function runZapCommand(
  command: string,
  cwd: string,
  options: { timeout?: number; encoding?: BufferEncoding } = {},
) {
  const { timeout = 10000, encoding = "utf8" } = options;
  try {
    return execSync(`node "${CLI_PATH}" ${command}`, {
      cwd,
      timeout,
      encoding,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "stderr" in error) {
      const execError = error as { stderr?: Buffer | string; message?: string };
      if (execError.stderr) {
        const message = execError.message || "";
        (error as { message: string }).message =
          message + `\nStderr: ${execError.stderr.toString()}`;
      }
    }
    throw error;
  }
}

function generateTestProjectName(): string {
  return `e2e-init-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function parseJsonFromOutput(output: string): Record<string, unknown> {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Keep scanning for a JSON line.
    }
  }

  throw new Error(`Could not parse JSON from output:\n${output}`);
}

describe("E2E: init ports", () => {
  let testProjectName: string;
  let fixtureDir: string;
  let tempConfigPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
  });

  afterEach(() => {
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }

    if (fixtureDir) {
      const zapDir = path.join(fixtureDir, ".zap");
      if (fs.existsSync(zapDir)) {
        fs.rmSync(zapDir, { recursive: true, force: true });
      }
    }
  });

  it("initializes ports in state.json", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    const configContent = `
project: ${testProjectName}
ports:
  - FRONTEND_PORT
  - BACKEND_PORT
  - DB_PORT

native:
  app:
    cmd: echo "hello"
    env:
      - FRONTEND_PORT
      - BACKEND_PORT
`;
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(tempConfigPath, configContent);

    const output = runZapCommand(
      `init --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const result = parseJsonFromOutput(output);

    expect(result.ports).toHaveProperty("FRONTEND_PORT");
    expect(result.ports).toHaveProperty("BACKEND_PORT");
    expect(result.ports).toHaveProperty("DB_PORT");

    const ports = result.ports as Record<string, string>;
    expect(typeof ports.FRONTEND_PORT).toBe("string");

    const statePath = path.join(fixtureDir, ".zap", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);

    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(state.ports).toEqual(ports);
  });

  it("is idempotent and only assigns ports for new keys", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");
    fs.mkdirSync(fixtureDir, { recursive: true });

    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(
      tempConfigPath,
      `
project: ${testProjectName}
ports:
  - PORT_A
  - PORT_B
native:
  app:
    cmd: echo "hello"
`,
    );

    const first = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );
    const second = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );
    expect(second.ports).toEqual(first.ports);

    fs.writeFileSync(
      tempConfigPath,
      `
project: ${testProjectName}
ports:
  - PORT_A
  - PORT_B
  - PORT_C
native:
  app:
    cmd: echo "hello"
`,
    );

    const third = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );

    const firstPorts = first.ports as Record<string, string>;
    const thirdPorts = third.ports as Record<string, string>;

    expect(thirdPorts.PORT_A).toBe(firstPorts.PORT_A);
    expect(thirdPorts.PORT_B).toBe(firstPorts.PORT_B);
    expect(thirdPorts.PORT_C).toBeDefined();
  });

  it("removes deleted keys and supports full randomization", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");
    fs.mkdirSync(fixtureDir, { recursive: true });

    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(
      tempConfigPath,
      `
project: ${testProjectName}
ports:
  - PORT_A
  - PORT_B
native:
  app:
    cmd: echo "hello"
`,
    );

    const first = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );

    fs.writeFileSync(
      tempConfigPath,
      `
project: ${testProjectName}
ports:
  - PORT_B
native:
  app:
    cmd: echo "hello"
`,
    );

    const reduced = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );
    expect(reduced.ports).toEqual({ PORT_B: (reduced.ports as Record<string, string>).PORT_B });

    fs.writeFileSync(
      tempConfigPath,
      `
project: ${testProjectName}
ports:
  - PORT_A
  - PORT_B
native:
  app:
    cmd: echo "hello"
`,
    );

    const randomized = parseJsonFromOutput(
      runZapCommand(`init -R --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );

    expect(randomized.ports).not.toEqual(first.ports);
  });

  it("uses initialized ports in env resolution", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    const envPath = path.join(fixtureDir, ".env");
    fs.writeFileSync(
      envPath,
      "FRONTEND_PORT=1111\nBACKEND_PORT=2222\nFRONTEND_URL=http://localhost:${FRONTEND_PORT}\n",
    );

    const configContent = `
project: ${testProjectName}
ports:
  - FRONTEND_PORT
  - BACKEND_PORT
env_files:
  - .env

native:
  app:
    cmd: echo "hello"
    env:
      - FRONTEND_PORT
      - BACKEND_PORT
      - FRONTEND_URL
`;
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(tempConfigPath, configContent);

    const initResult = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );
    const initializedPorts = initResult.ports as Record<string, string>;

    const envOutput = runZapCommand(
      `env --service app --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const resolvedEnv = parseJsonFromOutput(envOutput);

    expect(resolvedEnv.FRONTEND_PORT).toBe(initializedPorts.FRONTEND_PORT);
    expect(resolvedEnv.BACKEND_PORT).toBe(initializedPorts.BACKEND_PORT);
    expect(resolvedEnv.FRONTEND_URL).toBe(
      `http://localhost:${initializedPorts.FRONTEND_PORT}`,
    );

    fs.unlinkSync(envPath);
  });

  it("uses initialized ports in docker port mappings", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");
    fs.mkdirSync(fixtureDir, { recursive: true });

    const configContent = `
project: ${testProjectName}
ports:
  - MONGO_PORT

docker:
  mongodb:
    image: mongo:latest
    ports:
      - \${MONGO_PORT}:27017
`;
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(tempConfigPath, configContent);

    const initResult = parseJsonFromOutput(
      runZapCommand(`init --json --config zap-${testProjectName}.yaml`, fixtureDir),
    );
    const initializedPorts = initResult.ports as Record<string, string>;

    const configOutput = runZapCommand(
      `config --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const resolvedConfig = parseJsonFromOutput(configOutput);
    const containers = resolvedConfig.containers as Array<{
      name: string;
      ports?: string[];
    }>;

    const mongodb = containers.find((container) => container.name === "mongodb");
    expect(mongodb).toBeDefined();
    expect(mongodb?.ports).toEqual([`${initializedPorts.MONGO_PORT}:27017`]);
  });
});
