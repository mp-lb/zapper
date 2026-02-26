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
  return `e2e-ports-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

describe("E2E: Ports Assignment", () => {
  let testProjectName: string;
  let fixtureDir: string;
  let tempConfigPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not found at ${CLI_PATH}. Run 'npm run build' first.`,
      );
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

  it("should assign random ports and save to ports.json", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    // Create fixture dir if needed
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    // Create a test config
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

    // Run zap assign
    const output = runZapCommand(
      `assign --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const result = parseJsonFromOutput(output);

    // Check result structure
    expect(result).toHaveProperty("ports");
    expect(result.ports).toHaveProperty("FRONTEND_PORT");
    expect(result.ports).toHaveProperty("BACKEND_PORT");
    expect(result.ports).toHaveProperty("DB_PORT");

    // Verify ports are strings
    const ports = result.ports as Record<string, string>;
    expect(typeof ports.FRONTEND_PORT).toBe("string");
    expect(typeof ports.BACKEND_PORT).toBe("string");
    expect(typeof ports.DB_PORT).toBe("string");

    // Verify ports are different
    expect(ports.FRONTEND_PORT).not.toBe(ports.BACKEND_PORT);
    expect(ports.FRONTEND_PORT).not.toBe(ports.DB_PORT);

    // Verify ports.json was created
    const portsPath = path.join(fixtureDir, ".zap", "ports.json");
    expect(fs.existsSync(portsPath)).toBe(true);

    const savedPorts = JSON.parse(fs.readFileSync(portsPath, "utf8"));
    expect(savedPorts).toEqual(ports);
  });

  it("should handle config without ports field", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    const configContent = `
project: ${testProjectName}
native:
  app:
    cmd: echo "hello"
`;
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(tempConfigPath, configContent);

    const output = runZapCommand(
      `assign --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const result = parseJsonFromOutput(output);

    expect(result).toHaveProperty("ports");
    expect(result.ports).toEqual({});
  });

  it("should use assigned ports in env resolution", () => {
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    // Create .env file with port references
    const envContent = `
FRONTEND_PORT=1111
BACKEND_PORT=2222
FRONTEND_URL=http://localhost:\${FRONTEND_PORT}
`;
    const envPath = path.join(fixtureDir, ".env");
    fs.writeFileSync(envPath, envContent);

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

    // First assign ports
    const assignOutput = runZapCommand(
      `assign --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const assignResult = parseJsonFromOutput(assignOutput);
    const assignedPorts = assignResult.ports as Record<string, string>;

    // Then check env resolution uses the assigned ports
    const envOutput = runZapCommand(
      `env --service app --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const resolvedEnv = parseJsonFromOutput(envOutput);

    // Ports should override env file values
    expect(resolvedEnv.FRONTEND_PORT).toBe(assignedPorts.FRONTEND_PORT);
    expect(resolvedEnv.BACKEND_PORT).toBe(assignedPorts.BACKEND_PORT);

    // Interpolated values should use the assigned ports
    expect(resolvedEnv.FRONTEND_URL).toBe(
      `http://localhost:${assignedPorts.FRONTEND_PORT}`,
    );

    // Cleanup env file
    fs.unlinkSync(envPath);
  });

  it("should resolve env file variables that reference assigned ports", () => {
    // Test case: PORT_A is an assigned port, PORT_B in .env references it via ${PORT_A}
    // Service only exposes PORT_B, which should resolve correctly using the assigned PORT_A value
    testProjectName = generateTestProjectName();
    fixtureDir = path.join(FIXTURES_DIR, "ports-project");

    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    // Create .env file where PORT_B references PORT_A (which will be assigned)
    const envContent = `PORT_B=\${PORT_A}
`;
    const envPath = path.join(fixtureDir, ".env");
    fs.writeFileSync(envPath, envContent);

    const configContent = `
project: ${testProjectName}
ports:
  - PORT_A
env_files:
  - .env

native:
  myservice:
    cmd: echo "hello"
    env:
      - PORT_B
`;
    tempConfigPath = path.join(fixtureDir, `zap-${testProjectName}.yaml`);
    fs.writeFileSync(tempConfigPath, configContent);

    // First assign ports
    const assignOutput = runZapCommand(
      `assign --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const assignResult = parseJsonFromOutput(assignOutput);
    const assignedPorts = assignResult.ports as Record<string, string>;

    // PORT_A should be assigned
    expect(assignedPorts.PORT_A).toBeDefined();
    expect(typeof assignedPorts.PORT_A).toBe("string");

    // Then check env resolution - PORT_B should be resolved using the assigned PORT_A
    const envOutput = runZapCommand(
      `env --service myservice --json --config zap-${testProjectName}.yaml`,
      fixtureDir,
    );
    const resolvedEnv = parseJsonFromOutput(envOutput);

    // PORT_B should equal PORT_A (not empty string)
    expect(resolvedEnv.PORT_B).toBe(assignedPorts.PORT_A);
    expect(resolvedEnv.PORT_B).not.toBe("");

    // Cleanup env file
    fs.unlinkSync(envPath);
  });
});
